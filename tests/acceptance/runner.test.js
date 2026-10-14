'use strict';
// The acceptance runner's own rules (`tests/acceptance/_runner.js`), each shown on a
// small scratch tree: one file per pending scenario under `pending/`, its closed
// classes, the `gap` class and its `closes_in`, the refused class `drift`, the
// `conditional` class and its probe module, and one definition per step phrase
// across every step file. Deterministic, offline; scratch directories are removed.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const runner = require('./_runner.js');

const FEATURE = [
  '@persona-x',
  'Feature: A persona',
  '',
  '  Scenario: Runs offline',
  '    Given a thing',
  '',
  '  Scenario: Needs a forge — and a "quoted" word',
  '    Given a thing',
  '',
  '  Scenario: Waits on the engine',
  '    Given a thing',
  '',
].join('\n');

const REASON = 'a sentence of reason that is long enough to read';

/** A scratch tree: features/, pending/ and steps/ under one directory. */
function tree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-runner-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), typeof text === 'string' ? text : `${JSON.stringify(text, null, 2)}\n`);
  }
  for (const sub of ['features', 'pending', 'steps']) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  return dir;
}

function pendingOf(dir) {
  const keys = new Set(runner.readPickles(path.join(dir, 'features')).map((p) => p.key));
  return runner.readPending(path.join(dir, 'pending'), keys);
}

function codes(problems) {
  return problems.map((p) => `${p.code} ${p.file}: ${p.message}`).join('\n');
}

test('a scenario name becomes a lower-case ASCII slug, and the file name joins it to the feature stem', () => {
  assert.strictEqual(runner.scenarioSlug('Needs a forge — and a "quoted" word'), 'needs-a-forge-and-a-quoted-word');
  assert.strictEqual(runner.scenarioSlug('Café: the .env file'), 'cafe-the-env-file');
  assert.strictEqual(runner.scenarioSlug(`${'word '.repeat(40)}end`).length <= 100, true);
  assert.ok(!runner.scenarioSlug(`${'word '.repeat(40)}end`).endsWith('-'));
  assert.strictEqual(runner.pendingFileName('persona-x.feature', 'Runs offline'), 'persona-x--runs-offline.json');
});

test('a well-formed pending file of each class is read, keyed by its feature and scenario', () => {
  const dir = tree({
    'features/persona-x.feature': FEATURE,
    'pending/persona-x--needs-a-forge-and-a-quoted-word.json':
      { class: 'forge', reason: REASON, scenario: 'Needs a forge — and a "quoted" word' },
    'pending/persona-x--waits-on-the-engine.json':
      { class: 'gap', closes_in: 'E4', reason: REASON, scenario: 'Waits on the engine' },
    'pending/persona-x--runs-offline.json':
      { class: 'conditional', needs: 'browser', reason: REASON, scenario: 'Runs offline' },
    'pending/README.md': '# not a pending file, and allowed\n',
  });
  try {
    const { entries, problems } = pendingOf(dir);
    assert.deepStrictEqual(problems, [], codes(problems));
    assert.deepStrictEqual([...entries.keys()].sort(), [
      'persona-x.feature#Needs a forge — and a "quoted" word',
      'persona-x.feature#Runs offline',
      'persona-x.feature#Waits on the engine',
    ]);
    assert.strictEqual(entries.get('persona-x.feature#Waits on the engine').closes_in, 'E4');
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test('a pending file naming no scenario of features/ is AGSC-E301', () => {
  const dir = tree({
    'features/persona-x.feature': FEATURE,
    'pending/persona-x--gone.json': { class: 'forge', reason: REASON, scenario: 'Gone' },
  });
  try {
    const { problems } = pendingOf(dir);
    assert.match(codes(problems), /^AGSC-E301 pending\/persona-x--gone\.json: .*names no scenario of features\//mu);
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test('a gap file without closes_in, or with one that names no package, fails', () => {
  const dir = tree({
    'features/persona-x.feature': FEATURE,
    'pending/persona-x--waits-on-the-engine.json': { class: 'gap', reason: REASON, scenario: 'Waits on the engine' },
    'pending/persona-x--runs-offline.json': { class: 'gap', closes_in: 'the next one', reason: REASON, scenario: 'Runs offline' },
  });
  try {
    const text = codes(pendingOf(dir).problems);
    assert.match(text, /^AGSC-E202 pending\/persona-x--waits-on-the-engine\.json: .*closes_in/mu);
    assert.match(text, /^AGSC-E204 pending\/persona-x--runs-offline\.json: .*closes_in/mu);
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test('the class drift is refused, and so is any class outside the closed list', () => {
  const dir = tree({
    'features/persona-x.feature': FEATURE,
    'pending/persona-x--runs-offline.json': { class: 'drift', reason: REASON, scenario: 'Runs offline' },
    'pending/persona-x--waits-on-the-engine.json': { class: 'browser', reason: REASON, scenario: 'Waits on the engine' },
  });
  try {
    const text = codes(pendingOf(dir).problems);
    assert.match(text, /^AGSC-E203 pending\/persona-x--runs-offline\.json: .*"drift".*rewritten/mu);
    assert.match(text, /^AGSC-E203 pending\/persona-x--waits-on-the-engine\.json: .*"browser"/mu);
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test('a short reason, a missing need, a stray member and a file name that is not the scenario slug fail', () => {
  const dir = tree({
    'features/persona-x.feature': FEATURE,
    'pending/persona-x--runs-offline.json': { class: 'forge', reason: 'too short', scenario: 'Runs offline' },
    'pending/persona-x--waits-on-the-engine.json': { class: 'conditional', reason: REASON, scenario: 'Waits on the engine' },
    'pending/persona-x--needs-a-forge-and-a-quoted-word.json':
      { class: 'model', closes_in: 'E4', reason: REASON, scenario: 'Needs a forge — and a "quoted" word', why: 'x' },
    'pending/persona-x--some-other-name.json': { class: 'forge', reason: REASON, scenario: 'Runs offline' },
    'pending/not-json.json': '{ "class": ',
  });
  try {
    const text = codes(pendingOf(dir).problems);
    assert.match(text, /^AGSC-E202 pending\/persona-x--runs-offline\.json: .*reason/mu);
    assert.match(text, /^AGSC-E202 pending\/persona-x--waits-on-the-engine\.json: .*needs/mu);
    assert.match(text, /^AGSC-E201 pending\/persona-x--needs-a-forge-and-a-quoted-word\.json: .*"why"/mu);
    assert.match(text, /^AGSC-E201 pending\/persona-x--needs-a-forge-and-a-quoted-word\.json: .*closes_in/mu);
    assert.match(text, /^AGSC-E204 pending\/persona-x--some-other-name\.json: .*persona-x--runs-offline\.json/mu);
    assert.match(text, /^AGSC-E201 pending\/not-json\.json: /mu);
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test('two scenarios of one feature whose names give one slug are refused', () => {
  const dir = tree({
    'features/persona-x.feature': `${FEATURE}\n  Scenario: Runs, offline\n    Given a thing\n`,
  });
  try {
    const problems = runner.slugCollisions(runner.readPickles(path.join(dir, 'features')));
    assert.match(codes(problems), /^AGSC-E206 features\/persona-x\.feature: .*runs-offline/mu);
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test('two step files defining one phrase fail, whether as two strings or as a string a pattern also matches', () => {
  const dir = tree({
    'steps/persona-x.js': "module.exports = [{ pattern: 'a thing', run() {} }, { pattern: /^an? (other|second) thing$/u, run() {} }];\n",
    'steps/persona-y.js': "module.exports = [{ pattern: 'a thing', run() {} }, { pattern: 'a second thing', run() {} }];\n",
    'steps/_common.js': "module.exports = [{ pattern: 'a shared thing', run() {} }];\n",
    'steps/_helper.js': "module.exports = [{ pattern: 'never loaded as a definition', run() {} }];\n",
  });
  try {
    const definitions = runner.loadDefinitions(path.join(dir, 'steps'));
    assert.deepStrictEqual(definitions.map((d) => d.file).sort(),
      ['_common.js', 'persona-x.js', 'persona-x.js', 'persona-y.js', 'persona-y.js']);
    const text = codes(runner.duplicatePhrases(definitions));
    assert.match(text, /a thing.*persona-x\.js.*persona-y\.js/u);
    assert.match(text, /a second thing.*persona-y\.js.*persona-x\.js/u);
    assert.strictEqual(runner.matches(definitions, 'a shared thing').length, 1);
    assert.deepStrictEqual(runner.matches(definitions, 'an other thing')[0].captures, ['other']);
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test('what a pending file means for the run: skipped, counted, or run where its need is present', () => {
  const dir = tree({
    'steps/_present.js': "module.exports = { probe: () => ({ available: true, reason: '' }) };\n",
    'steps/_absent.js': "module.exports = { probe: () => ({ available: false, reason: 'no such thing here' }) };\n",
  });
  const steps = path.join(dir, 'steps');
  try {
    assert.deepStrictEqual(runner.disposition(undefined, steps), { counted: 'run', skip: null });
    const gap = runner.disposition({ class: 'gap', closes_in: 'E4', reason: REASON }, steps);
    assert.strictEqual(gap.counted, 'pending');
    assert.match(gap.skip, /^pending \(gap, closes in E4\): a sentence/u);
    const forge = runner.disposition({ class: 'forge', reason: REASON }, steps);
    assert.match(forge.skip, /^pending \(forge\): /u);
    const unwired = runner.disposition({ class: 'conditional', needs: 'browser', reason: REASON }, steps);
    assert.strictEqual(unwired.counted, 'pending');
    assert.match(unwired.skip, /no probe.*_browser\.js/u);
    const absent = runner.disposition({ class: 'conditional', needs: 'absent', reason: REASON }, steps);
    assert.strictEqual(absent.counted, 'run');
    assert.match(absent.skip, /^not available here \(absent\): no such thing here\. a sentence/u);
    assert.deepStrictEqual(runner.disposition({ class: 'conditional', needs: 'present', reason: REASON }, steps),
      { counted: 'run', skip: null });
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});
