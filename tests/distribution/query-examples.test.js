'use strict';
// verifies AGSC-06-39, AGSC-05-34, AGSC-05-41, AGSC-05-38
// The examples of the `/query/` page filled in from the node (src/distribution/query-examples.js).
// The SPARQL text of each of the ten questions (AGSC-05-34, docs/ontology-questions.json)
// names its subject `?x`, a selection `<S...>` and an instant `"T"`; as published, question 4
// does not parse and question 9 answers nothing. The page puts in values of the node itself:
//   * for each question, the first item in code-point order of its slug that the question has
//     something to say about, else the first item; for question 4 the items that produce what
//     it consumes, for question 9 the items that have a reason and one that has none, and the
//     build's instant;
//   * each filled query, run by the engine the page ships (the Node build of the same Oxigraph
//     release, through the worker's own `queryAnswer`), answers exactly what the question's
//     function answers for the same values, on the shared fixture of graph-0030 to graph-0039
//     and on any graph of items fast-check draws;
//   * the choice does not depend on the order of the items (AGSC-04-02);
//   * the competency questions of a node (AGSC-05-41) and the terms of its site vocabulary
//     (AGSC-05-38) are read for the page, and a faulty file gives none.
// Deterministic (fixed seeds, fixed instant), no network.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const fc = require('fast-check');
const ox = require('oxigraph');

const examples = require('../../src/distribution/query-examples.js');
const engine = require('../../src/distribution/query/engine.js');
const nquads = require('../../src/knowledge/nquads.js');
const questions = require('../../src/knowledge/questions.js');
const domain = require('../../src/knowledge/domain.js');
const { rowsOf, toAnswer } = require('../knowledge/_question-answers.js');

const ROOT = path.resolve(__dirname, '..', '..');
const DOC = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'ontology-questions.json'), 'utf8'));
const WORLD = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'vectors', 'graph', 'graph-0030-question-1-requires-closure.json'), 'utf8')).input.items;
const LINT_0059 = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'vectors', 'lint', 'lint-0059-competency-question-answers-are-checked.json'), 'utf8')).input.add_files;
const BASE = 'https://a.example/';
const AT = '2026-10-29T00:00:00Z';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Every filled example run by the page's engine over the items' graph, as answers of the question's shape. */
function runAll(items, at) {
  const store = new ox.Store();
  store.load(nquads.toNQuads(items, { base: BASE, sha256 }), { format: 'application/n-quads' });
  const iriOf = (slug) => nquads.itemIri(items.find((i) => i.slug === slug), { base: BASE });
  return examples.exampleValues(items, at).map((values, k) => {
    const text = examples.exampleText(DOC.questions[k], DOC.prefixes, values, iriOf);
    const answer = engine.queryAnswer(ox, store, text);
    assert.strictEqual(answer.error, undefined, `example ${k + 1}: ${answer.error}\n${text}`);
    return { expected: questions.answer(k + 1, items, values), got: toAnswer(k + 1, rowsOf(answer.json), items), text, values };
  });
}

test('on the shared fixture each question asks about an item it has something to say about', () => {
  const values = examples.exampleValues(WORLD, AT);
  assert.deepStrictEqual(values.map((v) => v.number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepStrictEqual(values.map((v) => v.subject), ['x', 'ex1', 'q', 'consumer', 'spec1', 't1', 'e1', 'c-sub', null, 's1']);
  assert.deepStrictEqual(values[3].selection, ['prod']);
  assert.deepStrictEqual(values[8].selection, ['dep', 'dr', 'ret', 'st', 'c-sub']);
  assert.strictEqual(values[8].at, AT);
  assert.ok(values.every((v) => v.fits), 'every question found an item to ask about');
  for (const v of values) assert.notDeepStrictEqual(questions.answer(v.number, WORLD, v), [], `question ${v.number} answers something`);
});

test('every filled example, run by the engine the page ships, answers what the question\'s function answers', () => {
  for (const run of runAll(WORLD, AT)) {
    assert.deepStrictEqual(run.got, run.expected, run.text);
    assert.doesNotMatch(run.text, /\?x\b|<S\.\.\.>|"T"/u, 'a placeholder is left in');
  }
});

test('the filled text is the defining text with the values put in, after the prologue of the prefixes', () => {
  const values = examples.exampleValues(WORLD, AT);
  const iriOf = (slug) => `${BASE}x/${slug}/`;
  const prologue = DOC.prefixes.map((p) => `PREFIX ${p}`).join('\n');
  assert.strictEqual(examples.exampleText(DOC.questions[0], DOC.prefixes, values[0], iriOf),
    `${prologue}\nSELECT DISTINCT ?item WHERE { <${BASE}x/x/> dcterms:requires+ ?item } ORDER BY ?item`);
  assert.match(examples.exampleText(DOC.questions[3], DOC.prefixes, values[3], iriOf), /VALUES \?p \{ <https:\/\/a\.example\/x\/consumer\/> <https:\/\/a\.example\/x\/prod\/> \}/u);
  assert.match(examples.exampleText(DOC.questions[8], DOC.prefixes, values[8], iriOf), /\?at < "2026-10-29T00:00:00Z"\^\^xsd:dateTime/u);
  assert.ok(examples.exampleText(DOC.questions[0], DOC.prefixes, values[0], () => 'https://a.example/$&/').includes('{ <https://a.example/$&/> dcterms:requires+'),
    'a $ in an IRI is put in as it is');
  const none = { at: null, fits: false, number: 1, selection: [], subject: null };
  assert.strictEqual(examples.exampleText(DOC.questions[0], DOC.prefixes, none, iriOf), `${prologue}\n${DOC.questions[0].sparql}`);
});

test('the note under each example says which values were put in, and when no item fits', () => {
  const titleOf = (slug) => `T-${slug}`;
  const values = examples.exampleValues(WORLD, AT);
  assert.strictEqual(examples.exampleNote(values[0], titleOf), 'Filled in from this node: ?x is “T-x” (x).');
  assert.strictEqual(examples.exampleNote(values[3], titleOf), 'Filled in from this node: ?x is “T-consumer” (consumer); <S...> is “T-prod” (prod).');
  assert.strictEqual(examples.exampleNote(values[8], titleOf),
    'Filled in from this node: <S...> is “T-dep” (dep), “T-dr” (dr), “T-ret” (ret), “T-st” (st), “T-c-sub” (c-sub); "T" is 2026-10-29T00:00:00Z, the instant of this build.');
  const lone = examples.exampleValues([{ slug: 'solo', title: 'Solo', type: 'concept' }], AT);
  assert.strictEqual(examples.exampleNote(lone[0], titleOf),
    'Filled in from this node: ?x is “T-solo” (solo). No item of this node has what this question asks about, so the answer is empty.');
  assert.strictEqual(examples.exampleNote({ at: null, fits: false, number: 1, selection: [], subject: null }, titleOf),
    'This node has no item yet: put your own in place of ?x, <S...> and "T" before you run the query.');
});

test('a node with one item and no link still gets ten examples that run, each answering what the function answers', () => {
  for (const run of runAll([{ kind: 'principle', prov: { operator: 'human:tester', origin: 'human' }, slug: 'solo', title: 'Solo', type: 'concept' }], AT)) {
    assert.deepStrictEqual(run.got, run.expected, run.text);
  }
});

/**
 * A small graph of items whose links fast-check draws among a fixed set of slugs. Every link
 * points to a later slug, so no chain closes a cycle: on a cycle the informative SPARQL text of
 * AGSC-05-34 (`p+`) reaches the subject itself, which the function leaves out ("a subject is
 * never in its own answer"). A `requires` cycle is refused (AGSC-E302) and a `blocked-by` cycle
 * is warned about; the divergence for the other chains is recorded for the specification's
 * owner, not worked around here.
 */
const SLUGS = ['a', 'b', 'c', 'd', 'e'];
const later = (slug) => SLUGS.filter((s) => s > slug);
const itemArb = (slug) => fc.record({
  'blocked-by': fc.subarray(later(slug), { maxLength: Math.min(2, later(slug).length) }),
  consumes: fc.subarray(['p1', 'p2', 'p3'], { maxLength: 2 }),
  'derived-from': fc.subarray(later(slug), { maxLength: Math.min(2, later(slug).length) }),
  excludes: fc.subarray(later(slug), { maxLength: Math.min(1, later(slug).length) }),
  produces: fc.subarray(['p1', 'p2', 'p3'], { maxLength: 2 }),
  requires: fc.subarray(later(slug), { maxLength: Math.min(2, later(slug).length) }),
  sources: fc.subarray(['https://example.org/r1', 'https://example.org/r2'], { maxLength: 2 }).map((r) => r.map((resource) => ({ resource }))),
  stale: fc.boolean(),
  status: fc.constantFrom(undefined, 'deprecated', 'retired'),
  verifies: fc.subarray(later(slug), { maxLength: Math.min(1, later(slug).length) }),
}).map((links) => {
  const item = { kind: 'principle', prov: { operator: 'human:tester', origin: 'human' }, slug, title: slug.toUpperCase(), type: 'concept' };
  for (const key of ['blocked-by', 'consumes', 'derived-from', 'excludes', 'produces', 'requires', 'sources', 'verifies']) {
    if (links[key].length > 0) item[key] = links[key];
  }
  if (links.stale) item.stale_after = '2026-01-01T00:00:00Z';
  if (links.status !== undefined) item.status = links.status;
  return item;
});
const worldArb = fc.tuple(...SLUGS.map(itemArb));

test('property: on any small graph every filled example answers what the function answers', () => {
  fc.assert(fc.property(worldArb, (items) => {
    for (const run of runAll(items, AT)) assert.deepStrictEqual(run.got, run.expected, run.text);
  }), { numRuns: 40, seed: 20261105 });
});

test('property: the values do not depend on the order of the items', () => {
  fc.assert(fc.property(worldArb.chain((items) => fc.tuple(fc.constant(items), fc.shuffledSubarray(items, { maxLength: items.length, minLength: items.length }))),
    ([items, shuffled]) => {
      assert.deepStrictEqual(examples.exampleValues(shuffled, AT), examples.exampleValues(items, AT));
    }), { numRuns: 60, seed: 20261105 });
});

test('AGSC-05-41: the competency questions of a node, in the order of its file; a file of the wrong shape gives none', () => {
  assert.deepStrictEqual(examples.siteQuestions(LINT_0059['domain/questions.json']), [
    { id: 'has-an-engine', query: 'PREFIX dom: <https://minimal.example/ns/domain#> ASK { ?x a dom:Engine }', question: 'Does the site describe at least one engine?' },
    { id: 'engines', query: 'PREFIX dom: <https://minimal.example/ns/domain#> SELECT ?x WHERE { ?x a dom:Engine } ORDER BY ?x', question: 'Which items are engines?' },
  ]);
  assert.deepStrictEqual(examples.siteQuestions('{"not": "an array"}'), []);
  assert.deepStrictEqual(examples.siteQuestions('[{"id": "a", "query": "ASK {}", "question": "A?"}, {"id": "a", "query": "ASK {}", "question": "B?"}]'), [], 'an id twice');
  assert.deepStrictEqual(examples.siteQuestions('[{"id": "a", "query": 3, "question": "A?"}]'), [], 'a query that is no text');
  assert.deepStrictEqual(examples.siteQuestions('[null]'), []);
  // The id names elements of the page, so only a slug (AGSC-05-41) is taken: no quote can reach an attribute.
  assert.deepStrictEqual(examples.siteQuestions('[{"id": "a\\" onclick=\\"x", "query": "ASK {}", "question": "A?"}]'), [], 'an id that is no slug');
  assert.deepStrictEqual(examples.siteQuestions('not json'), []);
  assert.deepStrictEqual(examples.siteQuestions(null), []);
});

test('AGSC-05-38: the classes and the relations a site vocabulary defines, each with its label, parent and meaning', () => {
  const model = domain.load(LINT_0059['domain/vocabulary.ttl']);
  assert.deepStrictEqual(examples.siteTerms(model), {
    classes: [{ iri: 'https://minimal.example/ns/domain#Engine', label: 'Engine', meaning: 'A machine that turns fuel into thrust.', parents: ['https://w3id.org/agentic-system-core/ns#Concept'] }],
    ontology: { iri: 'https://minimal.example/ns/domain', label: 'Minimal domain vocabulary' },
    relations: [
      { inverse: 'https://minimal.example/ns/domain#controls', iri: 'https://minimal.example/ns/domain#controlled-by', label: 'controlled by', meaning: 'This engine is run by the target controller.', parents: ['https://w3id.org/agentic-system-core/ns#uses'] },
      { inverse: 'https://minimal.example/ns/domain#controlled-by', iri: 'https://minimal.example/ns/domain#controls', label: 'controls', meaning: 'This controller runs the target engine.', parents: ['https://w3id.org/agentic-system-core/ns#uses'] },
    ],
  });
  assert.strictEqual(examples.siteTerms(null), null);
});
