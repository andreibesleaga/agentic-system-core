'use strict';
// tests/knowledge/_question-answers.js — the rows of a SPARQL query of the ten questions
// (AGSC-05-34) read back into the answer shape of the question, so that a test can compare
// what a store answered with what the engine's function (src/knowledge/questions.js)
// answers. Shared by the development lane (tests/knowledge/questions-sparql.test.js), the
// examples of the query page (tests/distribution/query-examples.test.js) and the browser
// tests of `/query/` (tests/distribution/query-browser.test.js, tests/e2e/query-sites.test.js).
//
// A row is a list of strings in the order of the query's variables: an IRI as its text, a
// literal as its lexical form, an unbound variable as null. Pure; no I/O.

const assert = require('node:assert/strict');

/** The slug of an item IRI: its last path segment. */
const slugOf = (iri) => iri.replace(/\/$/u, '').slice(iri.replace(/\/$/u, '').lastIndexOf('/') + 1);

/** The rows of a result in the W3C JSON format (SPARQL 1.1 Query Results JSON Format). */
function rowsOf(json) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json;
  return parsed.results.bindings.map((b) => parsed.head.vars.map((v) => (b[v] === undefined ? null : b[v].value)));
}

/** Rows of one query -> the answer shape of question `number` (the rows are in query order). */
function toAnswer(number, rows, items) {
  const slugs = (column) => [...new Set(rows.map((r) => slugOf(r[column])))].sort();
  const typeOf = (slug) => { const found = items.find((i) => i.slug === slug); assert.ok(found, 'unknown ' + slug + ' in ' + JSON.stringify(rows)); return found.type; };
  switch (number) {
    case 1: case 2: case 3: case 6: return slugs(0);
    case 4: return [...new Set(rows.map((r) => r[0]))].sort();
    case 5: return {
      verified_by: rows.filter((r) => r[0] === 'verified_by').map((r) => slugOf(r[1])).sort(),
      verifies: rows.filter((r) => r[0] === 'verifies').map((r) => slugOf(r[1])).sort(),
    };
    case 7: {
      const lineage = slugs(0);
      return { episodes: lineage.filter((s) => typeOf(s) === 'episode'), lineage };
    }
    case 8: {
      const below = slugs(0);
      return { clusters: below.filter((s) => typeOf(s) === 'cluster'), items: below.filter((s) => typeOf(s) !== 'cluster') };
    }
    case 9: {
      const bySlug = new Map();
      for (const [iri, reason] of rows) bySlug.set(slugOf(iri), [...(bySlug.get(slugOf(iri)) || []), reason]);
      const order = ['deprecated', 'draft', 'retired', 'stale'];
      return [...bySlug.keys()].sort().map((slug) => ({
        reasons: order.filter((r) => bySlug.get(slug).includes(r)), slug }));
    }
    default: {
      const resources = [...new Set(rows.map((r) => r[0]))].sort();
      return {
        shared: resources.filter((resource) => rows.some((r) => r[0] === resource && r[1] !== null))
          .map((resource) => ({ items: rows.filter((r) => r[0] === resource && r[1] !== null).map((r) => slugOf(r[1])).sort(), resource })),
        sources: resources,
      };
    }
  }
}

module.exports = { rowsOf, slugOf, toAnswer };
