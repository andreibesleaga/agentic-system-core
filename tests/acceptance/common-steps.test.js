'use strict';
// The shared step phrases of `tests/acceptance/steps/_common.js`, each driven
// through the same matcher the scenario runner uses, before any feature file uses
// it: every phrase below must match exactly one definition across all step files,
// that definition must be the shared one, and every shared definition must be
// exercised here at least once. A persona file reuses these phrases instead of
// writing its own, so one phrase never has two definitions.
//
// Deterministic: the World's fixed build instant and git dates; nothing reaches
// the network except the loopback server one walk starts and stops.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const runner = require('./_runner.js');
const { World } = require('./steps/_world.js');

const STEPS = path.join(__dirname, 'steps');
const definitions = runner.loadDefinitions(STEPS);
const shared = definitions.filter((d) => d.file === '_common.js');
const used = new Set();

/**
 * Run one walk: each entry is a step text, `[text, argument]` for a table or doc
 * string, or a function that changes the scratch world between two steps.
 */
async function walk(steps) {
  const world = new World();
  try {
    for (const entry of steps) {
      if (typeof entry === 'function') { entry(world); continue; }
      const [text, argument] = Array.isArray(entry) ? entry : [entry, undefined];
      const found = runner.matches(definitions, text);
      assert.strictEqual(found.length, 1, `"${text}" matches ${found.length} definitions`);
      assert.strictEqual(found[0].definition.file, '_common.js', `"${text}" is defined in ${found[0].definition.file}`);
      used.add(found[0].definition);
      await found[0].definition.run(world, ...found[0].captures, argument);
    }
  } finally {
    await world.close();
  }
}

/** A Gherkin data table as the runner hands it to a step: rows of cells. */
const table = (rows) => ({ rows: rows.map((cells) => ({ cells: cells.map((value) => ({ value })) })) });

test('build, lint and ci --json on a scratch git history, with no network call', async () => {
  await walk([
    'a fresh copy of the acceptance Bundle',
    'the Bundle is a git repository of one commit with fixed dates',
    'the Bundle is built',
    'the Bundle holds "www/index.html"',
    'the author runs "agsc lint --json"',
    'the command exits 0',
    'the JSON envelope\'s status is "pass"',
    'the maintainer runs "agsc ci --json" under the network trap',
    'the command exits 0',
    'no network call was attempted',
    'the JSON envelope carries no "AGSC-E403"',
    'the author runs "agsc build"',
    'the output names "build: pass"',
  ]);
});

test('a tracked .env is refused by ci with AGSC-E403', async () => {
  await walk([
    'a fresh copy of the acceptance Bundle',
    'a ".env" file is tracked in the Bundle\'s git history',
    'the reviewer runs "agsc ci --json"',
    'the command exits 1',
    'the JSON envelope\'s status is "fail"',
    'the JSON envelope carries the error "AGSC-E403"',
  ]);
});

test('commits with given trailers, on the fixed dates', async () => {
  const signed = ['Signed-off-by: A Contributor <contributor', 'example.org>'].join('@');
  await walk([
    'a fresh copy of the acceptance Bundle',
    'the Bundle is a git repository of one commit with fixed dates',
    `a commit "Fix a typo" carrying the trailer "${signed}"`,
    `the last commit carries the trailer "${signed}"`,
    ['a commit "Two trailers" carrying these trailers:', table([
      ['Signed-off-by', ['A Contributor <contributor', 'example.org>'].join('@')],
      ['Assisted-by', 'an assistant'],
    ])],
    'the last commit carries the trailer "Assisted-by: an assistant"',
    'the Bundle is built',
  ]);
});

test('the environment of the next command: a variable set, a variable removed', async () => {
  await walk([
    'a fresh copy of the acceptance Bundle',
    'the environment variable "SOURCE_DATE_EPOCH" is unset',
    'the author runs "agsc build --json"',
    'the command exits 0',
    'the JSON envelope carries the warning "AGSC-E606"',
    'a fresh copy of the acceptance Bundle',
    'the environment variable "SOURCE_DATE_EPOCH" is "1767225600"',
    'the environment variable "AGSC_BUILD_OUT" is "site-out"',
    'the author runs "agsc build --json"',
    'the command exits 0',
    'the JSON envelope carries no "AGSC-E606"',
    'the Bundle holds "site-out/index.html"',
    'the Bundle does not hold "www/index.html"',
  ]);
});

test('the built node served on loopback passes the shipped checker at Level 2', async () => {
  await walk([
    'a fresh copy of the acceptance Bundle',
    'the Bundle is built and served on loopback',
    'the shipped validate-wellknown passes at Level 2 over loopback',
    (world) => fs.rmSync(path.join(world.dir, 'www', 'llms.txt')),
    'the shipped validate-wellknown fails at Level 2 over loopback',
  ]);
});

test('every shared definition is exercised above, and each is defined once across all step files', () => {
  for (const d of shared) assert.ok(used.has(d), `_common.js: ${d.pattern} is exercised by no walk of this file`);
  assert.deepStrictEqual(runner.duplicatePhrases(definitions), []);
});
