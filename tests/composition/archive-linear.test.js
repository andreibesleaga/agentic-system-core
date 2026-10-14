'use strict';
// The archive's own file name (AGSC-04-25) drops the trailing slashes of the folder it
// names in linear steps. The pattern it used read to the end of the text from every
// slash of every earlier run, so a long run of slashes before any other character took
// quadratic time (100,000 characters took about 23 s). `archiveName` runs in both
// hosts, so the scan is a portable function of this module, tested here against the
// shared one.
//
// Steps are counted, not timed (tests/_linear-kit.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const archive = require('../../src/composition/archive.js');
const trailing = require('../../src/shared/trailing.js');
const { MIB, assertLinear, longRuns, texts } = require('../_linear-kit.js');

const ALPHABET = ['/', '//', 'a', '\\', '\n', ' ', '.', 'é', '\u{1F600}', 'dist', '-'];

test('the portable trim equals the shared one and the pattern it replaced on a seeded corpus', () => {
  for (const text of texts(20261012, 20000, ALPHABET)) {
    assert.equal(archive.withoutTrailingSlashes(text), trailing.withoutTrailingSlashes(text), JSON.stringify(text));
    assert.equal(archive.withoutTrailingSlashes(text), text.replace(/\/+$/u, ''), JSON.stringify(text));
  }
});

test('an archive name whose stem holds a 1 MiB run of slashes is built in linear steps', () => {
  const stem = `${'/'.repeat(MIB)}x`;
  assert.equal(assertLinear('archiveName, a run then a word', (t, m) => archive.archiveName(t, '1.0.0', m), stem),
    `${stem}-1.0.0.zip`);
  assert.equal(assertLinear('archiveName, all slashes', (t, m) => archive.archiveName(t, 'x', m), '/'.repeat(MIB)), '-x.zip');
  assert.equal(archive.archiveName('dist/harness/abc///', '1.0.0'), 'dist/harness/abc-1.0.0.zip');
  assert.equal(archive.archiveName(null, null), '-unversioned.zip');
});

test('every long run of the alphabet is trimmed in linear steps', () => {
  for (const { label, input } of longRuns(ALPHABET)) {
    assertLinear(`withoutTrailingSlashes, ${label}`, archive.withoutTrailingSlashes, input, 2);
  }
});
