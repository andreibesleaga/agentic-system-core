'use strict';
// AGSC-09-92 for this distribution: its own CI runs every validator on every pull
// request, and a failure fails the check. The workflow is read as data; it runs
// on GitHub, never here.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const ROOT = path.resolve(__dirname, '..', '..');
const FILE = path.join(ROOT, '.github', 'workflows', 'test.yml');

test('AGSC-09-92: the test workflow runs every validator, the suite and the rule matrix on every push and pull request', () => {
  const workflow = YAML.parse(fs.readFileSync(FILE, 'utf8'));
  assert.ok('pull_request' in workflow.on && 'push' in workflow.on);
  assert.deepStrictEqual(workflow.permissions, { contents: 'read' });
  const job = workflow.jobs.test;
  assert.deepStrictEqual(job.strategy.matrix.os.slice().sort(), ['macos-latest', 'ubuntu-latest', 'windows-latest']);
  assert.ok(job.strategy.matrix.node.some((n) => String(n).startsWith('22')) && job.strategy.matrix.node.includes('24'));
  for (const step of job.steps.filter((s) => s.uses)) {
    assert.match(step.uses, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/u, `${step.uses} is not pinned to a commit`);
  }
  const script = job.steps.map((s) => s.run || '').join('\n');
  assert.match(script, /npm ci/u);
  assert.match(script, /npm test/u);
  assert.match(script, /node tools\/rule-coverage --check/u);
  const validators = fs.readdirSync(path.join(ROOT, 'tools')).filter((n) => n.startsWith('validate-'));
  assert.strictEqual(validators.length, 7);
  for (const name of validators) assert.ok(script.includes(name), `${name} is not run by the workflow`);
});
