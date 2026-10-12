'use strict';
// The two cases that pin the MCP extension's capabilities (AGSC-11-18) are run
// against the capabilities a real tool server reports, under the revision its
// transport speaks (AGSC-11-16): the `initialize` result of a stdio session under
// 2025-11-25. A server that reports no `extensions` map must fail both, and the
// runner must hold no check that compares a case with itself.
//
// Deterministic and offline: each session is one synchronous child process on a
// scratch copy of the fixture Bundle, under the fixed build instant; the server
// exits on end of input (AGSC-09-13), so no timer is involved.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const area = require('../conformance/areas/boundary.js');

function vector(prefix) {
  const dir = path.join(ROOT, 'tests', 'vectors', 'boundary');
  const name = fs.readdirSync(dir).find((f) => f.startsWith(`${prefix}-`));
  return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
}

/**
 * A mutated tool server: the engine's own `agsc mcp`, with the Boundary context's
 * capabilities replaced by an object that has no `extensions` member.
 */
function mutatedServer(dir) {
  const file = path.join(dir, 'mutated-server.js');
  fs.writeFileSync(file, [
    "'use strict';",
    `const root = ${JSON.stringify(ROOT)};`,
    "const surfaces = require(require('node:path').join(root, 'src', 'boundary', 'surfaces.js'));",
    'surfaces.mcpCapabilities = () => Object.freeze({});',
    "process.argv = [process.execPath, require('node:path').join(root, 'bin', 'agsc.js'), 'mcp'];",
    "require(require('node:path').join(root, 'bin', 'agsc.js')).run();",
    '',
  ].join('\n'));
  return [file];
}

test('AGSC-11-18: both capability cases pass against the initialize result of a real session', () => {
  for (const id of ['bnd-0042', 'bnd-0036']) {
    const result = area.run(vector(id), { root: ROOT });
    assert.deepStrictEqual(result, { detail: '', status: 'pass' }, id);
  }
});

test('AGSC-11-18: a server that reports no extensions map fails both capability cases', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-mutated-mcp-'));
  try {
    const ctx = { mcpServer: mutatedServer(dir), root: ROOT };
    const first = area.run(vector('bnd-0042'), ctx);
    assert.strictEqual(first.status, 'fail');
    assert.match(first.detail, /^extensions: /u);
    const second = area.run(vector('bnd-0036'), ctx);
    assert.strictEqual(second.status, 'fail');
    assert.match(second.detail, /mcp\.capabilities/u);
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test('AGSC-11-18: the runner compares what the server reports, never the case with itself', () => {
  const text = fs.readFileSync(path.join(ROOT, 'tests', 'conformance', 'areas', 'boundary.js'), 'utf8');
  const body = (name) => {
    const start = text.indexOf(`function ${name}(`);
    assert.notStrictEqual(start, -1, name);
    const end = text.indexOf('\n}\n', start);
    return text.slice(start, end);
  };
  for (const name of ['runBnd0042', 'runBnd0036']) {
    const source = body(name);
    // The capabilities come from the session, not from the Boundary context's function.
    assert.doesNotMatch(source, /surfaces\.mcpCapabilities/u, name);
    // No member of `expected` is compared with a constant, and no member of `input`
    // with its own length.
    assert.doesNotMatch(source, /vector\.expected\.[a-z_]+ === (?:false|true)\b/u, name);
    assert.doesNotMatch(source, /vector\.input\.[a-z_]+ \|\| \[\]\)\.length/u, name);
  }
});
