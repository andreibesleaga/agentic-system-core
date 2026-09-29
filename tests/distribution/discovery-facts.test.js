'use strict';
// The discovery document's bundle facts and link shapes, from the reference writer
// (`distribution/discovery.js#linkset`) and its own reader (`#check`, `#peerCheck`):
//   AGSC-06-08 / AGSC-04-15  `agsc-bundle-hash` is the SHA-256 of `graph.nq`;
//   AGSC-11-20               a restricted node publishes no digest of a gated target;
//   AGSC-06-10 / AGSC-06-35  a related-system `title` is a string, `profile` an array;
//   AGSC-00-21 / AGSC-09-93  a newer MINOR's relation or attribute is ignored with a
//                            warning, and a peer that uses one still resolves.
// Deterministic: fixed build instant, no network.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const site = require('../../src/distribution/site.js');
const discovery = require('../../src/distribution/discovery.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const REL = discovery.REL;

function built() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-facts-'));
  try {
    fs.cpSync(FIXTURE, dir, { recursive: true });
    const port = createFileSystem(dir);
    const bundle = loadBundle(port, { schemas: validate.schemas(readSchemas(ROOT)) });
    const clock = createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } });
    return site.build(bundle, { clock, fs: port }, { specVersion: '1.0.0-rc.6', version: '0.0.0' });
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
}

test('AGSC-06-08 / AGSC-04-15: agsc-bundle-hash is the SHA-256 of graph.nq, the fingerprint /now.md shows', () => {
  const files = built().files;
  const doc = JSON.parse(String(files.get(discovery.WELLKNOWN_PATH)));
  const context = doc.linkset[0];
  const hash = context.describedby[0]['agsc-bundle-hash'];
  const nq = files.get('/graph.nq');
  const expected = `sha-256=:${createHash('sha256').update(Buffer.from(String(nq), 'utf8')).digest('base64')}:`;
  assert.deepStrictEqual(hash, [expected]);
  const graphLink = context[`${REL}graph`].find((one) => one.href.endsWith('/graph.nq'));
  assert.deepStrictEqual(graphLink.digest, hash, 'the bundle hash and the digest of graph.nq disagree');
  const hex = createHash('sha256').update(Buffer.from(String(nq), 'utf8')).digest('hex');
  assert.ok(String(files.get('/now.md')).includes(hex), 'the NOW view shows another fingerprint');
});

test('AGSC-11-20: a restricted node carries a digest only on /graph.jsonld and /llms.txt', () => {
  const digests = {};
  for (const route of ['/graph.jsonld', '/llms.txt', '/graph.nq', '/graph.ttl', '/now.md', '/skills/index.json',
    '/ns/context.jsonld', '/ledger.jsonl']) digests[route] = discovery.digestOf(route);
  const config = { access: 'https://a.example/access/', site: { base: 'https://a.example' }, visibility: 'restricted' };
  const doc = discovery.linkset(config, { digests, generatedAt: '2026-01-01T00:00:00Z', ledgerHead: 'a'.repeat(64),
    specVersion: '1.0.0-rc.6', bundleHash: digests['/graph.nq'], bundleVersion: 'v1.0.0', counts: [] });
  const withDigest = [];
  for (const [relation, links] of Object.entries(doc.linkset[0])) {
    if (relation === 'anchor') continue;
    for (const one of links) if (one.digest !== undefined) withDigest.push(new URL(one.href).pathname);
  }
  assert.deepStrictEqual(withDigest.sort(), ['/graph.jsonld', '/llms.txt']);
  const anchor = doc.linkset[0].describedby[0];
  for (const name of ['agsc-bundle-hash', 'agsc-bundle-version', 'agsc-counts']) assert.strictEqual(anchor[name], undefined, name);
  assert.strictEqual(doc.linkset[0][`${REL}ledger`], undefined);
  // A public node keeps every digest.
  const open = discovery.linkset({ site: { base: 'https://a.example' } }, { digests });
  assert.ok(open.linkset[0][`${REL}graph`].every((one) => Array.isArray(one.digest)));
});

test('AGSC-06-10 / AGSC-06-35: the build writes a related-system title as a string and profile as an array', () => {
  const doc = discovery.linkset({
    related: [
      { href: 'https://registry.example/b.json', profile: 'https://p.example/', rel: 'related', title: 'B', type: 'application/json' },
      { href: 'https://registry.example/a.json', rel: 'related', type: 'application/json' },
    ],
    site: { base: 'https://a.example' },
  }, { level: 0 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(doc.linkset[0].related)), [
    { href: 'https://registry.example/a.json', type: 'application/json' },
    { href: 'https://registry.example/b.json', profile: ['https://p.example/'], title: 'B', type: 'application/json' },
  ]);
  assert.deepStrictEqual(discovery.check(doc, { level: 0 }), []);
});

test('AGSC-00-21 / AGSC-09-93: a newer MINOR\'s relation and attribute are warned and ignored; another MAJOR fails', () => {
  const later = (version) => ({
    linkset: [{
      anchor: 'https://b.example/',
      describedby: [{ 'agsc-spec-version': [version], 'agsc-summary': 'a later attribute, in a later shape', href: 'https://b.example/graph.jsonld', type: 'application/ld+json' }],
      [`${REL}brief`]: [{ href: 'https://b.example/brief.md', type: 'text/markdown' }],
      [`${REL}peer`]: [{ href: 'https://a.example/.well-known/knowledge-linkset', type: discovery.MEDIA_TYPE }],
    }],
  });
  // Level 1: a Level-0 document states no version (AGSC-06-08a), so it has none to be newer.
  const findings = discovery.check(later('1.1.0'), { level: 1 });
  assert.deepStrictEqual(findings.map((f) => [f.code, f.severity]), [['AGSC-E506', 'warn'], ['AGSC-E506', 'warn']]);
  assert.ok(findings.every((f) => f.message.includes('1.1.0')));
  const refused = discovery.check(later('2.0.0'), { level: 1 });
  assert.ok(refused.some((f) => f.code === 'AGSC-E209' && f.severity === 'error'));
  // The mutual check of AGSC-10-12 between a 1.0 node and a 1.1 node still holds.
  const mine = {
    linkset: [{
      anchor: 'https://a.example/',
      describedby: [{ href: 'https://a.example/graph.jsonld', type: 'application/ld+json' }],
      [`${REL}peer`]: [{ href: 'https://b.example/.well-known/knowledge-linkset', type: discovery.MEDIA_TYPE }],
    }],
  };
  const result = discovery.peerCheck([
    { doc: mine, level: 0, url: 'https://a.example/.well-known/knowledge-linkset' },
    { doc: later('1.1.0'), level: 1, url: 'https://b.example/.well-known/knowledge-linkset' },
  ]);
  assert.strictEqual(result.both_resolve, true);
  assert.strictEqual(result.mutual, true);
});
