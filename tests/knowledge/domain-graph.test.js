'use strict';
// verifies AGSC-05-38, AGSC-05-39
// The triples of the domain layer in the graph views: every triple of the site vocabulary
// in the Bundle's named graph of `graph.nq`, `graph.ttl` and `graph.jsonld` and in no
// per-item view (AGSC-05-38), and the triples an item adds with its domain keys
// (AGSC-05-39). The whole `graph.nq` is the vector graph-0044; the views are compared with
// the pinned `n3` (Turtle) and the reference JSON-LD processor `jsonld@9.0.0`. Offline:
// the document loader serves the one context URL from memory.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const fc = require('fast-check');
const N3 = require('n3');
const jsonldProcessor = require('jsonld');
const domain = require('../../src/knowledge/domain.js');
const nq = require('../../src/knowledge/nquads.js');
const turtle = require('../../src/knowledge/turtle.js');
const jsonld = require('../../src/knowledge/jsonld.js');
const { INVERSE_OF_TYPE, NAMESPACE, VALID, withExtra } = require('./_domain-fixtures.js');

const ROOT = path.resolve(__dirname, '..', '..');
const CASE = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'vectors', 'graph', 'graph-0044-site-vocabulary-and-domain-triples.json'), 'utf8'));
const BASE = 'https://minimal.example/';
const CONTEXT_URL = 'https://minimal.example/ns/context.jsonld';
const CONTEXT = jsonld.context(turtle.ontologyTerms(fs.readFileSync(path.join(ROOT, 'ontology', 'agsc.ttl'), 'utf8')),
  jsonld.allExternalProperties());
const RUNS = { numRuns: 40, seed: 20261102, verbose: 0 };

const optionsWith = (model, extra = {}) => ({ base: BASE, bundle: CASE.input.bundle, domain: model, ...extra });
const MODEL = domain.load(CASE.input.vocabulary, { contexts: [] });
const ITEMS = CASE.input.items;

/** The triples of a text as sorted N-Triples-like lines, the plain-literal datatype written out. */
function tripleLines(quads) {
  return quads.map((q) => {
    const term = (t) => {
      if (t.termType === 'NamedNode') return `<${t.value}>`;
      if (t.language) return `${JSON.stringify(t.value)}@${t.language}`;
      return `${JSON.stringify(t.value)}^^<${t.datatype.value}>`;
    };
    return `${term(q.subject)} ${term(q.predicate)} ${term(q.object)}`;
  }).sort();
}

test('the whole graph.nq of the case is the one the vector states (graph-0044)', () => {
  assert.strictEqual(nq.toNQuads(ITEMS, optionsWith(MODEL)), CASE.expected.nquads);
});

test('without the model no domain triple is written, whatever keys the items carry (AGSC-05-39)', () => {
  const plain = ITEMS.map(({ domain_context, domain_links, domain_role, domain_type, ...rest }) => rest);
  assert.strictEqual(nq.toNQuads(ITEMS, optionsWith(undefined)), nq.toNQuads(plain, optionsWith(undefined)));
  const text = nq.toNQuads(ITEMS, optionsWith(undefined));
  assert.ok(!text.includes(NAMESPACE) && !text.includes('additionalType') && !text.includes('isPartOf'));
});

test('graph.ttl holds the same triples as graph.nq, with the prefix block of AGSC-05-10 unchanged', () => {
  const text = turtle.toTurtle(ITEMS, optionsWith(MODEL));
  assert.ok(text.startsWith(`${turtle.prefixBlock()}\n\n`));
  assert.ok(text.includes('<http://www.w3.org/2002/07/owl#Class>'), 'the terms of OWL are full IRIs');
  const fromTurtle = tripleLines(new N3.Parser().parse(text));
  const fromNQuads = tripleLines(new N3.Parser({ format: 'N-Quads' }).parse(CASE.expected.nquads));
  assert.deepStrictEqual(fromTurtle, fromNQuads);
});

test('graph.jsonld holds the same triples, and an item with two classes lists both in code-point order of their IRIs', async () => {
  const document = jsonld.toJsonLd(ITEMS, optionsWith(MODEL, { context: CONTEXT, contextUrl: CONTEXT_URL }));
  const node = document['@graph'].find((n) => n['@id'] === `${BASE}concepts/engine-a/`);
  assert.deepStrictEqual(node['@type'], CASE.expected.jsonld_type[`${BASE}concepts/engine-a/`]);
  const loader = async (url) => {
    if (url === CONTEXT_URL) return { contextUrl: null, document: CONTEXT, documentUrl: url };
    throw new Error(`the test resolves no URL but the context: ${url}`);
  };
  const fromJsonLd = await jsonldProcessor.toRDF(document, { format: 'application/n-quads', documentLoader: loader });
  const fromNQuads = new N3.Parser({ format: 'N-Quads' }).parse(CASE.expected.nquads)
    .map((q) => N3.DataFactory.quad(q.subject, q.predicate, q.object));
  assert.deepStrictEqual(tripleLines(new N3.Parser({ format: 'N-Quads' }).parse(fromJsonLd)), tripleLines(fromNQuads));
});

test('a per-item view holds the item\'s domain triples and no triple of the vocabulary (AGSC-05-38, AGSC-05-39)', () => {
  const options = optionsWith(MODEL, { context: CONTEXT, contextUrl: CONTEXT_URL });
  const whole = jsonld.toJsonLd(ITEMS, options);
  for (const item of ITEMS) {
    const page = jsonld.restrictTo(whole, jsonld.toJsonLd([item], { ...options, siteVocabulary: false }));
    const ids = page['@graph'].map((n) => n['@id']);
    // A node of the vocabulary is written as its IRI or, under a prefix of the context, as its compact IRI.
    assert.ok(ids.every((id) => !id.startsWith(NAMESPACE) && !id.startsWith('https://w3id.org/')
      && !/^(asc|dcterms|prov|rdfs|schema|skos|xsd):/u.test(id)), ids.join(', '));
  }
  const page = jsonld.restrictTo(whole, jsonld.toJsonLd([ITEMS[0]], { ...options, siteVocabulary: false }));
  const engine = page['@graph'].find((n) => n['@id'] === `${BASE}concepts/engine-a/`);
  assert.strictEqual(engine['schema:additionalType'], 'aggregate-root');
  assert.deepStrictEqual(engine[`${NAMESPACE}controlled-by`], { '@id': `${BASE}concepts/ctl/` });
});

const extended = domain.load(withExtra([
  'dom:pairedWith a owl:ObjectProperty , owl:SymmetricProperty ; rdfs:label "paired with" ; rdfs:subPropertyOf skos:related .',
  'dom:feeds a owl:ObjectProperty ; rdfs:label "feeds" ; rdfs:subPropertyOf asc:uses .',
].join('\n')), { contexts: [] });
const concept = (slug, extra = {}) => ({ type: 'concept', slug, title: slug, kind: 'principle', ...extra });
const linesOf = (items) => nq.toNQuads(items, optionsWith(extended)).split('\n').filter((l) => l.includes(NAMESPACE) && !l.startsWith(`<${NAMESPACE}`));

test('a symmetric property gives the edge back; a property with no inverse gives one edge', () => {
  assert.deepStrictEqual(linesOf([concept('a', { domain_links: { pairedWith: ['b'], feeds: ['b'] } }), concept('b')]), [
    `<${BASE}concepts/a/> <${NAMESPACE}feeds> <${BASE}concepts/b/> <${BASE}> .`,
    `<${BASE}concepts/a/> <${NAMESPACE}pairedWith> <${BASE}concepts/b/> <${BASE}> .`,
    `<${BASE}concepts/b/> <${NAMESPACE}pairedWith> <${BASE}concepts/a/> <${BASE}> .`,
  ]);
});

test('nothing is written for a name the vocabulary does not define, a missing target, or a concept-only property at a cluster', () => {
  const items = [
    concept('a', { domain_type: 'Unknown', domain_links: { unknown: ['b'], feeds: ['nowhere'], pairedWith: ['c'] }, domain_context: 'b' }),
    concept('b'),
    { type: 'cluster', slug: 'c', title: 'c' },
  ];
  assert.deepStrictEqual(linesOf(items), []);
  assert.ok(!nq.toNQuads(items, optionsWith(extended)).includes('isPartOf'), 'domain_context names a concept, not a cluster');
});

test('a domain link adds only edges whose predicate the site vocabulary defines, whatever its owl:inverseOf names (AGSC-05-38 (f))', () => {
  const unsafe = domain.load(withExtra([
    INVERSE_OF_TYPE,
    'dom:usedBy a owl:ObjectProperty ; rdfs:label "used by" ; rdfs:subPropertyOf asc:uses ; owl:inverseOf asc:uses .',
  ].join('\n')), { contexts: [] });
  const items = [concept('a', { domain_links: { typeOf: ['b'], usedBy: ['b'] } }), concept('b')];
  const plain = items.map(({ domain_links, ...rest }) => rest);
  const before = new Set(nq.toNQuads(plain, optionsWith(unsafe)).split('\n'));
  const added = nq.toNQuads(items, optionsWith(unsafe)).split('\n').filter((line) => !before.has(line));
  assert.deepStrictEqual(added, [
    `<${BASE}concepts/a/> <${NAMESPACE}typeOf> <${BASE}concepts/b/> <${BASE}> .`,
    `<${BASE}concepts/a/> <${NAMESPACE}usedBy> <${BASE}concepts/b/> <${BASE}> .`,
  ]);
});

test('a link target with an anchor keeps its anchor, as every Link does (AGSC-03-02)', () => {
  assert.deepStrictEqual(linesOf([concept('a', { domain_links: { feeds: ['b#part'] } }), concept('b')]),
    [`<${BASE}concepts/a/> <${NAMESPACE}feeds> <${BASE}concepts/b/#part> <${BASE}> .`]);
});

test('the domain triples do not depend on the order of the items or of their links', () => {
  const items = [
    concept('a', { domain_type: 'Engine', domain_role: 'entity', domain_links: { feeds: ['b', 'c'], pairedWith: ['c'] } }),
    concept('b', { domain_links: { 'controlled-by': ['a'] } }),
    concept('c'),
  ];
  const once = nq.toNQuads(items, optionsWith(extended));
  fc.assert(fc.property(fc.shuffledSubarray(items, { minLength: items.length }), (shuffled) => {
    assert.strictEqual(nq.toNQuads(shuffled, optionsWith(extended)), once);
  }), RUNS);
});

test('a vocabulary used by no item still publishes all its triples, and the file text is not needed twice', () => {
  const model = domain.load(VALID, { contexts: [] });
  const text = nq.toNQuads([concept('a')], optionsWith(model));
  for (const [s, p, o] of model.triples) assert.ok(text.includes(`${nq.nquadsTerm(s)} ${nq.nquadsTerm(p)} ${nq.nquadsTerm(o)} <${BASE}> .`));
  assert.strictEqual(nq.toNQuads([concept('a')], optionsWith(model, { siteVocabulary: false })), nq.toNQuads([concept('a')], optionsWith(undefined)));
});

test('a literal under a term that selects IRIs stays a literal in graph.jsonld (rdfs:seeAlso in a site vocabulary)', async () => {
  const model = domain.load(withExtra('dom:Engine rdfs:seeAlso "A note on engines" .'), { contexts: [] });
  const document = jsonld.toJsonLd([concept('a')], optionsWith(model, { context: CONTEXT, contextUrl: CONTEXT_URL }));
  const engine = document['@graph'].find((n) => n['@id'] === `${NAMESPACE}Engine`);
  assert.deepStrictEqual(engine.seeAlso, { '@type': 'xsd:string', '@value': 'A note on engines' });
  const loader = async (url) => ({ contextUrl: null, document: CONTEXT, documentUrl: url });
  const fromJsonLd = await jsonldProcessor.toRDF(document, { format: 'application/n-quads', documentLoader: loader });
  assert.match(fromJsonLd, /<https:\/\/minimal\.example\/ns\/domain#Engine> <http:\/\/www\.w3\.org\/2000\/01\/rdf-schema#seeAlso> "A note on engines" \./u);
});
