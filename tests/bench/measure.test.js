'use strict';
// verifies PRD-067
// tests/bench/measure.test.js — bench/measure.js assembles a record by merging, and
// the install layer's record says what its prose says: the verbs a user runs every
// day load no protocol package, and the control run of `agsc mcp` shows the trace
// sees them when a verb does. The measuring itself spawns npm and builds and is not
// run here (bench/measure.js, header).
//
// Deterministic: reads the committed record; the merge test writes only under the
// system temporary directory and runs the shipped counter once (as --assemble does).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, it } = require('node:test');

const measure = require('../../bench/measure.js');
const install = require('../../bench/install.js');

const RECORD = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'measurements.json'), 'utf8'));

describe('bench/measure.js --assemble', () => {
  it('replaces the layers it measured and keeps every other layer of the record', () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-measure-'));
    process.on('exit', () => { try { fs.rmSync(scratch, { force: true, recursive: true }); } catch { /* gone */ } });
    const out = path.join(scratch, 'record.json');
    fs.writeFileSync(out, JSON.stringify({ layers: { conformance: { kept: true }, package: { files: 1 } }, schema: 'agsc.measurements.v1' }));
    fs.writeFileSync(path.join(scratch, 'measure-package.json'), JSON.stringify({ files: 2 }));
    const before = process.env.SOURCE_DATE_EPOCH;
    process.env.SOURCE_DATE_EPOCH = '1767225600';   // assemble dates the record from the fixed clock alone
    try {
      measure.assemble(scratch, out);
    } finally {
      if (before === undefined) delete process.env.SOURCE_DATE_EPOCH;
      else process.env.SOURCE_DATE_EPOCH = before;
    }
    const record = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.deepEqual(record.measured, ['package']);
    assert.equal(record.measured_for, '2026-01-01');
    assert.deepEqual(record.layers, { conformance: { kept: true }, package: { files: 2 } });
  });

  it('--all runs only layers that need nothing outside the repository, and every one has its command', () => {
    assert.deepEqual(measure.SELF_CONTAINED, ['conformance', 'determinism', 'security', 'perf', 'package', 'install']);
    for (const layer of measure.SELF_CONTAINED) assert.ok(measure.LAYERS.includes(layer), layer);
    assert.match(measure.HELP, /--all/u);
  });
});

describe('bench/install.js — the module trace', () => {
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
