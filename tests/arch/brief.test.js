'use strict';
// Fitness function: the brief stays beside the Harness and runs the same source in both hosts.
//
// Two rules of 1.1 that a later change could break without failing a vector:
//   * AGSC-07-25 with AGSC-07-12: the seven Harness file kinds are the same bytes whether or not a
//     brief is asked for (vector compose-0027 pins them). The Harness writer must therefore never
//     reach the brief writer; the brief is written by `composition/brief.js`, called by the
//     `compose` verb and by the tool `brief` of the local server (AGSC-09-13, which writes no
//     file), and emitted for the page by `composition/browser.js` alone.
//   * AGSC-07-25 with AGSC-07-13: the `/compose/` page computes the brief from the same source
//     text as the command line, so `composition/brief.js` requires nothing but the two portable
//     algebras (`compose.js`, `harness.js`), whose functions the page bundle carries.

const test = require('node:test');
const assert = require('node:assert');
const { reachable, sources } = require('./_scan.js');

const BRIEF = 'src/composition/brief.js';

test('the Harness writer never reaches the brief writer (AGSC-07-12, AGSC-07-25)', () => {
  const reached = reachable(['src/composition/harness.js']);
  assert.ok(reached.has('src/composition/compose.js'), 'the walk reaches the algebra, so it follows the requires');
  assert.ok(!reached.has(BRIEF), `${BRIEF} is reached from the Harness writer`);
});

test('only the compose verb, the tool server and the page bundle require the brief', () => {
  const users = sources().filter((file) => file.requires.some((s) => s.endsWith('/brief.js'))).map((file) => file.rel).sort();
  assert.deepStrictEqual(users, ['src/application/cli/verbs/compose.js', 'src/composition/browser.js',
    'src/distribution/mcp-tools.js']);
});

test('the brief requires only the two portable algebras, so the page can run its source (AGSC-07-13)', () => {
  const file = sources().find((f) => f.rel === BRIEF);
  assert.ok(file, `${BRIEF} was not scanned`);
  assert.deepStrictEqual([...file.requires].sort(), ['./compose.js', './harness.js']);
});
