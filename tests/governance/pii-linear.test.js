'use strict';
// AGSC-08-16 (`no-pii`): the e-mail check is linear in the length of the text.
//
// The e-mail pattern used to be tried from every position of a run of local-part
// characters, so one long line was quadratic: an item with a 200,000-character run
// before an address cost 65 s of `agsc lint` (0.9 s after; security-corpus case
// `pii-email-after-long-run`). The check now starts from each `@` and looks at the
// characters around it, and finds exactly what the pattern found (the equivalence
// test below compares the two over a fixed, generated set of texts).
//
// The board adapter's redaction (`export --to board`) used the same pattern globally
// and now uses the same spans.
//
// Steps are counted, not timed (tests/_linear-kit.js): the scan reports the
// characters it examines, and the bound is a small constant times the length.

const test = require('node:test');
const assert = require('node:assert/strict');
const pii = require('../../src/governance/pii.js');
const { MIB, assertLinear } = require('../_linear-kit.js');

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

test('the e-mail scan finds exactly what the reference pattern finds', () => {
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

test('the redaction the board adapter applies is unchanged', () => {
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

test('a 1 MiB line costs linear steps, with or without an @', () => {
  const local = 'a'.repeat(MIB);
  const spans = (text, meter) => pii.emailSpans(text, meter);
  assert.deepEqual(assertLinear('emailSpans, a local-part run', spans, local, 4), []);
  assert.deepEqual(pii.check({ text: local }), []);
  assert.deepEqual(assertLinear('emailSpans, a run then a bare @', spans, `${local}${AT}x`, 4), []);
  assert.equal(assertLinear('emailSpans, a run then an address', spans, `${local}${AT}example.org`, 4).length, 1);
  assert.equal(pii.check({ text: `${local}${AT}example.org` }).length, 1);
  assert.equal(assertLinear('emailSpans, a domain run', spans, `x${AT}${'a'.repeat(MIB)}-`, 4).length, 0);
  assert.equal(assertLinear('emailSpans, many addresses', spans, `a${AT}b.c `.repeat(MIB / 8), 4).length, MIB / 8);
  assert.equal(assertLinear('emailSpans, dotted run', spans, `${'a.'.repeat(MIB / 2)}${AT}`, 4).length, 0);
  assert.equal(assertLinear('emailSpans, a run of @', spans, AT.repeat(MIB), 4).length, 0);
});
