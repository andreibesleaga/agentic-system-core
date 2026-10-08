'use strict';
// AGSC-08-16 (`no-pii`): the e-mail check is linear in the length of the text.
//
// Until 2026-10-06 (verification finding C5) the e-mail pattern was tried from every
// position of a run of local-part characters, so one long line was quadratic: an item
// with a 200,000-character run before an address cost 65 s of `agsc lint` (0.9 s after;
// security-corpus case `pii-email-after-long-run`). The check now starts from each `@`
// and looks at the characters around
// it, and finds exactly what the pattern found (the equivalence test below compares
// the two over a fixed, generated set of texts).
//
// The board adapter's redaction (`export --to board`) used the same pattern globally
// and now uses the same spans.
//
// The bound below is a ceiling three orders of magnitude above the linear run time,
// not a measurement: before the change this test did not finish within two minutes.

const test = require('node:test');
const assert = require('node:assert/strict');
const pii = require('../../src/governance/pii.js');

const MIB = 1024 * 1024;
const AT = '@';

/** The pattern as it stood, kept here as the reference the new scan must equal. */
const REFERENCE = /[A-Za-z0-9._%+!#$&'*/=?^`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+/u;
const REFERENCE_GLOBAL = new RegExp(`(${REFERENCE.source.replace('@', ')@')}`, 'gu');

/** A fixed pseudo-random sequence (no Math.random): a 32-bit linear congruential generator, high bits. */
function* texts(count) {
  const alphabet = ['a', 'a', 'b', 'b', 'Z', '0', '9', '.', '.', '-', '_', '+', AT, AT, ' ', '\n', 'é', '('];
  let state = 20261006;
  for (let n = 0; n < count; n += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const length = 1 + ((state >>> 16) % 24);
    let text = '';
    for (let i = 0; i < length; i += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      text += alphabet[(state >>> 16) % alphabet.length];
    }
    yield text;
  }
}

test('C5: the e-mail scan finds exactly what the reference pattern finds', () => {
  let positives = 0;
  for (const text of texts(40000)) {
    const expected = REFERENCE.test(text);
    if (expected) positives += 1;
    assert.equal(pii.check({ text }).some((f) => /e-mail/u.test(f.message)), expected, JSON.stringify(text));
    const spans = pii.emailSpans(text).map((s) => text.slice(s.start, s.end));
    const matches = [...text.matchAll(new RegExp(REFERENCE.source, 'gu'))].map((m) => m[0]);
    assert.deepEqual(spans, matches, JSON.stringify(text));
  }
  assert.ok(positives > 500, `the generated set exercises the positive case (${positives})`);
});

test('C5: the redaction the board adapter applies is unchanged', () => {
  const board = require('../../src/interchange/adapters/board.js');
  for (const text of texts(5000)) {
    const expected = { count: 0 };
    const want = text.replace(REFERENCE_GLOBAL, (_, local) => { expected.count += 1; return local; });
    const got = { count: 0 };
    const out = board.redactEmails(text, got);
    assert.equal(out, want, JSON.stringify(text));
    assert.equal(got.count, expected.count, JSON.stringify(text));
  }
});

test('C5: a 1 MiB line costs linear time, with or without an @', { timeout: 20000 }, () => {
  const local = 'a'.repeat(MIB);
  assert.deepEqual(pii.check({ text: local }), []);
  assert.deepEqual(pii.emailSpans(`${local}${AT}x`), []);
  assert.equal(pii.check({ text: `${local}${AT}example.org` }).length, 1);
  assert.equal(pii.emailSpans(`x${AT}${'a'.repeat(MIB)}-`).length, 0);
  assert.equal(pii.emailSpans(`a${AT}b.c `.repeat(MIB / 8)).length, MIB / 8);
  assert.equal(pii.emailSpans(`${'a.'.repeat(MIB / 2)}${AT}`).length, 0);
});
