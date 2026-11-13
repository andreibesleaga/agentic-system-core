'use strict';
// Requirement: PRD-076 (docs/PRD.md).
// verifies AGSC-05-40, AGSC-02-25
// The warrant of a term as the graph writer and the display read it: a `source` plus one of
// the three kinds of warrant of ANSI/NISO Z39.19-2005 (R2010), `literary`, `user` and
// `organisational`. `warrantOf` returns the warrant only when it meets the rule, as the two
// members AGSC-05-40 names; anything else is no warrant, and the lint reports it (AGSC-E512,
// AGSC-E204, from the item schema). The code is not decided here: `domain-keys.test.js`
// pins the codes.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');
const warrants = require('../../src/knowledge/warrants.js');

const RUNS = { numRuns: 200, seed: 20261103, verbose: 0 };
const item = (warrant) => ({ type: 'concept', slug: 'ledger', title: 'Ledger', warrant });

test('the three kinds are those of ANSI/NISO Z39.19, in the British spelling of the specification', () => {
  assert.deepStrictEqual(warrants.TYPES, ['literary', 'user', 'organisational']);
  assert.ok(Object.isFrozen(warrants.TYPES));
});

test('a warrant that meets the rule is read as its source and its kind', () => {
  for (const type of warrants.TYPES) {
    assert.deepStrictEqual(warrants.warrantOf(item({ source: 'https://example.org/glossary', type })),
      { source: 'https://example.org/glossary', type });
  }
  assert.deepStrictEqual(warrants.warrantOf(item({ source: 'ANSI/NISO Z39.19-2005 (R2010), section 6', type: 'user' })),
    { source: 'ANSI/NISO Z39.19-2005 (R2010), section 6', type: 'user' });
});

test('a member the rule does not name is preserved in the item and never read (AGSC-02-25)', () => {
  const warrant = { note: 'kept', source: 'https://example.org/glossary', type: 'literary' };
  const subject = item(warrant);
  assert.deepStrictEqual(warrants.warrantOf(subject), { source: 'https://example.org/glossary', type: 'literary' });
  assert.deepStrictEqual(subject.warrant, warrant, 'the item is not changed');
});

test('an item without a warrant, or with one that breaks the rule, has none', () => {
  const broken = [
    undefined, null, 'https://example.org/glossary', ['literary'], {},
    { source: 'https://example.org/glossary' },
    { type: 'literary' },
    { source: 'https://example.org/glossary', type: 'popular' },
    { source: 'https://example.org/glossary', type: 'organizational' },
    { source: '', type: 'user' },
    { source: 'a\nb', type: 'user' },
    { source: 'a\u2028b', type: 'user' },
    { source: 42, type: 'user' },
    { source: 'https://example.org/glossary', type: ['user'] },
  ];
  for (const warrant of broken) assert.strictEqual(warrants.warrantOf(item(warrant)), null, JSON.stringify(warrant));
  assert.strictEqual(warrants.warrantOf({ type: 'concept', slug: 'plain', title: 'Plain' }), null);
  assert.strictEqual(warrants.warrantOf(null), null, 'no item, no warrant');
});

test('reading is idempotent: the warrant read back from its own result is the same (property)', () => {
  const source = fc.string({ minLength: 1, maxLength: 40 });
  const type = fc.oneof(fc.constantFrom(...warrants.TYPES), fc.string({ maxLength: 16 }));
  fc.assert(fc.property(source, type, fc.dictionary(fc.string({ maxLength: 8 }), fc.string({ maxLength: 8 })),
    (s, t, extra) => {
      const once = warrants.warrantOf(item({ ...extra, source: s, type: t }));
      if (once === null) return true;
      assert.ok(warrants.TYPES.includes(once.type));
      assert.deepStrictEqual(Object.keys(once), ['source', 'type']);
      assert.deepStrictEqual(warrants.warrantOf(item(once)), once);
      return true;
    }), RUNS);
});
