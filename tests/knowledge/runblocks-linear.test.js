'use strict';
// `agsc run` finds the fenced blocks of a procedure (AGSC-09-94, CommonMark 0.31.2
// §4.5) in linear steps. The fence opener's pattern read a lazy info string and then
// the blanks to the end of the line, so a fence line with a long run of blanks before
// its last word was read again from every blank: 100,000 blanks took about 17 s.
//
// Steps are counted, not timed (tests/_linear-kit.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const runblocks = require('../../src/knowledge/runblocks.js');
const { MIB, assertLinear, longRuns, texts } = require('../_linear-kit.js');

const ALPHABET = ['```', '~~~', '`', '~', ' ', '  ', '\t', 'run', 'a b', '\r', '\u2028', '\u2029', '\u00a0', '````'];
const OLD = /^\s{0,3}(`{3,}|~{3,})\s*(\S.*?)?\s*$/u;

test('the fence opener equals the pattern it replaced on a seeded corpus', () => {
  for (const text of texts(20261012, 20000, ALPHABET)) {
    const m = OLD.exec(text);
    assert.deepEqual(runblocks.fenceOpener(text), m === null ? null : { fence: m[1], info: m[2] }, JSON.stringify(text));
  }
});

test('a 1 MiB fence line is read in linear steps', () => {
  const wide = `\`\`\`a${' '.repeat(MIB)}x`;
  assert.deepEqual(assertLinear('fenceOpener, a long info string', runblocks.fenceOpener, wide),
    { fence: '```', info: `a${' '.repeat(MIB)}x` });
  assert.equal(assertLinear('fenceOpener, a line terminator inside', runblocks.fenceOpener,
    `\`\`\`a${' '.repeat(MIB)}\u2028x`), null);
  const body = `${wide}\nline\n\`\`\`\n`;
  const blocks = assertLinear('fences, a long info string', runblocks.fences, body);
  assert.deepEqual(blocks.map((b) => [b.info.length, b.line, b.text]), [[MIB + 2, 1, 'line\n']]);
});

test('every long run of the alphabet is read in linear steps', () => {
  for (const { label, input } of longRuns(ALPHABET)) assertLinear(`fenceOpener, ${label}`, runblocks.fenceOpener, input);
});
