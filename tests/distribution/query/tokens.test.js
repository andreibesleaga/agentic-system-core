'use strict';
// verifies AGSC-06-39
// The query page's own reading of a query (src/distribution/query/tokens.js): the tokens
// the editor colours, the query form it names, and the page's refusal of an update and of
// a SERVICE clause BEFORE anything runs (AGSC-06-39 (a)). The engine refuses both too; the
// page refuses first because the engine lets `SERVICE SILENT` through and names no update
// in its message (measured on Oxigraph 0.5.13). The tokenizer only classifies
// tokens; it does not parse SPARQL. Pure functions; deterministic, no network.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const tokens = require('../../../src/distribution/query/tokens.js');

const kinds = (text) => tokens.queryTokens(text).filter((t) => t.kind !== 'space').map((t) => [t.kind, t.text]);

test('the tokens of a query, each with its kind, and the text read back whole', () => {
  const text = 'PREFIX dcterms: <http://purl.org/dc/terms/>\n# the items\nSELECT ?item $n WHERE { ?item dcterms:title "a \\"b\\"" ; a _:x . FILTER(?n < 10) }';
  assert.deepStrictEqual(kinds(text), [
    ['keyword', 'PREFIX'], ['prefixed', 'dcterms:'], ['iri', '<http://purl.org/dc/terms/>'],
    ['comment', '# the items'],
    ['keyword', 'SELECT'], ['variable', '?item'], ['variable', '$n'], ['keyword', 'WHERE'], ['punct', '{'],
    ['variable', '?item'], ['prefixed', 'dcterms:title'], ['string', '"a \\"b\\""'], ['punct', ';'], ['keyword', 'a'],
    ['blank', '_:x'], ['punct', '.'], ['keyword', 'FILTER'], ['punct', '('], ['variable', '?n'], ['punct', '<'],
    ['number', '10'], ['punct', ')'], ['punct', '}'],
  ]);
  assert.strictEqual(tokens.queryTokens(text).map((t) => t.text).join(''), text);
});

test('long strings, single quotes, an unclosed string and an unclosed IRI', () => {
  assert.deepStrictEqual(kinds('"""a\n"b"\n""" \'c\''), [['string', '"""a\n"b"\n"""'], ['string', '\'c\'']]);
  assert.deepStrictEqual(kinds('"open'), [['string', '"open']]);
  assert.deepStrictEqual(kinds('?a <?b'), [['variable', '?a'], ['punct', '<'], ['variable', '?b']]);
  assert.deepStrictEqual(kinds('ex:a. :b'), [['prefixed', 'ex:a'], ['punct', '.'], ['prefixed', ':b']]);
  assert.deepStrictEqual(kinds('ORDER BY DESC(?n) STR(?x) true 1.5e3'), [['keyword', 'ORDER'], ['keyword', 'BY'], ['keyword', 'DESC'],
    ['punct', '('], ['variable', '?n'], ['punct', ')'], ['word', 'STR'], ['punct', '('], ['variable', '?x'], ['punct', ')'],
    ['word', 'true'], ['number', '1.5e3']]);
});

test('the form of a query is its first form keyword, after the prologue and comments', () => {
  assert.strictEqual(tokens.queryCheck('# SELECT in a comment\nPREFIX a: <x:>\nask { ?s ?p ?o }').form, 'ASK');
  assert.strictEqual(tokens.queryCheck('CONSTRUCT WHERE { ?s ?p ?o }').form, 'CONSTRUCT');
  assert.strictEqual(tokens.queryCheck('DESCRIBE <x:a>').form, 'DESCRIBE');
  assert.strictEqual(tokens.queryCheck('select * { ?s ?p ?o }').form, 'SELECT');
  assert.strictEqual(tokens.queryCheck('"SELECT"').form, null);
  assert.strictEqual(tokens.queryCheck('').form, null);
});

test('an update is refused before it runs, whatever its case, and a SERVICE clause too', () => {
  for (const word of ['INSERT', 'DELETE', 'LOAD', 'CLEAR', 'CREATE', 'DROP', 'COPY', 'MOVE', 'ADD']) {
    const check = tokens.queryCheck(`${word.toLowerCase()} DATA { <x:a> <x:b> <x:c> }`);
    assert.deepStrictEqual(check.refusal, { reason: 'update', word }, word);
  }
  assert.deepStrictEqual(tokens.queryCheck('SELECT * WHERE { SERVICE SILENT <https://example.org/sparql> { ?s ?p ?o } }').refusal,
    { reason: 'service', word: 'SERVICE' });
  assert.deepStrictEqual(tokens.queryCheck('DELETE WHERE { ?s ?p ?o } ; SELECT * { SERVICE <x:s> {} }').refusal,
    { reason: 'update', word: 'DELETE' });
});

test('a refused word inside a string, an IRI, a comment, a variable or a prefixed name is not a refusal', () => {
  const text = 'SELECT ?insert WHERE { ?insert ex:delete "DELETE SERVICE" ; <x:LOAD> ?drop } # INSERT, SERVICE';
  const check = tokens.queryCheck(text);
  assert.strictEqual(check.refusal, null);
  assert.strictEqual(check.form, 'SELECT');
});

test('a < that compares two values is not the start of an IRI, so it cannot hide a refused word', () => {
  // Inside an expression, after a value, `<` is "less than": the engine reads `1<2)SERVICE#>`
  // as a comparison, a SERVICE clause and a comment, never as the IRI `<2)SERVICE#>`.
  const hidden = 'SELECT * WHERE { ?s ?p ?o FILTER(1<2)SERVICE#>\nSILENT <https://example.org/sparql> { ?x ?y ?z } }';
  assert.deepStrictEqual(tokens.queryCheck(hidden).refusal, { reason: 'service', word: 'SERVICE' });
  for (const text of ['SELECT * { ?s ?p ?o BIND(?o<?s)SERVICE#> AS ?b) }', 'SELECT * { FILTER regex(?a<"x")DELETE#>\n }',
    'SELECT * { FILTER(?a = "x"@en<?b)SERVICE#>\n }', 'SELECT * { FILTER (STR(?a)<"b")LOAD#>\n }',
    'SELECT * { FILTER ex:f(?a<?b)SERVICE#>\n }', 'SELECT (1<2)SERVICE#> AS ?b) {}']) {
    assert.notStrictEqual(tokens.queryCheck(text).refusal, null, text);
  }
  assert.deepStrictEqual(kinds('FILTER(?n<10)'), [['keyword', 'FILTER'], ['punct', '('], ['variable', '?n'], ['punct', '<'],
    ['number', '10'], ['punct', ')']]);
});

test('a comment ends at a carriage return as at a line feed, as SPARQL says, so it cannot hide a refused word', () => {
  // SPARQL 1.1 §19.4: a comment runs to the end of its line, a CR or an LF; the engine reads
  // the SERVICE after `#x\r`.
  assert.deepStrictEqual(tokens.queryCheck('SELECT * { #x\rSERVICE SILENT <https://example.org/s> { ?a ?b ?c } }').refusal,
    { reason: 'service', word: 'SERVICE' });
  assert.deepStrictEqual(kinds('#a\rSELECT'), [['comment', '#a'], ['keyword', 'SELECT']]);
  assert.deepStrictEqual(kinds('"a\rDELETE'), [['string', '"a'], ['keyword', 'DELETE']]);
});

test('a refused word glued to the token before it is still refused (the engine reads it apart)', () => {
  // Found by a differential fuzz against the engine (Oxigraph 0.5.13): a local name cannot
  // start with a full stop, so `ex:.SERVICE` is `ex:`, `.`, `SERVICE`; and the engine reads
  // `a1SERVICE` as `a`, `1`, `SERVICE`. A bare word that holds a refused word is refused:
  // no function name, boolean or language tag of SPARQL holds one.
  for (const text of ['SELECT * WHERE { ?s ?p ?o , #\nex:.SERVICE SILENT <https://e.org/s> { ?x ?y ?z } }',
    'SELECT * WHERE { ?s ?p ?o ;a1SERVICE SILENT <https://e.org/s> { ?x ?y ?z } }', 'SELECT * { ?s ?p true1DELETE }']) {
    assert.notStrictEqual(tokens.queryCheck(text).refusal, null, text);
  }
  assert.deepStrictEqual(kinds('ex:.b _:.c'), [['prefixed', 'ex:'], ['punct', '.'], ['word', 'b'], ['blank', '_:'], ['punct', '.'], ['word', 'c']]);
  assert.strictEqual(tokens.queryCheck('SELECT (STRUUID() AS ?u) (ENCODE_FOR_URI(?s) AS ?e) { ?s ?p ?o FILTER(isLITERAL(?o) && LANGMATCHES(LANG(?o), "en")) }').refusal, null);
});

test('an IRI after a value outside an expression, or where an expression expects a value, is still an IRI', () => {
  // Triple patterns, collections, VALUES rows and the arguments of IN and of a function.
  const text = 'SELECT * { ?s <x:p> <x:o> ; <x:q> (<x:a> <x:b>) . VALUES (?v) { (<x:c>) } FILTER(?v IN (<x:c>, <x:d>) && <x:f>(?v) = <x:e>) }';
  const iris = tokens.queryTokens(text).filter((t) => t.kind === 'iri').map((t) => t.text);
  assert.deepStrictEqual(iris, ['<x:p>', '<x:o>', '<x:q>', '<x:a>', '<x:b>', '<x:c>', '<x:c>', '<x:d>', '<x:f>', '<x:e>']);
  assert.strictEqual(tokens.queryCheck('SELECT * { ?s ?p (1 <x:SERVICE>) FILTER(?o = <x:LOAD>) }').refusal, null);
  assert.strictEqual(tokens.queryCheck('SELECT ?a (COUNT(?b) AS ?n) { ?a ?p ?b } GROUP BY ?a HAVING (COUNT(?b) > 1)').refusal, null);
});

test('a query that names its own dataset says so (FROM, FROM NAMED)', () => {
  assert.strictEqual(tokens.queryCheck('SELECT * FROM <x:g> WHERE { ?s ?p ?o }').dataset, true);
  assert.strictEqual(tokens.queryCheck('SELECT * FROM NAMED <x:g> WHERE { GRAPH ?g { ?s ?p ?o } }').dataset, true);
  assert.strictEqual(tokens.queryCheck('SELECT * WHERE { ?s <x:from> ?o }').dataset, false);
});

test('the coloured copy of the editor: one span per token that is not white space, text as text', () => {
  const tree = tokens.queryHighlight('SELECT ?x\n');
  assert.deepStrictEqual(tree, [['span', { class: 'q-keyword' }, 'SELECT'], ' ', ['span', { class: 'q-variable' }, '?x'], '\n', '\n']);
  // The copy ends with one more line feed, so it is as tall as the text area when the text
  // ends with one; markup in the text stays text.
  assert.deepStrictEqual(tokens.queryHighlight('"<b>" &'), [['span', { class: 'q-string' }, '"<b>"'], ' ',
    ['span', { class: 'q-punct' }, '&'], '\n']);
});

test('property: the tokens of any text read back to the text, and the scan is total', () => {
  fc.assert(fc.property(fc.string({ maxLength: 200, unit: 'binary' }), (text) => {
    const list = tokens.queryTokens(text);
    assert.strictEqual(list.map((t) => t.text).join(''), text);
    assert.ok(list.every((t) => t.text.length > 0));
    const check = tokens.queryCheck(text);
    assert.ok(check.refusal === null || ['update', 'service'].includes(check.refusal.reason));
  }), { numRuns: 300, seed: 6390 });
});

test('a hostile text of about 1 MiB is read in one pass', () => {
  const text = `${'<'.repeat(1 << 19)}${'"'.repeat(1 << 19)}`;
  assert.strictEqual(tokens.queryTokens(text).map((t) => t.text).join('').length, text.length);
});

test('the sentence that says why a query is not run', () => {
  assert.strictEqual(tokens.queryRefusal(tokens.queryCheck('SELECT * { ?s ?p ?o }')), null);
  assert.strictEqual(tokens.queryRefusal(tokens.queryCheck('drop all')),
    'This page does not change the graph: DROP is an update, and an update is refused.');
  assert.strictEqual(tokens.queryRefusal(tokens.queryCheck('ASK { SERVICE <x:s> { ?s ?p ?o } }')),
    'This page sends no query to another server: a SERVICE clause is refused.');
  assert.strictEqual(tokens.queryRefusal(tokens.queryCheck('')), 'Write a SELECT, ASK, CONSTRUCT or DESCRIBE query.');
});
