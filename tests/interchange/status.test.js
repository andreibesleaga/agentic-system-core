'use strict';
// AGSC-02-23, AGSC-01-20, AGSC-01-21 — `status`, `release` and `tags` on import.
// Three rules the old format ran together in two keys, so the tests state each
// one separately: a foreign status value is MAPPED and never added to the
// vocabulary; a `batch-*` tag is a release switch and not a topic; the
// switchboard writes every key an item uses, because a key that is absent leaves
// the item published.

const test = require('node:test');
const assert = require('node:assert');

const status = require('../../src/interchange/status.js');

test('AGSC-02-23: the four values pass through unchanged', () => {
  for (const value of status.STATUS_VALUES) {
    const result = status.status(value);
    assert.deepStrictEqual(result, { status: value, mapped: false, findings: [] }, value);
  }
});

test('AGSC-02-23: `published` becomes `stable`, and the other synonyms map too', () => {
  for (const [from, to] of Object.entries(status.STATUS_SYNONYMS)) {
    const result = status.status(from);
    assert.strictEqual(result.status, to, from);
    assert.strictEqual(result.mapped, true, from);
    assert.deepStrictEqual(result.findings, [], `${from} must map silently, not warn`);
  }
  assert.strictEqual(status.status('  PUBLISHED  ').status, 'stable', 'case and space are not a new value');
});

test('AGSC-02-23: an absent status starts `stable`', () => {
  for (const value of [undefined, null, '', '   ']) {
    assert.strictEqual(status.status(value).status, 'stable', JSON.stringify(value));
  }
});

test('a value in neither vocabulary is held back as `draft` and reported', () => {
  const result = status.status('percolating');
  assert.strictEqual(result.status, 'draft');
  assert.deepStrictEqual(result.findings.map((f) => [f.code, f.severity]), [['AGSC-E203', 'warn']]);
});

test('the caller\'s override wins, and an override outside the enum is an error', () => {
  assert.strictEqual(status.status('published', { override: 'draft' }).status, 'draft');
  const bad = status.status('published', { override: 'held' });
  assert.deepStrictEqual(bad.findings.map((f) => [f.code, f.severity]), [['AGSC-E203', 'error']]);
  assert.strictEqual(bad.status, 'stable', 'an unusable override never becomes the status');
  assert.strictEqual(status.status('published', { override: '' }).status, 'stable', 'an empty override is none');
});

test('AGSC-01-21: `batch-*` values leave `tags` and become release switches', () => {
  const result = status.tags(['alpha', 'batch-one', 'mapping', 'batch-two']);
  assert.deepStrictEqual(result.tags, ['alpha', 'mapping']);
  assert.deepStrictEqual(result.releases, ['batch-one', 'batch-two']);
  assert.deepStrictEqual(result.findings, []);
});

test('AGSC-04-14: author order is kept and only duplicates go', () => {
  assert.deepStrictEqual(status.tags(['zeta', 'alpha', 'zeta']).tags, ['zeta', 'alpha']);
});

test('a tag outside the grammar is dropped with a warning', () => {
  const result = status.tags(['ok', 'Not Ok', 'also-ok', '-leading']);
  assert.deepStrictEqual(result.tags, ['ok', 'also-ok']);
  assert.deepStrictEqual(result.findings.map((f) => f.code), ['AGSC-E203', 'AGSC-E203']);
});

test('AGSC-01-21: a count outside 2–5 is a warning, never a refusal', () => {
  assert.deepStrictEqual(status.tags(['one']).findings.map((f) => [f.code, f.severity]),
    [['AGSC-E203', 'warn']]);
  assert.deepStrictEqual(status.tags(['a', 'b', 'c', 'd', 'e', 'f']).findings.map((f) => f.code),
    ['AGSC-E203']);
  assert.deepStrictEqual(status.tags(undefined).findings.map((f) => f.code), ['AGSC-E203']);
  assert.deepStrictEqual(status.tags(['a', '', 'b']).findings, [], 'an empty entry is not a tag');
});

test('AGSC-01-20: the switchboard writes every key once, in code-point order, true', () => {
  assert.deepStrictEqual(status.switchboard(['zeta', 'alpha', 'zeta', '', 'Not A Key']),
    { alpha: true, zeta: true });
  assert.deepStrictEqual(status.switchboard([]), {});
  assert.deepStrictEqual(Object.keys(status.switchboard(['b', 'a'])), ['a', 'b']);
});
