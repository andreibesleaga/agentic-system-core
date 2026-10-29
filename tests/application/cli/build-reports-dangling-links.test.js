'use strict';
// I-153 (verification finding m2): `build` dropped an edge whose typed-link target does
// not exist without a word, while it reports a broken body link (AGSC-E310) and `lint`
// and `ci` report the Link as AGSC-E301. From 1.1 `build` reports it too. A 1.0 Bundle
// that carried the Link built, so the report is a warning (AGSC-00-14) and the build
// still writes its files and exits 0.
//
// Deterministic: fixed SOURCE_DATE_EPOCH, no network; a scratch copy of the minimal fixture.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { agsc, scratch } = require('./_bundle-run');

const HANDOFF = 'content/concepts/handoff.md';

function dangle(dir) {
  const file = path.join(dir, HANDOFF);
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.includes('kind: pattern\n'));
  fs.writeFileSync(file, text.replace('kind: pattern\n', 'kind: pattern\nrelated:\n  - no-such-item\n'));
}

test('build reports a typed-link target that does not exist as the warning AGSC-E301 and still builds', async (t) => {
  const dir = scratch(t);
  dangle(dir);
  const built = await agsc(dir, ['build', '--json']);
  assert.equal(built.exit, 0, built.stderr);
  const findings = JSON.parse(built.stdout).findings;
  const hits = findings.filter((f) => f.code === 'AGSC-E301');
  assert.equal(hits.length, 1, JSON.stringify(findings));
  assert.deepEqual([hits[0].severity, hits[0].file, hits[0].slug], ['warn', HANDOFF, 'handoff']);
  assert.match(hits[0].message, /no-such-item/u);
  assert.ok(fs.existsSync(path.join(dir, 'www', 'index.html')), 'the files are written');
  // lint and ci keep the error they always had
  assert.equal((await agsc(dir, ['lint', '--json'])).exit, 1);
  assert.equal((await agsc(dir, ['ci', '--json'])).exit, 1);
});

test('build of a Bundle with no dangling Link reports no AGSC-E301', async (t) => {
  const dir = scratch(t);
  const built = await agsc(dir, ['build', '--json']);
  assert.equal(built.exit, 0, built.stderr);
  assert.deepEqual(JSON.parse(built.stdout).findings.filter((f) => f.code === 'AGSC-E301'), []);
});
