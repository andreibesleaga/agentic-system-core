'use strict';
// verifies AGSC-06-39
// The query page's worker (src/distribution/query/engine.js) over the engine the page
// ships. The page vendors the WebAssembly build of Oxigraph 0.5.13; these tests drive the
// Node build of the same release, the engine's own pinned dependency, through the same
// functions the worker runs. They check:
//   * the four query forms are answered over the node's graph (every quad of `graph.nq` is
//     in the node's named graph, so a query runs over the union of the graphs unless it
//     names its own dataset with FROM);
//   * an update and a SERVICE clause are refused before the engine sees them, and an
//     engine error comes back as a message, not a crash;
//   * the result files are the W3C formats (SPARQL 1.1 Query Results JSON Format, and CSV
//     and TSV Formats, both of 21 March 2013), written by the engine's own writers and
//     checked here as properties over hostile values: commas, quotes, line feeds, language
//     tags, datatypes, IRIs, blank nodes, unbound values;
//   * a CONSTRUCT or DESCRIBE result is given as subject, predicate and object bindings
//     with its blank nodes named b0, b1, … in the order first seen, so the same query
//     gives the same bytes every time.
// Deterministic (fixed seeds), no network.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');
const ox = require('oxigraph');

const engine = require('../../../src/distribution/query/engine.js');

const NODE = 'https://node.example/';
const NQ = [
  `<${NODE}concepts/a/> <http://www.w3.org/2004/02/skos/core#prefLabel> "Item, \\"A\\"\\nnext"@en <${NODE}> .`,
  `<${NODE}concepts/a/> <http://purl.org/dc/terms/requires> <${NODE}concepts/b/> <${NODE}> .`,
  `<${NODE}concepts/b/> <http://www.w3.org/2004/02/skos/core#prefLabel> "Item B"@en <${NODE}> .`,
  `<${NODE}concepts/b/> <http://purl.org/dc/terms/source> _:s1 <${NODE}> .`,
  `_:s1 <http://purl.org/dc/terms/title> "A book" <${NODE}> .`,
  `<${NODE}concepts/b/> <https://w3id.org/agentic-system-core/ns#kind> "pattern"^^<http://www.w3.org/2001/XMLSchema#string> <${NODE}> .`,
  '',
].join('\n');

function store() {
  const s = new ox.Store();
  s.load(NQ, { format: 'application/n-quads' });
  return s;
}

test('SELECT: the JSON and the CSV of the result, over the union of the node\'s graphs', () => {
  const answer = engine.queryAnswer(ox, store(), 'PREFIX skos: <http://www.w3.org/2004/02/skos/core#>\nSELECT ?item ?label WHERE { ?item skos:prefLabel ?label } ORDER BY ?item');
  assert.strictEqual(answer.form, 'SELECT');
  assert.deepStrictEqual(JSON.parse(answer.json), { head: { vars: ['item', 'label'] }, results: { bindings: [
    { item: { type: 'uri', value: `${NODE}concepts/a/` }, label: { type: 'literal', value: 'Item, "A"\nnext', 'xml:lang': 'en' } },
    { item: { type: 'uri', value: `${NODE}concepts/b/` }, label: { type: 'literal', value: 'Item B', 'xml:lang': 'en' } },
  ] } });
  assert.strictEqual(answer.csv, `item,label\r\n${NODE}concepts/a/,"Item, ""A""\nnext"\r\n${NODE}concepts/b/,Item B\r\n`);
  assert.strictEqual(answer.error, undefined);
});

test('ASK: JSON only, because no W3C format writes a yes or no as CSV', () => {
  const answer = engine.queryAnswer(ox, store(), 'ASK { ?s <http://purl.org/dc/terms/requires> ?o }');
  assert.deepStrictEqual(answer, { csv: null, form: 'ASK', json: '{"head":{},"boolean":true}' });
});

test('CONSTRUCT and DESCRIBE: subject, predicate and object bindings, blank nodes named b0, b1, … by what each touches', () => {
  const text = 'CONSTRUCT { ?s ?p ?o } WHERE { ?s <http://purl.org/dc/terms/source> ?o . BIND(<http://purl.org/dc/terms/source> AS ?p) }';
  const first = engine.queryAnswer(ox, store(), text);
  assert.strictEqual(first.form, 'CONSTRUCT');
  assert.deepStrictEqual(JSON.parse(first.json), { head: { vars: ['subject', 'predicate', 'object'] }, results: { bindings: [
    { object: { type: 'bnode', value: 'b0' }, predicate: { type: 'uri', value: 'http://purl.org/dc/terms/source' }, subject: { type: 'uri', value: `${NODE}concepts/b/` } },
  ] } });
  assert.strictEqual(first.csv, `subject,predicate,object\r\n${NODE}concepts/b/,http://purl.org/dc/terms/source,_:b0\r\n`);
  const described = engine.queryAnswer(ox, store(), `DESCRIBE <${NODE}concepts/b/>`);
  assert.strictEqual(described.form, 'DESCRIBE');
  assert.strictEqual(JSON.parse(described.json).results.bindings.length, 4);
  // Two runs over two stores loaded from the same file give the same bytes.
  assert.deepStrictEqual(engine.queryAnswer(ox, store(), `DESCRIBE <${NODE}concepts/b/>`), described);
});

test('a query that names its own dataset runs over that dataset, not over the union', () => {
  const inGraph = engine.queryAnswer(ox, store(), `SELECT (COUNT(*) AS ?n) FROM <${NODE}> WHERE { ?s ?p ?o }`);
  assert.strictEqual(JSON.parse(inGraph.json).results.bindings[0].n.value, '6');
  const elsewhere = engine.queryAnswer(ox, store(), 'SELECT (COUNT(*) AS ?n) FROM <https://example.org/data> WHERE { ?s ?p ?o }');
  assert.strictEqual(JSON.parse(elsewhere.json).results.bindings[0].n.value, '0');
});

test('an update, a SERVICE clause and a text that is no query are refused before the engine runs', () => {
  const calls = [];
  const spy = { query: (...args) => { calls.push(args); throw new Error('the engine was called'); } };
  assert.deepStrictEqual(engine.queryAnswer(ox, spy, 'INSERT DATA { <x:a> <x:b> <x:c> }'),
    { error: 'This page does not change the graph: INSERT is an update, and an update is refused.', form: null });
  assert.deepStrictEqual(engine.queryAnswer(ox, spy, 'SELECT * { SERVICE SILENT <https://example.org/sparql> { ?s ?p ?o } }'),
    { error: 'This page sends no query to another server: a SERVICE clause is refused.', form: 'SELECT' });
  assert.deepStrictEqual(engine.queryAnswer(ox, spy, '# nothing'),
    { error: 'Write a SELECT, ASK, CONSTRUCT or DESCRIBE query.', form: null });
  assert.deepStrictEqual(calls, []);
});

test('the engine\'s own error comes back as a message', () => {
  const answer = engine.queryAnswer(ox, store(), 'SELECT ?x WHERE { ?x }');
  assert.strictEqual(answer.form, 'SELECT');
  assert.match(answer.error, /^The engine could not run the query: .+/u);
});

/** RFC 4180 records of a CSV text, as the W3C CSV format writes it (CRLF, quoted fields). */
function csvRecords(text) {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { record.push(field); field = ''; } else if (ch === '\r' && text[i + 1] === '\n') {
      record.push(field); records.push(record); record = []; field = ''; i += 1;
    } else field += ch;
  }
  return records;
}

const literalArb = fc.record({
  kind: fc.constantFrom('plain', 'lang', 'typed'),
  lang: fc.constantFrom('en', 'ro', 'fi', 'en-GB'),
  value: fc.string({ maxLength: 30, unit: 'grapheme-composite' }).map((v) => `${v}${['', ',', '"', '\n', '\r\n', '\t', ' x'][v.length % 7]}`),
});

test('property: SELECT results in both W3C formats keep every value, whatever it holds', () => {
  fc.assert(fc.property(fc.array(literalArb, { minLength: 1, maxLength: 8 }), fc.boolean(), (literals, blank) => {
    const s = new ox.Store();
    literals.forEach((l, k) => {
      const object = l.kind === 'lang' ? ox.literal(l.value, l.lang)
        : l.kind === 'typed' ? ox.literal(l.value, ox.namedNode('https://example.org/type')) : ox.literal(l.value);
      const subject = blank && k === 0 ? ox.blankNode('n0') : ox.namedNode(`https://node.example/i/${k}`);
      s.add(ox.quad(subject, ox.namedNode('https://example.org/p'), object, ox.namedNode(NODE)));
    });
    const answer = engine.queryAnswer(ox, s, 'SELECT ?s ?o ?unbound WHERE { ?s <https://example.org/p> ?o } ORDER BY STR(?s)');
    const json = JSON.parse(answer.json);
    assert.deepStrictEqual(json.head.vars, ['s', 'o', 'unbound']);
    const records = csvRecords(answer.csv);
    assert.deepStrictEqual(records[0], ['s', 'o', 'unbound']);
    assert.strictEqual(records.length, literals.length + 1);
    json.results.bindings.forEach((row, k) => {
      assert.strictEqual(row.unbound, undefined, 'an unbound variable is left out of a JSON row');
      // CSV: an IRI as it is, a blank node as _:label, a literal as its lexical form alone, an unbound value empty.
      const want = row.s.type === 'bnode' ? `_:${row.s.value}` : row.s.value;
      assert.deepStrictEqual(records[k + 1], [want, row.o.value, '']);
      const source = literals[row.s.type === 'bnode' ? 0 : Number(row.s.value.split('/').pop())];
      assert.strictEqual(row.o.value, source.value);
      if (source.kind === 'lang') assert.strictEqual(row.o['xml:lang'], source.lang.toLowerCase());
      if (source.kind === 'typed') assert.strictEqual(row.o.datatype, 'https://example.org/type');
    });
  }), { numRuns: 120, seed: 6391 });
});

test('property: a graph result is the same bytes on every run, blank nodes included', () => {
  fc.assert(fc.property(fc.array(fc.tuple(fc.nat(4), fc.nat(4), fc.boolean()), { minLength: 1, maxLength: 12 }), (edges) => {
    const nq = edges.map(([a, b, blankTarget]) => `<${NODE}i/${a}> <https://example.org/p> ${blankTarget ? `_:x${b}` : `<${NODE}i/${b}>`} <${NODE}> .`).join('\n');
    const run = () => {
      const s = new ox.Store();
      s.load(nq, { format: 'application/n-quads' });
      return engine.queryAnswer(ox, s, 'CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }');
    };
    const first = run();
    assert.deepStrictEqual(run(), first);
    const labels = [...first.csv.matchAll(/_:([a-z0-9]+)/gu)].map((m) => m[1]);
    assert.ok(labels.every((label) => /^b\d+$/u.test(label)), first.csv);
  }), { numRuns: 80, seed: 6392 });
});
