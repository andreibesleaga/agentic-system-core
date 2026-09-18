'use strict';
// Unit tests for `src/knowledge/skos.js` — the SKOS integrity rules of AGSC-05-12,
// AGSC-05-13 and AGSC-05-17…05-20.

const test = require('node:test');
const assert = require('node:assert');

const skos = require('../../src/knowledge/skos.js');

test('every item type has a class and there is no asc:Item (AGSC-05-12/05-13)', () => {
  assert.strictEqual(skos.classOf('concept'), 'https://w3id.org/agentic-system-core/ns#Concept');
  assert.strictEqual(skos.classOf('cluster'), 'https://w3id.org/agentic-system-core/ns#Cluster');
  assert.strictEqual(skos.classOf('gate'), 'https://w3id.org/agentic-system-core/ns#Gate');
  assert.strictEqual(skos.classOf('nonsense'), null);
  assert.strictEqual(Object.keys(skos.CLASSES).length, 6);
  assert.ok(!Object.values(skos.CLASSES).some((iri) => iri.endsWith('#Item')));
});

test('only a concept and a lesson are skos:Concepts, and so in the scheme (AGSC-05-17)', () => {
  assert.ok(skos.isConceptType('concept'));
  assert.ok(skos.isConceptType('lesson'));
  for (const type of ['episode', 'procedure', 'gate', 'cluster']) {
    assert.ok(!skos.isConceptType(type), `${type} is not a skos:Concept`);
  }
});

test('a Collection is barred from every semantic relation (AGSC-05-20)', () => {
  assert.ok(!skos.allowsSemanticRelation('cluster'));
  assert.ok(skos.allowsSemanticRelation('concept'));
  assert.strictEqual(skos.SEMANTIC_RELATIONS.length, 3);
  for (const property of skos.SEMANTIC_RELATIONS) assert.ok(skos.isSemanticRelation(property));
  assert.ok(!skos.isSemanticRelation('http://www.w3.org/2004/02/skos/core#member'));
});

test('labels are language-tagged and come from title, description and aliases (AGSC-05-17/05-27)', () => {
  const out = skos.labels({ title: 'A', description: 'D', aliases: ['x', 'y'], lang: 'EN' });
  assert.deepStrictEqual(out.map((l) => [l.property.split('#')[1], l.value, l.lang]), [
    ['prefLabel', 'A', 'en'],
    ['definition', 'D', 'en'],
    ['altLabel', 'x', 'en'],
    ['altLabel', 'y', 'en'],
  ]);
});

test('the language falls back to i18n.default, then to en (AGSC-01-13)', () => {
  assert.strictEqual(skos.labels({ title: 'A' }, { lang: 'fr' })[0].lang, 'fr');
  assert.strictEqual(skos.labels({ title: 'A' })[0].lang, 'en');
  assert.deepStrictEqual(skos.labels({}), []);
});

test('cluster membership and cluster NESTING are both skos:member (AGSC-05-18/05-19)', () => {
  const items = [
    { type: 'cluster', slug: 'foundations' },
    { type: 'cluster', slug: 'protocols', broader: ['foundations'] },
    { type: 'concept', slug: 'a2a', clusters: ['protocols'] },
  ];
  const resolve = (slug) => `https://e.org/${slug}`;
  assert.deepStrictEqual(skos.membership(items, resolve), [
    { subject: 'https://e.org/foundations', object: 'https://e.org/protocols' },
    { subject: 'https://e.org/protocols', object: 'https://e.org/a2a' },
  ]);
});

test('a broader on a Concept is NOT membership; it is a semantic relation (AGSC-05-20)', () => {
  const items = [{ type: 'concept', slug: 'a', broader: ['b'] }, { type: 'concept', slug: 'b' }];
  assert.deepStrictEqual(skos.membership(items, (slug) => `https://e.org/${slug}`), []);
});

test('an unresolved slug yields no edge, at either end', () => {
  const items = [{ type: 'concept', slug: 'a', clusters: ['ghost'] }, { type: 'concept', slug: 'ghost2' }];
  assert.deepStrictEqual(skos.membership(items, (slug) => (slug === 'a' ? 'https://e.org/a' : null)), []);
  assert.deepStrictEqual(skos.membership(undefined, () => null), []);
});
