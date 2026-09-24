'use strict';
// tests/arch/pack-and-conform.test.js — the packed package runs its own vector set.
//
// `agsc conform` executes the conformance vectors through the area handlers that
// live beside them under `tests/conformance/`. A package that ships the vectors and
// not the handlers answers every vector with "no handler", which AGSC-09-02 counts
// as a failure. This test proves the published file set is enough: it asks npm for
// the exact list `npm pack` would put in the tarball, copies only those files into a
// temporary directory, gives that copy the production dependencies and nothing else,
// and runs `agsc conform` from it on a copy of the minimal Bundle.
//
// Deterministic: `npm pack --dry-run` reads the manifest and the tree and touches no
// network; the dependencies are linked from this repository's own `node_modules`
// (the production closure of `package-lock.json`, dev-only packages left out, so a
// runtime dependency that is only a devDependency fails here); the build instant is
// fixed by SOURCE_DATE_EPOCH.

const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

/** The files `npm pack` would ship, as npm itself lists them. */
function packedFiles() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = cp.spawnSync(npm, ['pack', '--dry-run', '--json', '--ignore-scripts', '--offline'], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32',
  });
  assert.equal(result.status, 0, `npm pack --dry-run failed: ${result.stderr}`);
  const listed = JSON.parse(result.stdout);
  return listed[0].files.map((f) => f.path);
}

/** Top-level package directories of the production closure in `package-lock.json`. */
function productionPackages() {
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  return Object.entries(lock.packages)
    .filter(([key, meta]) => key.startsWith('node_modules/') && !meta.dev
      && !key.slice('node_modules/'.length).includes('node_modules/'))
    .map(([key]) => key.slice('node_modules/'.length));
}

test('the packed package runs `agsc conform` on the minimal Bundle and every vector passes', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-pack-'));
  try {
    const pkg = path.join(work, 'package');
    const files = packedFiles();
    for (const rel of files) {
      const to = path.join(pkg, rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(ROOT, rel), to);
    }
    // The handlers of the conform run are in the pack, and nothing else of tests/ is.
    assert.ok(files.some((f) => f.startsWith('tests/conformance/areas/')), 'the area handlers are not packed');
    assert.ok(!files.some((f) => /\.test\.js$/u.test(f)), 'a test file is packed');

    for (const name of productionPackages()) {
      const to = path.join(pkg, 'node_modules', name);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.symlinkSync(path.join(ROOT, 'node_modules', name), to, 'junction');
    }

    const bundle = path.join(work, 'bundle');
    fs.cpSync(path.join(ROOT, 'tests', 'fixtures', 'minimal'), bundle, { recursive: true });
    // The run's own environment: no AGSC_* variable of the test process leaks in as a
    // configuration override (AGSC-09-09).
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGSC_')));
    env.SOURCE_DATE_EPOCH = '1767225600';
    const run = cp.spawnSync(process.execPath, [path.join(pkg, 'bin', 'agsc.js'), 'conform', '--json',
      '--to', 'report.json'], { cwd: bundle, encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 });
    assert.equal(run.status, 0, `agsc conform from the packed package failed:\n${run.stdout}\n${run.stderr}`);
    const envelope = JSON.parse(run.stdout);
    assert.equal(envelope.status, 'pass');
    const report = JSON.parse(fs.readFileSync(path.join(bundle, 'report.json'), 'utf8'));
    assert.equal(report.summary.fail, 0, 'a vector failed from the packed package');
    assert.ok(report.summary.pass > 0);
    // Every vector not passed is a withdrawn one; nothing is skipped for want of a handler.
    const counted = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'count-artifacts'), '--json'],
      { cwd: ROOT, encoding: 'utf8' });
    assert.equal(report.summary.skip, JSON.parse(counted.stdout).counts.vectors_withdrawn);
    assert.ok(!/no handler/u.test(JSON.stringify(report)), 'a vector found no handler in the packed package');
  } finally {
    fs.rmSync(work, { force: true, recursive: true });
  }
});
