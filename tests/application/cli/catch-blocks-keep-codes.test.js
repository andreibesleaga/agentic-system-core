'use strict';
// AGSC-09-08 / AGSC-09-11: a catch block names the fault it caught. Until
// 2026-10-06 (verification finding C12) several replaced a specific fault by a
// generic or wrong one:
//   (a) any read error was "not valid UTF-8" — a directory where a file was expected
//       (and a permission-denied file) gave `AGSC-E108`;
//   (b) any error while loading a verb module was "no verb module", and a streaming
//       verb whose module failed to load answered `AGSC-E001`, the unknown-verb code;
//   (c) `trace` reported a path escape (`AGSC-E902`) as `AGSC-E201` "could not be read
//       as JSON";
//   (d) any error inside an adapter module was "no adapter named … is installed";
//   (e) the streaming verb (`mcp`) wrote `AGSC-E901` whatever the fault's own code.
//
// Deterministic: fixed SOURCE_DATE_EPOCH, no network; scratch copies of the minimal fixture.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const { main } = require('../../../src/application/cli/main.js');
const { createFileSystem } = require('../../../src/adapters/node-fs.js');

function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-catch-'));
  t.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

function capture() {
  let text = '';
  return { write: (s) => { text += s; }, text: () => text };
}

function agsc(dir, argv) {
  const stdout = capture();
  const stderr = capture();
  const exit = main(argv, {
    env: { SOURCE_DATE_EPOCH: '1767225600' }, ports: { fs: createFileSystem(dir) }, root: dir, stderr, stdout,
  });
  return Promise.resolve(exit).then((code) => ({ exit: code, stdout: stdout.text(), stderr: stderr.text() }));
}

/**
 * Make `require(file)` throw `error` for the duration of one test: a cached module
 * whose `exports` cannot be read is what a module that throws while loading looks
 * like to its caller.
 */
function brokenModule(t, file, error) {
  const resolved = require.resolve(file);
  const saved = require.cache[resolved];
  const stub = { id: resolved, filename: resolved, loaded: true, children: [], paths: [] };
  Object.defineProperty(stub, 'exports', { get() { throw error; } });
  require.cache[resolved] = stub;
  t.after(() => {
    if (saved === undefined) delete require.cache[resolved];
    else require.cache[resolved] = saved;
  });
}

test('C12 (a): a directory where an item file is expected is not "not valid UTF-8"', async (t) => {
  const dir = scratch(t);
  fs.mkdirSync(path.join(dir, 'content', 'concepts', 'odd.md'));
  const r = await agsc(dir, ['lint', '--json']);
  const odd = JSON.parse(r.stdout).findings.filter((f) => f.file === 'content/concepts/odd.md');
  assert.equal(odd.length, 1, r.stdout);
  assert.equal(odd[0].code, 'AGSC-E901', odd[0].message);
  assert.doesNotMatch(odd[0].message, /UTF-8/u);
});

test('C12 (a): a file that is not UTF-8 is still AGSC-E108', async (t) => {
  const dir = scratch(t);
  fs.writeFileSync(path.join(dir, 'content', 'concepts', 'bad.md'), Buffer.from([0x2d, 0x2d, 0x2d, 0x0a, 0xff, 0xfe, 0x0a]));
  const r = await agsc(dir, ['lint', '--json']);
  const bad = JSON.parse(r.stdout).findings.filter((f) => f.file === 'content/concepts/bad.md');
  assert.equal(bad.length, 1, r.stdout);
  assert.equal(bad[0].code, 'AGSC-E108');
});

test('C12 (b): a verb module that fails to load is an internal error that keeps its reason', async (t) => {
  const dir = scratch(t);
  brokenModule(t, '../../../src/application/cli/verbs/review.js', new Error('the reason it failed'));
  const r = await agsc(dir, ['review']);
  assert.equal(r.exit, 1);
  assert.match(r.stderr, /internal error/u);
  assert.match(r.stderr, /the reason it failed/u);
});

test('C12 (b): a streaming verb whose module fails to load is not AGSC-E001 (unknown verb)', async (t) => {
  const dir = scratch(t);
  brokenModule(t, '../../../src/application/cli/verbs/mcp.js', new Error('the reason it failed'));
  const r = await agsc(dir, ['mcp']);
  assert.equal(r.exit, 1);
  assert.doesNotMatch(r.stderr, /AGSC-E001/u);
  assert.match(r.stderr, /the reason it failed/u);
});

test('C12 (c): trace reports a path escape as AGSC-E902, not as a JSON fault', async (t) => {
  const dir = scratch(t);
  const configFile = path.join(dir, 'agsc.config.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  fs.writeFileSync(configFile, `${JSON.stringify({ ...config, run: { enabled: true } }, null, 2)}\n`);
  const r = await agsc(dir, ['trace', '../outside.json', '--json']);
  assert.equal(r.exit, 1, r.stderr);
  const codes = JSON.parse(r.stdout).findings.map((f) => f.code);
  assert.ok(codes.includes('AGSC-E902'), JSON.stringify(codes));
  assert.ok(!codes.includes('AGSC-E201'), JSON.stringify(codes));
});

test('C12 (d): an adapter module that fails to load keeps its reason, and is not "not installed"', async (t) => {
  const dir = scratch(t);
  brokenModule(t, '../../../src/interchange/adapters/cogx.js', new Error('the reason it failed'));
  const r = await agsc(dir, ['export', '--to', 'cogx', '--json']);
  assert.equal(r.exit, 1, r.stderr);
  const message = JSON.parse(r.stdout).findings.map((f) => f.message).join('\n');
  assert.match(message, /the reason it failed/u);
  assert.doesNotMatch(message, /is installed/u);
});

test('C12 (e): the streaming verb passes a registered code through', async (t) => {
  const dir = scratch(t);
  const verb = require('../../../src/application/cli/verbs/mcp.js');
  const original = verb.run;
  t.after(() => { verb.run = original; });
  verb.run = () => { const e = new Error('path escapes the Bundle root'); e.code = 'AGSC-E902'; throw e; };
  const r = await agsc(dir, ['mcp']);
  assert.equal(r.exit, 1);
  const lines = r.stderr.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));
  assert.ok(lines.some((f) => f.code === 'AGSC-E902'), r.stderr);
  assert.ok(!lines.some((f) => f.code === 'AGSC-E901'), r.stderr);
});
