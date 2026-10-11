'use strict';
// The trailing line feeds of a text are removed, or made exactly one, by a scan from
// the end, in linear steps (src/shared/trailing.js). The patterns it replaces,
// `/\n+$/u` and `/\n*$/u`, read to the end of every run of line feeds from each of
// its positions, so a body with a long run of line feeds before its last word stalled
// the caller (100,000 line feeds took tens of seconds). The modules of the Knowledge
// context use the shared scan, and the last test keeps the patterns from coming back
// there.
//
// Steps are counted, not timed (tests/_linear-kit.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const trailing = require('../../src/shared/trailing.js');
const markdown = require('../../src/knowledge/markdown.js');
const runblocks = require('../../src/knowledge/runblocks.js');
const { MIB, assertLinear, longRuns, texts } = require('../_linear-kit.js');

const REPO = path.resolve(__dirname, '..', '..');
const SEED = 20261011;
const COUNT = 20000;
// the pieces that matter to the patterns: the line feed, a run of two, the characters
// a careless scan could mistake for one (a carriage return, the two Unicode line
// separators, a space, a slash) and plain text, with an astral character whose UTF-16
// halves are not line feeds.
const ALPHABET = ['\n', '\n\n', '\r', '\r\n', '\u2028', '\u2029', ' ', '/', 'a', '\u{1F600}'];

/** The patterns as they stood, kept as the reference the scan must equal. */
const OLD = {
  without: (text) => text.replace(/\n+$/u, ''),
  withoutStar: (text) => text.replace(/\n*$/u, ''),
  one: (text) => text.replace(/\n*$/u, '\n'),
  trimThenOne: (text) => `${text.replace(/\n+$/u, '')}\n`,
};

const FIXED = ['', '\n', '\n\n\n', 'a', 'a\n', 'a\n\n', '\na', 'a\nb', 'a\r\n', 'a\n\r', 'a\u2028', '\u{1F600}\n'];

test('withoutTrailingFeeds equals both patterns it replaces on a seeded corpus', () => {
  for (const text of [...texts(SEED, COUNT, ALPHABET), ...FIXED]) {
    assert.equal(trailing.withoutTrailingFeeds(text), OLD.without(text), JSON.stringify(text));
    assert.equal(trailing.withoutTrailingFeeds(text), OLD.withoutStar(text), JSON.stringify(text));
  }
});

test('withOneTrailingFeed equals both patterns it replaces on a seeded corpus', () => {
  for (const text of [...texts(SEED + 1, COUNT, ALPHABET), ...FIXED]) {
    assert.equal(trailing.withOneTrailingFeed(text), OLD.one(text), JSON.stringify(text));
    assert.equal(trailing.withOneTrailingFeed(text), OLD.trimThenOne(text), JSON.stringify(text));
  }
});

test('a text with no trailing line feed is returned unchanged, and one with exactly one keeps it', () => {
  const text = 'x'.repeat(16);
  assert.equal(trailing.withoutTrailingFeeds(text), text);
  assert.equal(trailing.withOneTrailingFeed(`${text}\n`), `${text}\n`);
});

test('a 1 MiB run of line feeds before a word is kept, in linear steps', () => {
  const text = `${'\n'.repeat(MIB)}x`;
  assert.equal(assertLinear('withoutTrailingFeeds, a run then a word', trailing.withoutTrailingFeeds, text, 2), text);
  assert.equal(assertLinear('withOneTrailingFeed, a run then a word', trailing.withOneTrailingFeed, text, 2), `${text}\n`);
});

test('every long run of the alphabet is trimmed in linear steps', () => {
  // none of these runs puts a long run of line feeds before another character, so the
  // old patterns answer them quickly and serve as the reference here too.
  for (const { label, input } of longRuns(ALPHABET)) {
    assert.equal(assertLinear(`withoutTrailingFeeds, ${label}`, trailing.withoutTrailingFeeds, input, 2),
      OLD.without(input));
    assert.equal(assertLinear(`withOneTrailingFeed, ${label}`, trailing.withOneTrailingFeed, input, 2),
      OLD.one(input));
  }
  assert.equal(assertLinear('withoutTrailingFeeds, a word then a run', trailing.withoutTrailingFeeds,
    `x${'\n'.repeat(MIB)}`, 2), 'x');
});

test('the Knowledge callers keep their results on a long run of line feeds', () => {
  // markdown.fenceProse quotes prose in a fence without its trailing line feeds;
  // runblocks.matches compares a captured result with an expect block the same way.
  const prose = `${'\n'.repeat(MIB)}x${'\n'.repeat(8)}`;
  assert.equal(markdown.fenceProse(prose), `\`\`\`text agsc-content\n${'\n'.repeat(MIB)}x\n\`\`\``);
  assert.equal(runblocks.matches(`${'\n'.repeat(MIB)}x\r\n\r\n`, `${'\n'.repeat(MIB)}x\n`), true);
  assert.equal(runblocks.matches(`${'\n'.repeat(MIB)}x\n`, `${'\n'.repeat(MIB)}y\n`), false);
});

/** Every file under `dir` (repository-relative), skipping dependency folders and prose. */
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

// The folders whose modules no longer carry either pattern. The other contexts move
// onto the shared scan next, and their folders join this list when they do. The shared
// module names the patterns it replaced in its comments.
const FOLDERS = ['src/knowledge', 'src/shared'];
const KEPT = new Set(['src/shared/trailing.js']);

test('no module of the Knowledge context uses either trailing line-feed pattern', () => {
  const patterns = ['/\\n+$/', '/\\n*$/'];
  const offenders = [];
  for (const rel of FOLDERS.flatMap(files)) {
    if (KEPT.has(rel)) continue;
    const text = fs.readFileSync(path.join(REPO, rel), 'utf8');
    text.split('\n').forEach((line, i) => {
      if (patterns.some((pattern) => line.includes(pattern))) offenders.push(`${rel}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, []);
});
