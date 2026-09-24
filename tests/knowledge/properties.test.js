'use strict';
// Property tests (fast-check, devDependency, pinned) for the two functions whose
// correctness is a LAW rather than a list of cases: the canonicaliser (AGSC-04-05,
// AGSC-04-21) and the slugifier (AGSC-02-91). Deterministic: a fixed seed, no clock,
// no network.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');
const jcs = require('../../src/knowledge/jcs.js');
const slug = require('../../src/knowledge/slug.js');
const { nfc, compareUtf16, codePointLength } = require('../../src/knowledge/unicode.js');

const RUNS = { numRuns: 300, seed: 20260918, verbose: 0 };
const jsonValue = fc.letrec((tie) => ({
  value: fc.oneof(
    { depthSize: 'small' },
    fc.constant(null),
    fc.boolean(),
    fc.integer({ min: -1e9, max: 1e9 }),
    fc.string(),
    fc.array(tie('value'), { maxLength: 4 }),
    fc.dictionary(fc.string({ minLength: 1, maxLength: 6 }), tie('value'), { maxKeys: 5 }),
  ),
})).value;

test('canonicalize is idempotent through a JSON round trip (AGSC-04-05)', () => {
  fc.assert(fc.property(jsonValue, (v) => {
    const once = jcs.canonicalize(v);
    assert.strictEqual(jcs.canonicalize(JSON.parse(once)), once);
  }), RUNS);
});

test('canonicalize emits member names in NFC, UTF-16 order (AGSC-04-21)', () => {
  fc.assert(fc.property(fc.dictionary(fc.string({ minLength: 1, maxLength: 8 }), fc.integer(), { maxKeys: 6 }),
    (obj) => {
      let text;
      try {
        text = jcs.canonicalize(obj);
      } catch {
        return; // two names that collide after NFC are AGSC-E601 by design
      }
      const names = [...text.matchAll(/"((?:[^"\\]|\\.)*)":/gu)].map((m) => JSON.parse(`"${m[1]}"`));
      const sorted = [...names].sort(compareUtf16);
      assert.deepStrictEqual(names, sorted);
      for (const n of names) assert.strictEqual(n, nfc(n));
    }), RUNS);
});

test('numbers follow ECMA-262 and -0 becomes 0 (AGSC-04-05, erratum 7920)', () => {
  assert.strictEqual(jcs.canonicalize({ a: -0 }), '{"a":0}');
  fc.assert(fc.property(fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e15, max: 1e15 }), (n) => {
    const text = jcs.canonicalize({ a: n });
    assert.strictEqual(text, `{"a":${n === 0 ? '0' : String(n)}}`);
    assert.ok(!/:-0[},]/u.test(text), text);
  }), RUNS);
});

test('a value outside I-JSON is AGSC-E601, never silent bytes (AGSC-04-05)', () => {
  fc.assert(fc.property(fc.integer({ min: 1, max: 1000 }), (k) => {
    assert.throws(() => jcs.canonicalize({ a: 2 ** 53 + k }), jcs.JcsError);
  }), { numRuns: 20, seed: 20260918 });
});

test('slugify always returns a valid slug (AGSC-02-91 totality)', () => {
  fc.assert(fc.property(fc.string({ maxLength: 200 }), (s) => {
    const out = slug.slugify(s);
    assert.ok(slug.isValid(out), `slugify(${JSON.stringify(s)}) = ${JSON.stringify(out)}`);
    assert.ok(codePointLength(out) <= slug.MAX_LENGTH);
  }), RUNS);
});

test('slugify is idempotent', () => {
  fc.assert(fc.property(fc.string({ maxLength: 120 }), (s) => {
    const once = slug.slugify(s);
    assert.strictEqual(slug.slugify(once), once);
  }), RUNS);
});

test('dedupe always returns a valid slug that is not taken', () => {
  fc.assert(fc.property(fc.string({ maxLength: 80 }), fc.array(fc.string({ maxLength: 80 }), { maxLength: 6 }),
    (s, others) => {
      const taken = new Set(others.map((o) => slug.slugify(o)));
      const out = slug.dedupe(slug.slugify(s), taken);
      assert.ok(slug.isValid(out), out);
      assert.ok(!taken.has(out), out);
    }), RUNS);
});
