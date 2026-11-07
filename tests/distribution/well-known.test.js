'use strict';
// tests/distribution/well-known.test.js — the well-known files of a real build of the minimal
// fixture, and the response headers they are served with:
//
//   * AGSC-06-34: a node with a responder and an a2a-card writes `/.well-known/agent-card.json`,
//     the discovery document declares it, and `_headers` gives it the cross-origin pair;
//   * AGSC-06-42: with `discovery.ai_catalog` the two catalogue files are written, their entries'
//     digests are the SHA-256 of the card and of the discovery document AS EMITTED, and each is
//     served with its media type; without the switch the build says why it wrote neither;
//     on a host that is not a domain name the build refuses (AGSC-E209) and writes neither;
//   * AGSC-06-40: the `Link` field of `/` carries the Signposting links of the built node, read
//     with an independent RFC 8288 parser (`http-link-header`);
//   * AGSC-06-41: the home page's Dataset block names every machine file the node serves.
//
// Deterministic: fixed build instant, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const LinkHeader = require('http-link-header');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const site = require('../../src/distribution/site.js');
const rules = require('../../src/distribution/hosts/rules.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const SURFACES = [
  { access: 'consent', binding: 'HTTP+JSON', surface: 'responder', target: 'https://minimal.example/a2a', version: 'a2a:1.0' },
  { access: 'none', surface: 'a2a-card', target: 'https://minimal.example/.well-known/agent-card.json', version: '1.0' },
];

/** A build of the minimal fixture with `patch` merged into its configuration. */
function built(patch = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-well-known-'));
  try {
    fs.cpSync(FIXTURE, dir, { recursive: true });
    const file = path.join(dir, 'agsc.config.json');
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, `${JSON.stringify({ ...config, ...patch, bundle: { ...config.bundle, ...(patch.bundle || {}) }, site: { ...config.site, ...(patch.site || {}) } }, null, 2)}\n`);
    const port = createFileSystem(dir);
    const bundle = loadBundle(port, { schemas: validate.schemas(readSchemas(ROOT)) });
    const clock = createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } });
    return site.build(bundle, { clock, fs: port }, { specVersion: '1.1.0', version: '0.0.0' });
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
}

const text = (files, route) => String(files.get(route));
const hex = (bytes) => `sha256:${createHash('sha256').update(Buffer.from(String(bytes), 'utf8')).digest('hex')}`;
const served = (files, route) => Object.fromEntries(rules.headersFor(rules.parseHeaders(text(files, '/_headers')).sets, route));

test('AGSC-06-34 / AGSC-06-42: the card and the catalogue files, their digests over the bytes the build emits', () => {
  const { files, findings } = built({ discovery: { ai_catalog: true }, surfaces: SURFACES });
  assert.deepEqual(findings.filter((f) => f.severity === 'error'), []);
  const card = text(files, '/.well-known/agent-card.json');
  assert.equal(JSON.parse(card).supportedInterfaces[0].url, 'https://minimal.example/a2a');
  const document = text(files, '/.well-known/knowledge-linkset');
  const declared = JSON.parse(document).linkset[0]['https://w3id.org/agentic-system-core/rel#surface'].map((l) => l.href);
  assert.ok(declared.includes('https://minimal.example/.well-known/agent-card.json'), declared.join(' '));
  const catalog = JSON.parse(text(files, '/.well-known/ai-catalog.json'));
  assert.deepEqual(catalog.entries.map((e) => [e.identifier, e.digest]), [
    ['urn:air:minimal.example:a2a:minimal', hex(card)], ['urn:air:minimal.example:knowledge:minimal', hex(document)]]);
  assert.deepEqual(JSON.parse(text(files, '/.well-known/ard.json')).entries.map((e) => e.metadata.digest), [hex(card), hex(document)]);
  assert.equal(served(files, '/.well-known/ai-catalog.json')['Content-Type'], 'application/ai-catalog+json');
  assert.equal(served(files, '/.well-known/ard.json')['Content-Type'], 'application/json');
  // The card is a JSON document (AGSC-06-34): its block carries the type beside the CORS pair.
  assert.equal(served(files, '/.well-known/agent-card.json')['Content-Type'], 'application/json');
  for (const route of ['/.well-known/agent-card.json', '/.well-known/ard.json', '/.well-known/ai-catalog.json']) {
    assert.equal(served(files, route)['Access-Control-Allow-Origin'], '*', route);
  }
});

test('AGSC-06-42: off by default, and the build says why; on a host that is not a domain name it refuses', () => {
  const plain = built();
  for (const route of ['/.well-known/agent-card.json', '/.well-known/ard.json', '/.well-known/ai-catalog.json']) assert.ok(!plain.files.has(route), route);
  assert.ok(plain.skipped.some((s) => s.startsWith('/.well-known/ard.json, /.well-known/ai-catalog.json (')), plain.skipped.join('\n'));
  assert.ok(!text(plain.files, '/_headers').includes('agent-card'), 'no block for a file the build did not write');
  const local = built({ discovery: { ai_catalog: true }, site: { base: 'http://localhost:8080/' } });
  assert.ok(local.findings.some((f) => f.code === 'AGSC-E209' && f.severity === 'error'));
  assert.ok(!local.files.has('/.well-known/ai-catalog.json'));
  const lonely = built({ surfaces: [SURFACES[1]] });
  assert.ok(lonely.findings.some((f) => f.code === 'AGSC-E210'), 'a card without an endpoint');
  assert.ok(!lonely.files.has('/.well-known/agent-card.json'));
});

test('AGSC-06-40 / AGSC-06-41: the home page\'s Link field and Dataset block name the files the node serves', () => {
  // The fixture ships no LICENSE-CONTENT, so no `/legal/`: the licence URL is the configured one.
  const licence = 'https://creativecommons.org/publicdomain/zero/1.0/';
  const { files } = built({ bundle: { license_url: licence }, site: { author: 'Josiah Carberry', author_orcid: '0000-0002-1825-0097' } });
  const links = LinkHeader.parse(served(files, '/').Link).refs.map((r) => `${r.rel} ${r.uri}`).sort();
  assert.deepEqual(links, [
    'cite-as https://minimal.example/', 'describedby /.well-known/knowledge-linkset', 'describedby /graph.jsonld',
    'item /chunks.jsonl', 'item /graph.nq', 'item /graph.ttl', `license ${licence}`,
    'linkset /.well-known/knowledge-linkset', 'type https://schema.org/AboutPage', 'type https://schema.org/Dataset']);
  const block = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/su.exec(text(files, '/index.html'))[1]);
  assert.deepEqual(block.distribution.map((d) => d.contentUrl.replace('https://minimal.example', '')),
    ['/graph.jsonld', '/graph.ttl', '/graph.nq', '/chunks.jsonl', '/.well-known/knowledge-linkset']);
  assert.equal(block.license, licence);
  assert.deepEqual(block['prov:wasAttributedTo'], { '@type': 'Person', name: 'Josiah Carberry', sameAs: 'https://orcid.org/0000-0002-1825-0097' });
  assert.equal(block['prov:generatedAtTime']['@value'], '2026-01-01T00:00:00Z');
});
