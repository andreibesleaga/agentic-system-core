'use strict';
// verifies AGSC-06-38, AGSC-06-30
// The explorer's reading of `/graph.jsonld` (src/distribution/explorer/graph-data.js):
// which nodes it draws, which links, how a node's page is found, and what the side
// panel lists as a node's neighbours. The explorer reads only the published graph, so a
// held-back item, absent from that file (AGSC-06-30), can never be drawn or named; a
// retired item, which the file keeps (AGSC-11-22), and the terms of a site vocabulary
// (AGSC-05-38) are in the file and are not drawn either.
// Pure functions over small documents; deterministic, no network.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const data = require('../../../src/distribution/explorer/graph-data.js');
const page = require('../../../src/distribution/explorer/page.js');
const { buildNode } = require('../_scratch-node.js');
const { VALID } = require('../../knowledge/_domain-fixtures.js');

const BASE = 'https://node.example/';
const RELATIONS = [
  { key: 'related', meaning: 'Connected in meaning.', symmetric: true, term: 'related' },
  { key: 'uses', meaning: 'Draws on the target.', symmetric: false, term: 'uses' },
  { key: 'requires', meaning: 'Cannot be used without the target.', symmetric: false, term: 'requires' },
];
const label = (text) => ({ '@language': 'en', '@value': text });

/** A small published graph: one cluster with two members, a third item, one source. */
function document() {
  return {
    '@context': `${BASE}ns/context.jsonld`,
    '@graph': [
      { '@id': BASE, '@type': 'Bundle' },
      { '@id': `${BASE}clusters/core/`, '@type': 'Cluster', member: [`${BASE}concepts/a/`, `${BASE}concepts/b/`], prefLabel: label('Core') },
      { '@id': `${BASE}concepts/a/`, '@type': 'Concept', definition: label('The first item.'), prefLabel: label('Item A'), requires: `${BASE}concepts/b/`, related: `${BASE}concepts/c/`, source: `${BASE}concepts/a/#source-1` },
      { '@id': `${BASE}concepts/a/#source-1`, '@type': 'Source', title: 'A book' },
      { '@id': `${BASE}concepts/b/`, '@type': 'Concept', isRequiredBy: `${BASE}concepts/a/`, prefLabel: label('Item B') },
      { '@id': `${BASE}concepts/c/`, '@type': 'Concept', prefLabel: label('Item C'), related: `${BASE}concepts/a/`, uses: 'https://elsewhere.example/x/' },
    ],
  };
}

test('a JSON-LD value reads as its text: a string, a value object, the English one of a list', () => {
  assert.strictEqual(data.explorerText('plain'), 'plain');
  assert.strictEqual(data.explorerText(label('valued')), 'valued');
  assert.strictEqual(data.explorerText([{ '@language': 'fi', '@value': 'suomi' }, label('english')]), 'english');
  assert.strictEqual(data.explorerText([{ '@language': 'fi', '@value': 'suomi' }]), 'suomi');
  assert.strictEqual(data.explorerText(['first', 'second']), 'first');
  for (const nothing of [undefined, null, 7, {}, [], [{}]]) assert.strictEqual(data.explorerText(nothing), '');
});

test('a node\'s page is the part of its IRI after the Bundle\'s IRI, and only a route of this site', () => {
  assert.strictEqual(data.explorerRoute(`${BASE}concepts/a/`, BASE), '/concepts/a/');
  assert.strictEqual(data.explorerRoute(`${BASE}concepts/a/`, 'https://node.example'), '/concepts/a/');
  for (const [iri, base] of [
    ['https://elsewhere.example/concepts/a/', BASE],
    [`${BASE}concepts/a/#source-1`, BASE],
    [`${BASE}concepts/A/`, BASE],
    [`${BASE}`, BASE],
    [`${BASE}concepts/a`, BASE],
    ['javascript:alert(1)//', 'javascript:'],
    [`${BASE}concepts/a/`, ''],
    [7, BASE],
    [`${BASE}concepts/a/`, null],
  ]) assert.strictEqual(data.explorerRoute(iri, base), null, `${iri} under ${base}`);
});

test('the graph draws the items and clusters with their pages, links and summaries; no Bundle, no Source', () => {
  const graph = data.explorerGraph(document(), RELATIONS, 400);
  assert.deepStrictEqual(graph.nodes.map((n) => [n.id, n.type, n.label, n.route, n.summary]), [
    [`${BASE}clusters/core/`, 'Cluster', 'Core', '/clusters/core/', ''],
    [`${BASE}concepts/a/`, 'Concept', 'Item A', '/concepts/a/', 'The first item.'],
    [`${BASE}concepts/b/`, 'Concept', 'Item B', '/concepts/b/', ''],
    [`${BASE}concepts/c/`, 'Concept', 'Item C', '/concepts/c/', ''],
  ]);
  // Members first (structure), then the relation keys in the order of the table; the
  // computed inverse (`isRequiredBy`) adds nothing; a symmetric link is drawn once; a
  // link to a node outside the graph (another site) is not drawn.
  assert.deepStrictEqual(graph.links.map((l) => [l.source.slice(BASE.length), l.key, l.target.slice(BASE.length)]), [
    ['clusters/core/', 'member', 'concepts/a/'],
    ['clusters/core/', 'member', 'concepts/b/'],
    ['concepts/a/', 'related', 'concepts/c/'],
    ['concepts/a/', 'requires', 'concepts/b/'],
  ]);
  assert.strictEqual(graph.total, 4);
});

test('a node with no label is named by its IRI, and one with no type or id is not drawn', () => {
  const graph = data.explorerGraph({ '@graph': [{ '@id': BASE, '@type': 'Bundle' }, { '@id': `${BASE}concepts/x/`, '@type': 'Concept' },
    { '@type': 'Concept' }, { '@id': `${BASE}concepts/y/` }, { '@id': `${BASE}concepts/z/`, '@type': ['Concept', 'schema:Thing'], title: 'Zed' }] }, RELATIONS, 400);
  assert.deepStrictEqual(graph.nodes.map((n) => [n.label, n.type]), [[`${BASE}concepts/x/`, 'Concept'], ['Zed', 'Concept']]);
});

test('a document that is not a graph gives an empty graph', () => {
  for (const nothing of [null, 7, {}, { '@graph': 'x' }]) {
    assert.deepStrictEqual(data.explorerGraph(nothing, RELATIONS, 400), { links: [], nodes: [], total: 0 });
  }
});

test('above the bound the first nodes are drawn, and no link reaches a node left out', () => {
  const graph = data.explorerGraph(document(), RELATIONS, 2);
  assert.deepStrictEqual(graph.nodes.map((n) => n.label), ['Core', 'Item A']);
  assert.strictEqual(graph.total, 4);
  assert.deepStrictEqual(graph.links.map((l) => l.key), ['member']);
});

test('the neighbours of a node: what it states, then what states something of it, members included', () => {
  const graph = data.explorerGraph(document(), RELATIONS, 400);
  const near = (id) => data.explorerNeighbours(graph, `${BASE}${id}`).map((n) => [n.direction, n.key, n.node.label]);
  assert.deepStrictEqual(near('concepts/a/'), [
    ['outgoing', 'related', 'Item C'], ['outgoing', 'requires', 'Item B'], ['incoming', 'member', 'Core']]);
  assert.deepStrictEqual(near('concepts/c/'), [['incoming', 'related', 'Item A']]);
  assert.deepStrictEqual(near('clusters/core/'), [['outgoing', 'member', 'Item A'], ['outgoing', 'member', 'Item B']]);
  assert.deepStrictEqual(data.explorerNeighbours(graph, 'nowhere'), []);
});

test('property: the same document gives the same graph, whatever the order of its keys', () => {
  const keys = fc.uniqueArray(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f'), { maxLength: 6 });
  fc.assert(fc.property(fc.array(fc.tuple(keys, fc.constantFrom('related', 'uses', 'requires')), { maxLength: 6 }), (rows) => {
    const nodes = ['a', 'b', 'c', 'd', 'e', 'f'].map((slug, k) => {
      const node = { '@id': `${BASE}concepts/${slug}/`, '@type': 'Concept', prefLabel: label(slug) };
      const [targets, key] = rows[k] || [[], 'uses'];
      if (targets.length > 0) node[key] = targets.map((t) => `${BASE}concepts/${t}/`);
      return node;
    });
    const reversed = nodes.map((node) => Object.fromEntries(Object.entries(node).reverse()));
    const one = data.explorerGraph({ '@graph': [{ '@id': BASE, '@type': 'Bundle' }, ...nodes] }, RELATIONS, 400);
    const two = data.explorerGraph({ '@graph': [{ '@id': BASE, '@type': 'Bundle' }, ...reversed] }, RELATIONS, 400);
    assert.deepStrictEqual(one, two);
    for (const link of one.links) assert.notStrictEqual(link.source, link.target, 'a self-link is drawn');
  }));
});

test('a graph written with no term for a type or a key (compact IRIs, `@id` objects) reads the same', () => {
  const relations = [{ key: 'uses', symmetric: false, term: 'asc:uses' }];
  const graph = data.explorerGraph({ '@graph': [
    { '@id': BASE, '@type': 'asc:Bundle' },
    { '@id': `${BASE}concepts/a/`, '@type': 'asc:Concept', 'asc:uses': { '@id': `${BASE}concepts/b/` }, prefLabel: label('A') },
    { '@id': `${BASE}concepts/b/`, '@type': 'https://w3id.org/agentic-system-core/ns#Concept', prefLabel: label('B') },
    { '@id': `${BASE}concepts/a/#source-1`, '@type': 'asc:Source' },
  ] }, relations, 400);
  assert.deepStrictEqual(graph.nodes.map((n) => [n.label, n.type, n.route]), [['A', 'Concept', '/concepts/a/'], ['B', 'Concept', '/concepts/b/']]);
  assert.deepStrictEqual(graph.links.map((l) => l.key), ['uses']);
});

test('a retired item is in the graph file and is neither drawn nor named, nor is any link to it', () => {
  const ASC = 'https://w3id.org/agentic-system-core/ns#';
  const retired = [
    { 'asc:retiredAt': { '@type': 'xsd:dateTime', '@value': '2026-01-01T00:00:00Z' }, 'asc:status': 'retired' },
    { retiredAt: '2026-01-01T00:00:00Z' },
    { [`${ASC}retiredAt`]: '2026-01-01T00:00:00Z' },
    { status: 'retired' },
    { [`${ASC}status`]: 'retired' },
  ];
  for (const marks of retired) {
    const graph = data.explorerGraph({ '@graph': [
      { '@id': BASE, '@type': 'Bundle' },
      { '@id': `${BASE}clusters/k/`, '@type': 'Cluster', member: [`${BASE}concepts/a/`, `${BASE}concepts/r/`], prefLabel: label('Kilo') },
      { '@id': `${BASE}concepts/a/`, '@type': 'Concept', prefLabel: label('Alpha'), requires: `${BASE}concepts/r/` },
      { '@id': `${BASE}concepts/r/`, '@type': 'Concept', prefLabel: label('Retired Romeo'), uses: `${BASE}concepts/a/`, ...marks },
    ] }, RELATIONS, 400);
    assert.deepStrictEqual(graph.nodes.map((n) => n.label), ['Kilo', 'Alpha'], JSON.stringify(marks));
    assert.deepStrictEqual(graph.links.map((l) => [l.source, l.key, l.target]), [[`${BASE}clusters/k/`, 'member', `${BASE}concepts/a/`]]);
    assert.strictEqual(graph.total, 2);
  }
  const stable = data.explorerGraph({ '@graph': [{ '@id': BASE, '@type': 'Bundle' },
    { '@id': `${BASE}concepts/a/`, '@type': 'Concept', status: 'deprecated' }] }, RELATIONS, 400);
  assert.strictEqual(stable.nodes.length, 1, 'a deprecated item is still drawn');
});

test('only the six item types with a page of this site are drawn: no vocabulary term, no class, no property', () => {
  const graph = data.explorerGraph({ '@graph': [
    { '@id': BASE, '@type': 'Bundle' },
    { '@id': 'asc:Concept', '@type': 'http://www.w3.org/2002/07/owl#Class' },
    { '@id': 'asc:uses', '@type': 'http://www.w3.org/2002/07/owl#ObjectProperty' },
    { '@id': `${BASE}ns/domain`, '@type': 'http://www.w3.org/2002/07/owl#Ontology' },
    { '@id': `${BASE}ns/domain#Engine`, '@type': 'http://www.w3.org/2002/07/owl#Class', 'rdfs:subClassOf': 'asc:Concept' },
    { '@id': `${BASE}ns/domain#Concept`, '@type': 'Concept', prefLabel: label('A term typed like an item, with no page') },
    { '@id': `${BASE}x/thing/`, '@type': 'schema:Thing', prefLabel: label('Some other node') },
    ...['Concept', 'Procedure', 'Lesson', 'Episode', 'Gate', 'Cluster'].map((type) => ({ '@id': `${BASE}t/${type.toLowerCase()}/`, '@type': type })),
    { '@id': `${BASE}concepts/e/`, '@type': ['https://minimal.example/ns/domain#Engine', 'asc:Concept'], prefLabel: label('An engine') },
  ] }, RELATIONS, 400);
  assert.deepStrictEqual(graph.nodes.map((n) => [n.route, n.type]), [
    ['/t/concept/', 'Concept'], ['/t/procedure/', 'Procedure'], ['/t/lesson/', 'Lesson'], ['/t/episode/', 'Episode'],
    ['/t/gate/', 'Gate'], ['/t/cluster/', 'Cluster'], ['/concepts/e/', 'Concept']]);
  assert.strictEqual(graph.total, 7);
});

test('a real build with a retired item, a draft and a site vocabulary: the explorer draws the listed items alone', () => {
  const built = buildNode([
    { slug: 'k', type: 'cluster', title: 'Kilo', description: 'A cluster of three items, one of them retired and one a draft.' },
    { slug: 'a', type: 'concept', kind: 'explainer', title: 'Alpha', requires: ['r'], uses: ['b'], clusters: ['k'] },
    { slug: 'b', type: 'concept', kind: 'explainer', title: 'Bravo', clusters: ['k'] },
    { slug: 'r', type: 'concept', kind: 'explainer', title: 'Retired Romeo', status: 'retired', uses: ['a'], clusters: ['k'] },
    { slug: 'd', type: 'concept', kind: 'explainer', title: 'Draft Delta', status: 'draft', uses: ['a'] },
  ], { vocabulary: VALID });
  assert.deepStrictEqual(built.findings.filter((f) => f.severity === 'error'), []);
  const doc = JSON.parse(String(built.files.get('/graph.jsonld')));
  assert.ok(doc['@graph'].some((entry) => entry['@id'].endsWith('/concepts/r/')), 'the graph file keeps the retired item (AGSC-11-22)');
  assert.ok(doc['@graph'].some((entry) => String(entry['@id']).includes('/ns/domain')), 'the graph file carries the vocabulary');
  const graph = data.explorerGraph(doc, page.relationTerms(JSON.parse(String(built.files.get('/ns/context.jsonld')))), 400);
  // The listed items, from what was written above: not the retired one, not the draft.
  assert.deepStrictEqual(graph.nodes.map((n) => n.route).sort(), ['/clusters/k/', '/concepts/a/', '/concepts/b/']);
  assert.deepStrictEqual(graph.links.map((l) => [l.source, l.key, l.target].map((iri) => iri.replace(/^https:\/\/[^/]+/u, ''))).sort(), [
    ['/clusters/k/', 'member', '/concepts/a/'], ['/clusters/k/', 'member', '/concepts/b/'], ['/concepts/a/', 'uses', '/concepts/b/']]);
  assert.strictEqual(graph.total, 3);
});
