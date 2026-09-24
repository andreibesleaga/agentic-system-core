'use strict';
// AGSC-06-16 and AGSC-06-23 beyond what build-0001…0003 pin: the omitted members,
// the posting lists, the shard rule of AGSC-06-21, and the two properties the
// tokenizer must hold for every input (fast-check).

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');
const search = require('../../src/distribution/search.js');

test('a member is never emitted as the empty string (AGSC-06-16)', () => {
  const index = search.index([{ slug: 'a', title: 'A', description: '', clusters: [] }]);
  assert.deepStrictEqual(index.docs, [{ slug: 'a', title: 'A' }]);
});

test('posting lists ascend without repetition (AGSC-06-16)', () => {
  const index = search.index([
    { slug: 'b', title: 'agent agent agent', body: 'agent' },
    { slug: 'a', title: 'agent', body: '' },
  ]);
  assert.deepStrictEqual(index.terms.agent, [0, 1]);
  assert.deepStrictEqual(index.docs.map((d) => d.slug), ['a', 'b']);
});

test('fenced code never reaches the tokenizer, indented code does (AGSC-06-23)', () => {
  const fenced = search.tokenize(search.stripFencedCode('text\n\n```js\nsecretvalue\n```\n'));
  assert.ok(!fenced.includes('secretvalue'), 'a fenced code block reached the index');
  const indented = search.tokenize(search.stripFencedCode('text\n\n    indentedvalue\n'));
  assert.ok(indented.includes('indentedvalue'), 'an indented block is not a FENCED one');
});

test('ASCII lower-casing only: a non-ASCII capital is kept as authored', () => {
  assert.deepStrictEqual(search.tokenize('ÉCOLE Σigma ABC'), ['École', 'Σigma', 'abc']);
});

test('above 500 items the index is sharded and /search.json is the manifest (AGSC-06-21)', () => {
  const items = [];
  for (let i = 1; i <= 501; i += 1) items.push({ slug: `i-${String(i).padStart(4, '0')}`, title: 'T' });
  const emitted = search.files(items);
  assert.deepStrictEqual(emitted.files.map((f) => f.path),
    ['/search.json', '/search-01.json', '/search-02.json']);
  assert.deepStrictEqual(emitted.manifest, { docs_total: 501, shards: ['/search-01.json', '/search-02.json'] });
  assert.strictEqual(emitted.files[1].value.docs.length, 500);
  assert.strictEqual(emitted.files[2].value.docs.length, 1);
});

test('property: no token is shorter than two code points, and none holds a boundary', () => {
  fc.assert(fc.property(fc.string(), (s) => {
    for (const token of search.tokenize(s)) {
      assert.ok([...token].length >= 2);
      assert.ok(!/[\s.,;:!?()[\]{}"'/\\|<>=+*&^%$#@~`-]/u.test(token), `"${token}" holds a boundary character`);
    }
  }), { numRuns: 300, seed: 20260918 });
});

test('property: tokenizing is idempotent over its own output', () => {
  fc.assert(fc.property(fc.string(), (s) => {
    const once = search.tokenize(s);
    assert.deepStrictEqual(search.tokenize(once.join(' ')), once);
  }), { numRuns: 300, seed: 20260918 });
});
