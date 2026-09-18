'use strict';
// AGSC-04-05, AGSC-04-21, AGSC-04-06 (and RFC 7493 for isIJSON).

const test = require('node:test');
const assert = require('node:assert');
const jcs = require('../../src/knowledge/jcs.js');

test('members sort by UTF-16 code units, NFC first (AGSC-04-21)', () => {
  assert.strictEqual(jcs.canonicalize({ 'é': 2, f: 1 }), '{"f":1,"é":2}');
  assert.strictEqual(jcs.canonicalize({ 'Ｚ': 1, '𐀀': 2 }), '{"𐀀":2,"Ｚ":1}');
});

test('negative zero serialises as 0 (AGSC-04-05, erratum 7920)', () => {
  assert.strictEqual(jcs.canonicalize({ a: -0, b: 0, c: -0.5 }), '{"a":0,"b":0,"c":-0.5}');
});

test('scalars, arrays and nesting', () => {
  assert.strictEqual(jcs.canonicalize(null), 'null');
  assert.strictEqual(jcs.canonicalize(true), 'true');
  assert.strictEqual(jcs.canonicalize(false), 'false');
  assert.strictEqual(jcs.canonicalize('a"b'), '"a\\"b"');
  assert.strictEqual(jcs.canonicalize([1, [2, { b: 1, a: 2 }]]), '[1,[2,{"a":2,"b":1}]]');
});

test('two names that collide after NFC are refused (AGSC-E601)', () => {
  assert.throws(() => jcs.canonicalize({ 'é': 1, 'é': 2 }), /AGSC-E601|duplicate/u);
});

test('isIJSON is the RFC 7493 gate of AGSC-04-04', () => {
  assert.strictEqual(jcs.isIJSON({ a: [1, 'x', null, true] }), true);
  assert.strictEqual(jcs.isIJSON(Infinity), false);
  assert.strictEqual(jcs.isIJSON(NaN), false);
  assert.strictEqual(jcs.isIJSON(2 ** 53), false);
  assert.strictEqual(jcs.isIJSON('\ud800'), false);
  assert.strictEqual(jcs.isIJSON({ a: undefined }), false);
  assert.strictEqual(jcs.isIJSON(1.5), true);
  assert.strictEqual(jcs.isIJSON(null), true);
  assert.strictEqual(jcs.isIJSON(false), true);
  assert.strictEqual(jcs.isIJSON({ 'é': 1, 'é': 2 }), false);
});

test('a non-JSON value is a JcsError, never a silent result', () => {
  assert.throws(() => jcs.canonicalize(() => {}), jcs.JcsError);
  assert.throws(() => jcs.canonicalize({ a: undefined }), jcs.JcsError);
});

test('the comparators are re-exported for the Findings sort (AGSC-09-10)', () => {
  assert.strictEqual(jcs.compareUtf16('a', 'b'), -1);
  assert.strictEqual(jcs.compareCodePoint('b', 'a'), 1);
});
