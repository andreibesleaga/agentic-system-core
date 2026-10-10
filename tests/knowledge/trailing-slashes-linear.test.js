'use strict';
// The trailing slashes of a base address or a folder path are removed by a scan from
// the end, in linear steps (src/shared/trailing.js). The pattern it replaced,
// `/\/+$/u`, read to the end of the text from every slash of every earlier run, so a
// long run of slashes followed by any other character stalled the caller (100,000
// characters took about 23 s). Every module outside the two emitted page scripts now
// uses the shared scan, and the last test keeps the pattern from coming back.
//
// Steps are counted, not timed (tests/_linear-kit.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const trailing = require('../../src/shared/trailing.js');
const release = require('../../tools/release');
const { MIB, assertLinear, longRuns, texts } = require('../_linear-kit.js');

const REPO = path.resolve(__dirname, '..', '..');
const SEED = 20261010;
const COUNT = 20000;
// the pieces that matter to the pattern: the slash, a run of two, the characters a
// careless scan could mistake for one (backslash, a line feed before the end, an
// astral character whose UTF-16 halves are not slashes) and plain text.
const ALPHABET = ['/', '//', 'a', '\\', '\n', ' ', '.', 'é', '\u{1F600}'];

/** The pattern as it stood, kept as the reference the scan must equal. */
const OLD = {
  without: (text) => text.replace(/\/+$/u, ''),
  collapsed: (text) => text.replace(/\/+$/u, '/'),
};

test('withoutTrailingSlashes equals the pattern it replaced on a seeded corpus', () => {
  for (const text of texts(SEED, COUNT, ALPHABET)) {
    assert.equal(trailing.withoutTrailingSlashes(text), OLD.without(text), JSON.stringify(text));
  }
  for (const text of ['', '/', '///', 'a', 'a/', 'a///', '/a', 'https://a.example', 'https://a.example//']) {
    assert.equal(trailing.withoutTrailingSlashes(text), OLD.without(text), JSON.stringify(text));
  }
});

test('collapseTrailingSlashes equals the pattern it replaced on a seeded corpus', () => {
  for (const text of texts(SEED + 1, COUNT, ALPHABET)) {
    assert.equal(trailing.collapseTrailingSlashes(text), OLD.collapsed(text), JSON.stringify(text));
  }
  for (const text of ['', '/', '///', 'a', 'a/', 'a///', 'https://a.example', 'https://a.example//']) {
    assert.equal(trailing.collapseTrailingSlashes(text), OLD.collapsed(text), JSON.stringify(text));
  }
});

test('the release tool\'s own copy equals the pattern it replaced on a seeded corpus', () => {
  for (const text of texts(SEED + 2, COUNT, ALPHABET)) {
    assert.equal(release.withoutTrailingSlashes(text), OLD.without(text), JSON.stringify(text));
  }
});

test('a text with no trailing slash is returned unchanged', () => {
  const text = 'x'.repeat(16);
  assert.equal(trailing.withoutTrailingSlashes(text), text);
  assert.equal(trailing.collapseTrailingSlashes(text), text);
});

test('a 1 MiB run of slashes before a word is kept, in linear steps', () => {
  const text = `${'/'.repeat(MIB)}x`;
  assert.equal(assertLinear('withoutTrailingSlashes, a run then a word', trailing.withoutTrailingSlashes, text, 2), text);
  assert.equal(assertLinear('collapseTrailingSlashes, a run then a word', trailing.collapseTrailingSlashes, text, 2), text);
});

test('every long run of the alphabet is trimmed in linear steps', () => {
  // none of these runs puts a long run of slashes before another character, so the
  // old pattern answers them quickly and serves as the reference here too.
  for (const { label, input } of longRuns(ALPHABET)) {
    assert.equal(assertLinear(`withoutTrailingSlashes, ${label}`, trailing.withoutTrailingSlashes, input, 2),
      OLD.without(input));
    assert.equal(assertLinear(`collapseTrailingSlashes, ${label}`, trailing.collapseTrailingSlashes, input, 2),
      OLD.collapsed(input));
  }
  assert.equal(assertLinear('withoutTrailingSlashes, all slashes', trailing.withoutTrailingSlashes, '/'.repeat(MIB), 2), '');
  assert.equal(assertLinear('collapseTrailingSlashes, all slashes', trailing.collapseTrailingSlashes, '/'.repeat(MIB), 2), '/');
  assert.equal(assertLinear('withoutTrailingSlashes, a word then a run', trailing.withoutTrailingSlashes,
    `x${'/'.repeat(MIB)}`, 2), 'x');
});

/** Every file under `dir` (repository-relative), skipping dependency folders. */
function files(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') out.push(...files(rel));
    } else if (!entry.name.endsWith('.md')) {
      out.push(rel);
    }
  }
  return out;
}

// The code the build copies into every node's pages keeps its own copy of the
// pattern: the page tools' script, the compose page's script, and `archiveName`,
// whose source text the compose page's bundle carries (composition/browser.js).
// Changing them changes the bytes every node emits, which waits for a later version.
// The shared module names the pattern it replaced in its comments.
const KEPT = new Set(['src/distribution/page-tools.js', 'src/distribution/compose-page.js',
  'src/composition/archive.js', 'src/shared/trailing.js']);

test('no module, command or tool outside the emitted page code uses the pattern', () => {
  const pattern = ['/', '\\/', '+$/'].join('');
  const offenders = [];
  for (const rel of [...files('src'), ...files('bin'), ...files('tools'), 'index.js']) {
    if (KEPT.has(rel)) continue;
    const text = fs.readFileSync(path.join(REPO, rel), 'utf8');
    text.split('\n').forEach((line, i) => {
      if (line.includes(pattern)) offenders.push(`${rel}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, []);
});
