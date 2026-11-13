'use strict';
// CONTEXT Knowledge — the check of a site's invariants and competency questions (AGSC-09-20).
//
// Implements AGSC-09-20 over AGSC-05-41. Where the Bundle declares `domain.shapes` or
// `domain.questions` (AGSC-01-41), `verify` and `ci` run this check: both files are evaluated
// over ONE data graph, the published projection as `graph.nq` holds it together with the closure
// of AGSC-05-37 (the engine's ontology and the site vocabulary in force); every result of the
// shapes is a finding `AGSC-E421` — an error for `sh:Violation`, a warning for `sh:Warning` and
// `sh:Info` — naming the focus node, the source shape and the message; every competency question
// whose answer differs from its `expected` is the error `AGSC-E422` naming its `id`; a shapes
// file or a questions file outside the subset is `AGSC-E420` (raised by the two evaluators).
//
// WHO DOES WHAT. The closure is `closure.js` (the pinned `n3` Reasoner), the shapes are
// `shacl-core.js` (the pinned `rdf-validate-shacl`), the questions are `competency.js` (the
// pinned SPARQL parser and engine), and the graph texts are read by `turtle.js#parse` (the pinned
// `n3`). This module only joins them: it builds the data graph once and turns the evaluators'
// records into findings, which name the item a focus node is (its slug and file) where it is one.
//
// A node that declares neither file runs neither check and nothing is read (AGSC-09-20). The
// warnings of the closure (`prp-irp`) are not repeated here: `lint` reports a self-link.
//
// PURE: texts in, findings and records out; no fs, no clock, no network, no model (AGSC-08-30).

const closure = require('./closure.js');
const competency = require('./competency.js');
const nq = require('./nquads.js');
const shaclCore = require('./shacl-core.js');
const turtle = require('./turtle.js');
const { finding } = require('./validate.js');

/** How much of an answer a finding quotes, so that a large answer keeps the message readable. */
const QUOTE_LIMIT = 300;

const none = () => ({ findings: [], invariants: [], questions: [] });

/** The data graph of AGSC-05-41: the quads of `graph.nq` and of its closure, as `turtle.js` reads them. */
function dataGraph(graph, ontology, vocabulary) {
  const vocabularies = vocabulary === undefined ? [ontology] : [ontology, vocabulary.text];
  const entailed = closure.closure(graph, vocabularies).text;
  return [...turtle.parse(graph, { format: 'N-Quads' }), ...turtle.parse(entailed, { format: 'N-Quads' })];
}

/** The items of the Bundle by item IRI (AGSC-05-01): the slug and the file a finding names. */
function itemsByIri(items, base) {
  const byIri = new Map();
  for (const item of items) {
    const iri = nq.itemIri(item, { base });
    if (iri !== null) byIri.set(iri, { file: item.path, slug: item.slug });
  }
  return byIri;
}

/** One result of the shapes as the finding `AGSC-E421`: on the focus item's file, or on the shapes file. */
function invariantFinding(record, items, shapesFile) {
  const item = items.get(record.focus);
  const path = record.path === null ? '' : ` on ${record.path}`;
  const said = record.message === null ? `sh:${record.component}` : record.message;
  const message = `${item === undefined ? record.focus : item.slug} breaks the invariant ${record.shape}${path}: ${said} (AGSC-05-41)`;
  return finding('AGSC-E421', message, {
    file: item === undefined || item.file === undefined ? shapesFile : item.file,
    severity: record.severity === 'Violation' ? 'error' : 'warn',
    slug: item === undefined ? undefined : item.slug,
  });
}

/** A value of an answer as text, cut at `QUOTE_LIMIT` code units. */
const quote = (value) => {
  const text = JSON.stringify(value);
  return text.length > QUOTE_LIMIT ? `${text.slice(0, QUOTE_LIMIT)}…` : text;
};

/** One question whose answer differs, as the error `AGSC-E422` naming its id. */
function questionFinding(result, file) {
  const message = `the competency question ${result.id} ("${result.question}") is answered ${quote(result.answer)}, `
    + `not the expected ${quote(result.expected)} (AGSC-05-41)`;
  return finding('AGSC-E422', message, { file, slug: result.id });
}

/**
 * The site's invariants and competency questions, checked over its published graph (AGSC-09-20).
 *
 * @param {object} inputs
 * @param {string} inputs.base  `site.base`, for the item IRIs
 * @param {string} inputs.graph  the text of the `graph.nq` this build emitted
 * @param {Array<{slug: string, type: string, path?: string}>} inputs.items  the items of the Bundle
 * @param {string} inputs.ontology  the text of the engine's `ontology/agsc.ttl`
 * @param {{file: string, text: string}} [inputs.vocabulary]  the site vocabulary in force (AGSC-05-38)
 * @param {{file: string, text: string}} [inputs.shapes]  the file at `domain.shapes`
 * @param {{file: string, text: string}} [inputs.questions]  the file at `domain.questions`
 * @returns {{findings: object[], invariants: object[], questions: object[]}}  the findings
 *   (`AGSC-E420`, then `AGSC-E421` in the order of AGSC-05-41, then `AGSC-E422` by id), and the
 *   records of `shacl-core.js#evaluate` and `competency.js#evaluate` they come from
 */
function check(inputs) {
  const { base, graph, items, ontology, questions, shapes, vocabulary } = inputs;
  if (shapes === undefined && questions === undefined) return none();
  if (typeof graph !== 'string') throw new TypeError('site-checks: the graph.nq of the build is required (AGSC-09-20)');
  let data;
  try {
    data = dataGraph(graph, ontology, vocabulary);
  } catch (e) {
    // The engine's graph and ontology always parse; only the site vocabulary can fail here
    // (AGSC-05-38 (a)). With no vocabulary the fault is the caller's, and it is not hidden.
    if (vocabulary === undefined) throw e;
    const message = `the site vocabulary is not Turtle, so the invariants and competency questions were not checked: ${e.message} (AGSC-05-38, AGSC-05-41)`;
    return { ...none(), findings: [finding('AGSC-E420', message, { file: (vocabulary || {}).file })] };
  }
  const shaped = shapes === undefined ? { findings: [], results: [] } : shaclCore.evaluate(shapes.text, data, { file: shapes.file });
  const asked = questions === undefined ? { findings: [], results: [] } : competency.evaluate(questions.text, data, { file: questions.file });
  const byIri = itemsByIri(items, base);
  return {
    findings: [
      ...shaped.findings,
      ...shaped.results.map((record) => invariantFinding(record, byIri, shapes.file)),
      ...asked.findings,
      ...asked.results.filter((r) => r.result === 'differs').map((r) => questionFinding(r, questions.file)),
    ],
    invariants: shaped.results,
    questions: asked.results,
  };
}

module.exports = { check };
