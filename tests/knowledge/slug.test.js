'use strict';
// AGSC-01-10, AGSC-01-11, AGSC-01-23, AGSC-02-91.

const test = require('node:test');
const assert = require('node:assert');
const slug = require('../../src/knowledge/slug.js');

test('the grammar is the portable one of AGSC-01-10 (slug-0006)', () => {
  assert.strictEqual(slug.SLUG_PATTERN, '^[a-z0-9]+(?:-[a-z0-9]+)*$');
  assert.ok(!/\(\?[=!]/u.test(slug.SLUG_PATTERN), 'no lookahead may be reintroduced (blocker B4)');
  for (const ok of ['a', 'a2a', 'multi-agent-supervisor', 'x1-y2-z3', 'a'.repeat(64)]) {
    assert.ok(slug.isValid(ok), ok);
  }
  for (const bad of ['a--b', '-a', 'a-', '', 'A', 'a_b', 'a.b', 'a'.repeat(65)]) {
    assert.ok(!slug.isValid(bad), bad);
  }
  assert.strictEqual(slug.isValid(7), false);
});

test('check reports AGSC-E204 then AGSC-E206 (AGSC-01-11)', () => {
  assert.deepStrictEqual(slug.check(['a', 'b']), []);
  assert.strictEqual(slug.check(['A'])[0].code, 'AGSC-E204');
  const dup = slug.check(['a', 'a'], { files: ['x.md', 'y.md'] });
  assert.strictEqual(dup.length, 1);
  assert.strictEqual(dup[0].code, 'AGSC-E206');
  assert.strictEqual(dup[0].file, 'y.md');
  assert.strictEqual(slug.check(['a', 'a'])[0].message.includes('another item'), true);
});

test('slugify is total (AGSC-02-91)', () => {
  assert.strictEqual(slug.slugify('My Notes'), 'my-notes');
  assert.strictEqual(slug.slugify('  --A__B--  '), 'a-b');
  assert.strictEqual(slug.slugify('###'), 'note');
  assert.strictEqual(slug.slugify(''), 'note');
  assert.strictEqual(slug.slugify(null), 'note');
  assert.strictEqual(slug.slugify(undefined), 'note');
  // every character outside [a-z0-9] becomes a hyphen, then runs collapse
  assert.strictEqual(slug.slugify('Ünïcôde'), 'n-c-de');
  // clipped to 64 code points, then any trailing hyphen trimmed
  const long = slug.slugify(`${'a'.repeat(63)} b`);
  assert.strictEqual(long, 'a'.repeat(63));
  assert.ok(slug.isValid(slug.slugify('x'.repeat(200))));
});

test('dedupe suffixes in discovery order and stays inside 64 (AGSC-01-23)', () => {
  assert.strictEqual(slug.dedupe('a', new Set()), 'a');
  assert.strictEqual(slug.dedupe('a', new Set(['a'])), 'a-2');
  assert.strictEqual(slug.dedupe('a', new Set(['a', 'a-2'])), 'a-3');
  assert.strictEqual(slug.dedupe('a', null), 'a');
  const wide = 'b'.repeat(64);
  const out = slug.dedupe(wide, new Set([wide]));
  assert.ok(slug.isValid(out) && out.endsWith('-2'), out);
});

test('stemOf and pathSlug read the file stem (AGSC-01-11)', () => {
  assert.strictEqual(slug.stemOf('content/concepts/handoff.md'), 'handoff');
  assert.strictEqual(slug.stemOf('handoff.fr.md'), 'handoff.fr');
  assert.strictEqual(slug.pathSlug('content/concepts/handoff.md'), null);
  assert.strictEqual(slug.pathSlug('content/concepts/handoff.fr.md'), null);
  assert.strictEqual(slug.pathSlug('content/concepts/Handoff.md').code, 'AGSC-E204');
});
