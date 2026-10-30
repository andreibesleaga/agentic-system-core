'use strict';
// AGSC-05-33 — the readings of the Link graph: computed, each with its reasons, never stored.
// Offline and deterministic: fixed seed, no clock, no network.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');
const derive = require('../../src/knowledge/derive.js');
const links = require('../../src/knowledge/links.js');
const relations = require('../../src/knowledge/relations.js');

const RUNS = { numRuns: 200, seed: 20261030, verbose: 0 };
const item = (slug, extra = {}) => ({ slug, type: 'concept', kind: 'principle', ...extra });
const readingsOf = (items) => derive.readings(links.resolve(items).edges);
const find = (list, source, key, target) => list.find((r) => r.source === source && r.key === key && r.target === target);

test('an authored edge gives its inverse reading with one step (a)', () => {
  const list = readingsOf([item('a', { uses: ['b'] }), item('b')]);
  assert.deepStrictEqual(list, [{ source: 'b', key: 'used-by', target: 'a',
    because: [{ rule: 'inverse', from: [['a', 'uses', 'b']] }] }]);
});

test('the other direction of related, excludes and contradicts is symmetric (b)', () => {
  for (const key of ['related', 'excludes', 'contradicts']) {
    const list = readingsOf([item('a', { [key]: ['b'] }), item('b')]);
    assert.deepStrictEqual(find(list, 'b', key, 'a').because, [{ rule: 'symmetric', from: [['a', key, 'b']] }]);
  }
});

test('an edge authored in both directions is not a reading', () => {
  const list = readingsOf([item('a', { related: ['b'] }), item('b', { related: ['a'] })]);
  assert.deepStrictEqual(list, []);
  const hierarchy = readingsOf([item('a', { broader: ['b'] }), item('b', { narrower: ['a'] })]);
  assert.deepStrictEqual(hierarchy, []);
});

test('a chain of two or more edges of a transitive key is one transitive reading (c)', () => {
  const list = readingsOf([item('a', { 'blocked-by': ['b'] }), item('b', { 'blocked-by': ['c'] }),
    item('c', { 'blocked-by': ['d'] }), item('d')]);
  assert.deepStrictEqual(find(list, 'a', 'blocked-by', 'd').because,
    [{ rule: 'transitive', from: [['a', 'blocked-by', 'b'], ['b', 'blocked-by', 'c'], ['c', 'blocked-by', 'd']] }]);
  assert.strictEqual(find(list, 'a', 'blocked-by', 'c').because[0].from.length, 2);
});

test('requires and its inverse read as closure (d)', () => {
  const list = readingsOf([item('x', { requires: ['y'] }), item('y', { requires: ['z'] }), item('z')]);
  assert.strictEqual(find(list, 'x', 'requires', 'z').because[0].rule, 'closure');
  assert.strictEqual(find(list, 'z', 'required-by', 'x').because[0].rule, 'closure');
});

test('a key that is not transitive has no chain reading', () => {
  const list = readingsOf([item('a', { uses: ['b'] }), item('b', { uses: ['c'] }), item('c')]);
  assert.strictEqual(find(list, 'a', 'uses', 'c'), undefined);
});

test('a pair that already holds an edge of the key is not a reading', () => {
  const list = readingsOf([item('a', { 'blocked-by': ['b', 'c'] }), item('b', { 'blocked-by': ['c'] }), item('c')]);
  assert.strictEqual(find(list, 'a', 'blocked-by', 'c'), undefined);
});

test('the chain is the shortest one, ties broken by code-point order of the frontier', () => {
  const list = readingsOf([item('a', { 'blocked-by': ['m', 'n'] }), item('m', { 'blocked-by': ['z'] }),
    item('n', { 'blocked-by': ['z'] }), item('z', { 'blocked-by': ['y'] }), item('y')]);
  assert.deepStrictEqual(find(list, 'a', 'blocked-by', 'z').because[0].from,
    [['a', 'blocked-by', 'm'], ['m', 'blocked-by', 'z']]);
  assert.strictEqual(find(list, 'a', 'blocked-by', 'y').because[0].from.length, 3);
});

test('a cycle never makes an item a reading of itself', () => {
  const list = readingsOf([item('a', { 'blocked-by': ['b'] }), item('b', { 'blocked-by': ['c'] }),
    item('c', { 'blocked-by': ['a'] })]);
  assert.ok(list.every((r) => r.source !== r.target));
});

test('inline-link edges (mentions) are not readings', () => {
  const list = readingsOf([{ ...item('a'), body: '[b](b.md)\n' }, item('b')]);
  assert.deepStrictEqual(list, []);
});

test('readings come ordered by source, key, target and every step names real edges', () => {
  const list = readingsOf([item('c', { broader: ['b'] }), item('b', { broader: ['a'] }), item('a', { related: ['c'] })]);
  const sorted = [...list].sort((p, q) => (p.source < q.source ? -1 : p.source > q.source ? 1 : 0)
    || (p.key < q.key ? -1 : p.key > q.key ? 1 : 0) || (p.target < q.target ? -1 : p.target > q.target ? 1 : 0));
  assert.deepStrictEqual(list, sorted);
  assert.ok(list.every((r) => r.because.length > 0 && r.because.every((s) => s.from.length > 0)));
});

test('every key the readings name is a table key or a computed inverse', () => {
  const names = new Set([...relations.LINK_KEYS, ...relations.COMPUTED_KEYS]);
  const list = readingsOf([item('a', { broader: ['b'], 'derived-from': ['b'] }), item('b')]);
  assert.ok(list.every((r) => names.has(r.key)));
});

// ------------------------------------------------------------------ property: input order

const SLUGS = ['a', 'b', 'c', 'd', 'e'];
const KEYS = ['related', 'broader', 'requires', 'supersedes', 'blocked-by', 'excludes'];
const itemsArb = fc.array(fc.record({
  slug: fc.constantFrom(...SLUGS),
  key: fc.constantFrom(...KEYS),
  target: fc.constantFrom(...SLUGS),
}), { maxLength: 12 }).map((rows) => SLUGS.map((slug) => {
  const own = { slug, type: 'concept', kind: 'principle' };
  for (const r of rows.filter((x) => x.slug === slug && x.target !== slug)) {
    own[r.key] = [...new Set([...(own[r.key] || []), r.target])];
  }
  return own;
}));

test('the derived set does not depend on the order of the items or of the edges', () => {
  fc.assert(fc.property(itemsArb, fc.infiniteStream(fc.nat()), (items, noise) => {
    const shuffle = (list) => [...list].map((v) => [noise.next().value, v]).sort((p, q) => p[0] - q[0]).map(([, v]) => v);
    const base = derive.readings(links.resolve(items).edges);
    assert.deepStrictEqual(derive.readings(links.resolve(shuffle(items)).edges), base);
    assert.deepStrictEqual(derive.readings(shuffle(links.resolve(items).edges)), base);
  }), RUNS);
});
