'use strict';
// verifies AGSC-03-01, AGSC-06-30
// The typed Links between published items, as the `mermaid` export and the graph view
// of the pages both read them (src/knowledge/link-graph.js; AGSC-03-01, AGSC-06-30,
// AGSC-06-38). Pure: no file, no clock.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const linkGraph = require('../../src/knowledge/link-graph.js');
const { LINK_KEYS } = require('../../src/knowledge/relations.js');

const a = { slug: 'a', title: 'A', type: 'concept', requires: ['b', 'b#part', 'd'], uses: ['a'], clusters: ['k'] };
const b = { slug: 'b', type: 'concept', related: ['a'], clusters: ['k', 'other'] };
const k = { slug: 'k', title: 'K', type: 'cluster', clusters: ['k'] };

test('linksOf: every Link once, in the declared key order, the #anchor dropped, nothing filtered', () => {
  assert.deepStrictEqual(linkGraph.linksOf(a), [
    { key: 'uses', source: 'a', target: 'a' },
    { key: 'requires', source: 'a', target: 'b' },
    { key: 'requires', source: 'a', target: 'd' },
  ]);
  assert.deepStrictEqual(linkGraph.linksOf({ slug: 'x', related: 'not-a-list' }), []);
});

test('edgesOf: only Links between published items, once each, in code-point order', () => {
  const published = new Map([['a', a], ['b', b]]);
  assert.deepStrictEqual(linkGraph.edgesOf([b, a, a], published), [
    { key: 'requires', source: 'a', target: 'b' },
    { key: 'uses', source: 'a', target: 'a' },
    { key: 'related', source: 'b', target: 'a' },
  ]);
});

test('touching, among and membersOf select from the edges and items they are given', () => {
  const edges = linkGraph.edgesOf([a, b], new Map([['a', a], ['b', b]]));
  assert.deepStrictEqual(linkGraph.touching(edges, 'b').map((e) => e.source), ['a', 'b']);
  assert.deepStrictEqual(linkGraph.among(edges, new Set(['a'])), [{ key: 'uses', source: 'a', target: 'a' }]);
  assert.deepStrictEqual(linkGraph.membersOf(k, [k, b, a]).map((i) => i.slug), ['b', 'a'], 'a cluster is never its own member');
});

test('titleOf: the title, else the slug', () => {
  assert.strictEqual(linkGraph.titleOf(a), 'A');
  assert.strictEqual(linkGraph.titleOf(b), 'b');
  assert.strictEqual(linkGraph.titleOf({ slug: 'c', title: '' }), 'c');
});

test('property: the edges do not depend on the order of the items, and every edge joins two published items', () => {
  const slugs = ['a', 'b', 'c', 'd', 'e'];
  const item = fc.record({
    slug: fc.constantFrom(...slugs),
    key: fc.constantFrom(...LINK_KEYS),
    targets: fc.array(fc.constantFrom(...slugs, 'gone'), { maxLength: 4 }),
  }).map(({ slug, key, targets }) => ({ slug, type: 'concept', [key]: targets }));
  fc.assert(fc.property(fc.uniqueArray(item, { selector: (i) => i.slug }), (items) => {
    const published = new Map(items.map((i) => [i.slug, i]));
    const forward = linkGraph.edgesOf(items, published);
    assert.deepStrictEqual(linkGraph.edgesOf([...items].reverse(), published), forward);
    for (const e of forward) assert.ok(published.has(e.source) && published.has(e.target));
  }));
});
