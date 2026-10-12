'use strict';
// `agsc init` takes an adopted note's title from its first ATX heading (AGSC-02-90),
// in linear steps. The pattern it used gave the blanks after the `#` back one at a
// time when the heading line ended in a carriage return, U+2028 or U+2029, and read
// the rest of the line again each time: one 100 KB note took 20 s with a carriage
// return and 151 s with U+2028. A downloaded folder can hold any note.
//
// Steps are counted, not timed (tests/_linear-kit.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const fm = require('../../src/knowledge/frontmatter.js');
const { nfc } = require('../../src/knowledge/unicode.js');
const { MIB, assertLinear, longRuns, texts } = require('../_linear-kit.js');

const ALPHABET = ['#', '# ', '#\t', ' ', '\t', 'a', 'Title', '\n', '\r', '\u2028', '\u2029', 'e\u0301', '##'];

/** The reader as it stood, kept as the reference the scan must equal. */
function oldFirstHeading(body) {
  for (const line of String(body).split('\n')) {
    const m = /^#[ \t]+(.*)$/u.exec(line);
    if (m) {
      const text = nfc(m[1]).trim();
      if (text !== '') return text;
    }
  }
  return null;
}

test('firstHeading equals the pattern it replaced on a seeded corpus', () => {
  for (const text of texts(20261012, 20000, ALPHABET)) {
    assert.equal(fm.firstHeading(text), oldFirstHeading(text), JSON.stringify(text));
  }
});

test('a 1 MiB heading line ending in a line terminator is passed over in linear steps', () => {
  for (const end of ['\r', '\u2028', '\u2029']) {
    const body = `# ${' '.repeat(MIB)}${end}Title\n# Next\n`;
    assert.equal(assertLinear(`firstHeading, blanks then ${JSON.stringify(end)}`, fm.firstHeading, body), 'Next');
  }
  assert.equal(assertLinear('firstHeading, blanks then a word', fm.firstHeading, `# ${' '.repeat(MIB)}Title\n`), 'Title');
});

test('every long run of the alphabet is read in linear steps', () => {
  for (const { label, input } of longRuns(ALPHABET)) assertLinear(`firstHeading, ${label}`, fm.firstHeading, input);
});
