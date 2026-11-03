'use strict';
// CONTEXT Knowledge — the SHACL Core subset that evaluates a site's invariants.
//
// Implements the SHACL half of AGSC-05-41. A node MAY state invariants of its own as SHACL 1.0
// shapes in the file at `domain.shapes` (AGSC-01-41), and the engine evaluates exactly the SHACL
// Core subset the rule names and nothing else: a shapes file outside it is the error `AGSC-E420`
// and is not evaluated; each result of a validation is returned as a plain record, in the order
// the rule fixes (focus node, source shape, path, by code point). `verify` and `ci` turn the
// records into findings (AGSC-09-20); that is not done here.
//
// LIBRARY. Validation is done by the pinned `rdf-validate-shacl` (Zazuko, MIT); nothing here
// evaluates a constraint. The shapes are Turtle, read by the pinned `n3` through
// `turtle.js#parse`. What is ours is what no library does, because SHACL has no profile
// mechanism: the subset as data (`TERMS`, `PARAMETERS`) and the check that refuses the rest,
// with the value each parameter takes (SHACL 1.0 sections 2 and 4); the records, whose blank
// property shapes and inverse paths are named by what the file says, never by a parser's label;
// and the order.
//
// WHY THE LIBRARY RUNS SYNCHRONOUSLY. Its `validate()` is asynchronous only because it first
// loads `owl:imports`; the verbs of this engine are synchronous and read no network (AGSC-08-30).
// So `run` does the two steps `validate()` does after the imports, with the members the
// library's type declarations make public: it sets the data graph and calls `validateAll`.
// `owl:imports` is therefore never followed. `tests/knowledge/shacl-core.test.js` checks that
// the results equal those of `validate()` on every shared fixture, so an update of the library
// that changes this fails there first.
//
// THE DATA GRAPH is one set of triples: the caller passes the quads of `graph.nq` and of the
// closure of AGSC-05-37. The library reads a triple in any graph, and counts a value that two
// graphs repeat once, so the graph names change no result (tested).
//
// PURE: a text and RDF/JS quads in, findings and records out; no fs, no clock, no network.

const SHACLValidator = require('rdf-validate-shacl').default;
const nq = require('./nquads.js');
const turtle = require('./turtle.js');
const { finding } = require('./validate.js');
const { compareCodePoint } = require('./unicode.js');

const SH = 'http://www.w3.org/ns/shacl#';
const CODE = 'AGSC-E420';
const RDF_FIRST = `${nq.RDF}first`;
const RDF_REST = `${nq.RDF}rest`;
const RDF_NIL = `${nq.RDF}nil`;

/** AGSC-05-41: the twelve constraint components, by the name of their parameter. */
const COMPONENTS = Object.freeze(['class', 'datatype', 'nodeKind', 'minCount', 'maxCount', 'hasValue', 'in',
  'pattern', 'minLength', 'maxLength', 'node', 'property']);

const SEVERITIES = Object.freeze(['Violation', 'Warning', 'Info']);
const NODE_KINDS = Object.freeze(['IRI', 'Literal', 'BlankNode', 'BlankNodeOrIRI', 'BlankNodeOrLiteral', 'IRIOrLiteral']);

/** Is the term a literal of this datatype? */
const literalOf = (term, datatype) => term.termType === 'Literal' && term.datatype.value === datatype;

/** A pattern the library can compile; SHACL patterns are XPath regular expressions, run here as JavaScript ones. */
function compiles(source) {
  try {
    new RegExp(source);
    return true;
  } catch (e) {
    return false;
  }
}

/** A well-formed RDF list: `rdf:nil`, or a blank node with one `rdf:first` and one `rdf:rest` that is a list. */
function isList(index, term, seen = new Set()) {
  if (term.value === RDF_NIL && term.termType === 'NamedNode') return true;
  if (term.termType !== 'BlankNode' || seen.has(term.value)) return false;
  seen.add(term.value);
  const rest = index.values(term, RDF_REST);
  return index.values(term, RDF_FIRST).length === 1 && rest.length === 1 && isList(index, rest[0], seen);
}

/** The values a parameter takes, as SHACL 1.0 states them, limited to the subset. */
const VALUES = Object.freeze({
  iri: { is: 'an IRI', test: (term) => term.termType === 'NamedNode' },
  integer: { is: 'an xsd:integer', test: (term) => literalOf(term, `${nq.XSD}integer`) },
  list: { is: 'a SHACL list', test: (term, index) => isList(index, term) },
  nodeKind: { is: `one of ${NODE_KINDS.map((k) => `sh:${k}`).join(', ')}`, test: (term) => NODE_KINDS.some((k) => term.value === `${SH}${k}`) },
  regex: { is: 'a regular expression written as an xsd:string', test: (term) => literalOf(term, nq.XSD_STRING) && compiles(term.value) },
  severity: { is: `one of ${SEVERITIES.map((s) => `sh:${s}`).join(', ')}`, test: (term) => SEVERITIES.some((s) => term.value === `${SH}${s}`) },
  shape: { is: 'an IRI or a blank node', test: (term) => term.termType === 'NamedNode' || term.termType === 'BlankNode' },
  target: { is: 'an IRI or a literal', test: (term) => term.termType === 'NamedNode' || term.termType === 'Literal' },
  term: { is: 'an RDF term', test: () => true },
  text: { is: 'a literal', test: (term) => term.termType === 'Literal' },
});

/**
 * Every parameter of the subset: the kind of value it takes (`VALUES`) and whether a shape may
 * state it more than once. `sh:path` is checked with the shape it belongs to (`pathFaults`).
 */
const PARAMETERS = Object.freeze({
  class: { many: true, value: 'iri' },
  datatype: { value: 'iri' },
  hasValue: { many: true, value: 'term' },
  in: { value: 'list' },
  maxCount: { value: 'integer' },
  maxLength: { value: 'integer' },
  message: { many: true, value: 'text' },
  minCount: { value: 'integer' },
  minLength: { value: 'integer' },
  node: { many: true, value: 'iri' },
  nodeKind: { value: 'nodeKind' },
  pattern: { value: 'regex' },
  property: { many: true, value: 'shape' },
  severity: { value: 'severity' },
  targetClass: { many: true, value: 'iri' },
  targetNode: { many: true, value: 'target' },
  targetObjectsOf: { many: true, value: 'iri' },
  targetSubjectsOf: { many: true, value: 'iri' },
});

/** AGSC-05-41: every term of the `sh:` namespace a shapes file may use; any other is `AGSC-E420`. */
const TERMS = Object.freeze(new Set([...Object.keys(PARAMETERS), 'path', 'inversePath', 'NodeShape', 'PropertyShape',
  ...SEVERITIES, ...NODE_KINDS].map((local) => `${SH}${local}`)));

// ---------------------------------------------------------------- reading the shapes

/** The statements of the shapes file, by subject and by object, keyed by term (a blank node by its label in this parse). */
function indexOf(quads) {
  const key = (term) => `${term.termType} ${term.value}`;
  const out = new Map();
  const into = new Map();
  const add = (map, at, predicate, term) => {
    if (!map.has(at)) map.set(at, new Map());
    const byPredicate = map.get(at);
    if (!byPredicate.has(predicate)) byPredicate.set(predicate, []);
    byPredicate.get(predicate).push(term);
  };
  for (const q of quads) {
    add(out, key(q.subject), q.predicate.value, q.object);
    add(into, key(q.object), q.predicate.value, q.subject);
  }
  const lookUp = (map, term, predicate) => (map.get(key(term)) || new Map()).get(predicate) || [];
  return {
    has: (term, predicate) => lookUp(out, term, predicate).length > 0,
    predicates: (term) => [...(out.get(key(term)) || new Map()).keys()],
    subjects: (predicate, term) => lookUp(into, term, predicate),
    values: (term, predicate) => lookUp(out, term, predicate),
  };
}

/** A property path as text: the predicate IRI, `^` and the IRI for an inverse path, `null` for none. */
function pathText(index, path) {
  if (path === undefined) return null;
  if (path.termType === 'NamedNode') return path.value;
  return `^${index.values(path, `${SH}inversePath`)[0].value}`;
}

/** Is the path of the subset: a predicate IRI, or a blank node whose one statement is `sh:inversePath` of one? */
function isSubsetPath(index, path) {
  if (path.termType === 'NamedNode') return true;
  if (path.termType !== 'BlankNode') return false;
  const inverse = index.values(path, `${SH}inversePath`);
  return index.predicates(path).length === 1 && inverse.length === 1 && inverse[0].termType === 'NamedNode';
}

/**
 * The name of a shape: its IRI; for a property shape that is a blank node, the name of the shape
 * whose `sh:property` it is (the least, by code point) and its path, as `<parent> > <path>`
 * (`[sh:property]` in place of a path outside the subset, which only a finding names).
 */
function nameOf(index, shape, seen = new Set()) {
  if (shape.termType === 'NamedNode') return shape.value;
  const parents = index.subjects(`${SH}property`, shape).filter((p) => !seen.has(p.value));
  if (parents.length === 0) return 'a blank node';
  seen.add(shape.value);
  const parent = parents.map((p) => nameOf(index, p, seen)).sort(compareCodePoint)[0];
  const path = index.values(shape, `${SH}path`);
  return `${parent} > ${path.length === 1 && isSubsetPath(index, path[0]) ? pathText(index, path[0]) : '[sh:property]'}`;
}

/** Every shape of the file (SHACL 1.0 section 2.1): typed, with a target or a parameter, or the value of `sh:node` or `sh:property`. */
function shapesOf(quads, index) {
  const shapes = new Map();
  const add = (term) => shapes.set(`${term.termType} ${term.value}`, term);
  for (const q of quads) {
    const local = q.predicate.value.startsWith(SH) ? q.predicate.value.slice(SH.length) : null;
    const typed = q.predicate.value === nq.RDF_TYPE && [`${SH}NodeShape`, `${SH}PropertyShape`].includes(q.object.value);
    if (typed || (local !== null && (PARAMETERS[local] || local === 'path'))) add(q.subject);
    if ((local === 'node' || local === 'property') && q.object.termType !== 'Literal') add(q.object);
  }
  return [...shapes.values()].map((term) => ({
    isProperty: index.has(term, `${SH}path`) || index.subjects(`${SH}property`, term).length > 0
      || index.values(term, nq.RDF_TYPE).some((t) => t.value === `${SH}PropertyShape`),
    term,
  }));
}

// ---------------------------------------------------------------- the subset check

/** Every term of the `sh:` namespace that the subset does not name. */
function termFaults(quads, fault) {
  const outside = new Set();
  for (const q of quads) {
    for (const term of [q.predicate, q.object]) {
      if (term.termType === 'NamedNode' && term.value.startsWith(SH) && !TERMS.has(term.value)) outside.add(term.value);
    }
  }
  for (const iri of outside) fault(`sh:${iri.slice(SH.length)} is not in the SHACL Core subset this engine evaluates`);
}

/** A shape named by a blank node where the subset names it by an IRI, and the one path of a property shape. */
function shapeFaults(index, { isProperty, term }, fault) {
  const blank = term.termType === 'BlankNode';
  const name = nameOf(index, term);
  if (blank && !isProperty) fault('a node shape is a blank node; the subset names a node shape by an IRI');
  if (blank && isProperty && index.subjects(`${SH}property`, term).length === 0) {
    fault('a property shape that is a blank node is not the object of sh:property; the subset names it by an IRI');
  }
  if (!isProperty) return;
  const paths = index.values(term, `${SH}path`);
  if (paths.length !== 1) fault(`${name} has ${paths.length} values of sh:path; a property shape has exactly one`);
  else if (!isSubsetPath(index, paths[0])) fault(`the property path of ${name} is neither a predicate IRI nor sh:inversePath of one`);
}

/** The values of the parameters of one shape: the kind each takes, and one value where a shape states it once. */
function parameterFaults(index, { term }, fault) {
  const name = nameOf(index, term);
  for (const [local, parameter] of Object.entries(PARAMETERS)) {
    const values = index.values(term, `${SH}${local}`);
    if (values.length > 1 && !parameter.many) fault(`${name} states sh:${local} ${values.length} times; a shape states it once`);
    const kind = VALUES[parameter.value];
    if (values.some((value) => !kind.test(value, index))) fault(`the value of sh:${local} on ${name} is not ${kind.is}`);
  }
}

/** The shapes file read and checked against the subset: `{quads, index, findings}`. */
function read(text, file) {
  const messages = new Set();
  const fault = (message) => messages.add(`${message} (AGSC-05-41)`);
  let quads = [];
  try {
    quads = turtle.parse(text);
  } catch (e) {
    fault(`the shapes file is not well-formed Turtle: ${e.message}`);
  }
  const index = indexOf(quads);
  termFaults(quads, fault);
  for (const shape of shapesOf(quads, index)) {
    shapeFaults(index, shape, fault);
    parameterFaults(index, shape, fault);
  }
  const findings = [...messages].sort(compareCodePoint).map((message) => finding(CODE, message, { file }));
  return { findings, index, quads };
}

// ---------------------------------------------------------------- the evaluation

/** A term of a result as text: an IRI as itself, a literal in N-Triples form (`xsd:string` bare), a blank node as `_:` and its label. */
function termText(term) {
  if (term.termType === 'NamedNode') return term.value;
  if (term.termType === 'BlankNode') return `_:${term.value}`;
  const lexical = `"${nq.escapeLiteral(term.value)}"`;
  if (term.language) return `${lexical}@${term.language}`;
  return term.datatype.value === nq.XSD_STRING ? lexical : `${lexical}^^<${nq.escapeIri(term.datatype.value)}>`;
}

/** One result of the library's report as the record of AGSC-05-41. */
function recordOf(index, result) {
  const shape = result.sourceShape;
  const messages = index.values(shape, `${SH}message`).map((m) => m.value).sort(compareCodePoint);
  return {
    component: result.sourceConstraintComponent.value.slice(SH.length),
    focus: termText(result.focusNode),
    message: messages.length > 0 ? messages.join(' | ') : null,
    path: pathText(index, index.values(shape, `${SH}path`)[0]),
    severity: result.severity.value.slice(SH.length),
    shape: nameOf(index, shape),
    value: result.value ? termText(result.value) : null,
  };
}

/**
 * AGSC-05-41: by focus node, source shape and path, by code point; then by component and value,
 * so that two results never tie. The members are joined by U+0000, which sorts below every
 * character a member can hold (a literal writes control characters as escapes), so comparing
 * the joined keys compares the members in turn.
 */
function byOrder(a, b) {
  const key = (r) => [r.focus, r.shape, r.path || '', r.component, r.value || ''].join('\u0000');
  return compareCodePoint(key(a), key(b));
}

/** The library over the data, synchronously (see the header): its report as sorted records. */
function run(shapes, dataQuads) {
  const validator = new SHACLValidator(shapes.quads);
  const { factory } = validator;
  validator.$data = factory.clownface({ dataset: factory.dataset(dataQuads) });
  validator.validationEngine.validateAll(validator.$data);
  return validator.validationEngine.getReport().results.map((result) => recordOf(shapes.index, result)).sort(byOrder);
}

/**
 * The faults of a shapes file against the subset of AGSC-05-41.
 *
 * @param {string} text  the Turtle of the file at `domain.shapes`
 * @param {{file?: string}} [options]  the path the findings name
 * @returns {object[]}  the findings `AGSC-E420`, sorted by message; empty when the file is in the subset
 */
function check(text, options = {}) {
  return read(text, options.file || '').findings;
}

/**
 * The invariants of a site evaluated over a data graph (AGSC-05-41).
 *
 * @param {string} text  the Turtle of the file at `domain.shapes`
 * @param {object[]} dataQuads  RDF/JS quads of the data graph (their graph names are ignored)
 * @param {{file?: string}} [options]  the path the findings name
 * @returns {{findings: object[], results: object[]}}  `findings` are the `AGSC-E420` of `check`, and
 *   then nothing is evaluated; otherwise `results` are the records `{component, focus, message,
 *   path, severity, shape, value}` in the order of AGSC-05-41
 */
function evaluate(text, dataQuads, options = {}) {
  const shapes = read(text, options.file || '');
  if (shapes.findings.length > 0) return { findings: shapes.findings, results: [] };
  return { findings: [], results: run(shapes, dataQuads) };
}

module.exports = { COMPONENTS, check, evaluate };
