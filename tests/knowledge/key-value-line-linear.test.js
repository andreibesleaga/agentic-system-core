'use strict';
// The rest of one line after a fixed head is read in linear steps
// (src/shared/key-value-line.js). The patterns it replaces, a head followed by a run
// of blanks and then `(.*)$` or `(.+)$`, gave the blanks back one at a time when the
// rest of the line held a line terminator that `.` does not match (a carriage return,
// U+2028, U+2029), and read the rest again each time: one 100 KB line took tens of
// seconds. The helper reads the head once, looks for a terminator once, and slices.
//
// Steps are counted, not timed (tests/_linear-kit.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const line = require('../../src/shared/key-value-line.js');
const { MIB, assertLinear, longRuns, texts } = require('../_linear-kit.js');

const SEED = 20261012;
const COUNT = 20000;
const ALPHABET = ['k:', 'key:', '#', '###', ' ', '\t', '  ', ':', 'x', 'y z', '\r', '\u2028', '\u2029', '\u00a0', '\n'];

const KEY = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*/u;
const WHITE_KEY = /^([a-z][a-z0-9_-]*):\s*/u;
const HASH = /^###/u;

/** The patterns as they stood, kept as the references the helper must equal. */
const OLD = {
  key: /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/u,
  whiteKey: /^([a-z][a-z0-9_-]*):\s*(.*)$/u,
  heading: /^###\s+(.+)$/u,
};

const pair = (m) => (m === null ? null : { key: m[1], value: m[2] });

test('keyValueLine equals both key patterns it replaces on a seeded corpus', () => {
  for (const text of texts(SEED, COUNT, ALPHABET)) {
    assert.deepEqual(line.keyValueLine(text, KEY), pair(OLD.key.exec(text)), JSON.stringify(text));
    assert.deepEqual(line.keyValueLine(text, WHITE_KEY), pair(OLD.whiteKey.exec(text)), JSON.stringify(text));
  }
});

test('lineText equals a head, a blank run and "(.+)$" on a seeded corpus, the short lines included', () => {
  const fixed = ['###', '### ', '###  ', '### \u2028', '###\u2028 ', '### x', '###\tx\r', '###  \r', '### \u00a0', '###\r\r'];
  for (const text of [...texts(SEED + 1, COUNT, ALPHABET), ...fixed]) {
    const m = OLD.heading.exec(text);
    const found = line.lineText(text, HASH);
    assert.deepEqual(found === null ? null : found.text, m === null ? null : m[1], JSON.stringify(text));
  }
});

test('hasLineTerminator finds the four line terminators and nothing else', () => {
  for (const text of ['a\nb', 'a\rb', 'a\u2028b', 'a\u2029b']) assert.equal(line.hasLineTerminator(text), true);
  for (const text of ['', 'a', 'a\tb', 'a\u0085b', 'a\u00a0b', '\u{1F600}']) assert.equal(line.hasLineTerminator(text), false);
});

test('a 1 MiB line whose blank run ends in a line terminator is read in linear steps', () => {
  for (const end of ['\r', '\u2028', '\u2029']) {
    const text = `key:${' '.repeat(MIB)}${end}x`;
    assert.equal(assertLinear(`keyValueLine, blanks then ${JSON.stringify(end)}`,
      (t, m) => line.keyValueLine(t, KEY, m), text), null);
    assert.equal(assertLinear(`lineText, blanks then ${JSON.stringify(end)}`,
      (t, m) => line.lineText(`###${t}`, HASH, m), text), null);
  }
  const plain = `key:${' '.repeat(MIB)}x`;
  assert.deepEqual(assertLinear('keyValueLine, blanks then a word', (t, m) => line.keyValueLine(t, KEY, m), plain),
    { key: 'key', value: 'x' });
});

test('every long run of the alphabet is read in linear steps', () => {
  for (const { label, input } of longRuns(ALPHABET)) {
    assertLinear(`keyValueLine, ${label}`, (t, m) => line.keyValueLine(t, KEY, m), input);
    assertLinear(`keyValueLine (white), ${label}`, (t, m) => line.keyValueLine(t, WHITE_KEY, m), input);
    assertLinear(`lineText, ${label}`, (t, m) => line.lineText(t, HASH, m), input);
  }
});
