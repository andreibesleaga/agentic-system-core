'use strict';
// AGSC-06-13a and AGSC-06-15: `/llms.txt` puts the node's description on one line, and
// `/llms-full.txt` ends each body with exactly one line feed. Both are done by scans
// that are linear in the length of the text. The root description is the one authored
// string with no single-line bound (AGSC-02-24) and a body has no size cap; the
// patterns these scans replaced read to the end of a whitespace run from every
// position in it, so a long run stalled the build (100,000 characters took 22 s and
// 57 s).
//
// Steps are counted, not timed (tests/_linear-kit.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const llms = require('../../src/distribution/llms.js');
const { MIB, assertLinear } = require('../_linear-kit.js');

const OPTIONS = { generatedAt: '2026-01-01T00:00:00Z', specVersion: '1.0.0' };

test('a 1 MiB run of spaces with no line break is kept, in linear steps', () => {
  const text = `${' '.repeat(MIB)}x`;
  assert.equal(assertLinear('collapseLineBreaks, spaces', llms.collapseLineBreaks, text, 4), text);
});

test('a whitespace run that holds a line break becomes one space, in linear steps', () => {
  assert.equal(assertLinear('collapseLineBreaks, spaces then a line feed', llms.collapseLineBreaks,
    `a${' '.repeat(MIB)}\n${'\t'.repeat(MIB)}b`, 4), 'a b');
  assert.equal(assertLinear('collapseLineBreaks, line feeds', llms.collapseLineBreaks, '\n'.repeat(MIB), 4), ' ');
  assert.equal(assertLinear('collapseLineBreaks, alternating', llms.collapseLineBreaks, 'a\n'.repeat(MIB / 2), 4),
    'a '.repeat(MIB / 2));
});

test('the trailing line feeds of a body become one, in linear steps', () => {
  const body = `${'\n'.repeat(MIB)}x${'\n'.repeat(MIB)}`;
  assert.equal(assertLinear('withOneTrailingFeed', llms.withOneTrailingFeed, body, 4), `${'\n'.repeat(MIB)}x\n`);
  assert.equal(assertLinear('withOneTrailingFeed, none', llms.withOneTrailingFeed, 'x'.repeat(MIB), 4), `${'x'.repeat(MIB)}\n`);
});

test('/llms.txt and /llms-full.txt of a Bundle with hostile whitespace are written', () => {
  const bundle = {
    base: 'https://a.example/',
    title: 'Node',
    description: `One${' '.repeat(MIB)}line${' '.repeat(MIB)}\nand more.`,
    license_prose: 'CC-BY-4.0',
    clusters: [],
    items: [{ slug: 'kept', title: 'Kept', description: 'Kept.', body: `${'\n'.repeat(MIB)}Body.${'\n'.repeat(3)}` }],
  };
  const index = llms.llmsTxt(bundle, OPTIONS);
  assert.ok(index.includes(`> One${' '.repeat(MIB)}line and more.\n`));
  const full = llms.llmsFullTxt(bundle, OPTIONS);
  assert.ok(full.endsWith(`${'\n'.repeat(MIB)}Body.\n\`\`\`\n`));
});
