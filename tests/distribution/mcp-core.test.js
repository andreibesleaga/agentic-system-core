'use strict';
// tests/distribution/mcp-core.test.js — the MCP core on the official SDK (src-ts/distribution/mcp-core.ts,
// compiled to src/distribution/mcp-core.js): the two revisions of AGSC-09-19 over standard input
// and output, in process, with the frames a client writes.
//
// What is proved here: the stdio server answers a client that opens with `initialize` (MCP
// revision 2025-11-25) and a client that sends per-request `_meta` (revision 2026-07-28) from
// one server factory, and the places where the frozen rule asks for more than the SDK does —
// `server/discover` lists both revisions, a request of a revision the server does not speak is
// -32022 naming both, `subscriptions/listen` is an unknown method, and a missing resource is
// -32002 under 2025-11-25 — are what the gate of the core adds (its header names them).
// The property tests: `tools/list` is the same list in code-point order whatever the calls before
// it, and a tool answer under 2025-11-25 carries the bytes of the 1.0 server with MCP's `isError`.
//
// Deterministic: the fixture Bundle and its build at the fixed instant, streams in memory, no
// network, no timer drives an assertion, fixed fast-check seeds.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const fc = require('fast-check');

const core = require('../../src/distribution/mcp-core.js');
const surfaces = require('../../src/boundary/surfaces.js');
const { tools } = require('../../src/distribution/mcp-tools.js');
const site = require('../../src/distribution/site.js');
const validate = require('../../src/knowledge/validate.js');
const { readSchemas, createFileSystem } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const { loadBundle } = require('../../src/application/bundle.js');

const ROOT = path.resolve(__dirname, '..', '..');
const MINIMAL = path.join(ROOT, 'tests', 'fixtures', 'minimal');
/** 2026-01-01T00:00:00Z — the fixed instant every test in this repository uses. */
const EPOCH = '1767225600';
const MODERN = '2026-07-28';
const LEGACY = '2025-11-25';

const port = createFileSystem(MINIMAL);
const bundle = loadBundle(port, { schemas: validate.schemas(readSchemas(ROOT)) });
const artifacts = site.build(bundle, { clock: createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } }), fs: port },
  { specVersion: '1.0.0', version: '0.0.2' }).files;
const OPTIONS = { artifacts, version: '0.0.2' };

/** The `_meta` of a request under 2026-07-28, for `revision`. */
const meta = (revision = MODERN) => ({
  'io.modelcontextprotocol/clientCapabilities': {},
  'io.modelcontextprotocol/clientInfo': { name: 'core-test', version: '0' },
  'io.modelcontextprotocol/protocolVersion': revision,
});
const request = (id, method, params = {}) => ({ id, jsonrpc: '2.0', method, params });
const modern = (id, method, params = {}, revision = MODERN) => request(id, method, { ...params, _meta: meta(revision) });
const INITIALIZE = request(1, 'initialize', { capabilities: {}, clientInfo: { name: 'core-test', version: '0' }, protocolVersion: LEGACY });
const INITIALIZED = { jsonrpc: '2.0', method: 'notifications/initialized' };

/**
 * One stdio session in memory: write `frames`, wait until every request among them has its
 * response, end the input, return the responses by id (and every line written).
 */
async function session(frames, options = OPTIONS) {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  stdout.setEncoding('utf8');
  let text = '';
  const wanted = frames.filter((f) => f.id !== undefined && f.method !== undefined).length;
  const byId = new Map();
  const done = new Promise((resolve) => {
    stdout.on('data', (chunk) => {
      text += chunk;
      for (const line of text.split('\n').slice(0, -1)) {
        const frame = JSON.parse(line);
        if (frame.id !== undefined) byId.set(frame.id, frame);
      }
      if (byId.size >= wanted) resolve();
    });
  });
  const handle = await core.serveStdio({ ...options, bundle, stdin, stdout });
  for (const frame of frames) stdin.write(`${JSON.stringify(frame)}\n`);
  if (wanted > 0) await done;
  stdin.end();
  await handle.close();
  return { byId, lines: text.split('\n').filter((l) => l !== '') };
}

/* ------------------------------------------------------------ the module */

test('the core names the server and builds one official SDK server with the shared toolset', () => {
  assert.equal(core.SERVER_NAME, 'agentic-system-core');
  const { server, toolset, resources } = core.createServer(bundle, OPTIONS);
  assert.equal(typeof server.connect, 'function');
  assert.equal(toolset.manifest().tools.length, 10);
  assert.equal(resources.list().resources.length, 5);
  // AGSC-11-18: the capabilities the rule pins, none with `listChanged` or `subscribe`.
  assert.deepEqual(server.getCapabilities(), {
    extensions: { 'com.agenticsystemcore/knowledge': { linkset: 'https://minimal.example/.well-known/knowledge-linkset' } },
    prompts: {}, resources: {}, tools: {},
  });
});

/* ------------------------------------------------- 2025-11-25, the handshake */

test('AGSC-09-19: a client that opens with initialize is served under 2025-11-25, as 1.0 served it', async () => {
  const { byId } = await session([INITIALIZE, INITIALIZED, request(2, 'tools/list'),
    request(3, 'resources/read', { uri: 'memory://minimal/no-such-item' }),
    request(4, 'tools/call', { arguments: {}, name: 'no-such-tool' }),
    request(5, 'resources/templates/list'), request(6, 'resources/read', { uri: 'memory://minimal/handoff' })]);
  assert.equal(byId.get(1).result.protocolVersion, LEGACY);
  assert.deepEqual(byId.get(1).result.serverInfo, { name: 'agentic-system-core', version: '0.0.2' });
  // The 2025-11-25 results carry none of the members of 2026-07-28.
  for (const id of [2, 5, 6]) {
    for (const member of ['resultType', 'ttlMs', 'cacheScope']) assert.equal(byId.get(id).result[member], undefined, `${id} ${member}`);
  }
  // AGSC-09-19 (4): a missing resource is -32002 under 2025-11-25, with the URI as data.
  assert.deepEqual(byId.get(3).error, { code: -32002, data: { uri: 'memory://minimal/no-such-item' }, message: 'Resource not found' });
  // AGSC-09-19 (5): a tool the server does not serve is a JSON-RPC error -32602 under both revisions.
  assert.equal(byId.get(4).error.code, -32602);
  assert.deepEqual(byId.get(5).result, { resourceTemplates: [] });
  assert.equal(byId.get(6).result.contents[0].text, String(artifacts.get('/pages/handoff.md')));
});

test('AGSC-09-19 (6): the same annotations under both revisions, and the tool list in code-point order', async () => {
  const legacy = await session([INITIALIZE, INITIALIZED, request(2, 'tools/list')]);
  const current = await session([modern(1, 'tools/list')]);
  const listed = legacy.byId.get(2).result.tools;
  assert.deepEqual(listed, current.byId.get(1).result.tools);
  assert.deepEqual(listed.map((t) => t.name), [...surfaces.TOOL_NAMES]);
  for (const tool of listed) {
    assert.equal(tool.annotations.openWorldHint, false, tool.name);
    assert.equal(tool.annotations.readOnlyHint, surfaces.WEBMCP_ANNOTATIONS[tool.name].readOnlyHint, tool.name);
    const writes = tool.name === 'propose' || tool.name === 'remember';
    assert.equal(tool.annotations.destructiveHint, writes ? false : undefined, tool.name);
  }
});

/* ------------------------------------------------ 2026-07-28, stateless */

test('AGSC-09-19 (1): server/discover lists both revisions of the stdio server, with the pinned capabilities', async () => {
  const { byId } = await session([modern(1, 'server/discover')]);
  const result = byId.get(1).result;
  assert.deepEqual(result.supportedVersions, [MODERN, LEGACY]);
  assert.deepEqual(result.supportedVersions, [...surfaces.MCP_STDIO_REVISIONS]);
  assert.equal(result.resultType, 'complete');
  assert.equal(result.ttlMs, 0);
  assert.equal(result.cacheScope, 'private');
  assert.deepEqual(result._meta['io.modelcontextprotocol/serverInfo'], { name: 'agentic-system-core', version: '0.0.2' });
  assert.deepEqual(Object.keys(result.capabilities).sort(), ['extensions', 'prompts', 'resources', 'tools']);
});

test('AGSC-09-19 (2): every result is complete, and the list and read results carry ttlMs 0 and cacheScope private', async () => {
  const { byId } = await session([modern(1, 'tools/list'), modern(2, 'prompts/list'), modern(3, 'resources/list'),
    modern(4, 'resources/templates/list'), modern(5, 'resources/read', { uri: 'memory://minimal/handoff' }),
    modern(6, 'tools/call', { arguments: { slug: 'handoff' }, name: 'read' }),
    modern(7, 'prompts/get', { arguments: { question: 'what is a handoff?' }, name: 'answer-from-this-memory-with-citations' })]);
  for (const id of [1, 2, 3, 4, 5]) {
    assert.equal(byId.get(id).result.resultType, 'complete', String(id));
    assert.equal(byId.get(id).result.ttlMs, 0, String(id));
    assert.equal(byId.get(id).result.cacheScope, 'private', String(id));
  }
  assert.deepEqual(byId.get(4).result.resourceTemplates, []);
  for (const id of [6, 7]) assert.equal(byId.get(id).result.resultType, 'complete', String(id));
  assert.equal(byId.get(6).result.isError, false);
});

test('AGSC-09-19 (3)-(5): the errors of 2026-07-28', async () => {
  const { byId } = await session([
    modern(1, 'resources/read', { uri: 'memory://minimal/no-such-item' }),
    modern(2, 'tools/call', { arguments: {}, name: 'no-such-tool' }),
    modern(3, 'tools/call', { arguments: { slug: 'no-such-item' }, name: 'read' }),
    modern(4, 'tools/list', {}, '1900-01-01'),
    modern(5, 'subscriptions/listen', { notifications: { toolsListChanged: true } }),
    modern(6, 'prompts/get', { arguments: {}, name: 'no-such-prompt' }),
  ]);
  assert.deepEqual(byId.get(1).error.code, -32602);
  assert.deepEqual(byId.get(1).error.data, { uri: 'memory://minimal/no-such-item' });
  assert.equal(byId.get(2).error.code, -32602);
  assert.equal(byId.get(3).result.isError, true);
  assert.equal(byId.get(3).result.structuredContent.body.code, 'AGSC-E301');
  assert.deepEqual(byId.get(4).error.code, -32022);
  assert.deepEqual(byId.get(4).error.data, { requested: '1900-01-01', supported: [MODERN, LEGACY] });
  assert.equal(byId.get(5).error.code, -32601);
  assert.equal(byId.get(6).error.code, -32602);
});

test('AGSC-09-19: a first request of a revision the server does not speak is -32022 naming both revisions', async () => {
  const { byId } = await session([modern(1, 'server/discover', {}, '2099-01-01')]);
  assert.deepEqual(byId.get(1).error.data, { requested: '2099-01-01', supported: [MODERN, LEGACY] });
});

test('AGSC-09-13: stdout carries protocol frames only, and nothing is written for a notification', async () => {
  const { lines } = await session([INITIALIZE, INITIALIZED, { jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 9 } }]);
  assert.equal(lines.length, 1);
  for (const line of lines) assert.equal(JSON.parse(line).jsonrpc, '2.0');
});

/* --------------------------------------------------------- the properties */

const callArb = fc.record({
  args: fc.oneof(
    fc.record({ slug: fc.constantFrom('handoff', 'supervisor', 'agent-patterns', 'no-such-item', '') }),
    fc.record({ query: fc.string({ maxLength: 12 }) }),
    fc.record({ selection: fc.array(fc.constantFrom('handoff', 'supervisor', 'nope'), { maxLength: 3 }) }),
    fc.constant({}),
  ),
  name: fc.constantFrom(...surfaces.TOOL_NAMES),
});

test('property: tools/list is the same list, in code-point order, whatever was called before it (2026-07-28)', async () => {
  const reference = JSON.stringify((await session([modern(1, 'tools/list')])).byId.get(1).result.tools);
  await fc.assert(fc.asyncProperty(fc.array(callArb, { maxLength: 4 }), async (calls) => {
    const frames = calls.map((c, i) => modern(i + 1, 'tools/call', { arguments: c.args, name: c.name }));
    frames.push(modern(100, 'tools/list'), modern(101, 'tools/list'));
    const { byId } = await session(frames);
    assert.equal(JSON.stringify(byId.get(100).result.tools), reference);
    assert.equal(JSON.stringify(byId.get(101).result.tools), reference);
  }), { numRuns: 25, seed: 20261106 });
});

test('property: under 2025-11-25 a tool answer is the 1.0 bytes, with MCP\'s isError beside them', async () => {
  const toolset = tools(bundle, OPTIONS);
  await fc.assert(fc.asyncProperty(fc.array(callArb, { minLength: 1, maxLength: 4 }), async (calls) => {
    const frames = [INITIALIZE, INITIALIZED, ...calls.map((c, i) => request(i + 2, 'tools/call', { arguments: c.args, name: c.name }))];
    const { byId } = await session(frames);
    for (const [i, c] of calls.entries()) {
      const envelope = await toolset.call(c.name, c.args);
      // The 1.0 server (SDK 1.32.2) wrote `{"content":[{"type":"text","text":…}],"structuredContent":…}`:
      // the same members in the same order, the envelope's bytes unchanged.
      const { isError, ...rest } = byId.get(i + 2).result;
      assert.equal(JSON.stringify(rest), JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(envelope) }], structuredContent: envelope }));
      assert.equal(isError, envelope.type === 'error');
    }
  }), { numRuns: 25, seed: 20261106 });
});

/* ------------------------------------------------------- the gate alone */

/** A Transport double: records what is sent, and can fail a send. */
function fakeWire(failSend = false) {
  const wire = {
    closed: 0, sent: [], started: 0,
    close: async () => { wire.closed += 1; },
    send: async (message) => { if (failSend) throw new Error('broken pipe'); wire.sent.push(message); },
    start: async () => { wire.started += 1; },
  };
  return wire;
}

test('the gate passes start, close, errors, closing and every other message through untouched', async () => {
  const wire = fakeWire();
  const gate = new core.StdioRevisionGate(wire);
  const seen = { closed: 0, errors: [], messages: [] };
  gate.onmessage = (m) => seen.messages.push(m);
  gate.onerror = (e) => seen.errors.push(e.message);
  gate.onclose = () => { seen.closed += 1; };
  await gate.start();
  const notification = { jsonrpc: '2.0', method: 'notifications/initialized' };
  const reply = { id: 7, jsonrpc: '2.0', result: {} };
  wire.onmessage(notification);
  wire.onmessage(reply);
  wire.onmessage(request(3, 'tools/list'));
  wire.onerror(new Error('read failed'));
  wire.onclose();
  await gate.send({ id: 3, jsonrpc: '2.0', result: { tools: [] } });
  await gate.close();
  assert.deepEqual(seen.messages, [notification, reply, request(3, 'tools/list')]);
  assert.deepEqual(seen.errors, ['read failed']);
  assert.equal(seen.closed, 1);
  assert.deepEqual(wire.sent, [{ id: 3, jsonrpc: '2.0', result: { tools: [] } }]);
  assert.equal(wire.started, 1);
  assert.equal(wire.closed, 1);
});

test('the gate reports a refusal it could not write, and a handshake-era read that failed otherwise keeps its error', async () => {
  const broken = fakeWire(true);
  const gate = new core.StdioRevisionGate(broken);
  const errors = [];
  gate.onerror = (e) => errors.push(e.message);
  broken.onmessage(modern(1, 'subscriptions/listen'));
  await new Promise((resolve) => { setImmediate(resolve); });
  assert.deepEqual(errors, ['broken pipe']);

  const wire = fakeWire();
  const other = new core.StdioRevisionGate(wire);
  other.onmessage = () => {};
  wire.onmessage(request(2, 'resources/read', { uri: 'memory://minimal/x' }));
  const internal = { error: { code: -32603, message: 'Internal error' }, id: 2, jsonrpc: '2.0' };
  await other.send(internal);
  assert.deepEqual(wire.sent, [internal]);
});
