'use strict';
// tests/conformance/areas/_cli-mcp-primitives.js — `cli` cases over the real tool
// server (`agsc mcp`), exchanged as JSON-RPC frames over standard input and output.
//
//   cli-0018 (AGSC-09-14b) the resources and the one prompt beside the seven tools.
//   cli-0019 (AGSC-09-13)  the tool list with each tool's argument names.
//
// The frames go to the server in one write and the server exits on end of input
// (AGSC-09-13 "SHOULD exit on stdin EOF"), so the exchange is one synchronous child
// process: no timer, no network. The fixture is copied to a scratch folder first, so
// the run does not depend on the engine checkout's own git history, and the build
// instant is fixed.

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

/** 2026-01-01T00:00:00Z — the fixed instant of `tests/fixtures/minimal/README.md`. */
const FIXTURE_EPOCH = '1767225600';

/** Send `frames` to `agsc mcp` on a scratch copy of the vector's Bundle; the responses by id. */
function exchange(vector, ctx) {
  const engine = path.resolve((ctx && ctx.root) || '.');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-mcp-vector-'));
  try {
    fs.cpSync(path.join(engine, 'tests', String(vector.input.bundle || 'fixtures/minimal')), root, { recursive: true });
    const input = vector.input.frames.map((f) => `${JSON.stringify(f)}\n`).join('');
    const run = spawnSync(process.execPath, [path.join(engine, 'bin', 'agsc.js'), 'mcp'], {
      cwd: root,
      encoding: 'utf8',
      env: { NO_COLOR: '1', PATH: process.env.PATH, SOURCE_DATE_EPOCH: FIXTURE_EPOCH },
      input,
      maxBuffer: 16 * 1024 * 1024,
    });
    const byId = new Map();
    for (const line of String(run.stdout || '').split('\n')) {
      if (line.trim() === '') continue;
      const frame = JSON.parse(line);
      if (frame.id !== undefined) byId.set(frame.id, frame);
    }
    return { byId, status: run.status, stderr: String(run.stderr || '') };
  } finally {
    fs.rmSync(root, { force: true, recursive: true });
  }
}

/** `expected` is a subset of `actual`; a list must have the same length, element by element. */
function subset(expected, actual) {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && expected.length === actual.length && expected.every((e, i) => subset(e, actual[i]));
  }
  if (expected !== null && typeof expected === 'object') {
    return actual !== null && typeof actual === 'object' && !Array.isArray(actual)
      && Object.keys(expected).every((k) => subset(expected[k], actual[k]));
  }
  return expected === actual;
}

const verdict = (problems) => (problems.length === 0
  ? { status: 'pass', detail: '' }
  : { status: 'fail', detail: problems.join('; ') });

/** cli-0018: each expected response is a subset of the response of the same id. */
function runCli0018(vector, ctx) {
  const got = exchange(vector, ctx);
  const problems = [];
  for (const want of vector.expected.responses || []) {
    const frame = got.byId.get(want.id);
    if (frame === undefined) {
      problems.push(`no response with id ${want.id} (${got.stderr.trim()})`);
      continue;
    }
    if (want.error !== undefined && (frame.error === undefined || frame.result !== undefined)) {
      problems.push(`id ${want.id}: a JSON-RPC error was expected, got ${JSON.stringify(frame).slice(0, 200)}`);
    }
    if (!subset(want, frame)) problems.push(`id ${want.id}: ${JSON.stringify(frame).slice(0, 400)} does not carry ${JSON.stringify(want)}`);
  }
  return verdict(problems);
}

/** cli-0019: the tool list reduced to name, sorted argument names and sorted `required`. */
function runCli0019(vector, ctx) {
  const got = exchange(vector, ctx);
  const frame = got.byId.get(vector.input.tools_list_id);
  if (frame === undefined || frame.result === undefined) return verdict([`no tools/list result (${got.stderr.trim()})`]);
  const reduced = (frame.result.tools || []).map((tool) => {
    const schema = tool.inputSchema || {};
    return {
      arguments: Object.keys(schema.properties || {}).sort(),
      name: tool.name,
      required: [...(schema.required || [])].sort(),
    };
  }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const same = JSON.stringify(reduced) === JSON.stringify(vector.expected.tools);
  return verdict(same ? [] : [`tools ${JSON.stringify(reduced)} != ${JSON.stringify(vector.expected.tools)}`]);
}

module.exports = { runCli0018, runCli0019, subset };
