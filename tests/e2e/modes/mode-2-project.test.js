'use strict';
// verifies AGSC-08-09, AGSC-08-12, AGSC-01-28, AGSC-02-99, AGSC-03-01
// MODE 2 — live specs and project memory: decisions, specs, tasks and gates are
// items; `ci` compiles the gate into forge files whose required check is one a CI job
// really reports; the steer files are the same bytes for every assistant; and a
// person reading the pages sees a task's state, a gate's checks and an item's typed
// Links without opening the graph.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const kit = require('./_kit.js');
const forge = require('../../../src/distribution/forge.js');

test('Mode 2, a person and a CI job: the gate compiles to a ruleset whose required check a job reports', () => {
  const dir = kit.projectBundle('m2');
  kit.write(dir, 'content/gates/merge-gate.md', kit.item({
    type: 'gate', title: 'Merge gate', level: 'L2', checks: ['schema', 'links', 'review'],
    enforce: ['status-check', 'ruleset'], prov: kit.PROV,
  }, '# Merge gate\n\nEvery change passes these checks before it merges.'));
  kit.write(dir, 'content/concepts/decide-the-login.md', kit.item({
    type: 'concept', title: 'Decide the login',
    description: 'The decision to build the login form first, which the tests task depends on and cites.',
    clusters: ['login'], prov: kit.PROV, kind: 'decision', contradicts: ['supervisor'],
  }, '## Decision\n\nBuild the form first.'));
  kit.write(dir, 'content/concepts/task-login-tests.md', kit.read(dir, 'content/concepts/task-login-tests.md')
    .replace('task_state: TASK_STATE_SUBMITTED', 'task_state: TASK_STATE_WORKING\nblocked-by:\n  - task-login-form'));
  kit.commitAll(dir, 'the project');

  const ci = kit.agsc(dir, ['ci']);
  assert.strictEqual(ci.code, 0, ci.stderr);
  const ruleset = JSON.parse(kit.read(dir, 'dist/forge/ruleset.json'));
  const statusChecks = JSON.parse(kit.read(dir, 'dist/forge/status-checks.json'));
  assert.deepStrictEqual(statusChecks, ['links', 'review', 'schema'], 'status-checks.json keeps the pinned gate checks');
  // The ruleset requires only names a job reports: the job that runs `agsc ci`, whose
  // name the action's usage shows. Requiring "schema" or "links" would block every merge.
  assert.deepStrictEqual(ruleset.rules.required_status_checks, [forge.CI_CHECK]);
  assert.match(kit.read(kit.ROOT, 'action.yml'), new RegExp(`name: ${forge.CI_CHECK}\\b`, 'u'));
  const gate = JSON.parse(kit.read(dir, 'dist/gate.json'));
  assert.strictEqual(gate.status, 'pass');

  // The steer files an assistant reads are one set of bytes.
  const steer = kit.agsc(dir, ['export', '--steer']);
  assert.strictEqual(steer.code, 0, steer.stderr);
  assert.strictEqual(kit.read(dir, 'dist/export/steer/AGENTS.md'), kit.read(dir, 'dist/export/steer/CLAUDE.md'));

  // A person reads the pages: the task's state and dependency, the gate's level and
  // checks, the decision's typed Links.
  assert.strictEqual(kit.agsc(dir, ['build']).code, 0);
  const task = kit.read(dir, 'www/concepts/task-login-tests/index.html');
  assert.match(task, /<dt>Task state<\/dt><dd><code>TASK_STATE_WORKING<\/code><\/dd>/u);
  assert.match(task, /<code>blocked-by<\/code>: <a href="\/concepts\/task-login-form\/">Build the login form<\/a>/u);
  const gatePage = kit.read(dir, 'www/gates/merge-gate/index.html');
  assert.match(gatePage, /<dt>Level<\/dt><dd><code>L2<\/code><\/dd>/u);
  assert.match(gatePage, /<dt>Checks<\/dt><dd><code>schema<\/code>, <code>links<\/code>, <code>review<\/code><\/dd>/u);
  const decision = kit.read(dir, 'www/concepts/decide-the-login/index.html');
  assert.match(decision, /<code>contradicts<\/code>: <a href="\/concepts\/supervisor\/">/u);
  assert.ok(path.isAbsolute(dir));
});
