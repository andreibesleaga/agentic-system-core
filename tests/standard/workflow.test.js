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
  // The release gate's loop `for t in tools/validate-*` runs every validator but the one
  // that needs an argument, which has its own steps; a validator named one by one also counts.
  const loop = /for t in tools\/validate-\*; do\n\s+case "\$t" in \*\/validate-wellknown\) continue ;; esac\n\s+node "\$t" --json\n\s*done/u.test(script);
  for (const name of validators) {
    assert.ok(script.includes(name) || (loop && name !== 'validate-wellknown'), `${name} is not run by the workflow`);
  }
});

// Verification finding P3 (2026-10-06): fourteen gate steps of the release workflow ran
// only on the tag push, after the permanent tag was public — which is how the rc.6
// release failed on Windows. Every step of the release gates now runs on every push, on
// the same six legs, so a tag is never the first time a gate runs.
test('P3: every step of the release gates also runs on every push, on the same six legs', () => {
  const release = YAML.parse(fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8')).jobs.verify;
  const push = YAML.parse(fs.readFileSync(FILE, 'utf8')).jobs.test;
  assert.deepStrictEqual(push.strategy.matrix, release.strategy.matrix, 'the same operating systems and Node lines');
  const norm = (step) => JSON.stringify({ env: step.env || {}, run: String(step.run).trim(), shell: step.shell || null });
  const onPush = new Set(push.steps.filter((s) => s.run).map(norm));
  const gates = release.steps.filter((s) => s.run);
  assert.ok(gates.length >= 14, `only ${gates.length} release gate steps were read`);
  const missing = gates.filter((s) => !onPush.has(norm(s))).map((s) => s.name || s.run);
  assert.deepStrictEqual(missing, [], `release gate steps the push workflow does not run: ${missing.join(' | ')}`);
});
