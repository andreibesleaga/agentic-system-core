'use strict';
// Fitness function: the context map stays beside the Harness, and a build applies no crosswalk.
//
// Two rules of 1.1 that a later change could break without failing a vector:
//   * AGSC-07-30 with AGSC-07-12: the seven Harness file kinds are the same bytes whether or not a
//     node declares contexts. The Harness writer, and the browser bundle built from its source
//     text, must therefore never reach the context-map writer or the context resolver; the map is
//     written by `composition/context-map.js`, called by the `compose` verb alone.
//   * AGSC-11-24 with AGSC-11-13: a build reads no peer and applies no crosswalk. A build checks a
//     crosswalk file of its own Bundle (the lint does), but only the client side of the federation
//     marks results with it: no module a build reaches calls `contextMapResults`, which only
//     `boundary/federation.js` defines.

const test = require('node:test');
const assert = require('node:assert');
const { reachable, sources } = require('./_scan.js');

const MAP_WRITER = 'src/composition/context-map.js';
const RESOLVER = 'src/knowledge/contexts.js';
const FEDERATION = 'src/boundary/federation.js';
const BUILD_ROOTS = Object.freeze(['src/application/cli/verbs/build.js', 'src/distribution/site.js']);
const HARNESS_ROOTS = Object.freeze(['src/composition/harness.js', 'src/composition/browser.js', 'src/distribution/compose-page.js']);

test('the Harness writer and the compose page never reach the context map or the context resolver (AGSC-07-30)', () => {
  const reached = reachable(HARNESS_ROOTS);
  assert.ok(reached.has('src/composition/compose.js'), 'the walk reaches the algebra, so it follows the requires');
  assert.ok(!reached.has(MAP_WRITER), `${MAP_WRITER} is reached from the Harness writer`);
  assert.ok(!reached.has(RESOLVER), `${RESOLVER} is reached from the Harness writer`);
});

test('only the compose verb writes the context map', () => {
  const users = sources().filter((file) => file.requires.some((s) => s.endsWith('/context-map.js'))).map((file) => file.rel);
  assert.deepStrictEqual(users, ['src/application/cli/verbs/compose.js']);
  assert.ok(!reachable(BUILD_ROOTS).has(MAP_WRITER), 'a build reaches the context-map writer');
});

test('no module a build reaches applies a crosswalk (AGSC-11-13, AGSC-11-24)', () => {
  const reached = reachable(BUILD_ROOTS);
  assert.ok(reached.has(FEDERATION), 'the walk reaches the federation module (peer citations), so the check below is not vacuous');
  const callers = sources().filter((file) => reached.has(file.rel) && file.rel !== FEDERATION && /contextMapResults\(/u.test(file.text))
    .map((file) => file.rel);
  assert.deepStrictEqual(callers, []);
  const definers = sources().filter((file) => /function contextMapResults\(/u.test(file.text)).map((file) => file.rel);
  assert.deepStrictEqual(definers, [FEDERATION]);
});
