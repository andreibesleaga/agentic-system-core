// tests/cli/flags.test.js — AGSC-09-07..09.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { main } = require('../../../src/application/cli/main.js');

function captureStream() {
  const chunks = [];
  return { write: (s) => chunks.push(s), text: () => chunks.join('') };
}

test('cli-0005: an unknown verb exits 2 with AGSC-E001 and empty stdout', async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const exitCode = await main(['frobnicate', '--json'], { env: {}, stdout, stderr, root: '.' });
  assert.equal(exitCode, 2);
  assert.equal(stdout.text(), '');
  assert.match(stderr.text(), /AGSC-E001/);
});

test('an unknown flag exits 2 with AGSC-E002', async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const exitCode = await main(['lint', '--no-such-flag'], { env: {}, stdout, stderr, root: '.' });
  assert.equal(exitCode, 2);
  assert.match(stderr.text(), /AGSC-E002/);
});

test('bare --version prints the package version and exits 0', async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const exitCode = await main(['--version'], { env: {}, stdout, stderr, root: '.' });
  assert.equal(exitCode, 0);
  assert.match(stdout.text(), /^agsc /);
});

test('a malformed SOURCE_DATE_EPOCH exits 2 with AGSC-E603, never a finding', async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const exitCode = await main(['lint', '--json'], { env: { SOURCE_DATE_EPOCH: 'not-a-number' }, stdout, stderr, root: '.' });
  assert.equal(exitCode, 2);
  assert.match(stderr.text(), /AGSC-E603/);
});

test('run is disabled by default and refused as a configuration the tool cannot run against (AGSC-09-94)', async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const exitCode = await main(['run', 'some-slug', '--json'], { env: {}, stdout, stderr, root: '.' });
  assert.equal(exitCode, 2);
  assert.match(stderr.text(), /AGSC-E004/);
});

test('AGSC-09-09: a positional argument a verb does not define is AGSC-E002 and exit 2', async () => {
  for (const argv of [['export', '--markdown', './out'], ['build', 'extra'], ['propose', 'a', 'b'], ['mcp', 'x', 'y']]) {
    const stdout = captureStream();
    const stderr = captureStream();
    const exitCode = await main([...argv, '--json'], { env: {}, stdout, stderr, root: '.' });
    assert.equal(exitCode, 2, argv.join(' '));
    assert.equal(stdout.text(), '', argv.join(' '));
    assert.equal(JSON.parse(stderr.text()).code, 'AGSC-E002', argv.join(' '));
  }
});
