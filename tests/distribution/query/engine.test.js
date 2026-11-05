'use strict';
// verifies AGSC-06-39
// The query page's worker (src/distribution/query/engine.js) over the engine the page
// ships. The page vendors the WebAssembly build of Oxigraph 0.5.13; these tests drive the
// Node build of the same release, the engine's own pinned dependency, through the same
// functions the worker runs. They check:
//   * the four query forms are answered over the node's graph (every quad of `graph.nq` is
//     in the node's named graph, so a query runs over the union of the graphs unless it
//     names its own dataset with FROM);
//   * an update and a SERVICE clause are refused before the engine sees them (a property
//     checks the page's refusal against the engine's own reading of the text), and an
//     engine error comes back as a message, not a crash;
//   * the result files are the W3C formats (SPARQL 1.1 Query Results JSON Format, and CSV
//     and TSV Formats, both of 21 March 2013), written by the engine's own writers and
//     checked here as properties over hostile values: commas, quotes, line feeds, language
//     tags, datatypes, IRIs, blank nodes, unbound values;
//   * a CONSTRUCT or DESCRIBE result is given as subject, predicate and object bindings
//     with its blank nodes named b0, b1, … in the order of what each one is in (the sorted
//     triples it is part of), never by the labels the engine gave them, so the same query
//     gives the same bytes every time.
// Deterministic (fixed seeds), no network. AGSC_QUERY_FUZZ=1 runs the two differential
// properties long, 30 000 runs on each of the seeds 1 to 6: the close gate of any change to
// src/distribution/query/tokens.js (about one minute).

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');
const ox = require('oxigraph');

const engine = require('../../../src/distribution/query/engine.js');

const NODE = 'https://node.example/';

/** The fast-check runs of a differential property: its own seed by default, six long runs with AGSC_QUERY_FUZZ=1. */
const fuzzRuns = (numRuns, seed) => (process.env.AGSC_QUERY_FUZZ === '1'
  ? [1, 2, 3, 4, 5, 6].map((s) => ({ numRuns: 30000, seed: s })) : [{ numRuns, seed }]);
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

test('a SELECT runs once: its CSV file holds the values of its JSON file, RAND(), STRUUID(), BNODE() and NOW() included', () => {
  // Found by the audit of the query page: run once per format, a value the engine draws anew
  // on each run differed between the CSV file and the JSON file and table.
  const calls = [];
  const real = store();
  const counted = { query: (...args) => { calls.push(args[0]); return real.query(...args); } };
  const answer = engine.queryAnswer(ox, counted, 'SELECT (RAND() AS ?r) (STRUUID() AS ?u) (BNODE() AS ?b) (NOW() AS ?n) ?unbound WHERE {}');
  assert.strictEqual(calls.length, 1, 'the query ran once');
  const row = JSON.parse(answer.json).results.bindings[0];
  assert.deepStrictEqual(csvRecords(answer.csv), [['r', 'u', 'b', 'n', 'unbound'], [row.r.value, row.u.value, `_:${row.b.value}`, row.n.value, '']]);
});

test('the CSV file of a SELECT, read back from its JSON file or not, is the bytes the engine\'s own CSV writer gives', () => {
  // No variable, no row, unbound values, repeated rows, blank nodes of the file, a triple
  // term, a literal with a base direction, a language tag and a datatype.
  for (const text of ['SELECT * {}', 'SELECT * WHERE { FILTER(false) }', 'SELECT * WHERE { VALUES () { () () () } }',
    'SELECT ?a ?b WHERE { BIND(1 AS ?a) }', 'SELECT ?x WHERE { VALUES ?x { 1 1 2 } }', 'SELECT ?s ?o WHERE { ?s <http://purl.org/dc/terms/title> ?o }',
    'SELECT ?s ?p ?o WHERE { ?s ?p ?o } ORDER BY ?s ?p ?o', 'SELECT (<<( <x:a> <x:b> "c" )>> AS ?t) {}',
    'SELECT (STRLANGDIR("a,b", "en", "rtl") AS ?d) ("x"@ro AS ?l) ("2"^^<https://example.org/t> AS ?t) {}']) {
    const s = store();
    const options = { use_default_graph_as_union: true };
    const csv = s.query(text, { ...options, results_format: 'text/csv' });
    assert.strictEqual(engine.querySelectCsv(ox, s.query(text, { ...options, results_format: 'application/sparql-results+json' })), csv, text);
    assert.strictEqual(engine.queryAnswer(ox, s, text).csv, csv, text);
  }
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
  // A `<` that compares two values hides nothing (the engine reads it as "less than").
  assert.deepStrictEqual(engine.queryAnswer(ox, spy, 'SELECT * WHERE { ?s ?p ?o FILTER(1<2)SERVICE#>\nSILENT <https://example.org/sparql> { ?x ?y ?z } }'),
    { error: 'This page sends no query to another server: a SERVICE clause is refused.', form: 'SELECT' });
  // An escaped `#` in a local name is part of the name, not a comment (SPARQL 1.1 PN_LOCAL_ESC).
  assert.deepStrictEqual(engine.queryAnswer(ox, spy, 'PREFIX ex: <x:> SELECT * WHERE { ?s ?p ex:a\\# . SERVICE SILENT <https://example.org/s> { ?x ?y ?z } }'),
    { error: 'This page sends no query to another server: a SERVICE clause is refused.', form: 'SELECT' });
  assert.deepStrictEqual(engine.queryAnswer(ox, spy, '# nothing'),
    { error: 'Write a SELECT, ASK, CONSTRUCT or DESCRIBE query.', form: null });
  assert.deepStrictEqual(calls, []);
});

test('property: no text lets through a SERVICE clause that the engine reads', () => {
  // A differential check against the engine: a text that the engine runs, and that it no
  // longer parses once the word SERVICE is replaced, holds a SERVICE clause the engine reads;
  // the page must refuse every such text. The pieces are the ones that could hide the word
  // from a tokenizer: comparisons, comments, strings, IRIs, line ends, brackets, glued names,
  // escapes in a local name and code point escapes in an IRI.
  const pieces = fc.constantFrom('FILTER(1<2)', 'FILTER(?a<?b)', '#x', '#>', '"', '\'', '<', '>', '<2)', '\r', '\n', '(', ')',
    '{', '}', '[', ']', ' ', '.', ';', ',', '?a', '<x:a>', 'ex:', 'ex:a', '1', '1.', 'a', 'true', 'e', '_:b', '"a"@en', '^^',
    'BIND(1 AS ?q)', 'STR(', 'ex:f(', 'OPTIONAL {', 'UNION {', 'FILTER EXISTS {', '|', '/', '*', '+', '!', '=', '&&',
    'ex:a\\#', 'ex:a\\\'', 'ex:\\#', 'ex:a\\.', '\\', '<x:a\\u0041', '<x:\\U00000041', '\\u0041');
  const store = new ox.Store();
  const parses = (q) => { try { store.query(q); return true; } catch (e) { return false; } };
  for (const runs of fuzzRuns(4000, 639)) {
    fc.assert(fc.property(fc.array(pieces, { maxLength: 10 }), (parts) => {
      const q = `PREFIX ex: <x:> SELECT * WHERE { ?s ?p ?o ${parts.join('')}SERVICE SILENT <https://example.org/s> { ?x ?y ?z } }`;
      const read = parses(q) && !parses(q.replace('SERVICE SILENT', 'NOSUCHWORD SILENT'));
      assert.ok(!read || engine.queryAnswer(ox, store, q).error !== undefined, JSON.stringify(q));
    }), runs);
  }
});

test('property: no escape in a name or an IRI lets through a SERVICE clause that the engine reads', () => {
  // The same differential check, aimed at the escapes the audit of the query page found:
  // a local name may hold `\#`, `\'` and the other escapes of PN_LOCAL_ESC, and an IRI
  // `\uXXXX` and `\UXXXXXXXX` (UCHAR), and the engine reads each as part of the name or the
  // IRI. Red on the tokenizer of the block 6b close (`<x:a\u0041#>`, then `ex:a\#`); its
  // fix was red on `ex:a.b.` and `?a-1` before a name ended at a second run of full stops and
  // a variable at a hyphen.
  const names = fc.constantFrom('ex:a', 'ex:a\\#', 'ex:a\\\'', 'ex:\\#', 'ex:\\#b', 'ex:a\\.', 'ex:a\\~', 'ex:a\\(', 'ex:a\\)',
    'ex:a\\;', 'ex:a\\,', 'ex:%41', '<x:a\\u0041#>', '<x:\\U00000041#>', '<x:a\\u0041>', '<x:a>', 'ex:a.b', 'ex:a\\.b');
  const pieces = fc.constantFrom('\\', '#', '>', '\'', '"', '\n', ' ', '.', ';', ',', '{', '}', '(', ')', '?a', 'ex:a', 'ex:a\\#',
    '<x:a\\u0041', 'ex:a.b', '?a-', '1');
  const store = new ox.Store();
  const parses = (q) => { try { store.query(q); return true; } catch (e) { return false; } };
  for (const runs of fuzzRuns(2000, 6394)) {
    fc.assert(fc.property(names, fc.array(pieces, { maxLength: 6 }), (name, parts) => {
      const q = `PREFIX ex: <x:> SELECT * WHERE { ?s ?p ?o ; ?p ${name}${parts.join('')}SERVICE SILENT <https://example.org/s> { ?x ?y ?z } }`;
      const read = parses(q) && !parses(q.replace('SERVICE SILENT', 'NOSUCHWORD SILENT'));
      assert.ok(!read || engine.queryAnswer(ox, store, q).error !== undefined, JSON.stringify(q));
    }), runs);
  }
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
