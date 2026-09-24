'use strict';
// The ProcessRunner port: no shell, a scrubbed environment, a timeout.

const test = require('node:test');
const assert = require('node:assert');
const { createProcessRunner, SCRUBBED_ENV, DEFAULT_TIMEOUT_MS } = require('../../src/adapters/node-proc.js');

test('a successful run returns code 0 and its stdout', () => {
  const r = createProcessRunner().run('node', ['-e', 'process.stdout.write("hi")']);
  assert.deepStrictEqual(r, { code: 0, stdout: 'hi', stderr: '' });
});

test('a failing run returns its exit code rather than throwing', () => {
  const r = createProcessRunner().run('node', ['-e', 'process.exit(3)']);
  assert.strictEqual(r.code, 3);
});

test('a program name outside the allow-list grammar is refused, never executed', () => {
  for (const bad of ['rm -rf /', './evil', 'a;b', '']) {
    assert.strictEqual(createProcessRunner().run(bad, []).code, 2, bad);
  }
  assert.strictEqual(createProcessRunner().run(7, []).code, 2);
});

test('the child environment is scrubbed: a secret in the parent never reaches it', () => {
  const runner = createProcessRunner({ env: { PATH: process.env.PATH, AGSC_SECRET: 'leak' } });
  const r = runner.run('node', ['-e', 'process.stdout.write(String(process.env.AGSC_SECRET))']);
  assert.strictEqual(r.stdout, 'undefined');
  assert.ok(SCRUBBED_ENV.includes('PATH'));
  assert.ok(!SCRUBBED_ENV.includes('AGSC_SECRET'));
  assert.strictEqual(typeof DEFAULT_TIMEOUT_MS, 'number');
});

test('a command that cannot be found is a code, not an exception', () => {
  const r = createProcessRunner().run('definitely-not-a-program-x9', []);
  assert.notStrictEqual(r.code, 0);
  assert.ok(r.stderr.length > 0);
});

// lens (b): the scrub copies only the names the parent actually SET. A
// mutation that inverted the `!== undefined` test survived the whole suite.
// The child's own runner may add names of its own (`NODE_V8_COVERAGE` under
// `--experimental-test-coverage`), so the assertions name what MUST and what
// MUST NOT be there rather than comparing the whole set.
test('AGSC-08-02: an unset name is not passed to the child, and nothing else is', () => {
  // PATH is the directory of the node running this test: a CI runner's node is not
  // in /usr/bin, and the runner takes a bare program name only, never a path.
  const runner = createProcessRunner({
    env: { PATH: require('node:path').dirname(process.execPath), HOME: '/home/a', SECRET: 'sh', AGSC_MODEL_API_KEY: 'k' },
  });
  const seen = runner.run('node', ['-e', 'process.stdout.write(Object.keys(process.env).sort().join(","))']);
  assert.strictEqual(seen.code, 0, seen.stderr);
  const names = new Set(seen.stdout.split(',').filter((n) => n !== ''));
  assert.ok(names.has('PATH'), 'a SET name of the scrub list is passed');
  assert.ok(names.has('HOME'), 'a SET name of the scrub list is passed');
  assert.ok(!names.has('LANG'), 'a name the parent never set is not invented');
  assert.ok(!names.has('LC_ALL'), 'a name the parent never set is not invented');
  assert.ok(!names.has('SOURCE_DATE_EPOCH'), 'a name the parent never set is not invented');
  assert.ok(!names.has('SECRET'), 'a name outside the scrub list never reaches the child');
  assert.ok(!names.has('AGSC_MODEL_API_KEY'), 'a credential never reaches the child');
  for (const name of names) {
    assert.ok(SCRUBBED_ENV.includes(name) || name.startsWith('NODE_'),
      `${name} is neither in the scrub list nor the test runner's own`);
  }
});
