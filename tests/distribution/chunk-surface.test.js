'use strict';
// Requirement: PRD-079 (docs/PRD.md).
// The chunk surface of a 1.1 build, on the minimal fixture: the tabular index
// `/chunks-index.toon` (AGSC-06-37) and its `_headers` block (AGSC-11-03), the digest, count
// and set commitment of the chunks surface link and the ledger length (AGSC-06-44), what a
// restricted node leaves out of that link (AGSC-11-20 (d)), the licence URL on every chunk
// (AGSC-06-44) and the two digest header fields the build never writes into `_headers`
// (AGSC-09-17 (b), AGSC-06-17). Fixed clock, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const chunks = require('../../src/knowledge/chunks.js');
const { sha256Field } = require('../../src/knowledge/digest-field.js');
const site = require('../../src/distribution/site.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const REL = 'https://w3id.org/agentic-system-core/rel#';
const GIT_LOG = [{ sha: 'a'.repeat(40), committed_at: '2026-01-01T00:00:00Z', parents: [], trailers: {} }];

function build(config = {}, extra = {}) {
  const fs = createFileSystem(FIXTURE);
  const loaded = loadBundle(fs, { schemas: validate.schemas(readSchemas(ROOT)) });
  const bundle = { ...loaded, config: { ...loaded.config, ...config } };
  const ports = { fs, clock: createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } }) };
  return site.build(bundle, ports, { specVersion: '1.1.0', version: '1.1.0', gitLog: GIT_LOG, contentTree: 'b'.repeat(40), ...extra });
}

const linksetOf = (files) => JSON.parse(files.get('/.well-known/knowledge-linkset')).linkset[0];
const linesOf = (text) => text.split('\n').slice(0, -1).map((line) => JSON.parse(line));
const chunksLink = (files) => (linksetOf(files)[`${REL}surface`] || []).find((one) => one['agsc-surface'][0] === 'chunks');

test('the build writes /chunks-index.toon, one row per chunk line in the same order (AGSC-06-37)', () => {
  const { files } = build();
  const lines = linesOf(files.get('/chunks.jsonl'));
  const index = files.get('/chunks-index.toon');
  assert.equal(index.split('\n')[0], `chunks[${lines.length}]{id,item,kind,section,ordinal,title,digest}:`);
  index.split('\n').slice(1, -1).forEach((row, i) => assert.ok(row.startsWith(`  ${lines[i].id.slice(0, 16)},`), row));
});

test('the chunks surface link carries the digest, the count and the set commitment (AGSC-06-44)', () => {
  const { files } = build();
  const link = chunksLink(files);
  const lines = linesOf(files.get('/chunks.jsonl'));
  assert.deepEqual(link.digest, [sha256Field(files.get('/chunks.jsonl'))]);
  assert.deepEqual(link['agsc-chunk-count'], [String(lines.length)]);
  assert.deepEqual(link['agsc-chunk-set'], [chunks.commitment(lines).set]);
});

test('the ledger link carries agsc-ledger-length, the number of ledger entries (AGSC-06-44)', () => {
  const { files } = build();
  const ledger = linksetOf(files)[`${REL}ledger`][0];
  assert.deepEqual(ledger['agsc-ledger-length'], [String(files.get('/ledger.jsonl').split('\n').length - 1)]);
});

test('a restricted node omits the four attributes from its links (AGSC-11-20 (d))', () => {
  const { files } = build({ visibility: 'restricted', access: 'https://a.example/access/' });
  const link = chunksLink(files);
  for (const name of ['digest', 'agsc-chunk-count', 'agsc-chunk-set']) assert.equal(name in link, false, name);
  assert.equal(`${REL}ledger` in linksetOf(files), false);
  assert.ok(!files.get('/_headers').includes('/chunks-index.toon\n  Access-Control-Allow-Origin'));
});

test('every chunk carries the licence URL of /legal/ when the node emits it (AGSC-06-44)', () => {
  const { files } = build({}, { licenseContent: 'Terms.\n' });
  assert.ok(files.has('/legal/index.html'));
  const base = String(files.get('/.well-known/knowledge-linkset').match(/"anchor":"([^"]+)"/u)[1]);
  for (const line of linesOf(files.get('/chunks.jsonl'))) assert.equal(line.license_url, `${base}legal/`);
});

test('_headers serves /chunks-index.toon to other origins as text/toon, and carries no digest field', () => {
  const { files } = build();
  const text = files.get('/_headers');
  const block = text.slice(text.indexOf('\n/chunks-index.toon\n'));
  assert.match(block.split('\n\n')[0], /Access-Control-Allow-Origin: \*/u);
  assert.match(block.split('\n\n')[0], /Content-Type: text\/toon; charset=utf-8/u);
  // AGSC-09-17 (b): no Content-Digest in `_headers`, and no static Repr-Digest on a host that compresses.
  assert.doesNotMatch(text, /Content-Digest|Repr-Digest/iu);
});
