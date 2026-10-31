'use strict';
// Fitness function: ONE RDF reader (official libraries first: the pinned library is used in one place).
//
// `n3` is the pinned library that reads Turtle and N-Quads. `knowledge/turtle.js` wraps it
// (`parse`), and every other module that needs RDF read goes through that wrapper: the SKOS
// import adapter and the SKOS export both do. A second place that requires `n3` is a second
// way to read RDF, with its own options, its own error handling and its own drift. The test
// names the one module allowed to require it, and that every module reading RDF names the
// wrapper in its header, so a newcomer finds the reader without searching.

const test = require('node:test');
const assert = require('node:assert');
const { sources } = require('./_scan.js');

/** The one module of `src/` that requires the library. */
const READER = 'src/knowledge/turtle.js';

test('only knowledge/turtle.js requires n3', () => {
  const offenders = sources().filter((file) => file.requires.includes('n3') && file.rel !== READER).map((file) => file.rel);
  assert.deepStrictEqual(offenders, [], `these modules read RDF with n3 themselves; use ${READER}#parse`);
  assert.ok(sources().some((file) => file.rel === READER && file.requires.includes('n3')), `${READER} no longer requires n3`);
});

test('the modules that read RDF do so through the wrapper, and their header says so', () => {
  const readers = sources().filter((file) => file.rel !== READER
    && file.requires.some((specifier) => /(^|\/)turtle\.js$/u.test(specifier)) && /\.parse\(/u.test(file.text));
  assert.ok(readers.some((file) => file.rel === 'src/interchange/adapters/skos.js'), 'the SKOS import is a reader');
  for (const file of readers) {
    assert.match(file.text.split('\n').slice(0, 40).join('\n'), /n3|Turtle/u, `${file.rel} does not say which library reads its RDF`);
  }
});
