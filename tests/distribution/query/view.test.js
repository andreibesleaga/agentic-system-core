'use strict';
// verifies AGSC-06-39, AGSC-06-05
// What the query page shows for a result (src/distribution/query/view.js): a term as
// text, the table of a result (AGSC-06-39 (c)), the graph picture of a CONSTRUCT,
// DESCRIBE or three-column result, the status line, and the share link whose fragment
// holds the query (AGSC-06-39 (e)). Every function returns plain data that the page's
// element writer turns into text nodes, so no value of a result can become markup.
// Pure functions; deterministic, no network.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const view = require('../../../src/distribution/query/view.js');

const PREFIXES = { dcterms: 'http://purl.org/dc/terms/', skos: 'http://www.w3.org/2004/02/skos/core#', xsd: 'http://www.w3.org/2001/XMLSchema#' };
const iri = (value) => ({ type: 'uri', value });
const literal = (value, extra = {}) => ({ type: 'literal', value, ...extra });

test('a term as text: a prefixed name where a prefix covers it, else the IRI; a literal with its tag or type', () => {
  assert.strictEqual(view.queryTermText(iri('http://purl.org/dc/terms/requires'), PREFIXES), 'dcterms:requires');
  assert.strictEqual(view.queryTermText(iri('https://node.example/concepts/a/'), PREFIXES), '<https://node.example/concepts/a/>');
  assert.strictEqual(view.queryTermText(iri('http://purl.org/dc/terms/a/b'), PREFIXES), '<http://purl.org/dc/terms/a/b>');
  assert.strictEqual(view.queryTermText({ type: 'bnode', value: 'b0' }, PREFIXES), '_:b0');
  assert.strictEqual(view.queryTermText(literal('Item', { 'xml:lang': 'en' }), PREFIXES), '"Item"@en');
  assert.strictEqual(view.queryTermText(literal('3', { datatype: 'http://www.w3.org/2001/XMLSchema#integer' }), PREFIXES), '"3"^^xsd:integer');
  assert.strictEqual(view.queryTermText(literal('x', { datatype: 'http://www.w3.org/2001/XMLSchema#string' }), PREFIXES), '"x"');
  assert.strictEqual(view.queryTermText(undefined, PREFIXES), '');
});

test('a short name: the prefixed name where one prefix covers the IRI and the rest is a plain local name, else null', () => {
  // One rule for the result table and the vocabulary tables of the page (query-page.js).
  assert.strictEqual(view.queryShortName('http://purl.org/dc/terms/requires', PREFIXES), 'dcterms:requires');
  assert.strictEqual(view.queryShortName('http://www.w3.org/2004/02/skos/core#related-match_2', PREFIXES), 'skos:related-match_2');
  for (const iri of ['https://node.example/concepts/a/', 'http://purl.org/dc/terms/a/b', 'http://purl.org/dc/terms/a.b',
    'http://purl.org/dc/terms/', 'http://purl.org/dc/terms/a?b']) {
    assert.strictEqual(view.queryShortName(iri, PREFIXES), null, iri);
  }
});

const SELECT = {
  head: { vars: ['item', 'label'] },
  results: { bindings: [
    { item: iri('https://node.example/concepts/a/'), label: literal('<script>alert(1)</script>', { 'xml:lang': 'en' }) },
    { item: iri('https://node.example/concepts/b/') },
  ] },
};

test('the table: one column per variable, one row per solution, an unbound value empty, text as text', () => {
  const table = view.queryTable(SELECT, 10, PREFIXES);
  assert.deepStrictEqual(table, ['table', { class: 'query-table' },
    ['caption', {}, 'The result: 2 rows.'],
    ['thead', {}, ['tr', {}, ['th', { scope: 'col' }, '?item'], ['th', { scope: 'col' }, '?label']]],
    ['tbody', {},
      ['tr', {}, ['td', {}, '<https://node.example/concepts/a/>'], ['td', {}, '"<script>alert(1)</script>"@en']],
      ['tr', {}, ['td', {}, '<https://node.example/concepts/b/>'], ['td', {}, '']]]]);
  const cut = view.queryTable(SELECT, 1, PREFIXES);
  assert.deepStrictEqual(cut[2], ['caption', {}, 'The result: 2 rows, the first 1 shown here; the downloads hold them all.']);
  assert.strictEqual(cut[4].length, 3);
  assert.deepStrictEqual(view.queryTable({ boolean: false, head: {} }, 10, PREFIXES), ['p', { class: 'query-boolean' }, 'The answer is no (false).']);
  assert.deepStrictEqual(view.queryTable({ boolean: true, head: {} }, 10, PREFIXES), ['p', { class: 'query-boolean' }, 'The answer is yes (true).']);
  assert.deepStrictEqual(view.queryTable({ head: { vars: ['x'] }, results: { bindings: [{ x: literal('1') }] } }, 10, PREFIXES)[2],
    ['caption', {}, 'The result: 1 row.']);
});

const TRIPLES = {
  head: { vars: ['subject', 'predicate', 'object'] },
  results: { bindings: [
    { object: iri('https://node.example/concepts/b/'), predicate: iri('http://purl.org/dc/terms/requires'), subject: iri('https://node.example/concepts/a/') },
    { object: literal('Item A', { 'xml:lang': 'en' }), predicate: iri('http://www.w3.org/2004/02/skos/core#prefLabel'), subject: iri('https://node.example/concepts/a/') },
    { object: iri('https://node.example/concepts/a/'), predicate: literal('not an IRI'), subject: { type: 'bnode', value: 'b0' } },
  ] },
};

test('the picture of a three-column result: its subjects and objects as nodes, each row whose middle is an IRI as a link', () => {
  const graph = view.queryGraph(TRIPLES, PREFIXES, 50);
  assert.deepStrictEqual(graph.nodes, [
    { id: 'uri https://node.example/concepts/a/', label: '<https://node.example/concepts/a/>', route: null, summary: '', type: 'IRI' },
    { id: 'uri https://node.example/concepts/b/', label: '<https://node.example/concepts/b/>', route: null, summary: '', type: 'IRI' },
    { id: 'literal Item A en ', label: '"Item A"@en', route: null, summary: '', type: 'Literal' },
  ]);
  assert.deepStrictEqual(graph.links, [
    { key: 'other', source: 'uri https://node.example/concepts/a/', target: 'uri https://node.example/concepts/b/' },
    { key: 'other', source: 'uri https://node.example/concepts/a/', target: 'literal Item A en ' },
  ]);
  assert.strictEqual(graph.total, 3);
  // A bound on the nodes drawn: links only among the drawn ones; the total says how many there are.
  const small = view.queryGraph(TRIPLES, PREFIXES, 1);
  assert.deepStrictEqual(small.nodes.map((n) => n.type), ['IRI']);
  assert.deepStrictEqual(small.links, []);
  assert.strictEqual(small.total, 3);
  // Not three columns, or no row with an IRI in the middle: no picture.
  assert.strictEqual(view.queryGraph(SELECT, PREFIXES, 50), null);
  assert.strictEqual(view.queryGraph({ boolean: true, head: {} }, PREFIXES, 50), null);
  assert.strictEqual(view.queryGraph({ head: { vars: ['a', 'b', 'c'] }, results: { bindings: [{ a: iri('x:a') }] } }, PREFIXES, 50), null);
});

test('the caption of the picture counts its nodes and links in words, one or many, and sends to the downloads for every row', () => {
  // Not to the table: above 200 rows the table shows the first 200 (found by the audit of the query page).
  const graph = view.queryGraph(TRIPLES, PREFIXES, 50);
  assert.strictEqual(view.queryPictureText(graph),
    'A picture of the result: 3 nodes and 2 links; the downloads hold every row.');
  assert.strictEqual(view.queryPictureText({ links: [{}], nodes: [{}, {}], total: 2 }),
    'A picture of the result: 2 nodes and 1 link; the downloads hold every row.');
  assert.strictEqual(view.queryPictureText(view.queryGraph(TRIPLES, PREFIXES, 1)),
    'A picture of the result: 1 node and 0 links; the downloads hold every row. The first 1 of 3 are drawn.');
});

test('the status line after a run', () => {
  assert.strictEqual(view.querySummary({ form: 'SELECT', json: JSON.stringify(SELECT) }), 'SELECT answered with 2 rows.');
  assert.strictEqual(view.querySummary({ form: 'ASK', json: '{"head":{},"boolean":false}' }), 'ASK answered no.');
  assert.strictEqual(view.querySummary({ form: 'CONSTRUCT', json: JSON.stringify(TRIPLES) }), 'CONSTRUCT answered with 3 triples.');
  assert.strictEqual(view.querySummary({ form: 'DESCRIBE', json: '{"head":{"vars":["subject","predicate","object"]},"results":{"bindings":[{}]}}' }),
    'DESCRIBE answered with 1 triple.');
  assert.strictEqual(view.querySummary({ form: 'SELECT', json: '{"head":{"vars":["x"]},"results":{"bindings":[{}]}}' }), 'SELECT answered with 1 row.');
  assert.strictEqual(view.querySummary({ error: 'Refused.', form: null }), 'Refused.');
});

test('the share link holds the query in its fragment, and the fragment gives the query back', () => {
  const text = 'SELECT * WHERE { ?s ?p "a # b & c" }\n# ünïcode';
  const href = view.queryShareHref(text);
  assert.ok(href.startsWith('#query='));
  assert.ok(!/[\s"#&]/u.test(href.slice(1)), href);
  assert.strictEqual(view.queryFromHash(href), text);
  assert.strictEqual(view.queryFromHash(''), null);
  assert.strictEqual(view.queryFromHash('#main'), null);
  assert.strictEqual(view.queryFromHash('#query=%E0%A4%A'), null);
  fc.assert(fc.property(fc.string({ maxLength: 120, unit: 'grapheme' }), (value) => {
    assert.strictEqual(view.queryFromHash(view.queryShareHref(value)), value);
  }), { numRuns: 200, seed: 6393 });
});
