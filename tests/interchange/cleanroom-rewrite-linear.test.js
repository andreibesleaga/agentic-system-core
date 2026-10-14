'use strict';
// AGSC-08-17 on import: when the clean-room rewrite cuts a sentence at the end of a
// line, the spaces and tabs the cut exposes are removed by a scan from the end, in
// linear steps. The pattern it replaced read to the end of the text from every space
// of every earlier run, so a long run of spaces earlier on the line stalled the import
// (100,000 characters took about 30 s).
//
// Steps are counted, not timed (tests/_linear-kit.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const rewrite = require('../../src/interchange/cleanroom-rewrite.js');
const cleanroom = require('../../src/governance/cleanroom.js');
const { MIB, assertLinear } = require('../_linear-kit.js');

test('trailing spaces and tabs after a long earlier run are removed in linear steps', () => {
  const text = `${' '.repeat(MIB)}x \t `;
  assert.equal(assertLinear('withoutTrailingBlanks, a run then a word', rewrite.withoutTrailingBlanks, text, 4),
    `${' '.repeat(MIB)}x`);
  assert.equal(assertLinear('withoutTrailingBlanks, all blanks', rewrite.withoutTrailingBlanks, ' \t'.repeat(MIB / 2), 4), '');
  assert.equal(assertLinear('withoutTrailingBlanks, no blank', rewrite.withoutTrailingBlanks, 'x'.repeat(MIB), 4), 'x'.repeat(MIB));
});

test('a refused sentence after a long run of spaces is cut and the line keeps no trailing space', () => {
  const marker = cleanroom.REFUSED_PHRASES[0];
  const body = `Kept${' '.repeat(MIB)}words. The ${marker} says so.\nNext line.\n`;
  const result = rewrite.rewrite(body);
  assert.equal(result.body, `Kept${' '.repeat(MIB)}words.\nNext line.\n`);
  assert.deepEqual(result.surviving, []);
});
