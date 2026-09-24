'use strict';
// Integration test for the MCP stdio transport. AGSC-09-13,
// AGSC-09-13a, AGSC-11-18.
//
// It spawns the real CLI (`bin/agsc.js mcp`) on the fixture Bundle with a
// FIXED clock (`SOURCE_DATE_EPOCH`) and no network, exchanges real JSON-RPC
// frames over stdio, and asserts that stdout carries protocol bytes and
// nothing else. Deterministic: the exchange is driven by stdin, the child
// exits on EOF, and nothing in the path reads a wall clock.

const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
/** 2026-01-01T00:00:00Z — the fixed instant every test in this repository uses. */
const EPOCH = '1767225600';

function exchange(messages) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'bin', 'agsc.js'), 'mcp'], {
      cwd: path.join(ROOT, 'tests', 'fixtures', 'minimal'),
      env: { NO_COLOR: '1', PATH: process.env.PATH, SOURCE_DATE_EPOCH: EPOCH },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    let sent = 0;
    const sendNext = () => {
      if (sent >= messages.length) { child.stdin.end(); return; }
      child.stdin.write(`${JSON.stringify(messages[sent])}\n`);
      sent += 1;
    };
    // Drive the exchange from the responses, never from a timer: the next
    // frame goes out when the previous one has come back, so the test cannot
    // race and needs no sleep.
    let seen = 0;
    child.stdout.on('data', () => {
      const complete = out.split('\n').filter((l) => l.trim() !== '').length;
      if (complete > seen) { seen = complete; sendNext(); }
    });
    sendNext();
    child.on('exit', (code) => resolve({ code, err, out }));
  });
}

const INITIALIZE = {
  id: 1,
  jsonrpc: '2.0',
  method: 'initialize',
  params: { capabilities: {}, clientInfo: { name: 'test', version: '0' }, protocolVersion: '2025-11-25' },
};

test('AGSC-09-13: initialize, tools/list and tools/call over real stdio frames', async () => {
  const { code, err, out } = await exchange([
    INITIALIZE,
    { id: 2, jsonrpc: '2.0', method: 'tools/list' },
    { id: 3, jsonrpc: '2.0', method: 'tools/call', params: { arguments: { slug: 'no-such-item' }, name: 'read' } },
  ]);
  const frames = out.split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
  assert.strictEqual(frames.length, 3, out);

  // AGSC-11-18: the extension identifier is advertised in the capabilities.
  // rc.5: the map of identifier to settings object, `linkset` and no more.
  assert.deepStrictEqual(frames[0].result.capabilities.extensions,
    { 'com.agenticsystemcore/knowledge': { linkset: 'https://minimal.example/.well-known/knowledge-linkset' } });
  assert.strictEqual(frames[0].result.protocolVersion, '2025-11-25');

  // AGSC-09-13: exactly seven tools, the same seven the browser registers.
  assert.deepStrictEqual(frames[1].result.tools.map((t) => t.name),
    ['ask', 'compose', 'links', 'propose', 'read', 'remember', 'search']);

  // AGSC-09-13a: a domain fault is a RESULT carrying the AGSC-08-18 envelope,
  // never a JSON-RPC error member.
  assert.strictEqual(frames[2].error, undefined);
  assert.deepStrictEqual(frames[2].result.structuredContent, {
    body: { code: 'AGSC-E301', message: 'no item with that slug in this Bundle' },
    license: 'LicenseRef-AgenticSystemCore-Content-Use-1.0',
    source: 'read',
    trust: 'untrusted',
    type: 'error',
  });
  assert.strictEqual(JSON.parse(frames[2].result.content[0].text).body.code, 'AGSC-E301');

  // AGSC-09-13: no non-protocol byte on stdout; the CLI's own verb line is
  // suppressed for this verb. SHOULD exit on stdin EOF: it does, cleanly.
  assert.strictEqual(err, '');
  assert.strictEqual(code, 0);
});

test('AGSC-09-13: a successful call returns the same envelope the tools produce', async () => {
  const { out } = await exchange([
    INITIALIZE,
    { id: 2, jsonrpc: '2.0', method: 'tools/call', params: { arguments: { slug: 'handoff' }, name: 'read' } },
  ]);
  const frames = out.split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
  const envelope = frames[1].result.structuredContent;
  assert.strictEqual(envelope.type, 'item');
  assert.strictEqual(envelope.trust, 'untrusted');
  assert.strictEqual(envelope.body.iri, 'https://minimal.example/concepts/handoff/');
});

test('a protocol fault stays a JSON-RPC error — that is what error results are for', async () => {
  const { out } = await exchange([
    INITIALIZE,
    { id: 2, jsonrpc: '2.0', method: 'no/such/method' },
  ]);
  const frames = out.split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
  assert.ok(frames[1].error, JSON.stringify(frames[1]));
  assert.strictEqual(frames[1].result, undefined);
});

test('serve writes protocol frames to the stdout it is given, and nothing else (AGSC-09-13)', async () => {
  const { serve } = require('../../src/distribution/mcp-stdio.js');
  const { PassThrough } = require('node:stream');
  const bundle = { config: {}, items: [{ body: '', frontmatter: {}, slug: 'a', type: 'concept' }] };
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const frames = [];
  stdout.setEncoding('utf8');
  stdout.on('data', (d) => frames.push(d));
  // No stream is monkey-patched any more: `application/cli/main.js` knows `mcp`
  // is a streaming verb and prints nothing on stdout.
  await serve({ bundle, stdin, stdout });
  stdin.write(`${JSON.stringify(INITIALIZE)}\n`);
  await new Promise((resolve) => { stdout.once('data', resolve); });
  assert.match(frames.join(''), /"protocolVersion":"2025-11-25"/u);
  assert.ok(frames.every((f) => f.trim().startsWith('{')), 'a non-protocol byte reached stdout');
  stdin.end();
});

test('serve refuses to run without a Bundle: the application layer loads it', () => {
  const { serve } = require('../../src/distribution/mcp-stdio.js');
  assert.throws(() => serve({}), /ctx\.bundle is required/u);
});

test('createServer wires the shared toolset without touching any stream', () => {
  const { createServer, SERVER_NAME, MCP_PROTOCOL_VERSION } = require('../../src/distribution/mcp-stdio.js');
  const bundle = { config: {}, items: [{ body: '', frontmatter: {}, slug: 'a', type: 'concept' }] };
  const { server, toolset } = createServer(bundle, { version: '9.9.9' });
  assert.strictEqual(typeof server.connect, 'function');
  assert.strictEqual(toolset.manifest().tools.length, 7);
  assert.strictEqual(SERVER_NAME, 'agentic-system-core');
  assert.strictEqual(MCP_PROTOCOL_VERSION, '2025-11-25');
});
