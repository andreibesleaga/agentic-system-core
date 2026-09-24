'use strict';
// ACCEPTANCE — the persona scenarios of `features/*.feature`, EXECUTED.
//
// Every feature file is parsed with the Gherkin reference parser
// (`@cucumber/gherkin`, pinned) and compiled to pickles — one per Scenario and one
// per Examples row of a Scenario Outline. Each pickle runs as one test: its steps
// are matched, in order, against the step definitions of
// `tests/acceptance/steps/*.js` (exactly one definition must match each step), and
// the definitions drive the REAL command line, the real local MCP server and the
// shipped tools on a scratch copy of `tests/acceptance/bundle/`.
//
// A scenario that cannot run offline, or whose text asks for something the
// specification does not define, is listed in `tests/acceptance/pending.json` with
// its class and reason; it is reported as skipped and counted, never silently
// dropped. A scenario listed under `conditional` in the same file runs wherever
// the thing it names is present on the machine (a probe, never the network) and is
// reported as skipped, with the reason, where it is not. The last tests keep both
// lists honest: every entry names a scenario, every scenario that is not pending
// has a definition for every step, and every definition is used.
//
// Deterministic: fixed build instant, no network, scratch directories only.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const gherkin = require('@cucumber/gherkin');
const messages = require('@cucumber/messages');

const { World, pythonPackage } = require('./steps/_world.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FEATURES = path.join(ROOT, 'features');
const STEPS = path.join(__dirname, 'steps');
const PENDING = JSON.parse(fs.readFileSync(path.join(__dirname, 'pending.json'), 'utf8'));
const CLASSES = Object.freeze(Object.keys(PENDING.classes));
const CONDITIONAL = PENDING.conditional || {};
/** What a conditional scenario may need, and how its presence is probed. */
const PROBES = Object.freeze({ 'python-package': pythonPackage });

/** Every step definition: `{ pattern: string|RegExp, run(world, ...captures), file }`. */
const definitions = fs.readdirSync(STEPS).filter((f) => f.endsWith('.js') && !f.startsWith('_')).sort()
  .flatMap((f) => require(path.join(STEPS, f)).map((d) => ({ ...d, file: f })));

/** Every pickle of every feature file, with the file and scenario it came from. */
function pickles() {
  const out = [];
  for (const file of fs.readdirSync(FEATURES).filter((f) => f.endsWith('.feature')).sort()) {
    const ids = messages.IdGenerator.incrementing();
    const parser = new gherkin.Parser(new gherkin.AstBuilder(ids), new gherkin.GherkinClassicTokenMatcher());
    const document = parser.parse(fs.readFileSync(path.join(FEATURES, file), 'utf8'));
    const counts = new Map();
    for (const pickle of gherkin.compile(document, file, ids)) {
      const n = (counts.get(pickle.name) || 0) + 1;
      counts.set(pickle.name, n);
      out.push({ example: n, file, key: `${file}#${pickle.name}`, pickle });
    }
  }
  return out;
}

const ALL = pickles();

/** The definitions whose pattern matches one step text, with the captures. */
function matches(text) {
  const found = [];
  for (const d of definitions) {
    if (typeof d.pattern === 'string') {
      if (d.pattern === text) found.push({ captures: [], definition: d });
    } else {
      const m = d.pattern.exec(text);
      if (m) found.push({ captures: m.slice(1), definition: d });
    }
  }
  return found;
}

const persona = (file) => file.replace(/\.feature$/u, '');

for (const { example, file, key, pickle } of ALL) {
  const outline = ALL.filter((p) => p.key === key).length > 1 ? ` [example ${example}]` : '';
  const title = `${persona(file)} — ${pickle.name}${outline}`;
  const pending = PENDING.pending[key];
  if (pending) {
    test(title, { skip: `pending (${pending.class}): ${pending.reason}` }, () => {});
    continue;
  }
  const conditional = CONDITIONAL[key];
  const probe = conditional && PROBES[conditional.needs] ? PROBES[conditional.needs]() : null;
  if (probe && !probe.available) {
    test(title, { skip: `not available here (${conditional.needs}): ${probe.reason}. ${conditional.reason}` }, () => {});
    continue;
  }
  test(title, async () => {
    const world = new World();
    try {
      for (const step of pickle.steps) {
        const found = matches(step.text);
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

test('the pending list is well formed and names only scenarios that exist', () => {
  const keys = new Set(ALL.map((p) => p.key));
  for (const [key, entry] of Object.entries(PENDING.pending)) {
    assert.ok(keys.has(key), `pending entry "${key}" names no scenario of features/`);
    assert.ok(CLASSES.includes(entry.class), `pending entry "${key}" has class "${entry.class}"`);
    assert.ok(typeof entry.reason === 'string' && entry.reason.length >= 30, `pending entry "${key}" states no reason`);
  }
});

test('the conditional list is well formed, names only scenarios that exist, and none of them is also pending', () => {
  const keys = new Set(ALL.map((p) => p.key));
  for (const [key, entry] of Object.entries(CONDITIONAL)) {
    assert.ok(keys.has(key), `conditional entry "${key}" names no scenario of features/`);
    assert.ok(Object.prototype.hasOwnProperty.call(PROBES, entry.needs), `conditional entry "${key}" needs "${entry.needs}"`);
    assert.ok(typeof entry.reason === 'string' && entry.reason.length >= 30, `conditional entry "${key}" states no reason`);
    assert.ok(!PENDING.pending[key], `"${key}" is both pending and conditional`);
  }
});

test('every step of every scenario that runs has exactly one definition, and every definition is used', () => {
  const used = new Set();
  for (const { key, pickle } of ALL) {
    const pending = PENDING.pending[key];
    if (pending && pending.class !== 'gap') continue;
    for (const step of pickle.steps) {
      const found = matches(step.text);
      // A gap scenario waits for the engine; where its steps are already written,
      // they are held to the same one-definition rule and count as used.
      if (pending && found.length === 0) continue;
      assert.strictEqual(found.length, 1, `${key}: step "${step.text}" matches ${found.length} definitions`);
      used.add(found[0].definition);
    }
  }
  for (const d of definitions) {
    assert.ok(used.has(d), `${d.file}: definition ${d.pattern} is used by no scenario that runs or waits on a gap`);
  }
});

test('scenario totals per persona are reported', (t) => {
  const byPersona = new Map();
  for (const { file, key } of ALL) {
    const row = byPersona.get(persona(file)) || { conditional: 0, pending: 0, run: 0, total: 0 };
    row.total += 1;
    if (PENDING.pending[key]) row.pending += 1; else row.run += 1;
    if (CONDITIONAL[key]) row.conditional += 1;
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
