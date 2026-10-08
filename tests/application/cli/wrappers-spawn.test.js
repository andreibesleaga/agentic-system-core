'use strict';
// AGSC-09-08 through the two wrapper commands. `bin/agentic-system-core` (the
// engine package's second command name) and the alias package `agsc-cli` (the
// documented `npx -y agsc-cli`) both call `run()` of `bin/agsc.js`. Until
// 2026-10-06 the handler that turns a fault carrying a REGISTERED code into its
// diagnostic and exit code lived only in `bin/agsc.js`'s own auto-run branch, so
// through either wrapper a malformed `SOURCE_DATE_EPOCH` — `AGSC-E603`, exit 2 —
// came out as "agsc: internal error" with a stack trace and exit 1. One spawn test
// per wrapper, each against the real file.
//
// Deterministic: fixed arguments, no network; scratch copies of the minimal fixture.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');

function scratch(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  return dir;
}

/** The caller's environment without any `AGSC_*` override. */
function cleanEnv(extra) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGSC_')));
  return { ...env, NO_COLOR: '1', ...extra };
}

function spawn(file, args, cwd, extra) {
  return spawnSync(process.execPath, [file, ...args], { cwd, encoding: 'utf8', env: cleanEnv(extra) });
}

/** The same assertions for every entry point: the registered code, exit 2, no stack. */
function assertRegistered(r, label) {
  assert.equal(r.status, 2, `${label}: exit ${r.status}\n${r.stderr}`);
  assert.doesNotMatch(r.stderr, /internal error/u, `${label}: ${r.stderr}`);
  assert.doesNotMatch(r.stderr, /^\s+at /mu, `${label} printed a stack trace`);
  assert.match(r.stderr, /AGSC-E603/u, label);
  assert.equal(r.stdout, '', `${label}: a fatal pre-verb fault prints nothing on stdout`);
}

/** A directory where `require('agentic-system-core/…')` resolves to this engine. */
function aliasInstall(t) {
  const dir = scratch(t, 'agsc-alias-');
  fs.mkdirSync(path.join(dir, 'node_modules'));
  // A junction needs no privilege on Windows and is a plain symlink elsewhere.
  fs.symlinkSync(ROOT, path.join(dir, 'node_modules', 'agentic-system-core'), 'junction');
  fs.mkdirSync(path.join(dir, 'bin'));
  const bin = path.join(dir, 'bin', 'agsc.js');
  fs.copyFileSync(path.join(ROOT, 'packages', 'agsc-cli', 'bin', 'agsc.js'), bin);
  return bin;
}

const ENTRIES = [
  ['bin/agsc.js', () => path.join(ROOT, 'bin', 'agsc.js')],
  ['bin/agentic-system-core', () => path.join(ROOT, 'bin', 'agentic-system-core')],
  ['agsc-cli (packages/agsc-cli/bin/agsc.js)', aliasInstall],
];

for (const [label, entry] of ENTRIES) {
  test(`AGSC-09-08 through ${label}: a malformed SOURCE_DATE_EPOCH is AGSC-E603 and exit 2`, (t) => {
    const file = entry(t);
    const dir = scratch(t, 'agsc-wrap-');
    fs.cpSync(FIXTURE, dir, { recursive: true });
    const plain = spawn(file, ['lint'], dir, { SOURCE_DATE_EPOCH: 'abc' });
    assertRegistered(plain, label);
    const json = spawn(file, ['lint', '--json'], dir, { SOURCE_DATE_EPOCH: 'abc' });
    assertRegistered(json, `${label} --json`);
    const line = json.stderr.split('\n').find((l) => l.startsWith('{'));
    assert.deepEqual(JSON.parse(line).code, 'AGSC-E603');
  });

  test(`${label} still answers a normal run with the engine's own exit code`, (t) => {
    const file = entry(t);
    const dir = scratch(t, 'agsc-wrap-');
    fs.cpSync(FIXTURE, dir, { recursive: true });
    const r = spawn(file, ['lint', '--json'], dir, { SOURCE_DATE_EPOCH: '1767225600' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).verb, 'lint');
  });
}
