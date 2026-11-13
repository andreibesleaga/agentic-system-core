'use strict';
// verifies PRD-070
// The direct memory adapters (mem0, letta, zep, csv, basic-memory, claude-code) and the CSV
// library are loaded only by the two verbs that use them. A require trace of a real
// `agsc build` (and `agsc lint`) over the minimal fixture proves that a normal build loads
// none of them; a trace of `agsc export --to csv` proves the trace sees them when they ARE
// loaded, so the first result is not an empty trace. No memory tool's client SDK is a
// dependency at all: the adapters write and read files, and a memory adapter never reaches
// the network (AGSC-00-24).
//
// Deterministic: a fixed SOURCE_DATE_EPOCH, a temporary copy of the fixture, no network.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const BIN = path.join(ROOT, 'bin', 'agsc.js');

/** The modules the trace looks for: the adapters, their shared module, the CSV library. */
const WATCHED = /(?:interchange\/adapters\/(?:mem0|letta|zep|csv|basic-memory|claude-code)\.js|interchange\/memory-records\.js|node_modules\/csv-(?:parse|stringify)\/)/u;

/** The official client packages of Mem0, Letta and Zep: never a dependency of the engine. */
const CLIENTS = Object.freeze(['mem0ai', '@letta-ai/letta-client', '@getzep/zep-cloud']);

/** Run `agsc <args>` in a copy of the minimal fixture; the files it loaded, by path. */
function traced(args) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-lazy-'));
  try {
    fs.cpSync(path.join(ROOT, 'tests', 'fixtures', 'minimal'), dir, { recursive: true });
    const log = path.join(dir, 'loaded.txt');
    const hook = path.join(dir, 'trace.js');
    fs.writeFileSync(hook, [
      "'use strict';",
      "const Module = require('node:module');",
      "const fs = require('node:fs');",
      'const original = Module._load;',
      'Module._load = function load(request, parent, isMain) {',
      '  const value = original.apply(this, arguments);',
      '  try { fs.appendFileSync(process.env.TRACE_LOG, `${Module._resolveFilename(request, parent, isMain)}\\n`); } catch (e) { /* a builtin */ }',
      '  return value;',
      '};',
      '',
    ].join('\n'));
    // No AGSC_ switch reaches the command (AGSC-01-37 refuses names it does not know, such
    // as the architecture lane's AGSC_AUDIT; docs/TESTING.md).
    const env = {};
    for (const [name, value] of Object.entries(process.env)) if (!name.startsWith('AGSC_')) env[name] = value;
    Object.assign(env, { SOURCE_DATE_EPOCH: '1767225600', TRACE_LOG: log });
    const run = spawnSync(process.execPath, ['--require', hook, BIN, ...args], { cwd: dir, encoding: 'utf8', env });
    const loaded = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
    return { loaded: [...new Set(loaded.map((p) => p.split(path.sep).join('/')))], status: run.status, stderr: run.stderr };
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
}

test('agsc build and agsc lint load no memory adapter and no CSV library', () => {
  for (const args of [['build'], ['lint']]) {
    const run = traced(args);
    assert.strictEqual(run.status, 0, run.stderr);
    assert.ok(run.loaded.length > 50, `the trace saw the engine load (${run.loaded.length} modules)`);
    assert.deepStrictEqual(run.loaded.filter((p) => WATCHED.test(p)), [], args.join(' '));
  }
});

test('the trace does see them when export --to csv loads them', () => {
  const run = traced(['export', '--to', 'csv']);
  assert.strictEqual(run.status, 0, run.stderr);
  const seen = run.loaded.filter((p) => WATCHED.test(p));
  assert.ok(seen.some((p) => p.endsWith('interchange/adapters/csv.js')), seen.join('\n'));
  assert.ok(seen.some((p) => /node_modules\/csv-stringify\//u.test(p)), seen.join('\n'));
});

test('no memory tool client is a dependency: the adapters move files, the person moves them on', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const all = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies };
  for (const name of CLIENTS) assert.ok(!Object.hasOwn(all, name), name);
});
