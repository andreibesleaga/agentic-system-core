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
