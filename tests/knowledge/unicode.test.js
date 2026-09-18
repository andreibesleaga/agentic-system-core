'use strict';
// AGSC-04-05 / AGSC-04-12 / AGSC-04-21 / AGSC-04-23 / AGSC-02-24.

const test = require('node:test');
const assert = require('node:assert');
const u = require('../../src/knowledge/unicode.js');

test('nfc composes and leaves non-strings alone (AGSC-04-07)', () => {
  assert.strictEqual(u.nfc('é'), 'é');
  assert.strictEqual(u.nfc(7), 7);
  assert.strictEqual(u.nfc(null), null);
});

test('codePointLength counts code points, not UTF-16 units (AGSC-02-24)', () => {
  assert.strictEqual(u.codePointLength('😀😀'), 2);
  assert.strictEqual('😀😀'.length, 4);
  assert.strictEqual(u.codePointLength(''), 0);
});

test('the two orderings disagree exactly where the spec says they do (jcs-0003)', () => {
  assert.strictEqual(u.compareUtf16('Ｚ', '𐀀'), 1);
  assert.strictEqual(u.compareCodePoint('Ｚ', '𐀀'), -1);
  assert.strictEqual(u.compareCodePoint('a', 'a'), 0);
  assert.strictEqual(u.compareUtf16('a', 'a'), 0);
  assert.strictEqual(u.compareCodePoint('a', 'ab'), -1);
  assert.strictEqual(u.compareCodePoint('ab', 'a'), 1);
  assert.strictEqual(u.compareUtf16('b', 'a'), 1);
});

test('checkCombining bounds a combining run at 256 (AGSC-04-23, AGSC-E607)', () => {
  assert.deepStrictEqual(u.checkCombining('é'), { ok: true, index: -1, count: 0 });
  assert.strictEqual(u.checkCombining(`e${'́'.repeat(256)}`).ok, true);
  const over = u.checkCombining(`e${'́'.repeat(257)}`);
  assert.strictEqual(over.ok, false);
  assert.strictEqual(over.count, 257);
  // A starter after the run resets the counter.
  assert.strictEqual(u.checkCombining(`e${'́'.repeat(200)}f${'́'.repeat(200)}`).ok, true);
  // Astral starters advance by two code units.
  assert.strictEqual(u.checkCombining('😀́').ok, true);
  assert.strictEqual(u.COMBINING_BOUND, 256);
});

test('isWellFormed rejects a lone surrogate', () => {
  assert.strictEqual(u.isWellFormed('ok 😀'), true);
  assert.strictEqual(u.isWellFormed('\ud800'), false);
  assert.strictEqual(u.isWellFormed('\udc00'), false);
  assert.strictEqual(u.isWellFormed('𐀀'), true);
});
