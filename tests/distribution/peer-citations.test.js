'use strict';
// AGSC-11-12 (F6): "when a `sources[].resource` value begins with the base of a
// declared peer … the graph exports MUST emit `<item-IRI> rdfs:seeAlso
// <normalised-url>` and `<item-IRI> asc:peerOrigin <peer-Bundle-IRI>`".
//
// ENG-9 (CONN1b-02): `boundary/federation.js#peerCitations` built those quads and
// nothing called it, so a node whose item cited a declared peer's page carried only
// the `dcterms:source` literal in all four graph views. These tests build a real
// Bundle through `distribution/site.js#build` and read the four views.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const site = require('../../src/distribution/site.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const PEER = 'https://peer.example/.well-known/knowledge-linkset';
const SEE_ALSO = 'http://www.w3.org/2000/01/rdf-schema#seeAlso';
const PEER_ORIGIN = 'https://w3id.org/agentic-system-core/ns#peerOrigin';

/** A copy of the minimal fixture with one declared peer and the given sources on `handoff`. */
function bundleWith(sources, peers = [PEER]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-peer-cite-'));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  const configPath = path.join(dir, 'agsc.config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.peers = peers;
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const itemPath = path.join(dir, 'content', 'concepts', 'handoff.md');
  const lines = sources.flatMap((s) => [`  - id: ${s.id}`, `    resource: ${JSON.stringify(s.resource)}`]);
  const text = fs.readFileSync(itemPath, 'utf8').replace('kind: pattern\n', `kind: pattern\nsources:\n${lines.join('\n')}\n`);
  fs.writeFileSync(itemPath, text);
  const port = createFileSystem(dir);
  const bundle = loadBundle(port, { schemas: validate.schemas(readSchemas(ROOT)) });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } });
  const built = site.build(bundle, { clock, fs: port }, { specVersion: '1.0.0-rc.6', version: '0.0.0' });
  fs.rmSync(dir, { force: true, recursive: true });
  return built;
}

test('AGSC-11-12: a citation under a declared peer reaches graph.nq, graph.ttl, graph.jsonld and the page view', () => {
  const built = bundleWith([{ id: 'peer-page', resource: 'https://peer.example/concepts/relay/' }]);
  const item = '<https://minimal.example/concepts/handoff/>';
  const nq = String(built.files.get('/graph.nq'));
  assert.ok(nq.includes(`${item} <${SEE_ALSO}> <https://peer.example/concepts/relay/> <https://minimal.example/> .\n`), nq);
  assert.ok(nq.includes(`${item} <${PEER_ORIGIN}> <https://peer.example/> <https://minimal.example/> .\n`));
  // The same dataset feeds the other views (AGSC-05-06, AGSC-05-07).
  const ttl = String(built.files.get('/graph.ttl'));
  assert.match(ttl, /peer\.example\/concepts\/relay\//u);
  assert.match(ttl, /peerOrigin/u);
  for (const route of ['/graph.jsonld', '/pages/handoff.jsonld']) {
    const text = String(built.files.get(route));
    assert.match(text, /https:\/\/peer\.example\/concepts\/relay\//u, route);
    assert.match(text, /https:\/\/peer\.example\//u, route);
  }
  // A seeAlso edge takes part in no composition step and no Link: the other page is untouched.
  assert.doesNotMatch(String(built.files.get('/pages/supervisor.jsonld')), /peer\.example/u);
  assert.ok(!built.findings.some((f) => f.code === 'AGSC-E312'));
});

test('AGSC-11-12: a citation of a host that is not a declared peer stays a plain source', () => {
  const built = bundleWith([{ id: 'elsewhere', resource: 'https://elsewhere.example/x/' }]);
  const nq = String(built.files.get('/graph.nq'));
  assert.ok(!nq.includes(SEE_ALSO));
  assert.ok(!nq.includes(PEER_ORIGIN));
});

test('AGSC-11-12: a reference under a peer base that is no IRI is AGSC-E312 and is omitted', () => {
  const built = bundleWith([
    { id: 'bad', resource: 'https://peer.example/bad space/' },
    { id: 'fine', resource: 'https://peer.example/ok%20path/' },
  ]);
  const nq = String(built.files.get('/graph.nq'));
  assert.ok(nq.includes('<https://peer.example/ok%20path/>'), 'an existing escape is kept byte for byte');
  // The AGSC-11-12 edge is omitted; the source's own `dcterms:source` literal stays.
  assert.ok(!nq.includes('<https://peer.example/bad space/>'));
  const e312 = built.findings.filter((f) => f.code === 'AGSC-E312');
  assert.strictEqual(e312.length, 1, JSON.stringify(built.findings));
  assert.strictEqual(e312[0].severity, 'error');
  assert.strictEqual(e312[0].file, 'content/concepts/handoff.md');
});

test('AGSC-11-12: with no peers declared the build is unchanged and reports nothing', () => {
  const built = bundleWith([{ id: 'bad', resource: 'https://peer.example/bad space/' }], []);
  assert.ok(!String(built.files.get('/graph.nq')).includes(SEE_ALSO));
  assert.ok(!built.findings.some((f) => f.code === 'AGSC-E312'));
});
