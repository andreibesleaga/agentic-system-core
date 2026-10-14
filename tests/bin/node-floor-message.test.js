'use strict';
// tests/bin/node-floor-message.test.js — on a Node.js older than the floor of
// package.json "engines", every command of the package answers one sentence and exit 2
// instead of a stack trace (a real Node.js 18 stopped with ERR_REQUIRE_ESM on the first
// `require` of the engine).
//
// An older Node.js is shown to the command the way the guard sees it: a preload that
// makes this Node.js report another version before the entry point runs. The preload
// also records, when the process ends, every module file that was loaded, so a test can
// say that the guard answered before the engine's own code was required.
//
// Deterministic: no clock, no network; each spawned command runs in a scratch
// directory under the system temporary directory, removed afterwards.

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const AGSC = path.join(ROOT, 'bin', 'agsc.js');
const COMMANDS = [
  ['agsc', AGSC],
  ['agsc', path.join(ROOT, 'bin', 'agentic-system-core')],
  ['agsc-host', path.join(ROOT, 'bin', 'agsc-host.js')],
];

const { nodeFloorRefusal } = require('../../bin/agsc.js');

/** Runs `file` with `args` on a Node.js that reports `version`; returns the result and the loaded files. */
function runAs(version, file, args) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-node-floor-'));
  try {
    const shim = path.join(dir, 'old-node.js');
    const loaded = path.join(dir, 'loaded.json');
    fs.writeFileSync(shim, [
      `Object.defineProperty(process, 'version', { value: 'v${version}' });`,
      `Object.defineProperty(process.versions, 'node', { value: '${version}' });`,
      `process.on('exit', () => require('fs').writeFileSync(${JSON.stringify(loaded)}, JSON.stringify(Object.keys(require.cache))));`,
      ''].join('\n'));
    const env = Object.assign({}, process.env);
    delete env.AGSC_DOI;
    const r = spawnSync(process.execPath, ['--require', shim, file, ...args], { cwd: dir, encoding: 'utf8', env });
    return { exit: r.status, stdout: r.stdout, stderr: r.stderr, loaded: JSON.parse(fs.readFileSync(loaded, 'utf8')) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('the floor the guard applies is the floor package.json declares', () => {
  const engines = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).engines.node;
  assert.equal(engines, '>=22.13.0');
  assert.equal(nodeFloorRefusal('agsc', 'v22.13.0'), null);
  assert.notEqual(nodeFloorRefusal('agsc', 'v22.12.99'), null);
});

test('a Node.js below 22.13 is refused with one sentence; 22.13 and later are accepted', () => {
  for (const v of ['v18.19.1', 'v20.20.2', 'v22.12.9', 'v22.0.0', 'v4.9.1']) {
    assert.equal(nodeFloorRefusal('agsc', v), `agsc needs Node.js 22.13 or later; this is ${v}`, v);
  }
  assert.equal(nodeFloorRefusal('agsc-host', 'v18.19.1'), 'agsc-host needs Node.js 22.13 or later; this is v18.19.1');
  for (const v of ['v22.13.0', 'v22.13.1', 'v22.22.3', 'v23.0.0', 'v24.0.0', 'v24.18.0', 'v26.1.0', 'v100.0.0']) {
    assert.equal(nodeFloorRefusal('agsc', v), null, v);
  }
});

test('a version the guard cannot read is not refused: the command runs and says what it can', () => {
  for (const v of ['', 'v', 'nightly', undefined]) assert.equal(nodeFloorRefusal('agsc', v), null, String(v));
});

for (const [name, file] of COMMANDS) {
  for (const version of ['18.19.1', '22.12.9']) {
    test(`${path.basename(file)} on a Node.js that reports v${version}: one line on standard error, exit 2, no engine code loaded`, () => {
      const r = runAs(version, file, ['--version']);
      assert.equal(r.exit, 2, r.stderr);
      assert.equal(r.stdout, '');
      assert.equal(r.stderr, `${name} needs Node.js 22.13 or later; this is v${version}\n`);
      const own = r.loaded.filter((f) => f.startsWith(ROOT + path.sep) && !f.startsWith(path.join(ROOT, 'bin') + path.sep));
      assert.deepEqual(own, [], 'the guard answers before the first require of the engine');
    });
  }
}

test('agsc --version on a Node.js that reports v22.13.0 runs as usual', () => {
  const r = runAs('22.13.0', AGSC, ['--version']);
  assert.equal(r.exit, 0, r.stderr);
  assert.match(r.stdout, /^agsc \d+\.\d+\.\d+/u);
});

test('agsc-host list on a Node.js that reports v22.13.0 runs as usual', () => {
  const r = runAs('22.13.0', path.join(ROOT, 'bin', 'agsc-host.js'), ['list']);
  assert.equal(r.exit, 0, r.stderr);
  assert.notEqual(r.stdout, '');
});

test('the run() the wrappers and the alias package call answers the same sentence', async () => {
  const shim = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-node-floor-')), 'run.js');
  try {
    fs.writeFileSync(shim, [
      "Object.defineProperty(process, 'version', { value: 'v18.19.1' });",
      "Object.defineProperty(process.versions, 'node', { value: '18.19.1' });",
      `require(${JSON.stringify(AGSC)}).run().then(() => process.stdout.write('resolved ' + process.exitCode + '\\n'));`,
      ''].join('\n'));
    const r = spawnSync(process.execPath, [shim], { encoding: 'utf8' });
    assert.equal(r.status, 2, r.stderr);
    assert.equal(r.stderr, 'agsc needs Node.js 22.13 or later; this is v18.19.1\n');
    assert.equal(r.stdout, 'resolved 2\n');
  } finally {
    fs.rmSync(path.dirname(shim), { recursive: true, force: true });
  }
});
