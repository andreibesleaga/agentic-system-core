'use strict';
// verifies PRD-067
// tests/bench/measure.test.js — bench/measure.js assembles a record by merging, `--all`
// runs every self-contained layer into a scratch record and leaves the repository's
// record alone (`--offline` without the install layer), the install layer
// (bench/runners/install.js, from src-ts/bench/install.ts) turns every failed run into
// an error rather than a number, and the record says what its prose says: the verbs a
// user runs every day load no protocol package, and the control run of `agsc mcp`
// shows the trace sees them when a verb does. The real layers spawn npm and builds and
// are not run here (bench/measure.js, header): `--all` runs with stand-in layers, and
// the install layer's checks with stand-in timers.
//
// Deterministic: reads the committed record; every write goes under the system
// temporary directory, and the shipped counter runs once per assembly (as --assemble does).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, it } = require('node:test');

const measure = require('../../bench/measure.js');
const install = require('../../bench/runners/install.js');

const RECORD_FILE = path.join(__dirname, '..', '..', 'docs', 'measurements.json');
const RECORD = JSON.parse(fs.readFileSync(RECORD_FILE, 'utf8'));

function tmpdir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-measure-'));
  process.on('exit', () => { try { fs.rmSync(dir, { force: true, recursive: true }); } catch { /* gone */ } });
  return dir;
}

/** `fn` with SOURCE_DATE_EPOCH set to the fixed clock (assemble dates the record from it alone), restored after. */
function atEpoch(fn) {
  const before = process.env.SOURCE_DATE_EPOCH;
  process.env.SOURCE_DATE_EPOCH = '1767225600';
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env.SOURCE_DATE_EPOCH;
    else process.env.SOURCE_DATE_EPOCH = before;
  }
}

/** bench/measure.js run with stand-in layers: the exit code, what it printed, and the layers it measured. */
function runWithStandIns(argv) {
  const measured = [];
  let out = '';
  const code = atEpoch(() => measure.run(argv, {
    err: (s) => { out += s; },
    measure: (layer) => { measured.push(layer); return { stand_in: layer }; },
    out: (s) => { out += s; },
  }));
  return { code, measured, out };
}

/** A timer that answers each call with the next of `results`, and records the calls. */
function standInTimer(results) {
  const calls = [];
  const timer = (command, args, options) => {
    calls.push({ args, command, options });
    return { code: 0, err: '', ms: 1, out: '', rss_kb: 1, ...results[Math.min(calls.length - 1, results.length - 1)] };
  };
  return { calls, timer };
}

describe('bench/measure.js --assemble', () => {
  it('replaces the layers it measured and keeps every other layer of the record', () => {
    const scratch = tmpdir();
    const out = path.join(scratch, 'record.json');
    fs.writeFileSync(out, JSON.stringify({ layers: { conformance: { kept: true }, package: { files: 1 } }, schema: 'agsc.measurements.v1' }));
    fs.writeFileSync(path.join(scratch, 'measure-package.json'), JSON.stringify({ files: 2 }));
    atEpoch(() => measure.assemble(scratch, out));
    const record = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.deepEqual(record.measured, ['package']);
    assert.equal(record.measured_for, '2026-01-01');
    assert.deepEqual(record.layers, { conformance: { kept: true }, package: { files: 2 } });
  });

});

describe('bench/measure.js --all', () => {
  it('measures every self-contained layer into <scratch>/measurements.json and leaves the repository\'s record alone', () => {
    const before = fs.readFileSync(RECORD_FILE);
    const scratch = tmpdir();
    const r = runWithStandIns(['--all', '--scratch', scratch]);
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(r.measured, ['conformance', 'determinism', 'security', 'perf', 'package', 'install']);
    const record = JSON.parse(fs.readFileSync(path.join(scratch, 'measurements.json'), 'utf8'));
    assert.deepEqual(record.measured, r.measured);
    assert.deepEqual(Object.keys(record.layers), r.measured, 'the layers in the order of LAYERS, nothing kept from elsewhere');
    assert.deepEqual(record.layers.install, { stand_in: 'install' });
    assert.equal(record.schema, 'agsc.measurements.v1');
    assert.equal(record.measured_for, '2026-01-01');
    assert.ok(fs.readFileSync(RECORD_FILE).equals(before), 'docs/measurements.json is unchanged');
  });

  it('--offline leaves out the install layer, the one that needs the npm registry, and says so', () => {
    const scratch = tmpdir();
    const r = runWithStandIns(['--all', '--offline', '--scratch', scratch]);
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(measure.NEEDS_NETWORK, ['install']);
    assert.deepEqual(r.measured, ['conformance', 'determinism', 'security', 'perf', 'package']);
    assert.match(r.out, /--offline: install left out/u);
    assert.equal(JSON.parse(fs.readFileSync(path.join(scratch, 'measurements.json'), 'utf8')).layers.install, undefined);
  });

  it('with --out it merges into that record, and every self-contained layer is a layer of the record', () => {
    const scratch = tmpdir();
    const out = path.join(scratch, 'kept.json');
    fs.writeFileSync(out, JSON.stringify({ layers: { parity: { kept: true } }, schema: 'agsc.measurements.v1' }));
    assert.equal(runWithStandIns(['--all', '--offline', '--scratch', scratch, '--out', out]).code, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')).layers.parity, { kept: true });
    for (const layer of measure.SELF_CONTAINED) assert.ok(measure.LAYERS.includes(layer), layer);
    assert.match(measure.HELP, /--all --scratch <dir> \[--offline\]/u);
  });
});

describe('bench/runners/install.js — a failed run is an error, never a number', () => {
  it('a run that exits non-zero, or is killed, throws with the tail of its standard error', () => {
    assert.throws(() => install.mustSucceed({ code: 1, err: 'x'.repeat(500) + 'the cause', ms: 0, out: '' }, 'npm pack'), /npm pack exited 1: x+the cause$/u);
    assert.throws(() => install.mustSucceed({ code: null, err: '', ms: 0, out: '' }, 'npm install'), /did not finish/u);
    const ok = { code: 0, err: '', ms: 3, out: 'y' };
    assert.equal(install.mustSucceed(ok, 'x'), ok);
  });

  it('a traced run removes the trace of the run before it, so a failed run cannot read it', () => {
    const work = tmpdir();
    const trace = path.join(work, 'trace.cjs');
    fs.writeFileSync(path.join(work, 'trace-out.json'), JSON.stringify(['file:///stale/node_modules/hono/index.js']));
    const failing = standInTimer([{ code: 1, err: 'boom' }]);
    assert.throws(() => install.traced({ epoch: '1767225600', timed: failing.timer }, ['x.js'], work, trace), /traced run of node x\.js exited 1: boom/u);
    assert.equal(fs.existsSync(path.join(work, 'trace-out.json')), false, 'the stale trace is gone');
    const writing = (command, args, options) => {
      fs.writeFileSync(options.env.MEASURE_TRACE_OUT, JSON.stringify(['file:///x/node_modules/yaml/a.js']));
      return { code: 0, err: '', ms: 1, out: '' };
    };
    assert.deepEqual(install.traced({ epoch: '1767225600', timed: writing }, ['x.js'], work, trace), ['file:///x/node_modules/yaml/a.js']);
  });

  it('a timed run of a verb that fails, and a package load that fails or prints no time, are errors', () => {
    const work = tmpdir();
    const failing = standInTimer([{ code: 2, err: 'no such verb' }]);
    assert.throws(() => install.coldStart({ epoch: '1', timed: failing.timer, timedWithRss: failing.timer }, ['agsc.js', 'lint'], work, path.join(work, 't.cjs')),
      /node agsc\.js lint exited 2: no such verb/u);
    assert.throws(() => install.loadTimes({ epoch: '1', timed: standInTimer([{ code: 1, err: 'Cannot find module' }]).timer }, work), /loading @modelcontextprotocol\/server exited 1/u);
    assert.throws(() => install.loadTimes({ epoch: '1', timed: standInTimer([{ out: '' }]).timer }, work), /printed no time/u);
    const times = install.loadTimes({ epoch: '1', timed: standInTimer([{ out: '231.6' }]).timer }, work);
    assert.deepEqual(times['@a2a-js/sdk'], [232, 232, 232, 232, 232]);
  });

  it('names what the machine lacks before anything runs: module.registerHooks, GNU time, a time that reports memory', () => {
    const gnu = { timedWithRss: () => ({ code: 0, err: '', ms: 1, out: '', rss_kb: 40000 }) };
    assert.deepEqual(install.prerequisites(gnu, () => {}, true), []);
    assert.match(install.prerequisites(gnu, null, true).join(), /module\.registerHooks \(Node 22\.15 or later\)/u);
    assert.match(install.prerequisites(gnu, () => {}, false).join(), /GNU time at \/usr\/bin\/time/u);
    const bsd = { timedWithRss: () => ({ code: 1, err: 'time: illegal option -- v', ms: 1, out: '', rss_kb: null }) };
    assert.match(install.prerequisites(bsd, () => {}, true).join(), /is not GNU time/u);
    assert.ok(install.INSTALL_TIMEOUT_MS > 0, 'the install has a time limit');
  });
});

describe('bench/runners/install.js — the module trace', () => {
  it('names the package a resolved file belongs to, scoped or nested', () => {
    assert.equal(install.packageOf('/x/node_modules/hono/dist/index.js'), 'hono');
    assert.equal(install.packageOf('/x/node_modules/a/node_modules/@a2a-js/sdk/dist/x.cjs'), '@a2a-js/sdk');
    assert.equal(install.packageOf('/x/src/main.js'), null);
    assert.deepEqual(install.protocolPackages([
      'file:///x/node_modules/@modelcontextprotocol/server/dist/a.js', 'file:///x/node_modules/@modelcontextprotocol/server/dist/b.js',
      'file:///x/node_modules/yaml/dist/index.js', 'file:///x/node_modules/hono/dist/index.js',
    ]), ['@modelcontextprotocol/server', 'hono']);
  });

  it('reads npm pack --json after the lines the prepack script prints', () => {
    assert.deepEqual(install.packJson('src-ts/: current (5 modules)\n[\n  { "entryCount": 3 }\n]\n'), { entryCount: 3 });
  });

  it('the record: --version, lint and build load no protocol package; agsc mcp loads the MCP packages', () => {
    const cold = RECORD.layers.install.cold_start;
    for (const verb of ['version', 'lint', 'build']) {
      assert.deepEqual(cold[verb].protocol_packages, [], verb);
      assert.ok(cold[verb].modules_loaded > 0, `${verb}: the trace saw no module at all`);
    }
    for (const name of ['@modelcontextprotocol/server', '@modelcontextprotocol/node']) {
      assert.ok(cold.mcp_answering_nothing.protocol_packages.includes(name), name);
    }
    assert.equal(RECORD.layers.install.runs, cold.version.ms_runs.length);
  });
});
