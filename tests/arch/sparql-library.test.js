'use strict';
// Fitness function: ONE SPARQL parser and ONE SPARQL engine, in one module, never at build.
//
// `@traqula/parser-sparql-1-1` reads a site's competency queries and `oxigraph` answers them
// (AGSC-05-41). `knowledge/competency.js` wraps both: the walk that refuses every query outside
// the subset BEFORE the engine sees it (so no query reads a clock, draws a random number or
// opens a connection, AGSC-08-30), the cells of an answer and the comparison. A second module
// that required either library would be a second way to run SPARQL with no subset check.
// The engine is handed only the N-Triples the wrapper writes from quads `turtle.js` read, so
// RDF text is still read in one place (`tests/arch/rdf-reader.test.js`).
//
// The build, `lint` and the tool server never run the check (AGSC-05-11, AGSC-05-23,
// AGSC-09-20): nothing they require, directly or through another module, reaches the wrapper
// or `knowledge/site-checks.js`, which joins it to the SHACL engine.

const test = require('node:test');
const assert = require('node:assert');
const { reachable, sources } = require('./_scan.js');

const PARSER = '@traqula/parser-sparql-1-1';
const ENGINE = 'oxigraph';
const WRAPPER = 'src/knowledge/competency.js';
const CHECK = 'src/knowledge/site-checks.js';
/** The modules a build, a lint and the tool server start from. */
const ROOTS = Object.freeze(['src/application/cli/verbs/build.js', 'src/application/cli/verbs/lint.js',
  'src/application/cli/verbs/mcp.js', 'src/distribution/site.js']);

for (const library of [PARSER, ENGINE]) {
  test(`only ${WRAPPER} requires ${library}`, () => {
    const users = sources().filter((file) => file.requires.includes(library)).map((file) => file.rel);
    assert.deepStrictEqual(users, [WRAPPER]);
  });
}

test('the wrapper hands the engine only N-Triples it writes, and never parses RDF with it', () => {
  const file = sources().find((f) => f.rel === WRAPPER);
  assert.ok(!/oxigraph\.parse\(/u.test(file.text), `${WRAPPER} reads RDF with the engine's own parser`);
  const loads = [...file.text.matchAll(/\.load\(([^)]*)\)/gu)].map((m) => m[1]);
  assert.ok(loads.length === 1 && loads[0].includes("format: 'application/n-triples'"), `${WRAPPER} loads ${JSON.stringify(loads)}`);
});

test('only the application wiring of verify and ci requires the site check', () => {
  const users = sources().filter((file) => file.requires.some((s) => /(^|\/)site-checks\.js$/u.test(s)))
    .map((file) => file.rel);
  assert.deepStrictEqual(users, ['src/application/cli/verbs/_site-checks.js']);
});

test('the build, lint and the tool server never reach the SPARQL engine or the site check', () => {
  const reached = reachable(ROOTS);
  for (const root of ROOTS) assert.ok(reached.has(root), `${root} is not a module of src/`);
  assert.ok(reached.size > 20, `${reached.size} modules reached; the walk lost the require graph`);
  for (const module of [WRAPPER, CHECK]) assert.ok(!reached.has(module), `a module they require reaches ${module}`);
});
