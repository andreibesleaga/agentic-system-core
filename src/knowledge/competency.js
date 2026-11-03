'use strict';
// CONTEXT Knowledge — the competency questions of a site, checked against the graph.
//
// Implements the question half of AGSC-05-41. A node MAY state competency questions of its own
// in the JSON file at `domain.questions` (AGSC-01-41): an array of `{expected, id, query,
// question}`, where `query` is SPARQL 1.1 Query limited to the subset the rule names. This module
// refuses a file outside that shape or that subset (`AGSC-E420`, and then no question is
// answered), runs every query over the data graph and says, for each `id`, whether the answer
// agrees with `expected`. `verify` and `ci` turn a disagreement into `AGSC-E422`
// (`site-checks.js`, AGSC-09-20); that is not done here. The ten questions of AGSC-05-34 are
// the engine's own pure functions (`questions.js`) and are never run through this module.
//
// LIBRARIES. The query text is read by the pinned SPARQL 1.1 parser `@traqula/parser-sparql-1-1`
// (Comunica, MIT; the successor of SPARQL.js, which its author deprecated in its favour) and
// evaluated by the pinned SPARQL engine `oxigraph` (MIT OR Apache-2.0), the same engine as the
// development lane that checks the SPARQL text of the ten questions; nothing here parses or
// evaluates SPARQL. What is ours is what no library does, because SPARQL has no profile
// mechanism: the subset as data (`SUBSET`) and the walk over the parsed query that refuses the
// rest; the shape of the file; the cells of an answer as N-Triples strings; and the comparison.
//
// WHY THE SUBSET IS CHECKED FIRST. The engine implements all of SPARQL 1.1, including `NOW()`,
// `RAND()`, `UUID()` and `SERVICE`. The subset has no function and no `SERVICE`, so a query that
// passes the walk reads no clock, draws no random number and opens no connection (AGSC-08-30);
// a query that does not pass is never given to the engine.
//
// THE DATA GRAPH is one set of triples: the caller passes the RDF/JS quads of `graph.nq` and of
// the closure of AGSC-05-37, as `turtle.js#parse` (the pinned `n3`) read them. The graph names
// are dropped, so a triple that two graphs repeat is one triple. The quads are handed to the
// engine as N-Triples that this module writes; the engine never reads an authored file.
//
// PURE: texts and quads in, findings and records out; no fs, no clock, no network.

const { Parser } = require('@traqula/parser-sparql-1-1');
const oxigraph = require('oxigraph');
const nq = require('./nquads.js');
const slug = require('./slug.js');
const { finding } = require('./validate.js');
const { compareCodePoint } = require('./unicode.js');

const CODE = 'AGSC-E420';
const MEMBERS = Object.freeze(['expected', 'id', 'query', 'question']);
const RESULTS_JSON = 'application/sparql-results+json';

/**
 * AGSC-05-41: the SPARQL 1.1 Query subset — the two query forms, the property-path operators,
 * the comparisons and the connectives of `FILTER` (with `NOT EXISTS`), and the members a parsed
 * query may have; `DISTINCT`, `ORDER BY` of a variable and `LIMIT` are the solution modifiers.
 */
const SUBSET = Object.freeze({
  comparisons: Object.freeze(['=', '!=', '<', '>', '<=', '>=']),
  connectives: Object.freeze(['&&', '||', '!']),
  forms: Object.freeze(['ask', 'select']),
  members: Object.freeze(['context', 'datasets', 'distinct', 'loc', 'solutionModifiers', 'subType', 'type', 'variables', 'where']),
  paths: Object.freeze(['/', '^', '+', '*']),
});

/** The name a finding gives to a construct outside the subset, by the parser's name for it. */
const NAMES = Object.freeze({
  bind: 'BIND',
  graph: 'GRAPH',
  group: 'a nested group { }',
  having: 'HAVING',
  minus: 'MINUS',
  optional: 'OPTIONAL',
  reduced: 'REDUCED',
  service: 'SERVICE',
  template: 'CONSTRUCT',
  union: 'UNION',
  values: 'VALUES',
});

// ---------------------------------------------------------------- the subset, over the parsed query

const isTerm = (node, kinds) => node.type === 'term' && kinds.includes(node.subType);
const isVariable = (node) => isTerm(node, ['variable']);

/** A property path of the subset: a predicate IRI, or `/`, `^`, `+` or `*` over such paths. */
function pathFaults(path, fault) {
  if (path.type !== 'path') return;
  if (!SUBSET.paths.includes(path.subType)) fault(`the property-path operator ${path.subType}`);
  for (const item of path.items) pathFaults(item, fault);
}

/** One triple pattern: terms, `[ … ]` and `( … )` (whose triples are walked too), and a path as predicate. */
function tripleFaults(triple, fault) {
  for (const node of [triple.subject, triple.object]) {
    if (node.type === 'tripleCollection') for (const inner of node.triples) tripleFaults(inner, fault);
    else if (!isTerm(node, ['variable', 'namedNode', 'literal', 'blankNode'])) fault('a quoted triple');
  }
  pathFaults(triple.predicate, fault);
}

/** What an expression outside the subset is called in a finding. */
function expressionName(node) {
  if (node.type === 'term') return 'a FILTER that is not a comparison, &&, ||, ! or NOT EXISTS';
  if (node.subType === 'aggregate') return 'an aggregate';
  if (node.subType === 'functionCall') return 'a function call';
  return `the operator or function ${String(node.operator).toUpperCase()}`;
}

/** An operand of a comparison: a variable, an IRI or a literal, never another expression. */
function operandFaults(node, fault) {
  if (node.type === 'term') return;
  const nested = node.subType === 'operation' && [...SUBSET.comparisons, ...SUBSET.connectives].includes(node.operator);
  fault(nested ? 'a comparison whose operand is not a term' : expressionName(node));
}

/** A condition of `FILTER`: a comparison of two terms, `&&`, `||` and `!` of conditions, or `NOT EXISTS`. */
function conditionFaults(node, fault) {
  if (node.type === 'expression' && node.subType === 'operation' && SUBSET.connectives.includes(node.operator)) {
    for (const arg of node.args) conditionFaults(arg, fault);
  } else if (node.type === 'expression' && node.subType === 'operation' && SUBSET.comparisons.includes(node.operator)) {
    for (const arg of node.args) operandFaults(arg, fault);
  } else if (node.type === 'expression' && node.subType === 'patternOperation' && node.operator === 'notexists') {
    groupFaults(node.args.patterns, fault);
  } else {
    fault(node.subType === 'patternOperation' ? 'EXISTS' : expressionName(node));
  }
}

/** A group graph pattern of the subset: basic graph patterns and `FILTER`s, nothing else. */
function groupFaults(patterns, fault) {
  for (const pattern of patterns) {
    if (pattern.type === 'pattern' && pattern.subType === 'bgp') {
      for (const triple of pattern.triples) tripleFaults(triple, fault);
    } else if (pattern.type === 'pattern' && pattern.subType === 'filter') {
      conditionFaults(pattern.expression, fault);
    } else {
      fault(pattern.type === 'query' ? 'a sub-query' : NAMES[pattern.subType] || pattern.subType);
    }
  }
}

/** The solution modifiers of the subset: `ORDER BY` of variables and `LIMIT`; no dataset clause. */
function modifierFaults(query, fault) {
  const { group, having, limitOffset, order } = query.solutionModifiers || {};
  if (group !== undefined) fault('GROUP BY');
  if (having !== undefined) fault('HAVING');
  if (limitOffset !== undefined && limitOffset.offset !== undefined) fault('OFFSET');
  if (order !== undefined && !order.orderDefs.every((def) => isVariable(def.expression))) fault('an ORDER BY that is not a variable');
  if (query.datasets !== undefined && query.datasets.clauses.length > 0) fault('FROM');
}

/** The constructs of one parsed query that are outside the subset, by name, in code-point order. */
function outside(query) {
  const found = new Set();
  const fault = (name) => found.add(name);
  if (query.type !== 'query') return ['SPARQL Update'];
  if (!SUBSET.forms.includes(query.subType)) fault(query.subType.toUpperCase());
  for (const member of Object.keys(query).filter((key) => !SUBSET.members.includes(key))) fault(NAMES[member] || member);
  for (const projected of query.variables || []) {
    if (projected.type !== 'wildcard' && !isVariable(projected)) fault('a projected expression (… AS ?v)');
  }
  modifierFaults(query, fault);
  if (query.where !== undefined) groupFaults(query.where.patterns, fault);
  return [...found].sort(compareCodePoint);
}

// ---------------------------------------------------------------- reading the file

/** Is `expected` of the shape AGSC-05-41 gives the form: a boolean for ASK, `{"rows": [[…]]}` of strings and null for SELECT? */
function expectedFits(form, expected) {
  if (form === 'ask') return typeof expected === 'boolean';
  if (expected === null || typeof expected !== 'object' || Array.isArray(expected)) return false;
  const { rows } = expected;
  return Object.keys(expected).join() === 'rows' && Array.isArray(rows)
    && rows.every((row) => Array.isArray(row) && row.every((cell) => cell === null || typeof cell === 'string'));
}

let parser = null;

/** The query read by the parser and walked against the subset; `null` with a fault when it is refused. */
function parsedQuery(text, name, fault) {
  if (parser === null) parser = new Parser();
  let query;
  try {
    query = parser.parse(text);
  } catch (e) {
    fault(`the query of ${name} is not SPARQL 1.1: ${String(e.message).split('\n')[0]}`);
    return null;
  }
  const names = outside(query);
  if (names.length === 0) return query;
  fault(`the query of ${name} uses ${names.join(', ')}, outside the SPARQL subset this engine runs`);
  return null;
}

/** One entry of the array, checked; the question with its parsed query, or `null` when it has a fault. */
function entryOf(entry, n, fault) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    fault(`entry ${n} is not an object`);
    return null;
  }
  const name = typeof entry.id === 'string' ? entry.id : `entry ${n}`;
  const members = Object.keys(entry).sort(compareCodePoint);
  if (members.join() !== MEMBERS.join()) {
    fault(`${name} has the members ${members.join(', ') || 'none'}; a question has exactly ${MEMBERS.join(', ')}`);
    return null;
  }
  const faults = [];
  const local = (message) => faults.push(message);
  if (!slug.isValid(entry.id)) local(`the id ${JSON.stringify(entry.id)} of entry ${n} is not a slug`);
  if (typeof entry.question !== 'string' || entry.question.trim() === '') local(`${name} has no question for people`);
  if (typeof entry.query !== 'string') local(`the query of ${name} is not a string`);
  const query = typeof entry.query === 'string' ? parsedQuery(entry.query, name, local) : null;
  if (query !== null && SUBSET.forms.includes(query.subType) && !expectedFits(query.subType, entry.expected)) {
    local(`the expected answer of ${name} is not ${query.subType === 'ask' ? 'a boolean' : 'an object {"rows": [[…]]} of N-Triples strings and null'}`);
  }
  faults.forEach((message) => fault(message));
  return faults.length === 0 ? { ...entry, parsed: query } : null;
}

/** The questions file read and checked: `{questions, findings}`; no question when the file has a fault. */
function read(text, file) {
  const messages = new Set();
  const fault = (message) => messages.add(`${message} (AGSC-05-41)`);
  let array = null;
  try {
    array = JSON.parse(String(text));
  } catch (e) {
    fault(`the questions file is not JSON: ${e.message}`);
  }
  if (array !== null && !Array.isArray(array)) fault('the questions file is not a JSON array');
  const entries = (Array.isArray(array) ? array : []).map((entry, n) => entryOf(entry, n + 1, fault));
  const seen = new Set();
  for (const entry of entries.filter(Boolean)) {
    if (seen.has(entry.id)) fault(`the id ${entry.id} is given twice`);
    seen.add(entry.id);
  }
  const findings = [...messages].sort(compareCodePoint).map((message) => finding(CODE, message, { file }));
  return { findings, questions: findings.length === 0 ? entries : [] };
}

// ---------------------------------------------------------------- answering

/** A term of the data as N-Triples (AGSC-05-32 escapes), for the engine's store. */
function nTriplesTerm(term) {
  if (term.termType === 'NamedNode') return `<${nq.escapeIri(term.value)}>`;
  if (term.termType === 'BlankNode') return `_:${term.value}`;
  const lexical = `"${nq.escapeLiteral(term.value)}"`;
  return term.language ? `${lexical}@${term.language}` : `${lexical}^^<${nq.escapeIri(term.datatype.value)}>`;
}

/** The data graph in the engine's store, every triple in its default graph. */
function storeOf(dataQuads) {
  const store = new oxigraph.Store();
  const text = dataQuads.map((q) => `${[q.subject, q.predicate, q.object].map(nTriplesTerm).join(' ')} .\n`).join('');
  if (text !== '') store.load(text, { format: 'application/n-triples' });
  return store;
}

/** A cell of a SELECT answer: the term in N-Triples form, a plain string without its datatype (AGSC-05-41). */
function cellOf(value) {
  if (value.type === 'uri') return `<${nq.escapeIri(value.value)}>`;
  if (value.type === 'bnode') return `_:${value.value}`;
  const lexical = `"${nq.escapeLiteral(value.value)}"`;
  if (value['xml:lang']) return `${lexical}@${value['xml:lang']}`;
  return value.datatype && value.datatype !== nq.XSD_STRING ? `${lexical}^^<${nq.escapeIri(value.datatype)}>` : lexical;
}

/** Rows sorted cell by cell, each cell as its N-Triples string by code point; an unbound cell sorts first. */
function sortRows(rows) {
  const key = (row) => row.map((cell) => (cell === null ? '' : cell)).join('\u0000');
  return [...rows].sort((a, b) => compareCodePoint(key(a), key(b)));
}

const ordered = (query) => query.solutionModifiers !== undefined && query.solutionModifiers.order !== undefined;

/** The answer of one question: a boolean for ASK; for SELECT `{rows}`, in the order of `ORDER BY` or sorted. */
function answerOf(store, entry) {
  if (entry.parsed.subType === 'ask') return store.query(entry.query);
  const result = JSON.parse(store.query(entry.query, { results_format: RESULTS_JSON }));
  const wildcard = entry.parsed.variables.some((v) => v.type === 'wildcard');
  // SELECT * leaves the order of the columns to the engine; the code-point order of the names fixes
  // it here, so the cells of an `expected` do not depend on the engine (Oxigraph 0.5.13 agrees).
  const columns = wildcard ? [...result.head.vars].sort(compareCodePoint) : result.head.vars;
  const rows = result.results.bindings.map((binding) => columns.map((v) => (binding[v] === undefined ? null : cellOf(binding[v]))));
  return { rows: ordered(entry.parsed) ? rows : sortRows(rows) };
}

/** `expected` in the form an answer takes: the rows of a SELECT without `ORDER BY` sorted as its answer is. */
function comparable(entry) {
  return entry.parsed.subType === 'select' && !ordered(entry.parsed) ? { rows: sortRows(entry.expected.rows) } : entry.expected;
}

/** Every question answered, by id in code-point order; a query the engine refuses is a fault and nothing is answered. */
function run(questions, dataQuads, file) {
  const store = storeOf(dataQuads);
  const results = [];
  const findings = [];
  for (const entry of [...questions].sort((a, b) => compareCodePoint(a.id, b.id))) {
    try {
      const answer = answerOf(store, entry);
      const expected = comparable(entry);
      const result = JSON.stringify(answer) === JSON.stringify(expected) ? 'agrees' : 'differs';
      results.push({ answer, expected, id: entry.id, question: entry.question, result });
    } catch (e) {
      const reason = String(e.message).split('\n')[0];
      findings.push(finding(CODE, `the engine could not run the query of ${entry.id}: ${reason} (AGSC-05-41)`, { file }));
    }
  }
  return findings.length > 0 ? { findings, results: [] } : { findings, results };
}

/**
 * The faults of a questions file against AGSC-05-41: its shape, its ids and the SPARQL subset.
 *
 * @param {string} text  the JSON of the file at `domain.questions`
 * @param {{file?: string}} [options]  the path the findings name
 * @returns {object[]}  the findings `AGSC-E420`, sorted by message; empty when the file is well formed
 */
function check(text, options = {}) {
  return read(text, options.file || '').findings;
}

/**
 * The competency questions of a site answered over a data graph (AGSC-05-41).
 *
 * @param {string} text  the JSON of the file at `domain.questions`
 * @param {object[]} dataQuads  RDF/JS quads of the data graph (their graph names are ignored)
 * @param {{file?: string}} [options]  the path the findings name
 * @returns {{findings: object[], results: object[]}}  `findings` are `AGSC-E420`, and then nothing
 *   is answered; otherwise `results` are `{answer, expected, id, question, result}` by id, where
 *   `result` is `agrees` or `differs` and `expected` is in the form of `answer`
 */
function evaluate(text, dataQuads, options = {}) {
  const file = options.file || '';
  const checked = read(text, file);
  if (checked.findings.length > 0) return { findings: checked.findings, results: [] };
  return run(checked.questions, dataQuads, file);
}

module.exports = { SUBSET, check, evaluate };
