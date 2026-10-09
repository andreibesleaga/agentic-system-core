'use strict';
// ACCEPTANCE — the persona scenarios of `features/*.feature`, EXECUTED.
//
// Every feature file is parsed with the Gherkin reference parser
// (`@cucumber/gherkin`, pinned) and compiled to pickles — one per Scenario and one
// per Examples row of a Scenario Outline. Each pickle runs as one test: its steps
// are matched, in order, against the step definitions of
// `tests/acceptance/steps/` (the persona files and the shared `_common.js`;
// exactly one definition must match each step), and the definitions drive the
// REAL command line, the real local MCP server and the shipped tools on a scratch
// copy of `tests/acceptance/bundle/`.
//
// A scenario that does not run as written in this offline lane has ONE file of its
// own under `tests/acceptance/pending/` — `<feature-stem>--<scenario-slug>.json`
// with its class and a sentence of reason (`_runner.js` holds the rules, and
// `pending/README.md` the classes). It is reported as skipped and counted, never
// silently dropped. A `conditional` scenario runs wherever the thing it `needs` is
// present on the machine (its probe module `steps/_<needs>.js` decides, never
// through the network) and is reported as skipped, with the reason, where it is
// not; until its probe module exists it runs nowhere and counts as pending. A
// `gap` scenario waits for the engine: its steps are written, and the change named
// in `closes_in` makes it run and deletes its file. The last tests keep all of
// this honest: every pending file is well formed and names a scenario, every
// phrase has one definition, every scenario that runs has a definition for every
// step, and every persona definition is used.
//
// Deterministic: fixed build instant, no network, scratch directories only.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const runner = require('./_runner.js');
const { World } = require('./steps/_world.js');

const ROOT = path.resolve(__dirname, '..', '..');
const STEPS = path.join(__dirname, 'steps');
const ALL = runner.readPickles(path.join(ROOT, 'features'));
const PENDING = runner.readPending(path.join(__dirname, 'pending'), new Set(ALL.map((p) => p.key)));
const definitions = runner.loadDefinitions(STEPS);

const persona = (file) => file.replace(/\.feature$/u, '');

for (const { example, file, key, pickle } of ALL) {
  const outline = ALL.filter((p) => p.key === key).length > 1 ? ` [example ${example}]` : '';
  const title = `${persona(file)} — ${pickle.name}${outline}`;
  const { skip } = runner.disposition(PENDING.entries.get(key), STEPS);
  if (skip) {
    test(title, { skip }, () => {});
    continue;
  }
  test(title, async () => {
    const world = new World();
    try {
      for (const step of pickle.steps) {
        const found = runner.matches(definitions, step.text);
        assert.strictEqual(found.length, 1,
          `step "${step.text}" matches ${found.length} definitions (${found.map((f) => f.definition.file).join(', ')})`);
        const argument = step.argument ? (step.argument.dataTable || step.argument.docString) : undefined;
        await found[0].definition.run(world, ...found[0].captures, argument);
      }
    } finally {
      await world.close();
    }
  });
}

test('every pending file is well formed, of a class of the closed list, and names a scenario that exists', () => {
  const problems = [...PENDING.problems, ...runner.slugCollisions(ALL)];
  assert.deepStrictEqual(problems.map((p) => `${p.code} ${p.file}: ${p.message}`), []);
});

test('no phrase has two definitions across the step files', () => {
  assert.deepStrictEqual(runner.duplicatePhrases(definitions).map((p) => `${p.code} ${p.file}: ${p.message}`), []);
});

test('every step of every scenario that runs has exactly one definition, and every persona definition is used', () => {
  const used = new Set();
  for (const { key, pickle } of ALL) {
    const entry = PENDING.entries.get(key);
    const runs = runner.disposition(entry, STEPS).counted === 'run';
    // A gap, or a conditional scenario whose probe is not written yet, waits: where
    // its steps are already written they are held to the same one-definition rule
    // and count as used. A forge, model or external scenario is not checked.
    const waits = entry && !runs && (entry.class === 'gap' || entry.class === 'conditional');
    if (!runs && !waits) continue;
    for (const step of pickle.steps) {
      const found = runner.matches(definitions, step.text);
      if (waits && found.length === 0) continue;
      assert.strictEqual(found.length, 1, `${key}: step "${step.text}" matches ${found.length} definitions`);
      used.add(found[0].definition);
    }
  }
  // The shared phrases are exercised by common-steps.test.js before a scenario uses them.
  for (const d of definitions.filter((x) => x.file !== runner.SHARED)) {
    assert.ok(used.has(d), `${d.file}: definition ${d.pattern} is used by no scenario that runs or waits`);
  }
});

test('scenario totals per persona are reported', (t) => {
  const byPersona = new Map();
  for (const { file, key } of ALL) {
    const row = byPersona.get(persona(file)) || { conditional: 0, pending: 0, run: 0, total: 0 };
    const entry = PENDING.entries.get(key);
    const { counted } = runner.disposition(entry, STEPS);
    row.total += 1;
    row[counted] += 1;
    if (entry && entry.class === 'conditional' && counted === 'run') row.conditional += 1;
    byPersona.set(persona(file), row);
  }
  let total = 0;
  let run = 0;
  for (const [name, row] of byPersona) {
    const where = row.conditional ? ` (${row.conditional} of them only where its conditional need is present)` : '';
    t.diagnostic(`${name}: ${row.total} scenario(s), ${row.run} run${where}, ${row.pending} pending`);
    total += row.total;
    run += row.run;
  }
  t.diagnostic(`all personas: ${total} scenario(s), ${run} run, ${total - run} pending`);
  assert.ok(total > 0);
});
