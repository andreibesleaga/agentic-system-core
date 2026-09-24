'use strict';
// AGSC-08-17 — the MECHANICAL half of the clean-room rule.
//
// The module removes the smallest span of prose that carries a refused phrase.
// Two properties matter more than any single example:
//
//   1. the deny-list is `governance/cleanroom.js#REFUSED_PHRASES` and nothing
//      else, so the engine holds no list of cards and no list of sentences;
//   2. an excision never crosses a line break, so a following blank line and the
//      `## heading` after it stay where the author put them. A rewrite that ate
//      the newlines pulled the next heading onto the previous paragraph and made
//      the card fail the AGSC-02-21 sections lint for a sentence three
//      paragraphs away.
//
// What it removes, it REPORTS: one record per excision with the exact text, and
// AGSC-E405 when a phrase survives, which is the case the caller answers by
// holding the card back.

const test = require('node:test');
const assert = require('node:assert');

const rewrite = require('../../src/interchange/cleanroom-rewrite.js');
const cleanroom = require('../../src/governance/cleanroom.js');

test('the deny-list is the lint\'s, not a copy', () => {
  const marker = cleanroom.REFUSED_PHRASES[0];
  const result = rewrite.rewrite(`A sentence with ${marker} inside it. A second sentence.\n`);
  assert.strictEqual(result.excisions.length, 1);
  assert.strictEqual(result.excisions[0].phrase, marker);
});

test('a sentence in its own paragraph goes, and the block structure survives', () => {
  const body = '\n## Intent\n\nThe claim stands. A third-party work covers it in chapter 1, which is framing.\n\n'
    + '## Context & Forces\n\nThe forces.\n';
  const result = rewrite.rewrite(body, { slug: 'x' });
  assert.strictEqual(result.body,
    '\n## Intent\n\nThe claim stands.\n\n## Context & Forces\n\nThe forces.\n');
  assert.deepStrictEqual(result.surviving, []);
  assert.deepStrictEqual(result.findings, []);
});

test('the unit of removal is the CLAUSE, so independent evidence survives', () => {
  assert.strictEqual(rewrite.rewrite('Alpha holds, and the book says otherwise. Beta holds.\n').body,
    'Alpha holds. Beta holds.\n');
  assert.strictEqual(rewrite.rewrite('A claim; this book disagrees; another claim.\n').body,
    'A claim; another claim.\n');
  assert.strictEqual(rewrite.rewrite('The point: the book says so.\n').body, 'The point.\n');
});

test('a sentence with no clause structure goes whole', () => {
  assert.strictEqual(rewrite.rewrite('Only one sentence about the book.\n').body, '\n');
  assert.strictEqual(rewrite.rewrite('Keep this. The book says so. Keep that.\n').body,
    'Keep this. Keep that.\n');
});

test('an abbreviation\'s full stop does not end a sentence', () => {
  assert.strictEqual(rewrite.rewrite('Smith et al. wrote about the book here. Next.\n').body, 'Next.\n');
  for (const abbreviation of rewrite.ABBREVIATIONS) {
    assert.strictEqual(rewrite.endsSentence(`x ${abbreviation}. y`, 2 + abbreviation.length), false, abbreviation);
  }
});

test('a terminator inside a word does not end a sentence', () => {
  assert.strictEqual(rewrite.endsSentence('a.b', 1), false);
  assert.strictEqual(rewrite.endsSentence('a! b', 1), true);
  assert.strictEqual(rewrite.endsSentence('a?" b', 1), true);
  assert.strictEqual(rewrite.endsSentence('nothing here', 3), false);
});

test('AGSC-E405: a phrase that outlives the bounded loop is reported, never left silent', () => {
  // The loop is bounded at 64 excisions so that no input can make it run away.
  // A text carrying more refused spans than that keeps some, and the survivor is
  // the case the caller answers by holding the card back (AGSC-08-17).
  const result = rewrite.rewrite('za. '.repeat(70), {
    file: 'content/concepts/x.md', phrases: ['za'], slug: 'x',
  });
  assert.strictEqual(result.excisions.length, 64, 'the loop must be bounded');
  assert.deepStrictEqual(result.surviving, ['za']);
  assert.deepStrictEqual(result.findings.map((f) => [f.code, f.severity, f.file, f.slug]),
    [['AGSC-E405', 'error', 'content/concepts/x.md', 'x']]);
});

test('a text with no refused phrase is returned unchanged, with no excision', () => {
  const body = '\n## Intent\n\nNothing here is refused.\n';
  const result = rewrite.rewrite(body);
  assert.strictEqual(result.body, body);
  assert.deepStrictEqual(result.excisions, []);
  assert.deepStrictEqual(result.findings, []);
  assert.deepStrictEqual(rewrite.rewrite(undefined).body, '');
});

test('seam(): only what the cut created is repaired', () => {
  assert.strictEqual(rewrite.seam('a ', ' b'), 'a b');
  assert.strictEqual(rewrite.seam('a ', '. b'), 'a. b');
  assert.strictEqual(rewrite.seam('a ', '\nb'), 'a\nb');
  assert.strictEqual(rewrite.seam('a', 'b'), 'ab');
  assert.strictEqual(rewrite.seam('', 'b'), 'b');
  assert.strictEqual(rewrite.seam('a', ''), 'a');
  // A legitimate `" ."` elsewhere in the prose is NOT touched.
  assert.strictEqual(rewrite.rewrite('The path .github/x is fine. Keep it.\n').body,
    'The path .github/x is fine. Keep it.\n');
});

test('clauses(): the separators, longest first', () => {
  const parts = rewrite.clauses('alpha, and beta; gamma: delta');
  assert.deepStrictEqual(parts.map((p) => p.text), ['alpha', 'beta', 'gamma', 'delta']);
  assert.deepStrictEqual(parts.map((p) => p.separatorAfter), [', and ', '; ', ': ', '']);
  assert.deepStrictEqual(rewrite.clauses('one clause').map((p) => p.text), ['one clause']);
});

test('sentenceSpan(): the span includes the terminator and the inline space after it', () => {
  const text = 'First. Second. Third.';
  assert.deepStrictEqual(rewrite.sentenceSpan(text, 8), { start: 7, end: 15 });
  assert.deepStrictEqual(rewrite.sentenceSpan('No terminator here', 3), { start: 0, end: 18 });
});

test('tailOf() and wordBefore()', () => {
  assert.strictEqual(rewrite.tailOf('a sentence. '), '. ');
  assert.strictEqual(rewrite.tailOf('no terminator'), '. ');
  assert.strictEqual(rewrite.tailOf('quoted."  '), '."  ');
  assert.strictEqual(rewrite.wordBefore('see al. more', 6), 'al');
  assert.strictEqual(rewrite.wordBefore('.leading', 0), '');
});

test('removeOne(): a phrase that is absent is null, and a mid-sentence clause goes', () => {
  assert.strictEqual(rewrite.removeOne('nothing here', 'the book'), null);
  const mid = rewrite.removeOne('alpha, and the book says so; gamma.', 'the book');
  assert.strictEqual(mid.text, 'alpha, and gamma.');
  assert.strictEqual(mid.removed, 'the book says so; ');
});

test('AGSC-08-17: a chapter cited by any number is removed as a pattern, and the lint then passes', () => {
  const body = 'Routing matters. The worker waits; chapter 7 has the proof. See Chapters XIV for more.\n\nKeep this.\n';
  const out = rewrite.rewrite(body);
  assert.deepStrictEqual(out.excisions.map((e) => e.phrase), ['chapter 7', 'chapters xiv']);
  assert.strictEqual(out.body, 'Routing matters. The worker waits.\n\nKeep this.\n');
  assert.deepStrictEqual(out.surviving, []);
  assert.deepStrictEqual(cleanroom.check({ path: 'content/concepts/a.md', text: out.body }), []);
  // A pattern the rewrite could not remove is reported, never silently kept.
  assert.deepStrictEqual(rewrite.numberedDivision('no division here'), null);
  assert.deepStrictEqual(rewrite.numberedDivision('see Chapter 21'), { index: 4, match: 'Chapter 21' });
});
