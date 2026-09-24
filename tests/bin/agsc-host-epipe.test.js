'use strict';
// `agsc-host list | head -1`: the reader closes the pipe after one line, and the
// command must stop quietly — no EPIPE stack trace on stderr — as a Unix tool does.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawn } = require('node:child_process');

const HOST = path.resolve(__dirname, '..', '..', 'bin', 'agsc-host.js');

test('agsc-host stops quietly when its reader closes the pipe', async () => {
  const child = spawn(process.execPath, [HOST, 'list'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  // Close the reading end before the command writes, as `head` does once it has its lines.
  child.stdout.destroy();
  const code = await new Promise((resolve) => child.on('close', resolve));
  assert.doesNotMatch(stderr, /EPIPE|Unhandled 'error' event|\n {4}at /u, stderr);
  assert.notStrictEqual(code, null);
});

test('agsc stops quietly when its reader closes the pipe', async () => {
  const cli = path.resolve(__dirname, '..', '..', 'bin', 'agsc.js');
  const child = spawn(process.execPath, [cli, '--help'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdout.destroy();
  const code = await new Promise((resolve) => child.on('close', resolve));
  assert.doesNotMatch(stderr, /EPIPE|Unhandled 'error' event|\n {4}at /u, stderr);
  assert.notStrictEqual(code, null);
});
