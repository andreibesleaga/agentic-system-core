'use strict';
// CONTEXT Distribution (Emission) — the query page of `/query/`: what its worker does with
// the engine.
//
// AGSC-06-39: the page loads `/graph.nq` of its own node into an in-browser store and
// answers SELECT, ASK, CONSTRUCT and DESCRIBE there; nothing leaves the visitor's browser.
// The store is the engine the node ships as page assets of `/query/` (the WebAssembly build
// of Oxigraph, `query-page.js#ENGINE`). It runs in a module worker, so a long query never
// freezes the page and the visitor can stop it (the page ends the worker).
//
// For each query the worker:
//   1. reads it with the page's own tokenizer (`tokens.js#queryCheck`) and refuses an
//      update or a SERVICE clause before the engine sees it — the engine's own refusal is
//      the second line;
//   2. runs it over the union of the node's graphs (every quad of `graph.nq` is in the
//      node's named graph, so the default graph alone is empty), or over the dataset the
//      query names itself with FROM;
//   3. returns the result in the two formats of AGSC-06-39 (d), written by the ENGINE'S OWN
//      writers (a library that does the job is used, not rewritten; no result writer is
//      written here):
//      "SPARQL 1.1 Query Results JSON Format" and "… CSV and TSV Formats" (W3C, 21 March
//      2013). A SELECT query runs once per format, so that each file comes from the engine's
//      own writer: two runs give the same rows in the same order (measured on Oxigraph
//      0.5.13, which draws no random order), except where the query calls RAND, NOW, UUID,
//      STRUUID or BNODE. Such a query runs once, to JSON, and its rows are read back through
//      the engine's CSV writer from a store of their own (`querySelectCsv`), so that the
//      table and both files hold the same values; that read costs more than a second run
//      (about 0.15 ms a value in Node), so it is kept for those queries. Those formats define
//      SELECT results, and JSON also a yes-or-no answer, so an ASK result is JSON only. A
//      CONSTRUCT or DESCRIBE result, which no results format defines, is put into a store of
//      its own and read back as subject, predicate and object bindings, its blank nodes
//      named b0, b1, … in an order fixed by what each one touches, so the same query over the
//      same file gives the same bytes every time.
//
// PORTABLE (see `tokens.js`): emitted into the worker as its own source text. The engine is
// a parameter (`ox`, the module of the engine's release), so the Node suite runs these
// functions over the Node build of the same release. `queryWorkerMain` is the one part that
// needs a worker; it is tested where a browser runs (`tests/distribution/query-browser.test.js`).

const { queryCheck, queryRefusal } = require('./tokens.js');

/**
 * A graph result as a store of its own: its triples in the default graph, its blank nodes
 * renamed b0, b1, … Each blank node is placed by the sorted list of the triples it is in,
 * written with itself as `_:*` and any other blank node as `_:`, so the names depend on
 * the graph and not on the labels the engine drew when it loaded the file.
 *
 * @param {object} ox the engine's module.
 * @param {Array<object>} quads the result of a CONSTRUCT or DESCRIBE query.
 * @returns {object} a store.
 */
function queryGraphStore(ox, quads) {
  const blank = (term) => term.termType === 'BlankNode';
  const text = (term, self) => {
    if (blank(term)) return term.value === self ? '_:*' : '_:';
    return term.termType === 'Literal' ? `"${term.value}"@${term.language}^^${term.datatype.value}` : `<${term.value}>`;
  };
  const signatures = new Map();
  for (const q of quads) {
    for (const term of [q.subject, q.object].filter(blank)) {
      if (!signatures.has(term.value)) signatures.set(term.value, []);
      signatures.get(term.value).push([q.subject, q.predicate, q.object].map((t) => text(t, term.value)).join(' '));
    }
  }
  const signature = (label) => signatures.get(label).sort().join('\n');
  const order = [...signatures.keys()].sort((a, b) => (signature(a) < signature(b) ? -1 : signature(a) > signature(b) ? 1 : 0));
  const names = new Map(order.map((label, k) => [label, ox.blankNode(`b${k}`)]));
  const renamed = (term) => (blank(term) ? names.get(term.value) : term);
  const store = new ox.Store();
  for (const q of quads) store.add(ox.quad(renamed(q.subject), q.predicate, renamed(q.object)));
  return store;
}

/**
 * The CSV file of a SELECT result, written by the engine's CSV writer from the JSON file of
 * the same run, for a query whose values are new on each run (`queryCheck`, `fresh`): row k
 * goes into a store of its own as `<urn:x-row:k>`, with its index and
 * one link per bound variable, and a query reads the rows back in their order, each variable
 * where it was bound and empty where it was not. A result with no variable is read back from
 * a VALUES block of as many empty rows.
 *
 * @param {object} ox the engine's module.
 * @param {string} json the result in the JSON format.
 * @returns {string} the result in the CSV format.
 */
function querySelectCsv(ox, json) {
  const result = JSON.parse(json);
  const vars = result.head.vars;
  const rows = result.results.bindings;
  const csv = { results_format: 'text/csv' };
  if (vars.length === 0) return new ox.Store().query(`SELECT * WHERE { VALUES () { ${'() '.repeat(rows.length)}} }`, csv);
  const term = (t) => {
    if (t.type === 'uri') return ox.namedNode(t.value);
    if (t.type === 'bnode') return ox.blankNode(t.value);
    if (t.type === 'triple') return ox.triple(term(t.value.subject), term(t.value.predicate), term(t.value.object));
    if (t['xml:lang'] !== undefined) return ox.literal(t.value, t['its:dir'] === undefined ? t['xml:lang'] : { direction: t['its:dir'], language: t['xml:lang'] });
    return t.datatype === undefined ? ox.literal(t.value) : ox.literal(t.value, ox.namedNode(t.datatype));
  };
  const link = (k) => ox.namedNode(`urn:x-var:${k}`);
  const order = ox.namedNode('urn:x-var:order');
  // The index is padded with zeros, so that the order of the texts is the order of the rows.
  const width = String(rows.length).length;
  const store = new ox.Store();
  rows.forEach((row, n) => {
    const node = ox.namedNode(`urn:x-row:${n}`);
    store.add(ox.quad(node, order, ox.literal(String(n).padStart(width, '0'))));
    vars.forEach((v, k) => { if (row[v] !== undefined) store.add(ox.quad(node, link(k), term(row[v]))); });
  });
  // The row and its index take a name that no variable of the result has.
  const free = (name) => (vars.includes(name) ? free(`${name}_`) : name);
  const [row, index] = [free('row'), free('index')];
  const bound = vars.map((v, k) => `OPTIONAL { ?${row} <urn:x-var:${k}> ?${v} }`).join(' ');
  return store.query(`SELECT ${vars.map((v) => `?${v}`).join(' ')} WHERE { ?${row} <urn:x-var:order> ?${index} ${bound} } ORDER BY ?${index}`, csv);
}

/**
 * The answer to one query.
 *
 * @param {object} ox the engine's module.
 * @param {object} store the store holding the node's graph.
 * @param {string} text the query.
 * @returns {{form:(string|null), json?:string, csv?:(string|null), error?:string}} the
 *   result as the two files, or the reason it was refused or failed.
 */
function queryAnswer(ox, store, text) {
  const json = 'application/sparql-results+json';
  const csv = 'text/csv';
  const check = queryCheck(text);
  const refused = queryRefusal(check);
  if (refused !== null) return { error: refused, form: check.form };
  const options = check.dataset ? {} : { use_default_graph_as_union: true };
  try {
    if (check.form === 'ASK') return { csv: null, form: check.form, json: store.query(text, { ...options, results_format: json }) };
    if (check.form === 'SELECT') {
      const result = store.query(text, { ...options, results_format: json });
      return { csv: check.fresh ? querySelectCsv(ox, result) : store.query(text, { ...options, results_format: csv }), form: check.form, json: result };
    }
    const triples = queryGraphStore(ox, store.query(text, options));
    const read = 'SELECT ?subject ?predicate ?object WHERE { ?subject ?predicate ?object } ORDER BY ?subject ?predicate ?object';
    return { csv: triples.query(read, { results_format: csv }), form: check.form, json: triples.query(read, { results_format: json }) };
  } catch (e) {
    return { error: `The engine could not run the query: ${e && e.message ? e.message : String(e)}`, form: check.form };
  }
}

/* node:coverage disable */
/**
 * The worker: start the engine, load the node's graph as bytes, say how many quads it
 * holds, then answer each `run` message with `queryAnswer`. It reads `graphRoute` of this
 * origin and nothing else, and keeps nothing between visits (AGSC-06-05).
 *
 * @param {object} scope the worker's global scope.
 * @param {object} ox the engine's module (its default export starts it).
 * @param {string} graphRoute `/graph.nq`.
 * @returns {Promise<void>}
 */
function queryWorkerMain(scope, ox, graphRoute) {
  let store = null;
  scope.onmessage = (event) => {
    const message = event.data || {};
    if (message.type !== 'run' || store === null) return;
    scope.postMessage({ answer: queryAnswer(ox, store, String(message.text)), id: message.id, type: 'answer' });
  };
  return ox.default()
    .then(() => scope.fetch(graphRoute))
    .then((response) => {
      if (!response.ok) throw new Error(`${graphRoute} answered ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => {
      const loaded = new ox.Store();
      loaded.load(new Uint8Array(bytes), { format: 'application/n-quads' });
      store = loaded;
      scope.postMessage({ size: loaded.size, type: 'ready' });
    })
    .catch((e) => scope.postMessage({ message: e && e.message ? e.message : String(e), type: 'error' }));
}
/* node:coverage enable */

/** The functions emitted into the worker, in order. */
const PORTABLE = Object.freeze(['queryGraphStore', 'querySelectCsv', 'queryAnswer', 'queryWorkerMain']);

module.exports = { PORTABLE, queryAnswer, queryGraphStore, querySelectCsv, queryWorkerMain };
