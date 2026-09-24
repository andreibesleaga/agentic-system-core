'use strict';
// tests/knowledge/content-version.test.js — AGSC-04-25.
//
// The vector `build-0014` pins the five derivation cases; this file pins what a
// vector cannot: the grammar is TOTAL over the derivation (no input produces a
// value outside it), the derivation is byte-reproducible (the same git-log file
// derives the same string, and the abbreviation is fixed at twelve characters
// whatever the clone), and `versionRows` reads the git-log file rather than the
// ledger, because a 1.0 ledger entry does not carry the tag's name (AGSC-08-21).

const test = require('node:test');
const assert = require('node:assert');

const cv = require('../../src/knowledge/content-version.js');

const commit = (sha, tag, at = '2026-09-16T00:00:00Z') => {
  const one = { committed_at: at, parents: [], sha, trailers: {} };
  if (tag !== undefined && tag !== null) one.tag = tag;
  return one;
};

test('branch 1: the tag of the built commit, verbatim', () => {
  const got = cv.bundleVersion({ gitLog: [commit('a'.repeat(40), 'v2.0.0')] });
  assert.strictEqual(got.version, 'v2.0.0');
  assert.strictEqual(got.branch, 1);
  assert.deepStrictEqual(got.findings, []);
});

test('branch 2: the newest earlier tag, the count after it, twelve hex characters', () => {
  const log = [commit('c'.repeat(40)), commit('b'.repeat(40), 'v1.4.0'),
    commit('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678')];
  const got = cv.bundleVersion({ gitLog: log });
  assert.strictEqual(got.version, 'v1.4.0+1.ga1b2c3d4e5f6');
  assert.strictEqual(got.branch, 2);
  // Twelve, not git's own abbreviation: the width may not depend on the clone.
  assert.strictEqual(cv.HASH_WIDTH, 12);
  assert.strictEqual(got.version.split('.g')[1].length, 12);
});

test('branch 2 counts every element after the tagged one, not just one', () => {
  const log = [commit('b'.repeat(40), 'v1.4.0'), commit('c'.repeat(40)),
    commit('d'.repeat(40)), commit('e'.repeat(40))];
  assert.strictEqual(cv.bundleVersion({ gitLog: log }).version, 'v1.4.0+3.geeeeeeeeeeee');
});

test('branch 3: no tag anywhere counts the whole chain', () => {
  const log = [commit('c'.repeat(40)), commit('b'.repeat(40)), commit('a'.repeat(40))];
  const got = cv.bundleVersion({ gitLog: log });
  assert.strictEqual(got.version, '0.0.0+3.gaaaaaaaaaaaa');
  assert.strictEqual(got.branch, 3);
});

test('branch 4: no git history renders the build instant without separators', () => {
  const got = cv.bundleVersion({ buildInstant: '1970-01-01T00:00:00Z', gitLog: [] });
  assert.strictEqual(got.version, '0.0.0+19700101T000000Z');
  assert.strictEqual(got.branch, 4);
  assert.strictEqual(cv.bundleVersion({ buildInstant: '2026-09-16T12:34:56Z' }).version,
    '0.0.0+20260916T123456Z');
});

test('a tag outside the grammar is warned once and the derivation falls through', () => {
  const log = [commit('b'.repeat(40), 'v1.4.0'),
    commit('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', 'v2.0/final')];
  const got = cv.bundleVersion({ gitLog: log });
  assert.strictEqual(got.version, 'v1.4.0+1.ga1b2c3d4e5f6');
  assert.strictEqual(got.findings.length, 1);
  assert.strictEqual(got.findings[0].code, 'AGSC-E506');
  assert.strictEqual(got.findings[0].severity, 'warn');
  assert.match(got.findings[0].message, /v2\.0\/final/u);
});

test('the grammar is total over the derivation', () => {
  const nasty = ['v1.0 0', 'release/2026', 'tag\nwith-newline', 'ü1.0', '', 'x'.repeat(200)];
  for (const tag of nasty) {
    const got = cv.bundleVersion({
      buildInstant: '2026-09-16T00:00:00Z',
      gitLog: [commit('a'.repeat(40), tag)],
    });
    assert.match(got.version, cv.GRAMMAR, `tag ${JSON.stringify(tag)} -> ${got.version}`);
  }
  assert.match(cv.bundleVersion({ buildInstant: 'not an instant' }).version, cv.GRAMMAR);
  assert.match(cv.bundleVersion({}).version, cv.GRAMMAR);
  assert.match(cv.bundleVersion({ gitLog: [{}] }).version, cv.GRAMMAR);
});

test('the derivation is byte-reproducible: same inputs, same string', () => {
  const log = [commit('c'.repeat(40)), commit('b'.repeat(40), 'v1.4.0'), commit('a'.repeat(40))];
  const once = cv.bundleVersion({ buildInstant: '2026-09-16T00:00:00Z', gitLog: log });
  const twice = cv.bundleVersion({ buildInstant: '2026-09-16T00:00:00Z', gitLog: JSON.parse(JSON.stringify(log)) });
  assert.strictEqual(once.version, twice.version);
});

test('the 64-character bound of the grammar holds for a long tag on the built commit', () => {
  const tag = `v${'1'.repeat(63)}`;            // 64 characters: the longest admitted
  assert.strictEqual(cv.bundleVersion({ gitLog: [commit('a'.repeat(40), tag)] }).version, tag);
  const tooLong = `v${'1'.repeat(64)}`;        // 65: outside the grammar, warned
  const got = cv.bundleVersion({ gitLog: [commit('a'.repeat(40), tooLong)] });
  assert.strictEqual(got.findings[0].code, 'AGSC-E506');
  assert.strictEqual(got.version, '0.0.0+1.gaaaaaaaaaaaa');
});

test('orFromInstant is what a writer calls, and never yields an empty value', () => {
  assert.strictEqual(cv.orFromInstant('v1.4.0', '2026-09-16T00:00:00Z'), 'v1.4.0');
  assert.strictEqual(cv.orFromInstant(undefined, '2026-09-16T00:00:00Z'), '0.0.0+20260916T000000Z');
  assert.strictEqual(cv.orFromInstant('', '2026-09-16T00:00:00Z'), '0.0.0+20260916T000000Z');
  assert.strictEqual(cv.orFromInstant('not a version', '2026-09-16T00:00:00Z'), '0.0.0+20260916T000000Z');
  assert.match(cv.orFromInstant(null, null), cv.GRAMMAR);
});

test('versionRows reads the git-log file, oldest first, tags only', () => {
  const log = [
    commit('c'.repeat(40), undefined, '2026-09-01T00:00:00Z'),
    commit('b'.repeat(40), 'v1.4.0', '2026-09-08T10:11:12Z'),
    commit('a'.repeat(40), 'v2.0/final', '2026-09-16T00:00:00Z'),
    commit('d'.repeat(40), 'v2.0.0', '2026-09-20T00:00:00Z'),
  ];
  assert.deepStrictEqual(cv.versionRows(log), [
    { date: '2026-09-08', sha: 'b'.repeat(40), tag: 'v1.4.0' },
    { date: '2026-09-20', sha: 'd'.repeat(40), tag: 'v2.0.0' },
  ]);
  assert.deepStrictEqual(cv.versionRows(undefined), []);
  assert.deepStrictEqual(cv.versionRows([]), []);
});

test('compactInstant and fromInstant', () => {
  assert.strictEqual(cv.compactInstant('2026-09-16T00:00:00Z'), '20260916T000000Z');
  assert.strictEqual(cv.compactInstant('rubbish'), '19700101T000000Z');
  assert.strictEqual(cv.fromInstant('2026-09-16T00:00:00Z'), '0.0.0+20260916T000000Z');
  assert.strictEqual(cv.abbreviate('A1B2C3D4E5F6071829'), 'a1b2c3d4e5f6');
});
