'use strict';
// AGSC-02-19, AGSC-03-08, AGSC-05-19/20 — the old DECKS become Clusters.
//
// The SKOS integrity claims are the point of this suite: a Collection carries no
// semantic relation (AGSC-05-20), so a cluster this module emits has no
// `related`, `narrower`, `uses` or any other Link key; membership is authored ON
// THE ITEM (AGSC-02-19), so it is DERIVED here and never written to the cluster
// file; and a deck nobody names produces no cluster at all, because a cluster
// with no members is an orphan warning for ever (AGSC-03-10).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const clusters = require('../../src/interchange/clusters.js');
const validate = require('../../src/knowledge/validate.js');

const DECKS = path.resolve(__dirname, '..', 'fixtures', 'old-site-10', 'content', 'decks.json');
const PROV = Object.freeze({ origin: 'imported', operator: 'human:tester' });

function build(decks, cards) {
  return clusters.build(decks, {
    members: clusters.membership(cards),
    prov: PROV,
    date: '2026-01-01',
  });
}

test('the fixture decks become one cluster per NAMED deck, in slug order', () => {
  const decks = JSON.parse(fs.readFileSync(DECKS, 'utf8'));
  const built = build(decks, [{ slug: 'b', deck: 'beta' }, { slug: 'a', deck: 'alpha' }]);
  assert.deepStrictEqual(built.findings, []);
  assert.deepStrictEqual(built.clusters.map((c) => c.slug), ['alpha', 'beta']);
  assert.deepStrictEqual(built.skipped, ['empty-deck']);
  assert.strictEqual(built.clusters[0].path, 'content/clusters/alpha.md');
});

test('AGSC-04-19: the cluster frontmatter is in the pinned key order', () => {
  const decks = JSON.parse(fs.readFileSync(DECKS, 'utf8'));
  const built = build(decks, [{ slug: 'a', deck: 'alpha' }]);
  assert.deepStrictEqual(Object.keys(built.clusters[0].frontmatter),
    ['type', 'title', 'description', 'date', 'prov', 'order', 'family']);
  assert.strictEqual(built.clusters[0].frontmatter.type, 'cluster');
  assert.deepStrictEqual(built.clusters[0].frontmatter.prov, PROV);
});

test('AGSC-05-20: a cluster carries no Link key at all', () => {
  const decks = JSON.parse(fs.readFileSync(DECKS, 'utf8'));
  const built = build(decks, [{ slug: 'a', deck: 'alpha' }, { slug: 'b', deck: 'beta' }]);
  const LINK_KEYS = ['related', 'broader', 'narrower', 'uses', 'requires', 'excludes',
    'derived-from', 'contradicts', 'supersedes', 'implements', 'verifies', 'covers',
    'blocked-by', 'decided-by', 'clusters'];
  for (const cluster of built.clusters) {
    for (const key of LINK_KEYS) {
      assert.strictEqual(cluster.frontmatter[key], undefined, `${cluster.slug} carries ${key}`);
    }
    // …and the body is prose, so no wikilink becomes a Link either (AGSC-03-12).
    assert.ok(!cluster.body.includes('[['), cluster.slug);
  }
});

test('AGSC-02-19: membership is derived from the items and never written on the cluster', () => {
  const map = clusters.membership([
    { slug: 'z', deck: 'alpha' }, { slug: 'a', deck: 'alpha' }, { slug: 'x', deck: '' },
    { slug: 'y' }, 'not an object',
  ]);
  assert.deepStrictEqual([...map.keys()], ['alpha']);
  assert.deepStrictEqual(map.get('alpha'), ['a', 'z'], 'members are in code-point order');
  assert.deepStrictEqual([...clusters.membership(undefined).keys()], []);
});

test('the AGSC-02-24 description comes from the deck\'s own words, extended not invented', () => {
  const long = clusters.describe({ name: 'Name', tagline: 'A tagline long enough to stand on its own beyond the minimum.' });
  assert.deepStrictEqual(long.findings, []);
  assert.strictEqual(long.description, 'A tagline long enough to stand on its own beyond the minimum.');
  // Too short: the deck's NAME is prepended, which is the deck's own word too.
  const extended = clusters.describe({ name: 'A Deck Whose Name Carries Most Of The Length Here', tagline: 'Short.' });
  assert.strictEqual(extended.description, 'A Deck Whose Name Carries Most Of The Length Here — Short.');
  assert.deepStrictEqual(extended.findings, []);
});

test('a description that cannot reach the minimum is reported, never padded', () => {
  const short = clusters.describe({ name: 'A', tagline: 'B.' }, { slug: 'a' });
  assert.deepStrictEqual(short.findings.map((f) => [f.code, f.severity]), [['AGSC-E408', 'warn']]);
  assert.strictEqual(short.description, 'A — B.');
  const empty = clusters.describe({}, { slug: 'a' });
  assert.strictEqual(empty.description, '');
  assert.deepStrictEqual(empty.findings.map((f) => f.code), ['AGSC-E408']);
});

test('a description over the maximum is an error, never silently cut', () => {
  const over = clusters.describe({ name: 'N', tagline: 'x'.repeat(clusters.DESCRIPTION_MAX + 1) }, { slug: 'a' });
  assert.deepStrictEqual(over.findings.map((f) => [f.code, f.severity]), [['AGSC-E204', 'error']]);
  assert.strictEqual(over.description.length, clusters.DESCRIPTION_MAX + 1, 'the text is preserved as authored');
});

test('AGSC-02-03: `order` is written as a failsafe scalar and typed back by the schema', () => {
  const built = build([{ id: 'a', name: 'A Deck', tagline: 'A tagline long enough to stand on its own beyond that bound.', order: 7 }],
    [{ slug: 'x', deck: 'a' }]);
  assert.strictEqual(built.clusters[0].frontmatter.order, '7');
  // The schema types it back on the way in, which is what AGSC-02-03 promises.
  const typed = validate.applyTypes({ order: '7' }, { properties: { order: { type: 'integer' } } });
  assert.strictEqual(typed.order, 7);
  // A string `order` is accepted too, and a non-numeric one adds no key.
  assert.strictEqual(build([{ id: 'b', name: 'B Deck', tagline: 'A tagline long enough to stand on its own beyond that bound.', order: '3' }],
    [{ slug: 'x', deck: 'b' }]).clusters[0].frontmatter.order, '3');
  assert.strictEqual(build([{ id: 'c', name: 'C Deck', tagline: 'A tagline long enough to stand on its own beyond that bound.', order: 'third' }],
    [{ slug: 'x', deck: 'c' }]).clusters[0].frontmatter.order, undefined);
});

test('a deck with no id, and a deck whose id is not a slug', () => {
  const built = build([{ name: 'No Id' }, { id: 'Not A Slug', name: 'Odd', tagline: 'A tagline long enough to stand on its own beyond that bound.' }],
    [{ slug: 'x', deck: 'Not A Slug' }]);
  assert.deepStrictEqual(built.clusters.map((c) => c.slug), ['not-a-slug']);
  assert.deepStrictEqual(built.findings, []);
  assert.deepStrictEqual(build(undefined, []).clusters, []);
});

test('AGSC-01-10: slugify is total, so even a punctuation-only deck id reaches a slug', () => {
  const built = build([{ id: '###', name: 'Punctuation', tagline: 'A tagline long enough to stand on its own beyond that bound.' }],
    [{ slug: 'x', deck: '###' }]);
  assert.deepStrictEqual(built.clusters.map((c) => c.slug), ['note']);
  assert.deepStrictEqual(built.findings, []);
});

test('the body states the derived member count and nothing else', () => {
  const one = build([{ id: 'a', name: 'A Deck', tagline: 'A tagline long enough to stand on its own beyond that bound.' }],
    [{ slug: 'x', deck: 'a' }]);
  assert.match(one.clusters[0].body, /1 imported item names this cluster\./u);
  const two = build([{ id: 'a', name: 'A Deck', tagline: 'A tagline long enough to stand on its own beyond that bound.' }],
    [{ slug: 'x', deck: 'a' }, { slug: 'y', deck: 'a' }]);
  assert.match(two.clusters[0].body, /2 imported items name this cluster\./u);
});

test('ordered(): an unexpected key lands after the pinned ones, in code-point order', () => {
  const out = clusters.ordered({ zebra: '1', type: 'cluster', apple: '2', title: 'T' });
  assert.deepStrictEqual(Object.keys(out), ['type', 'title', 'apple', 'zebra']);
});
