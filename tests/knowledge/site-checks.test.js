'use strict';
// verifies AGSC-05-41, AGSC-09-20
// The check of a site's invariants and competency questions (AGSC-05-41), as `verify` and `ci`
// run it (AGSC-09-20) through `src/knowledge/site-checks.js`: one data graph, `graph.nq` with
// the closure of AGSC-05-37; each result of the shapes is a finding AGSC-E421 (an error for
// `sh:Violation`, a warning for `sh:Warning` and `sh:Info`) naming the focus item; each question
// whose answer differs is AGSC-E422 naming its id; a file outside the subset is AGSC-E420.
// The fixture is the one of the vectors lint-0057 to lint-0059 and graph-0046.
//
// Deterministic: fixed fixtures, fast-check with a fixed seed; no clock, no network.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const fc = require('fast-check');

const siteChecks = require('../../src/knowledge/site-checks.js');
const domain = require('../../src/knowledge/domain.js');
const nq = require('../../src/knowledge/nquads.js');

const ROOT = path.resolve(__dirname, '..', '..');
const RUNS = { numRuns: 25, seed: 20261103, verbose: 0 };
const ONTOLOGY = fs.readFileSync(path.join(ROOT, 'ontology', 'agsc.ttl'), 'utf8');
const CASE = require(path.join(ROOT, 'tests', 'vectors', 'graph', 'graph-0046-invariants-and-questions-over-the-closure.json')).input;
const BASE = CASE.site.base;
const SHAPES = { file: 'domain/shapes.ttl', text: CASE.shapes };
const QUESTIONS = { file: 'domain/questions.json', text: JSON.stringify(CASE.questions) };
const ITEMS = CASE.items.map((item) => ({ ...item, path: `content/concepts/${item.slug}.md` }));
const ENGINE_A = `${BASE}concepts/engine-a/`;

/** The `graph.nq` the items give under the case's site vocabulary, as the build writes it. */
const graphOf = (items = ITEMS, vocabulary = CASE.vocabulary) => nq.toNQuads(items, {
  base: BASE, domain: domain.load(vocabulary, { contexts: [] }),
});

const VOCABULARY = { file: 'domain/vocabulary.ttl', text: CASE.vocabulary };
const inputs = (extra = {}) => ({
  base: BASE, graph: graphOf(), items: ITEMS, ontology: ONTOLOGY, vocabulary: VOCABULARY, ...extra,
});
const codes = (findings) => findings.map((f) => f.code);

test('a node that declares neither file runs neither check', () => {
  assert.deepStrictEqual(siteChecks.check(inputs()), { findings: [], invariants: [], questions: [] });
  // Nothing is read: not even a vocabulary that is not Turtle can fail it.
  assert.deepStrictEqual(siteChecks.check(inputs({ vocabulary: { ...VOCABULARY, text: 'not turtle' } })).findings, []);
});

test('a violated invariant is the error AGSC-E421 naming the focus item, its file and the shape', () => {
  const got = siteChecks.check(inputs({ shapes: SHAPES }));
  assert.deepStrictEqual(got.findings.map(({ code, file, severity, slug }) => ({ code, file, severity, slug })), [
    { code: 'AGSC-E421', file: 'content/concepts/engine-a.md', severity: 'error', slug: 'engine-a' },
  ]);
  const [message] = got.findings.map((f) => f.message);
  assert.match(message, /engine-a/u);
  assert.match(message, /EngineControlled/u);
  assert.match(message, /Every engine needs a controller\./u);
  assert.match(message, /AGSC-05-41/u);
  assert.deepStrictEqual(got.invariants.map((r) => r.focus), [ENGINE_A]);
});

test('a result of sh:Warning or sh:Info severity is a warning AGSC-E421', () => {
  for (const level of ['Warning', 'Info']) {
    const text = CASE.shapes.replace('sh:severity sh:Violation', `sh:severity sh:${level}`);
    const got = siteChecks.check(inputs({ shapes: { ...SHAPES, text } }));
    assert.deepStrictEqual(got.findings.map((f) => [f.code, f.severity, f.slug]), [['AGSC-E421', 'warn', 'engine-a']], level);
  }
});

test('a focus node that is no item of the Bundle is named in the message, on the shapes file, with no slug', () => {
  const text = `${CASE.shapes}
shp:VocabularyLabelled
    a sh:NodeShape ;
    sh:targetNode dom:Engine ;
    sh:property [ sh:path rdfs:comment ; sh:minCount 1 ; sh:message "A class has a comment." ] .
`.replace('@prefix sh:', '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n@prefix sh:');
  const got = siteChecks.check(inputs({ shapes: { ...SHAPES, text } }));
  const outsider = got.findings.find((f) => f.message.includes('https://minimal.example/ns/domain#Engine'));
  assert.ok(outsider, JSON.stringify(got.findings));
  assert.strictEqual(outsider.file, SHAPES.file);
  assert.strictEqual(outsider.slug, undefined);
  assert.strictEqual(outsider.severity, 'error');
});

test('a shapes file outside the subset is AGSC-E420 and no invariant is evaluated', () => {
  const text = CASE.shapes.replace('sh:minCount 1 ;', 'sh:minCount 1 ;\n    sh:sparql shp:Anything ;');
  const got = siteChecks.check(inputs({ shapes: { ...SHAPES, text } }));
  assert.deepStrictEqual(codes(got.findings), ['AGSC-E420']);
  assert.strictEqual(got.findings[0].file, SHAPES.file);
  assert.deepStrictEqual(got.invariants, []);
});

test('a competency question whose answer differs is the error AGSC-E422 naming its id; one that agrees is silent', () => {
  const got = siteChecks.check(inputs({ questions: QUESTIONS }));
  assert.deepStrictEqual(got.findings.map(({ code, file, severity, slug }) => ({ code, file, severity, slug })), [
    { code: 'AGSC-E422', file: QUESTIONS.file, severity: 'error', slug: 'engines' },
  ]);
  assert.match(got.findings[0].message, /Which items are engines\?/u);
  assert.match(got.findings[0].message, /engine-b/u, 'the message shows the answer the graph gives');
  assert.deepStrictEqual(got.questions.map(({ id, result }) => ({ id, result })), [
    { id: 'engines', result: 'differs' }, { id: 'has-an-engine', result: 'agrees' },
  ]);
});

test('a questions file outside the subset is AGSC-E420 and no question is answered', () => {
  const text = JSON.stringify([{ ...CASE.questions[0], query: 'ASK { ?x ?p ?o OPTIONAL { ?x ?q ?r } }' }]);
  const got = siteChecks.check(inputs({ questions: { ...QUESTIONS, text } }));
  assert.deepStrictEqual(codes(got.findings), ['AGSC-E420']);
  assert.strictEqual(got.findings[0].file, QUESTIONS.file);
  assert.deepStrictEqual(got.questions, []);
});

test('the data graph holds the closure: an invariant met only by an entailed triple is met', () => {
  // `controls` is a sub-property of `asc:uses` (prp-spo1), so `ctl asc:uses engine-b` is entailed, never stored.
  const text = `@prefix asc: <https://w3id.org/agentic-system-core/ns#> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix shp: <https://minimal.example/ns/domain-shapes#> .

shp:UsesSomething a sh:NodeShape ;
    sh:targetNode <${BASE}concepts/ctl/> ;
    sh:property shp:UsesSomethingPath .

shp:UsesSomethingPath a sh:PropertyShape ;
    sh:path asc:uses ;
    sh:minCount 1 .
`;
  assert.ok(!graphOf().includes(`<${BASE}concepts/ctl/> <https://w3id.org/agentic-system-core/ns#uses>`), 'the triple is stored');
  assert.deepStrictEqual(siteChecks.check(inputs({ shapes: { ...SHAPES, text } })).findings, []);
  const question = { expected: true, id: 'uses', query: `ASK { <${BASE}concepts/ctl/> <https://w3id.org/agentic-system-core/ns#uses> ?x }`, question: 'Does ctl use something?' };
  const asked = siteChecks.check(inputs({ questions: { ...QUESTIONS, text: JSON.stringify([question]) } }));
  assert.deepStrictEqual(asked.findings, []);
  assert.deepStrictEqual(asked.questions.map((q) => q.result), ['agrees']);
});

test('a site vocabulary that is not Turtle leaves both checks unevaluated, as AGSC-E420 on the vocabulary', () => {
  const got = siteChecks.check(inputs({ questions: QUESTIONS, shapes: SHAPES, vocabulary: { ...VOCABULARY, text: 'not turtle' } }));
  assert.deepStrictEqual(codes(got.findings), ['AGSC-E420']);
  assert.strictEqual(got.findings[0].file, 'domain/vocabulary.ttl');
  assert.deepStrictEqual([got.invariants, got.questions], [[], []]);
});

test('only the site vocabulary is blamed: a build with no graph.nq, or a fault with no vocabulary, is no AGSC-E420', () => {
  assert.throws(() => siteChecks.check(inputs({ graph: undefined, shapes: SHAPES })), /graph\.nq/u);
  assert.throws(() => siteChecks.check(inputs({ ontology: 'not turtle', shapes: SHAPES, vocabulary: undefined })));
});

test('a node with no site vocabulary runs its checks on the graph with no site classes (AGSC-01-41)', () => {
  const plain = ITEMS.map(({ domain_type: _type, domain_links: _links, ...item }) => item);
  const question = { expected: true, id: 'concepts', query: 'ASK { ?x a <https://w3id.org/agentic-system-core/ns#Concept> }', question: 'Any concept?' };
  const got = siteChecks.check({ base: BASE, graph: nq.toNQuads(plain, { base: BASE }), items: plain, ontology: ONTOLOGY,
    questions: { ...QUESTIONS, text: JSON.stringify([question]) }, shapes: SHAPES });
  assert.deepStrictEqual(got.findings, []);
  assert.deepStrictEqual(got.questions.map((q) => q.result), ['agrees']);
});

test('both checks together: the invariants first, then the questions, each in its own order', () => {
  const got = siteChecks.check(inputs({ questions: QUESTIONS, shapes: SHAPES }));
  assert.deepStrictEqual(got.findings.map((f) => [f.code, f.slug]), [['AGSC-E421', 'engine-a'], ['AGSC-E422', 'engines']]);
});

test('property: the order of the items changes no finding', () => {
  const reference = JSON.stringify(siteChecks.check(inputs({ questions: QUESTIONS, shapes: SHAPES })));
  fc.assert(fc.property(fc.shuffledSubarray(ITEMS, { maxLength: ITEMS.length, minLength: ITEMS.length }), (items) => {
    const got = siteChecks.check(inputs({ graph: graphOf(items), items, questions: QUESTIONS, shapes: SHAPES }));
    assert.strictEqual(JSON.stringify(got), reference);
  }), RUNS);
});
