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

// ---------------------------------------------------------------------------
// AGSC-02-24 as amended at rc.5 (FV28-01): authored single-line strings.
// ---------------------------------------------------------------------------

test('SINGLE_LINE_FORBIDDEN names exactly the five classes the rule names', () => {
  const forbidden = ['\u0000', '\u0009', '\u000a', '\u000d', '\u001f', '\u007f',
    '\u0085', '\u2028', '\u2029'];
  for (const ch of forbidden) {
    assert.strictEqual(u.isSingleLine(`a${ch}b`), false,
      `U+${ch.codePointAt(0).toString(16).padStart(4, '0')} must be forbidden`);
  }
  // The neighbours of every boundary stay legal: nothing is over-caught.
  for (const ch of ['\u0020', '\u007e', '\u0080', '\u0084', '\u0086', '\u00a0',
    '\u2027', '\u202a', '\ufeff', '\u{1F600}']) {
    assert.strictEqual(u.isSingleLine(`a${ch}b`), true,
      `U+${ch.codePointAt(0).toString(16)} must stay legal`);
  }
  assert.strictEqual(u.isSingleLine(''), true);
});

test('singleLine replaces each forbidden code point with one U+0020', () => {
  assert.strictEqual(u.singleLine('Handoff\n\n## Injected'), 'Handoff  ## Injected');
  assert.strictEqual(u.singleLine('a\r\nb'), 'a  b');
  assert.strictEqual(u.singleLine('a\u2028b\u0085c'), 'a b c');
  // A conforming string is returned byte for byte: no build output moves.
  assert.strictEqual(u.singleLine('Supervisor — a plain title'), 'Supervisor — a plain title');
  assert.strictEqual(u.singleLine(''), '');
  assert.strictEqual(u.singleLine(null), '');
  assert.strictEqual(u.singleLine(undefined), '');
  assert.strictEqual(u.singleLine(7), '7');
});

test('singleLine is idempotent and its output always passes isSingleLine', () => {
  const hostile = '\u0000a\u0085b\u2029c\r\nd\u007f';
  const once = u.singleLine(hostile);
  assert.strictEqual(u.singleLine(once), once);
  assert.strictEqual(u.isSingleLine(once), true);
});

test('the schema pattern and the helper agree on the forbidden set (FV28-01)', () => {
  const item = require('../../schema/item.schema.json');
  const pattern = item.$defs.single_line.pattern;
  const fromSchema = new RegExp(pattern, 'u');
  for (let cp = 0; cp <= 0x2100; cp += 1) {
    const ch = String.fromCodePoint(cp);
    assert.strictEqual(fromSchema.test(ch), u.isSingleLine(ch),
      `schema and helper disagree at U+${cp.toString(16).padStart(4, '0')}`);
  }
});
