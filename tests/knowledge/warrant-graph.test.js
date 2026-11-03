'use strict';
// verifies AGSC-05-40, AGSC-05-26, AGSC-06-32
// The two triples a valid warrant adds on its item, `dcterms:source` with the source and
// `asc:warrant` with the kind, both `xsd:string` (AGSC-05-40, the AGSC-05-26 table), in the
// four views of the graph and in the item's own `pages/<slug>.jsonld`. The whole `graph.nq`
// is the vector graph-0045. An item with no warrant, or with one that breaks the rule, adds
// nothing, so its bytes are those of the same item without the key. `graph.jsonld` must
// survive the expand and re-compact round trip of AGSC-06-32 with the context of the
// context version, which has no `warrant` term (AGSC-05-09): the member is written as the
// compact IRI the reference processor writes. Offline: the document loader serves the one
// context URL from memory.

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
const jcs = require('../../src/knowledge/jcs.js');

const ROOT = path.resolve(__dirname, '..', '..');
const vector = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'vectors', 'graph', name), 'utf8'));
const CASE = vector('graph-0045-warrant-on-the-source.json');
const DOMAIN_CASE = vector('graph-0044-site-vocabulary-and-domain-triples.json');
const CONTEXT_URL = 'https://minimal.example/ns/context.jsonld';
const CONTEXT = jsonld.context(turtle.ontologyTerms(fs.readFileSync(path.join(ROOT, 'ontology', 'agsc.ttl'), 'utf8')),
  jsonld.allExternalProperties());
const OPTIONS = Object.freeze({ base: CASE.input.site.base, bundle: CASE.input.bundle });
const RUNS = { numRuns: 60, seed: 20261103, verbose: 0 };
const [LEDGER] = CASE.input.items;
const SUBJECT = `${CASE.input.site.base}concepts/ledger/`;

const loader = async (url) => {
  if (url === CONTEXT_URL) return { contextUrl: null, document: CONTEXT, documentUrl: url };
  throw new Error(`the test resolves no URL but the context: ${url}`);
};

/** The triples of a quad list as sorted lines, the plain-literal datatype written out. */
function tripleLines(quads) {
  const term = (t) => {
    if (t.termType === 'NamedNode') return `<${t.value}>`;
    if (t.language) return `${JSON.stringify(t.value)}@${t.language}`;
    return `${JSON.stringify(t.value)}^^<${t.datatype.value}>`;
  };
  return quads.map((q) => `${term(q.subject)} ${term(q.predicate)} ${term(q.object)}`).sort();
}

/** Expand a document and compact it again with the context (AGSC-06-32). */
async function roundTrip(document) {
  const expanded = await jsonldProcessor.expand(document, { documentLoader: loader });
  return jsonldProcessor.compact(expanded, CONTEXT_URL, { documentLoader: loader });
}

const withoutWarrant = ({ warrant, ...rest }) => rest;
const warrantLines = (text) => text.split('\n')
  .filter((line) => line.startsWith(`<${SUBJECT}> <${nq.NS}warrant>`) || line.startsWith(`<${SUBJECT}> <${nq.DCTERMS}source>`));

test('the whole graph.nq of the case is the one the vector states (graph-0045)', () => {
  assert.strictEqual(nq.toNQuads(CASE.input.items, OPTIONS), CASE.expected.nquads);
});

test('the two triples are on the item, both xsd:string, and the Source node of sources[] is unchanged', () => {
  const text = nq.toNQuads(CASE.input.items, OPTIONS);
  assert.deepStrictEqual(warrantLines(text), [
    `<${SUBJECT}> <${nq.DCTERMS}source> "https://example.org/glossary"^^<${nq.XSD}string> <${CASE.input.site.base}> .`,
    `<${SUBJECT}> <${nq.NS}warrant> "literary"^^<${nq.XSD}string> <${CASE.input.site.base}> .`,
  ]);
  const plain = nq.toNQuads([withoutWarrant(LEDGER)], OPTIONS);
  assert.deepStrictEqual(text.split('\n').filter((line) => !warrantLines(line).length), plain.split('\n'),
    'a warrant is not an entry of sources[] and changes none of them (AGSC-05-40)');
});

test('no warrant, or one that breaks the rule, adds no triple: the bytes are those of the item without the key', () => {
  const plain = nq.toNQuads([withoutWarrant(LEDGER)], OPTIONS);
  for (const warrant of [{ source: 'https://example.org/glossary' }, { source: 'x', type: 'popular' }, { source: '', type: 'user' }, 'literary']) {
    assert.strictEqual(nq.toNQuads([{ ...LEDGER, warrant }], OPTIONS), plain, JSON.stringify(warrant));
  }
});

test('a member of the warrant the rule does not name adds nothing (AGSC-02-25)', () => {
  const extra = { ...LEDGER, warrant: { ...LEDGER.warrant, note: 'kept, never read' } };
  assert.strictEqual(nq.toNQuads([extra], OPTIONS), CASE.expected.nquads);
});

test('graph.ttl holds the same triples as graph.nq, with the prefix block of AGSC-05-10 unchanged', () => {
  const text = turtle.toTurtle(CASE.input.items, OPTIONS);
  assert.ok(text.startsWith(`${turtle.prefixBlock()}\n\n`));
  assert.deepStrictEqual(tripleLines(new N3.Parser().parse(text)),
    tripleLines(new N3.Parser({ format: 'N-Quads' }).parse(CASE.expected.nquads)));
});

test('graph.jsonld holds the same triples and survives the round trip; the context has no warrant term', async () => {
  assert.strictEqual(CONTEXT['@context'].warrant, undefined, 'the context of the context version is unchanged (AGSC-05-09)');
  const document = jsonld.toJsonLd(CASE.input.items, { ...OPTIONS, context: CONTEXT, contextUrl: CONTEXT_URL });
  const node = document['@graph'].find((n) => n['@id'] === SUBJECT);
  assert.strictEqual(node['asc:warrant'], 'literary');
  assert.strictEqual(node['dcterms:source'], 'https://example.org/glossary');
  assert.strictEqual(jcs.canonicalize(await roundTrip(document)), jcs.canonicalize(document));
  const fromJsonLd = await jsonldProcessor.toRDF(document, { format: 'application/n-quads', documentLoader: loader });
  assert.deepStrictEqual(tripleLines(new N3.Parser({ format: 'N-Quads' }).parse(fromJsonLd)),
    tripleLines(new N3.Parser({ format: 'N-Quads' }).parse(CASE.expected.nquads)));
});

test('the per-item view carries the two triples (AGSC-05-40 with AGSC-06-02)', () => {
  const options = { ...OPTIONS, context: CONTEXT, contextUrl: CONTEXT_URL };
  const whole = jsonld.toJsonLd(CASE.input.items, options);
  const page = jsonld.restrictTo(whole, jsonld.toJsonLd([LEDGER], options));
  const node = page['@graph'].find((n) => n['@id'] === SUBJECT);
  assert.strictEqual(node['asc:warrant'], 'literary');
});

test('a node with a site vocabulary and domain keys survives the round trip too (AGSC-06-32 with AGSC-05-39)', async () => {
  const model = domain.load(DOMAIN_CASE.input.vocabulary, { contexts: [] });
  const items = DOMAIN_CASE.input.items.map((it, n) => (n === 0 ? { ...it, warrant: { source: 'Field glossary', type: 'user' } } : it));
  const document = jsonld.toJsonLd(items, {
    base: 'https://minimal.example/', bundle: DOMAIN_CASE.input.bundle, domain: model, context: CONTEXT, contextUrl: CONTEXT_URL,
  });
  assert.strictEqual(jcs.canonicalize(await roundTrip(document)), jcs.canonicalize(document));
});

test('the warrant triples do not depend on the order of the items (property)', () => {
  const kinds = ['literary', 'user', 'organisational'];
  const items = kinds.map((type, n) => ({ ...LEDGER, slug: `term-${n}`, title: `Term ${n}`, sources: undefined,
    warrant: { source: `https://example.org/${type}`, type } }));
  const expected = nq.toNQuads(items, OPTIONS);
  assert.strictEqual(expected.split('\n').filter((line) => line.includes(`<${nq.NS}warrant>`)).length, kinds.length);
  fc.assert(fc.property(fc.shuffledSubarray(items, { minLength: items.length }), (order) => {
    assert.strictEqual(nq.toNQuads(order, OPTIONS), expected);
    return true;
  }), RUNS);
});
