'use strict';
// tests/connectors/entry-points.test.js — the two consumer entry points at the
// repository root (CONN-1): the composite GitHub Action `action.yml` and the
// pre-commit hook file `.pre-commit-hooks.yaml`. Each is PARSED and checked against
// the format its owner documents (read 2026-09-23, quotes in the CONN-1 report):
//
//   GitHub: "the metadata filename must be either `action.yml` or `action.yaml`";
//   `runs.using` "You must set this value to 'composite'"; a composite action's
//   `outputs.<output_id>.value` is required; a `run` step names its `shell`.
//   pre-commit: a hook repository "must contain a `.pre-commit-hooks.yaml` file";
//   every hook needs `id`, `name`, `entry` and `language`.

const test = require('node:test');
const assert = require('node:assert');
const nodeFs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const ROOT = path.resolve(__dirname, '..', '..');
const parse = (file) => YAML.parse(nodeFs.readFileSync(path.join(ROOT, file), 'utf8'));

test('action.yml: a composite action at the repository root', () => {
  assert.ok(nodeFs.existsSync(path.join(ROOT, 'action.yml')));
  assert.ok(!nodeFs.existsSync(path.join(ROOT, 'action.yaml')), 'two metadata files');
  const action = parse('action.yml');
  for (const key of ['name', 'description', 'runs']) assert.ok(action[key], `missing ${key}`);
  assert.strictEqual(action.runs.using, 'composite');
  assert.ok(Array.isArray(action.runs.steps) && action.runs.steps.length > 0);
  for (const [id, output] of Object.entries(action.outputs)) {
    assert.match(String(output.value), /^\$\{\{ steps\.[a-z-]+\.outputs\.[a-z-]+ \}\}$/u, `outputs.${id}.value`);
  }
  for (const [id, input] of Object.entries(action.inputs)) assert.ok(input.description, `inputs.${id}`);
});

test('action.yml runs agsc ci with the engine pinned to the action\'s own ref', () => {
  const steps = parse('action.yml').runs.steps;
  const ci = steps.find((s) => s.id === 'ci');
  assert.match(ci.run, /node "\$GITHUB_ACTION_PATH\/bin\/agsc\.js" ci /u);
  const install = steps.find((s) => s.id === 'engine');
  assert.match(install.run, /cd "\$GITHUB_ACTION_PATH"\n/u);
  assert.match(install.run, /npm ci --omit=dev --ignore-scripts/u, 'the install runs package scripts or dev dependencies');
  for (const step of steps) if (step.run !== undefined) assert.strictEqual(step.shell, 'bash', `${step.name} names no shell`);
});

test('action.yml: least privilege — pinned actions, no token, no secret, no input in a script', () => {
  const text = nodeFs.readFileSync(path.join(ROOT, 'action.yml'), 'utf8');
  const action = YAML.parse(text);
  for (const step of action.runs.steps) {
    if (step.uses !== undefined) assert.match(step.uses, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/u, `${step.uses} is not pinned to a commit`);
    // An input interpolated into a script is a script-injection path; inputs travel as env.
    if (step.run !== undefined) assert.doesNotMatch(step.run, /\$\{\{/u, `${step.name} interpolates an expression into its script`);
  }
  assert.doesNotMatch(text, /secrets\.|GITHUB_TOKEN|github\.token/u);
  assert.match(text, /permissions:\n#\s+contents: read/u, 'the header does not state the one permission needed');
});

test('.pre-commit-hooks.yaml: one hook, lint on commit, over the whole Bundle', () => {
  const hooks = parse('.pre-commit-hooks.yaml');
  assert.ok(Array.isArray(hooks));
  assert.deepStrictEqual(hooks.map((h) => h.id), ['agsc-lint']);
  const [hook] = hooks;
  for (const key of ['id', 'name', 'entry', 'language']) assert.ok(hook[key], `missing ${key}`);
  assert.strictEqual(hook.entry, 'agsc lint');
  assert.strictEqual(hook.language, 'node');
  assert.strictEqual(hook.pass_filenames, false, 'lint reads the whole Bundle, not the staged names');
  const files = new RegExp(hook.files, 'u');
  assert.ok(files.test('content/concepts/x.md') && files.test('agsc.config.json'));
  assert.ok(!files.test('src/index.js'));
  // The entry is the package's own bin, so pre-commit's node install provides it.
  assert.strictEqual(JSON.parse(nodeFs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).bin.agsc, 'bin/agsc.js');
});

test('the README says how to use both', () => {
  const readme = nodeFs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.match(readme, /uses: andreibesleaga\/agentic-system-core@/u);
  assert.match(readme, /id: agsc-lint/u);
});
