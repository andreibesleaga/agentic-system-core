'use strict';
// Fitness function: ONE RDF reader (official libraries first: the pinned library is used in one place).
//
// `n3` is the pinned library that reads Turtle and N-Quads. `knowledge/turtle.js` wraps it
// (`parse`), and every other module that needs RDF read goes through that wrapper: the SKOS
// import adapter and the SKOS export both do. A second place that requires `n3` is a second
// way to read RDF, with its own options, its own error handling and its own drift. The test
// names the one module allowed to READ with it, and that every module reading RDF names the
// wrapper in its header, so a newcomer finds the reader without searching.
//
// One more module may require `n3`, for a different job: `knowledge/closure.js` runs the
// library's rule `Reasoner` over a `Store` (AGSC-05-37). It never parses: its text goes in
// through `turtle.parse`, and the test below fails if it constructs a parser itself.

const test = require('node:test');
const assert = require('node:assert');
const { sources } = require('./_scan.js');

/** The one module of `src/` that reads RDF with the library. */
const READER = 'src/knowledge/turtle.js';
/** The one module besides it that requires the library, for its `Store` and `Reasoner` only. */
const REASONER = 'src/knowledge/closure.js';

test('only knowledge/turtle.js and knowledge/closure.js require n3', () => {
  const offenders = sources().filter((file) => file.requires.includes('n3') && ![READER, REASONER].includes(file.rel)).map((file) => file.rel);
  assert.deepStrictEqual(offenders, [], `these modules use n3 themselves; read RDF through ${READER}#parse`);
  assert.ok(sources().some((file) => file.rel === READER && file.requires.includes('n3')), `${READER} no longer requires n3`);
});

test('the reasoner module does not read RDF itself', () => {
  const file = sources().find((f) => f.rel === REASONER);
  assert.ok(file.requires.includes('n3'), `${REASONER} no longer requires n3`);
  assert.ok(!/N3\.(?:Stream)?Parser|new Parser/u.test(file.text), `${REASONER} builds a parser; use ${READER}#parse`);
  assert.ok(/N3\.Reasoner/u.test(file.text), `${REASONER} no longer runs the library's Reasoner`);
});

test('the modules that read RDF do so through the wrapper, and their header says so', () => {
  const readers = sources().filter((file) => file.rel !== READER
    && file.requires.some((specifier) => /(^|\/)turtle\.js$/u.test(specifier)) && /\.parse\(/u.test(file.text));
  assert.ok(readers.some((file) => file.rel === 'src/interchange/adapters/skos.js'), 'the SKOS import is a reader');
  for (const file of readers) {
    assert.match(file.text.split('\n').slice(0, 40).join('\n'), /n3|Turtle/u, `${file.rel} does not say which library reads its RDF`);
  }
});
