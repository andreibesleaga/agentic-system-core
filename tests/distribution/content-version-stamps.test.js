'use strict';
// tests/distribution/content-version-stamps.test.js — AGSC-04-25's nine stamping
// places, over a real build of the fixture Bundle, plus the two deliberate
// absences the rule states.
//
// The vectors pin the BYTES of four of the nine (`disc-0013`, `disc-0014`,
// `disc-0015`, `build-0014`). This file pins the other five and, more importantly,
// pins that ONE value reaches all of them: a build that stamped two different
// strings would satisfy every vector and still be wrong.
//
// Deterministic: a fixed `SOURCE_DATE_EPOCH`, an injected git-log file, no process
// and no network.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const site = require('../../src/distribution/site.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const EPOCH = '1767225600';
const VERSION = 'v1.4.0';

const GIT_LOG = Object.freeze([
  { committed_at: '2025-09-01T00:00:00Z', parents: [], sha: 'a'.repeat(40), trailers: {} },
  { committed_at: '2025-09-08T10:11:12Z', parents: ['a'.repeat(40)], sha: 'b'.repeat(40), tag: 'v1.0.0', trailers: {} },
  { committed_at: '2026-01-01T00:00:00Z', parents: ['b'.repeat(40)], sha: 'c'.repeat(40), tag: VERSION, trailers: {} },
]);

function build(options) {
  const fs = createFileSystem(FIXTURE);
  const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(ROOT)) });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } });
  return site.build(bundle, { clock, fs },
    { specVersion: '1.0.0-rc.6', version: '0.0.2', ...(options || {}) });
}

test('AGSC-04-25: the build derives the version from the git-log file it is given', () => {
  const { files } = build({ gitLog: GIT_LOG });
  // Branch 1: the built commit carries a usable tag.
  assert.match(String(files.get('/llms.txt')), new RegExp(`\\nbundle_version: ${VERSION}\\n`, 'u'));
});

test('AGSC-04-25: ONE value reaches every stamping place', () => {
  const { files } = build({ bundleVersion: VERSION, gitLog: GIT_LOG });
  const line = `bundle_version: ${VERSION}`;

  // (1) the provenance header, which AGSC-01-29 routes every agent-facing digest
  // through — the two text files here, and the skill pack beside them.
  for (const route of ['/llms.txt', '/llms-full.txt', '/skills/agent-patterns/SKILL.md']) {
    const text = String(files.get(route));
    assert.ok(text.includes(`\n${line}\n`), `${route} carries no ${line}`);
    // Its position is fixed: between `spec_version:` and `generated_at:`.
    assert.ok(text.indexOf('spec_version:') < text.indexOf(line), route);
    assert.ok(text.indexOf(line) < text.indexOf('generated_at:'), route);
  }

  // (2) the discovery document, as one value beside `agsc-bundle-hash`.
  const wellknown = JSON.parse(String(files.get('/.well-known/knowledge-linkset')));
  const anchor = wellknown.linkset[0].describedby[0];
  assert.deepStrictEqual(anchor['agsc-bundle-version'], [VERSION]);
  const names = Object.keys(anchor);
  assert.strictEqual(names[names.indexOf('agsc-bundle-hash') + 1], 'agsc-bundle-version',
    'the JCS member order puts it immediately after agsc-bundle-hash');

  // (3) the NOW line, with the four values in AGSC-06-22's order.
  assert.match(String(files.get('/now.md')),
    new RegExp(`\\ncontent version ${VERSION}, built at 2026-01-01T00:00:00Z, `
      + 'fingerprint [0-9a-f]{64}, specification 1\\.0\\.0-rc\\.6\\n', 'u'));
  // The fingerprint IS the SHA-256 of graph.nq (AGSC-04-15), not some other digest.
  const { createHash } = require('node:crypto');
  const fingerprint = createHash('sha256').update(String(files.get('/graph.nq')), 'utf8').digest('hex');
  assert.ok(String(files.get('/now.md')).includes(`fingerprint ${fingerprint},`));

  // (4) `/skills/index.json`, where JCS sorts it first.
  const index = JSON.parse(String(files.get('/skills/index.json')));
  assert.strictEqual(index.bundle_version, VERSION);
  assert.strictEqual(Object.keys(index)[0], 'bundle_version');

  // (5) `/changelog/`, the versions list: one row per tagged element, oldest first.
  const changelog = String(files.get('/changelog/index.html'));
  assert.ok(changelog.includes('<code>v1.0.0</code>'), changelog);
  assert.ok(changelog.includes('<code>v1.4.0</code>'), changelog);
  assert.ok(changelog.indexOf('v1.0.0') < changelog.indexOf('v1.4.0'), 'oldest first');
  assert.ok(changelog.includes('2025-09-08'), 'the committed_at DATE, not the instant');
  assert.ok(changelog.includes(`<code>${'c'.repeat(40)}</code>`), 'the sha');
  assert.ok(!changelog.includes('<code>aaaa'), 'an untagged commit is not a version');
});

test('AGSC-01-27: the two graph exports carry the version NOWHERE', () => {
  const { files } = build({ bundleVersion: VERSION, gitLog: GIT_LOG });
  // Asserted so that a later change cannot add it by accident: both are
  // byte-identical to the graph of the same build and may not invent a member.
  for (const route of ['/graph.jsonld', '/graph.nq', '/graph.ttl']) {
    assert.ok(!String(files.get(route)).includes('bundle_version'), `${route} carries it`);
    assert.ok(!String(files.get(route)).includes(VERSION), `${route} carries the value`);
  }
});

test('AGSC-06-31: the shard manifest carries it where sharding produced one', () => {
  // The fixture is far below the 500-item shard bound, so `/chunks.jsonl` is the
  // records themselves and carries no manifest — which is the rule, not a gap.
  const { files } = build({ bundleVersion: VERSION, gitLog: GIT_LOG });
  const chunks = String(files.get('/chunks.jsonl'));
  assert.ok(!chunks.startsWith('{"bundle_version"'), 'an unsharded export is the records');
  // The manifest itself is proved over a sharded set in
  // `tests/distribution/pagination.test.js` and `page-tools-shards.test.js`.
  const chunksModule = require('../../src/knowledge/chunks.js');
  const { canonicalize } = require('../../src/knowledge/jcs.js');
  const records = [];
  for (let i = 0; i < 501; i += 1) {
    records.push({ digest: 'a'.repeat(64), id: 'b'.repeat(64), item: `i-${String(i).padStart(4, '0')}`, ordinal: 0, text: 'x' });
  }
  const sharded = chunksModule.files(records, canonicalize, { bundleVersion: VERSION });
  assert.strictEqual(JSON.parse(sharded.files[0].text).bundle_version, VERSION);
  // And a caller with no content version states none rather than an empty value.
  assert.strictEqual(JSON.parse(chunksModule.files(records, canonicalize).files[0].text).bundle_version,
    undefined);
});

test('with no git-log file the build still stamps, from the build instant', () => {
  const { files, skipped } = build({});
  assert.match(String(files.get('/llms.txt')), /\nbundle_version: 0\.0\.0\+20260101T000000Z\n/u);
  // And `/changelog/` is not derived at all, with the reason said out loud.
  assert.ok(!files.has('/changelog/index.html'));
  assert.ok(skipped.some((s) => s.startsWith('/changelog/')), JSON.stringify(skipped));
});

test('AGSC-11-20: a restricted node stamps nothing a content oracle could read', () => {
  const fs = createFileSystem(FIXTURE);
  const loaded = loadBundle(fs, { schemas: validate.schemas(readSchemas(ROOT)) });
  const bundle = {
    ...loaded,
    config: { ...loaded.config, access: 'https://example.org/access/', visibility: 'restricted' },
  };
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } });
  const { files } = site.build(bundle, { clock, fs },
    { bundleVersion: VERSION, gitLog: GIT_LOG, specVersion: '1.0.0-rc.6', version: '0.0.2' });
  const anchor = JSON.parse(String(files.get('/.well-known/knowledge-linkset'))).linkset[0].describedby[0];
  for (const gone of ['agsc-bundle-version', 'agsc-bundle-hash', 'agsc-counts']) {
    assert.strictEqual(anchor[gone], undefined, `${gone} reached a restricted node`);
  }
  // It still says the node exists and is current.
  assert.deepStrictEqual(anchor['agsc-visibility'], ['restricted']);
  assert.ok(Array.isArray(anchor['agsc-spec-version']));
  assert.ok(Array.isArray(anchor['agsc-generated-at']));
});

test('AGSC-04-02: the version does not make the build irreproducible', () => {
  const first = build({ bundleVersion: VERSION, gitLog: GIT_LOG }).files;
  const second = build({ bundleVersion: VERSION, gitLog: GIT_LOG }).files;
  assert.deepStrictEqual([...first.keys()], [...second.keys()]);
  for (const [route, text] of first) assert.strictEqual(second.get(route), text, route);
});
