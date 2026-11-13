'use strict';
// Requirement: PRD-082 (docs/PRD.md).
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
//   * AGSC-07-29: the blueprint outputs are written beside the Harness like the brief, from the
//     brief's own parts: `composition/blueprint.js` requires the two algebras and the brief and
//     nothing else, the Harness writer never reaches it, and only the `compose` verb and the page
//     bundle require it.
// The build reads the brief too, for the brief shown on an architecture's item page
// (`distribution/architecture-brief.js`) and for the domain parts of an item page
// (`distribution/domain-view.js` reads `domainOf`, the one reader of the parts that the brief and
// the tools share, AGSC-06-38, AGSC-07-25, AGSC-09-13), and writes no brief file.

const test = require('node:test');
const assert = require('node:assert');
const { reachable, sources } = require('./_scan.js');

const BRIEF = 'src/composition/brief.js';
const BLUEPRINT = 'src/composition/blueprint.js';

test('the Harness writer never reaches the brief writer or the blueprint writer (AGSC-07-12, AGSC-07-25, AGSC-07-29)', () => {
  const reached = reachable(['src/composition/harness.js']);
  assert.ok(reached.has('src/composition/compose.js'), 'the walk reaches the algebra, so it follows the requires');
  assert.ok(!reached.has(BRIEF), `${BRIEF} is reached from the Harness writer`);
  assert.ok(!reached.has(BLUEPRINT), `${BLUEPRINT} is reached from the Harness writer`);
});

test('only the compose verb, the blueprint, the tool server, the item-page views and the page bundle require the brief', () => {
  const users = sources().filter((file) => file.requires.some((s) => s.endsWith('/brief.js'))).map((file) => file.rel).sort();
  assert.deepStrictEqual(users, ['src/application/cli/verbs/compose.js', 'src/composition/blueprint.js',
    'src/composition/browser.js', 'src/distribution/architecture-brief.js', 'src/distribution/domain-view.js',
    'src/distribution/mcp-tools.js']);
});

test('only the compose verb and the page bundle require the blueprint writer (AGSC-07-29)', () => {
  const users = sources().filter((file) => file.requires.some((s) => s.endsWith('/blueprint.js'))).map((file) => file.rel).sort();
  assert.deepStrictEqual(users, ['src/application/cli/verbs/compose.js', 'src/composition/browser.js']);
});

test('the blueprint requires only the two portable algebras and the brief, so the page can run its source (AGSC-07-13)', () => {
  const file = sources().find((f) => f.rel === BLUEPRINT);
  assert.ok(file, `${BLUEPRINT} was not scanned`);
  assert.deepStrictEqual([...file.requires].sort(), ['./brief.js', './compose.js', './harness.js']);
});

test('the brief requires only the two portable algebras, so the page can run its source (AGSC-07-13)', () => {
  const file = sources().find((f) => f.rel === BRIEF);
  assert.ok(file, `${BRIEF} was not scanned`);
  assert.deepStrictEqual([...file.requires].sort(), ['./compose.js', './harness.js']);
});
