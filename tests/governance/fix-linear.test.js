'use strict';
// AGSC-03-12 and AGSC-04-19 (`lint --fix`): finding the code spans, the fenced blocks
// and the wikilinks of a body, and trimming its trailing line feeds, are linear in the
// length of the body. An item that ends with one long run of backticks, or holds one
// long run of `[`, must not stall `lint --fix`.
//
// Steps are counted, not timed (tests/_linear-kit.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const fix = require('../../src/governance/fix.js');
const { MIB, assertLinear } = require('../_linear-kit.js');

const NONE = new Map();

test('the code spans of a 1 MiB run of backticks are found in linear steps', () => {
  const run = '`'.repeat(MIB);
  assert.deepEqual(assertLinear('codeSpans, a run of backticks', fix.codeSpans, run), [[0, MIB]]);
  const odd = `${run}\``;
  assert.deepEqual(assertLinear('codeSpans, an odd run', fix.codeSpans, odd), [[0, MIB]]);
});

test('an item body that ends with a long run of backticks is rewritten in linear steps', () => {
  const body = `See [[alpha]] here.\n${'`'.repeat(MIB)}`;
  const scan = (text, meter) => fix.rewriteWikilinks(text, new Map([['alpha', 'concept']]), meter);
  const result = assertLinear('rewriteWikilinks, a trailing run of backticks', scan, body);
  assert.equal(result.rewritten, 1);
  assert.ok(result.body.startsWith('See [alpha](../concepts/alpha.md) here.\n'));
});

test('a run of backticks with no line feed after it is no fence, in linear steps', () => {
  const text = `${'`'.repeat(MIB)}x`;
  assert.deepEqual(assertLinear('codeSpans, a fence run without a line feed', fix.codeSpans, text), [[0, MIB]]);
  const tildes = `${'~'.repeat(MIB)}x`;
  assert.deepEqual(assertLinear('codeSpans, a tilde run without a line feed', fix.codeSpans, tildes), []);
});

test('a 1 MiB run of "[" holds no wikilink and is scanned in linear steps', () => {
  const scan = (text, meter) => fix.rewriteWikilinks(text, NONE, meter);
  const result = assertLinear('rewriteWikilinks, a run of [', scan, '['.repeat(MIB));
  assert.equal(result.rewritten, 0);
  assert.deepEqual(result.left, []);
});

test('many code spans and many wikilinks together stay linear', () => {
  const count = Math.floor(MIB / 10);
  const body = '`a` [[x]] '.repeat(count);
  const scan = (text, meter) => fix.rewriteWikilinks(text, new Map([['x', 'concept']]), meter);
  const result = assertLinear('rewriteWikilinks, spans and links', scan, body);
  assert.equal(result.rewritten, count);
});

test('trailing line feeds are trimmed in linear steps, whatever precedes them', () => {
  assert.equal(assertLinear('normaliseText, a run of line feeds', fix.normaliseText, `${'\n'.repeat(MIB)}x`),
    `${'\n'.repeat(MIB)}x\n`);
  assert.equal(assertLinear('normaliseText, a trailing run', fix.normaliseText, `x${'\n'.repeat(MIB)}`), 'x\n');
});
