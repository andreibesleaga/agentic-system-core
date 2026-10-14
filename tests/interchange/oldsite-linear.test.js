'use strict';
// `agsc import --from old-site` reads each "key: value" line of a card in linear steps.
// The pattern it used gave the blanks after a key back one at a time when the line
// ended in U+2028 or U+2029 (the reader turns a carriage return into a line feed, not
// these two), and read the rest of the line again each time: one 100 KB card took
// about 69 s. A foreign card is untrusted input.
//
// Steps are counted, not timed (tests/_linear-kit.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const oldsite = require('../../src/interchange/oldsite.js');
const { MIB, assertLinear, texts } = require('../_linear-kit.js');

const OLD = /^([A-Za-z0-9_.]+):[ \t]*(.*)$/u;

test('the key line reader equals the pattern it replaced on a seeded corpus', () => {
  const alphabet = ['title:', 'a.b:', ' ', '\t', 'x', ':', '.', '\u2028', '\u2029', '\r', 'é'];
  for (const text of texts(20261012, 20000, alphabet)) {
    const m = OLD.exec(text);
    assert.deepEqual(oldsite.keyLine(text), m === null ? null : { key: m[1], value: m[2] }, JSON.stringify(text));
  }
});

test('a 1 MiB key line ending in U+2028 or U+2029 is read in linear steps', () => {
  for (const end of ['\u2028', '\u2029']) {
    assert.equal(assertLinear(`keyLine, blanks then ${JSON.stringify(end)}`, oldsite.keyLine,
      `title:${' '.repeat(MIB)}${end}x`), null);
  }
});

test('such a card is read, and the line is reported as not a "key: value" line', () => {
  const markdown = `---\nid: x\ntitle:${' '.repeat(MIB - 64)}\u2028x\n---\nbody\n`;
  const card = oldsite.readCard({ path: 'patterns/x.md', markdown });
  assert.deepEqual(card.keys, ['id']);
  assert.deepEqual(card.findings.map((f) => [f.code, f.line]), [['AGSC-E101', 3]]);
  assert.equal(card.body, 'body\n');
});
