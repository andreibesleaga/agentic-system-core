'use strict';
// verifies AGSC-06-38, AGSC-06-01, AGSC-06-05, AGSC-06-17
// The two files the `/clusters/` page loads for its explorer (src/distribution/explorer/
// page.js): the script, made of the SOURCE TEXT of the explorer's pure functions so
// that the page runs exactly what these tests test, and the stylesheet, which also holds
// the relation filter that needs no script. Both are same-origin page assets of
// `/clusters/` (AGSC-06-01), and neither reads, stores or sends anything beyond this node.

const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');

const page = require('../../../src/distribution/explorer/page.js');
const { RELATIONS, LINK_KEYS } = require('../../../src/knowledge/relations.js');

/** A context whose term names differ from the local names, as a real one may. */
const CONTEXT = { '@context': {
  asc: 'https://w3id.org/agentic-system-core/ns#',
  dcterms: 'http://purl.org/dc/terms/',
  derivedFrom: { '@id': 'http://www.w3.org/ns/prov#wasDerivedFrom', '@type': '@id' },
  requires: { '@id': 'dcterms:requires', '@type': '@id' },
  uses: { '@id': 'asc:uses', '@type': '@id' },
} };

test('each of the fourteen keys is read by the term the node\'s own context gives its property', () => {
  const rows = page.relationTerms(CONTEXT);
  assert.deepStrictEqual(rows.map((r) => r.key), [...LINK_KEYS]);
  const term = (key) => rows.find((r) => r.key === key).term;
  assert.strictEqual(term('uses'), 'uses');
  assert.strictEqual(term('requires'), 'requires');
  assert.strictEqual(term('derived-from'), 'derivedFrom');
  // A property the context names no term for is read as the writer compacts it: under a
  // prefix of the context, else as the full IRI.
  assert.strictEqual(term('supersedes'), 'dcterms:replaces');
  assert.strictEqual(term('related'), 'http://www.w3.org/2004/02/skos/core#related');
  for (const row of rows) assert.strictEqual(row.meaning, RELATIONS.find((r) => r.key === row.key).meaning);
  assert.deepStrictEqual(rows.filter((r) => r.symmetric).map((r) => r.key), ['related', 'excludes', 'contradicts']);
  assert.deepStrictEqual(page.relationTerms(null).map((r) => r.term).slice(2, 4),
    ['http://www.w3.org/2004/02/skos/core#narrower', 'https://w3id.org/agentic-system-core/ns#uses']);
});

test('the script evaluates with nothing but the language, exposes its functions and stands down without a page', () => {
  const context = vm.createContext({});
  vm.runInContext(page.script({ relations: page.relationTerms(CONTEXT), specVersion: '1.1.0' }), context, { filename: 'agsc-explorer.js' });
  const api = vm.runInContext('globalThis.AGSC_EXPLORER', context);
  for (const name of ['explorerGraph', 'explorerLayout', 'explorerPlaceTip', 'explorerReduce', 'explorerScene', 'explorerBuild']) {
    assert.strictEqual(typeof api[name], 'function', name);
  }
  assert.strictEqual(api.GRAPH_ROUTE, '/graph.jsonld');
  assert.strictEqual(api.ready, null, 'with no document the script draws nothing');
  // The script reads the graph exactly as the Node module does.
  const doc = { '@graph': [{ '@id': 'https://n.example/', '@type': 'Bundle' },
    { '@id': 'https://n.example/concepts/a/', '@type': 'Concept', uses: 'https://n.example/concepts/b/' },
    { '@id': 'https://n.example/concepts/b/', '@type': 'Concept' }] };
  const graph = JSON.parse(JSON.stringify(api.explorerGraph(doc, api.RELATIONS, api.MAX_NODES)));
  assert.deepStrictEqual(graph.links, [{ key: 'uses', source: 'https://n.example/concepts/a/', target: 'https://n.example/concepts/b/' }]);
});

test('the script reaches nothing beyond this node and evaluates no text', () => {
  const text = page.script({ relations: page.relationTerms(CONTEXT) });
  for (const forbidden of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function',
    'localStorage', 'sessionStorage', 'document.cookie', 'indexedDB', 'sendBeacon', 'XMLHttpRequest', 'WebSocket', 'importScripts']) {
    assert.ok(!text.includes(forbidden), `the explorer script uses ${forbidden}`);
  }
  // No address to fetch: the only IRIs are the SVG namespace and, in the RELATIONS line,
  // the names of properties a context left without a term, which are read, never fetched.
  const code = text.split('\n').filter((line) => !line.startsWith('    RELATIONS: ')).join('\n');
  assert.ok(!/https?:\/\/[A-Za-z0-9]/u.test(code.replace('http://www.w3.org/2000/svg', '')), 'the script names an origin');
  assert.deepStrictEqual([...text.matchAll(/fetch\(([^,)]*)/gu)].map((m) => m[1]), ['api.GRAPH_ROUTE'], 'one fetch, of the graph');
  assert.match(text, /^'use strict';\n/u);
  assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'));
  assert.match(text, /spec_version: unset/u);
});

test('the stylesheet colours every type in both schemes and filters the relations table with no script', () => {
  const css = page.stylesheet();
  assert.match(css, /@media \(prefers-color-scheme: dark\)/u);
  assert.match(css, /:root\[data-theme="dark"\]/u);
  for (const key of LINK_KEYS) {
    assert.ok(css.includes(`.relation-filter:has(#relation-filter-${key}:checked) ~ .table-wrap tr[data-relation]:not([data-relation="${key}"]) { display: none; }`), key);
  }
  for (const forbidden of ['url(', '@import', 'expression(']) assert.ok(!css.includes(forbidden), forbidden);
  assert.ok(css.endsWith('\n') && !css.endsWith('\n\n'));
});

test('the two assets live under /clusters/, where the page that loads them is', () => {
  assert.strictEqual(page.SCRIPT_ROUTE, '/clusters/agsc-explorer.js');
  assert.strictEqual(page.STYLESHEET_ROUTE, '/clusters/agsc-explorer.css');
});
