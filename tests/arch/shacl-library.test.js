'use strict';
// Fitness function: ONE SHACL engine, in one module, and never at build.
//
// `rdf-validate-shacl` is the pinned library that evaluates a site's invariants (AGSC-05-41).
// `knowledge/shacl-core.js` wraps it: the subset check that refuses everything else, the
// synchronous run and the order of the results. A second module that requires the library
// would be a second evaluator, with no subset check and its own order. The build runs no
// SHACL engine (AGSC-05-23): the shapes of `schema/item-shapes.ttl` run in a development lane
// (AGSC-05-24) and a site's own shapes in `verify` and `ci` (AGSC-09-20), so nothing the build
// verb requires, directly or through another module, may reach the wrapper.

const test = require('node:test');
const assert = require('node:assert');
const { reachable, sources } = require('./_scan.js');

const LIBRARY = 'rdf-validate-shacl';
const WRAPPER = 'src/knowledge/shacl-core.js';
/** The modules a build starts from: the verb, and the library entry point of the site build. */
const BUILD_ROOTS = Object.freeze(['src/application/cli/verbs/build.js', 'src/distribution/site.js']);

test(`only ${WRAPPER} requires ${LIBRARY}`, () => {
  const users = sources().filter((file) => file.requires.includes(LIBRARY)).map((file) => file.rel);
  assert.deepStrictEqual(users, [WRAPPER]);
});

test('the wrapper reads the shapes through knowledge/turtle.js and builds no parser of its own', () => {
  const file = sources().find((f) => f.rel === WRAPPER);
  assert.ok(file.requires.includes('./turtle.js'), `${WRAPPER} does not read through turtle.js`);
  assert.ok(!file.requires.includes('n3'), `${WRAPPER} requires n3 itself`);
});

test('the build never reaches the SHACL engine (AGSC-05-23)', () => {
  const reached = reachable(BUILD_ROOTS);
  for (const root of BUILD_ROOTS) assert.ok(reached.has(root), `${root} is not a module of src/`);
  assert.ok(reached.size > 20, `${reached.size} modules reached; the walk lost the require graph`);
  assert.ok(!reached.has(WRAPPER), `a module the build requires reaches ${WRAPPER}`);
});
