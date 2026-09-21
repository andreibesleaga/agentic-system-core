'use strict';
// AGSC-01-22 — the SELECTION file. The engine carries no list of its own, so
// everything about "which records, with which status" is a property of this
// parser and of the file it reads. The tests state the closed sets, the
// tolerance, and the ORDER, because the order is what AGSC-01-23 makes the
// slug-collision order.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const selection = require('../../src/interchange/selection.js');

const TSV = path.resolve(__dirname, '..', 'fixtures', 'old-site-10', 'selection.tsv');

test('the fixture selection parses into rows, chosen and columns', () => {
  const parsed = selection.parse(fs.readFileSync(TSV, 'utf8'), { file: 'selection.tsv' });
  assert.deepStrictEqual(parsed.findings, []);
  assert.deepStrictEqual(parsed.columns, ['slug', 'title', 'class', 'old_status', 'decision', 'reason']);
  assert.strictEqual(parsed.rows.length, 14);
  assert.strictEqual(parsed.chosen.length, 11);
  assert.strictEqual(parsed.rows.filter((r) => r.decision === 'DEFER').length, 2);
  assert.strictEqual(parsed.rows.filter((r) => r.decision === 'EXCLUDE').length, 1);
});

test('AGSC-01-23: `chosen` is in FILE order, which is the discovery order', () => {
  const parsed = selection.parse(fs.readFileSync(TSV, 'utf8'));
  assert.deepStrictEqual(parsed.chosen.slice(0, 3).map((r) => r.slug),
    ['alpha-one', 'beta-one', 'no-kind']);
  // Every row carries the 1-based line it came from, so a finding points at it.
  assert.strictEqual(parsed.chosen[0].line, 2);
});

test('an empty file names itself AGSC-E003 rather than importing nothing in silence', () => {
  const parsed = selection.parse('');
  assert.deepStrictEqual(parsed.findings.map((f) => f.code), ['AGSC-E003']);
  assert.deepStrictEqual(parsed.rows, []);
  assert.deepStrictEqual(selection.parse(undefined).findings.map((f) => f.code), ['AGSC-E003']);
});

test('a file with no `slug` or no `decision` column is AGSC-E003, and nothing is read', () => {
  const parsed = selection.parse('title\tclass\nA\tW\n');
  assert.deepStrictEqual(parsed.findings.map((f) => f.code), ['AGSC-E003', 'AGSC-E003']);
  assert.deepStrictEqual(parsed.rows, []);
  assert.deepStrictEqual(parsed.columns, ['title', 'class']);
});

test('a row with no slug is reported and skipped; the rest of the file is read', () => {
  const parsed = selection.parse('slug\tdecision\n\tCHOOSE\nkept\tCHOOSE\n');
  assert.deepStrictEqual(parsed.findings.map((f) => f.code), ['AGSC-E003']);
  assert.deepStrictEqual(parsed.chosen.map((r) => r.slug), ['kept']);
});

test('AGSC-01-11: a slug named twice keeps the FIRST row and reports the later one', () => {
  const parsed = selection.parse('slug\tdecision\ttag\nx\tCHOOSE\tfirst\nx\tEXCLUDE\tsecond\n');
  assert.deepStrictEqual(parsed.findings.map((f) => f.code), ['AGSC-E206']);
  assert.strictEqual(parsed.rows.length, 1);
  assert.strictEqual(parsed.rows[0].tag, 'first');
});

test('a decision outside the closed set is AGSC-E203 and the row is not acted on', () => {
  const parsed = selection.parse('slug\tdecision\nx\tMAYBE\n');
  assert.deepStrictEqual(parsed.findings.map((f) => f.code), ['AGSC-E203']);
  assert.match(parsed.findings[0].message, /CHOOSE\|DEFER\|EXCLUDE/u);
  assert.deepStrictEqual(parsed.rows, []);
});

test('a class outside the closed set is a WARNING: the decision still stands', () => {
  const parsed = selection.parse('slug\tclass\tdecision\nx\tZ\tCHOOSE\n');
  assert.deepStrictEqual(parsed.findings.map((f) => [f.code, f.severity]), [['AGSC-E203', 'warn']]);
  assert.deepStrictEqual(parsed.chosen.map((r) => r.slug), ['x']);
  // An empty class is not a value outside the set.
  assert.deepStrictEqual(selection.parse('slug\tclass\tdecision\nx\t\tCHOOSE\n').findings, []);
});

test('AGSC-01-22: an unknown column is carried through untouched', () => {
  const parsed = selection.parse('slug\tdecision\tsomething_new\nx\tCHOOSE\tkept verbatim\n');
  assert.deepStrictEqual(parsed.findings, []);
  assert.strictEqual(parsed.rows[0].something_new, 'kept verbatim');
});

test('a short row is padded with empty cells, never with undefined', () => {
  const parsed = selection.parse('slug\tclass\tdecision\tnote\nx\tW\tCHOOSE\n');
  assert.deepStrictEqual(parsed.findings, []);
  assert.strictEqual(parsed.rows[0].note, '');
});

test('the parsed row is prototype-free, so a column called __proto__ is inert', () => {
  const parsed = selection.parse('slug\tdecision\t__proto__\nx\tCHOOSE\tinert\n');
  assert.strictEqual(Object.getPrototypeOf(parsed.rows[0]), null);
  assert.strictEqual(parsed.rows[0].__proto__, 'inert');
  assert.strictEqual({}.inert, undefined);
});

test('the closed sets are the record\'s, stated once', () => {
  assert.deepStrictEqual([...selection.DECISIONS], ['CHOOSE', 'DEFER', 'EXCLUDE']);
  assert.deepStrictEqual([...selection.CLASSES], ['W', 'B+W', 'O', 'X', 'B']);
  assert.deepStrictEqual([...selection.REQUIRED_COLUMNS], ['slug', 'decision']);
});
