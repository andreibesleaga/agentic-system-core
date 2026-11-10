'use strict';
// Requirement: PRD-081 (docs/PRD.md).
// tests/distribution/mcp-http.test.js — the Streamable HTTP transport of the tool server
// (src-ts/distribution/mcp-http.ts, compiled to src/distribution/mcp-http.js; AGSC-09-18).
//
// What is proved here, beside the vectors cli-0029 to cli-0031:
//   * the host names a request may name are the three loopback names and the `--bind` address,
//     written as the URL parser writes a host;
//   * the two places where the transport adds to the official SDK — only `/mcp` is the endpoint,
//     and `subscriptions/listen` is an unknown method (404, -32601) once the SDK's checks admit
//     it, and otherwise the check's own answer (415, -32020, -32022, -32602) — and the errors of
//     AGSC-09-19 (4) (5) as this transport sends them;
//   * a property: a `Host` or an `Origin` that names no allowed host is 403 and runs no tool;
//   * transport parity: for one fixed list of requests of revision 2026-07-28, the real
//     `agsc mcp` answers with the same result bytes over standard input and output and over
//     HTTP; for revision 2025-11-25 the stdio server answers each tool call with the same tool
//     result less `resultType` and `_meta`, and the HTTP transport refuses the revision (-32022);
//   * an end-to-end run of the official client (`@modelcontextprotocol/client` 2.4.0,
//     `StreamableHTTPClientTransport`) against the real CLI: pinned to 2026-07-28, in `auto`
//     mode (it finds 2026-07-28 by `server/discover`), and in `legacy` mode, which opens with the
//     2025-11-25 handshake and is refused.
//
// Deterministic: the fixture Bundle and its build at the fixed instant, loopback only, no timer
// drives an assertion, a fixed fast-check seed.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const fc = require('fast-check');

const { Client, ResourceNotFoundError } = require('@modelcontextprotocol/client');

const mcpHttp = require('../../src/distribution/mcp-http.js');
const site = require('../../src/distribution/site.js');
const validate = require('../../src/knowledge/validate.js');
const { readSchemas, createFileSystem } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const { listenWith } = require('../../src/adapters/node-http-server.js');
const { loadBundle } = require('../../src/application/bundle.js');

const ROOT = path.resolve(__dirname, '..', '..');
const MINIMAL = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const AGSC = path.join(ROOT, 'bin', 'agsc.js');
/** 2026-01-01T00:00:00Z — the fixed instant every test in this repository uses. */
const EPOCH = '1767225600';
const ENV = { NO_COLOR: '1', PATH: process.env.PATH, SOURCE_DATE_EPOCH: EPOCH };
const MODERN = '2026-07-28';
const LEGACY = '2025-11-25';

const port = createFileSystem(MINIMAL);
const bundle = loadBundle(port, { schemas: validate.schemas(readSchemas(ROOT)) });
const artifacts = site.build(bundle, { clock: createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } }), fs: port },
  { specVersion: '1.0.0', version: '0.0.2' }).files;

const meta = {
  'io.modelcontextprotocol/clientCapabilities': {},
  'io.modelcontextprotocol/clientInfo': { name: 'http-test', version: '0' },
  'io.modelcontextprotocol/protocolVersion': MODERN,
};
const modern = (id, method, params = {}) => ({ id, jsonrpc: '2.0', method, params: { ...params, _meta: meta } });

/** The headers of AGSC-09-18 (4) for a request of 2026-07-28. */
function headersOf(message) {
  const name = message.params && (message.params.name || message.params.uri);
  return {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': MODERN,
    'Mcp-Method': message.method,
    ...(name === undefined ? {} : { 'Mcp-Name': name }),
  };
}

/** One request to `url` (`{hostname, port}`) with `node:http`, which lets a test send its own `Host`. */
function send(url, { body, headers = {}, method = 'POST', path: target = '/mcp' }) {
  return new Promise((resolve, reject) => {
    const outgoing = http.request({
      headers, host: url.hostname.replace(/^\[|\]$/gu, ''), method, path: target, port: url.port,
      setHost: !Object.keys(headers).some((h) => h.toLowerCase() === 'host'),
    }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => resolve({ body: text, headers: response.headers, status: response.statusCode }));
    });
    outgoing.on('error', reject);
    outgoing.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

/** The transport in process, behind the HTTP server adapter on 127.0.0.1; `calls` counts tool runs. */
async function inProcess(options = {}) {
  const transport = mcpHttp.createHttpHandler(bundle, { artifacts, version: '0.0.2', ...options });
  const running = await listenWith(transport.handle, { bind: '127.0.0.1', port: 0 });
  return {
    close: async () => { await transport.close(); await new Promise((resolve) => running.server.close(resolve)); },
    url: new URL(running.url),
  };
}

/** The real `agsc mcp --http 0` in the fixture; resolves `{url, stop}` once it reports its address. */
function startCli(argv = []) {
  const child = spawn(process.execPath, [AGSC, 'mcp', '--http', '0', ...argv], { cwd: MINIMAL, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  return new Promise((resolve, reject) => {
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (text) => {
      stderr += text;
      const m = /(http:\/\/\S+?\/mcp)\b/u.exec(stderr);
      if (m) {
        resolve({
          endpoint: new URL(m[1]),
          stdout: () => stdout,
          stop: () => new Promise((done) => { child.once('exit', done); child.kill(); }),
          url: new URL(m[1]),
        });
      }
    });
    child.on('exit', (code) => reject(new Error(`agsc mcp --http exited ${code}: ${stderr}`)));
  });
}

/* ------------------------------------------------------------ the allowed hosts */

test('AGSC-09-18 (3): the hosts a request may name are the loopback names and the --bind address', () => {
  assert.deepEqual(mcpHttp.allowedHosts(), ['127.0.0.1', 'localhost', '[::1]']);
  assert.deepEqual(mcpHttp.allowedHosts('127.0.0.1'), ['127.0.0.1', 'localhost', '[::1]']);
  assert.deepEqual(mcpHttp.allowedHosts('127.0.0.2'), ['127.0.0.1', 'localhost', '[::1]', '127.0.0.2']);
  // An IPv6 address is written in brackets and in its short form, as `Host` carries it.
  assert.deepEqual(mcpHttp.allowedHosts('::1'), ['127.0.0.1', 'localhost', '[::1]']);
  assert.deepEqual(mcpHttp.allowedHosts('0:0:0:0:0:0:0:1'), ['127.0.0.1', 'localhost', '[::1]']);
  assert.equal(mcpHttp.MCP_HTTP_PATH, '/mcp');
});

/* ------------------------------------------- what the transport adds to the SDK */

test('AGSC-09-18 (2), AGSC-09-19 (3) (4) (5): the endpoint, subscriptions/listen and the errors over HTTP', async () => {
  const server = await inProcess();
  try {
    const listen = modern(7, 'subscriptions/listen', { notifications: { toolsListChanged: true } });
    const refused = await send(server.url, { body: listen, headers: headersOf(listen) });
    assert.equal(refused.status, 404);
    assert.deepEqual(JSON.parse(refused.body), { error: { code: -32601, message: 'Method not found' }, id: 7, jsonrpc: '2.0' });
    // The header alone does not make a listen request: a body of another method is the SDK's mismatch.
    const list = modern(8, 'tools/list');
    const mismatch = await send(server.url, { body: list, headers: { ...headersOf(list), 'Mcp-Method': 'subscriptions/listen' } });
    assert.equal(mismatch.status, 400);
    assert.equal(JSON.parse(mismatch.body).error.code, -32020);
    // A tools/call with no Mcp-Name header is refused the same way (headersOf sends none for a body without a name).
    const search = modern(12, 'tools/call', { arguments: { query: 'x' }, name: 'search' });
    const nameless = await send(server.url, { body: search, headers: headersOf({ method: 'tools/call' }) });
    assert.deepEqual([nameless.status, JSON.parse(nameless.body).error.code], [400, -32020]);
    // Only /mcp is the endpoint; a query string does not change the path.
    assert.equal((await send(server.url, { body: list, headers: headersOf(list), path: '/mcp/' })).status, 404);
    assert.equal((await send(server.url, { body: list, headers: headersOf(list), path: '/mcp?x=1' })).status, 200);
    // AGSC-09-19 (4): a missing resource is -32602 with the URI; (5): an unknown tool is -32602.
    const read = modern(9, 'resources/read', { uri: 'memory://agenticsystemcore/no-such-item' });
    const missing = JSON.parse((await send(server.url, { body: read, headers: headersOf(read) })).body);
    assert.equal(missing.error.code, -32602);
    assert.deepEqual(missing.error.data, { uri: 'memory://agenticsystemcore/no-such-item' });
    const call = modern(10, 'tools/call', { arguments: {}, name: 'frobnicate' });
    assert.equal(JSON.parse((await send(server.url, { body: call, headers: headersOf(call) })).body).error.code, -32602);
  } finally {
    await server.close();
  }
});

test('AGSC-09-18 (4): a subscriptions/listen request that fails the checks gets the check\'s answer, not -32601', async () => {
  const server = await inProcess();
  try {
    const listen = (revision, withMeta = true) => ({
      id: 11, jsonrpc: '2.0', method: 'subscriptions/listen',
      params: withMeta ? { _meta: { ...meta, 'io.modelcontextprotocol/protocolVersion': revision } } : {},
    });
    const answer = async (body, headers) => {
      const got = await send(server.url, { body, headers: { ...headersOf(body), ...headers } });
      return [got.status, got.status === 415 ? null : JSON.parse(got.body).error.code];
    };
    // A revision the transport does not speak, in the header and the body: -32022.
    assert.deepEqual(await answer(listen('1999-01-01'), { 'MCP-Protocol-Version': '1999-01-01' }), [400, -32022]);
    // No `_meta` behind a header of 2026-07-28: the envelope error -32602.
    assert.deepEqual(await answer(listen(MODERN, false), {}), [400, -32602]);
    // A body that is not declared as JSON: 415.
    assert.deepEqual(await answer(listen(MODERN), { 'Content-Type': 'text/plain' }), [415, null]);
    // Header and body disagree: -32020.
    assert.deepEqual(await answer(listen('1999-01-01'), {}), [400, -32020]);
    // Every check passed: the method is unknown.
    assert.deepEqual(await answer(listen(MODERN), {}), [404, -32601]);
  } finally {
    await server.close();
  }
});

test('a listen header over a body that is not JSON is the SDK\'s answer, not the gate\'s', async () => {
  const server = await inProcess();
  try {
    const got = await send({ hostname: server.url.hostname, port: server.url.port }, {
      headers: { ...headersOf({ method: 'subscriptions/listen' }) }, method: 'POST',
    });
    assert.notEqual(got.status, 404);
  } finally {
    await server.close();
  }
});

test('the adapter destroys the response of a handler that rejects, and the server keeps listening', async () => {
  const running = await listenWith(() => Promise.reject(new Error('handler fault')), { bind: '127.0.0.1', port: 0 });
  try {
    await assert.rejects(send(new URL(running.url), { method: 'GET', path: '/' }), /socket hang up|ECONNRESET/u);
    await assert.rejects(send(new URL(running.url), { method: 'GET', path: '/' }), /socket hang up|ECONNRESET/u);
  } finally {
    await new Promise((resolve) => running.server.close(resolve));
  }
});

test('property: a Host or an Origin naming a host that is not allowed is 403, and no tool runs', async () => {
  const server = await inProcess({ bind: '127.0.0.2' });
  const allowed = new Set(mcpHttp.allowedHosts('127.0.0.2'));
  const label = fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/u);
  const host = fc.oneof(fc.array(label, { maxLength: 3, minLength: 1 }).map((parts) => `${parts.join('.')}.example`),
    fc.tuple(fc.integer({ max: 255, min: 0 }), fc.integer({ max: 255, min: 3 })).map(([a, b]) => `127.0.${a}.${b}`));
  const call = modern(1, 'tools/call', { arguments: { slug: 'supervisor' }, name: 'propose' });
  try {
    await fc.assert(fc.asyncProperty(host, fc.boolean(), async (name, inOrigin) => {
      fc.pre(!allowed.has(name));
      const headers = inOrigin ? { ...headersOf(call), Origin: `http://${name}:5173` } : { ...headersOf(call), Host: `${name}:80` };
      const got = await send(server.url, { body: call, headers });
      assert.equal(got.status, 403);
      assert.ok(!got.body.includes('"result"'), got.body);
    }), { numRuns: 40, seed: 20261106 });
  } finally {
    await server.close();
  }
});

/* ----------------------------------------------------------- transport parity */

/** The fixed requests of the parity test: every list, the ten tools, one resource, one prompt. */
function parityRequests() {
  const calls = [
    ['ask', { question: 'what is a supervisor?' }], ['brief', { selection: ['supervisor'] }], ['check', { selection: ['supervisor'] }],
    ['compose', { selection: ['supervisor'] }], ['explain', { key: 'related', source: 'supervisor', target: 'handoff' }],
    ['links', { slug: 'supervisor' }], ['propose', { slug: 'supervisor' }], ['read', { slug: 'supervisor' }],
    ['remember', { body: 'A note.', kind: 'note', title: 'A note' }], ['search', { query: 'supervisor' }],
    ['read', {}], ['search', { query: '' }],
  ];
  return [
    ['tools/list', {}], ['resources/list', {}], ['resources/templates/list', {}], ['prompts/list', {}],
    ['resources/read', { uri: 'memory://minimal/supervisor' }],
    ...calls.map(([name, args]) => ['tools/call', { arguments: args, name }]),
  ].map(([method, params], i) => modern(i + 1, method, params));
}

/** Frames to `agsc mcp` over standard input and output; the answers by id. */
function overStdio(frames) {
  const run = spawnSync(process.execPath, [AGSC, 'mcp'], {
    cwd: MINIMAL, encoding: 'utf8', env: ENV, input: frames.map((f) => `${JSON.stringify(f)}\n`).join(''), maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr);
  return new Map(run.stdout.split('\n').filter(Boolean).map((line) => JSON.parse(line)).map((m) => [m.id, m]));
}

test('transport parity, revision 2026-07-28: standard input and output and HTTP give the same result bytes', async () => {
  const requests = parityRequests();
  const stdio = overStdio(requests);
  const cli = await startCli();
  try {
    for (const request of requests) {
      const got = await send(cli.url, { body: request, headers: headersOf(request) });
      assert.equal(got.status, 200, `${request.method} ${got.body}`);
      assert.equal(got.headers['content-type'], 'application/json', 'one JSON object, never a stream (AGSC-09-18 (5))');
      assert.equal(got.headers['mcp-session-id'], undefined);
      const answer = JSON.parse(got.body);
      assert.ok(answer.result, got.body);
      assert.equal(JSON.stringify(answer.result), JSON.stringify(stdio.get(request.id).result),
        `${request.method} ${request.params.name || ''}: the result bytes differ between the transports`);
    }
    // server/discover differs in one member only, which AGSC-09-19 (1) sets per transport.
    const discover = modern(99, 'server/discover');
    const overHttp = JSON.parse((await send(cli.url, { body: discover, headers: headersOf(discover) })).body).result;
    const overStdin = overStdio([discover]).get(99).result;
    assert.deepEqual(overHttp.supportedVersions, [MODERN]);
    assert.deepEqual(overStdin.supportedVersions, [MODERN, LEGACY]);
    assert.equal(JSON.stringify({ ...overHttp, supportedVersions: [] }), JSON.stringify({ ...overStdin, supportedVersions: [] }));
    assert.equal(cli.stdout(), '', 'the HTTP form writes nothing on standard output');
  } finally {
    await cli.stop();
  }
});

test('transport parity, revision 2025-11-25: stdio answers each tool with the same tool result, and HTTP refuses the revision', async () => {
  const calls = parityRequests().filter((r) => r.method === 'tools/call');
  const legacyFrames = [
    { id: 0, jsonrpc: '2.0', method: 'initialize', params: { capabilities: {}, clientInfo: { name: 'http-test', version: '0' }, protocolVersion: LEGACY } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    ...calls.map(({ id, jsonrpc, method, params: { _meta: _, ...params } }) => ({ id, jsonrpc, method, params })),
  ];
  const legacy = overStdio(legacyFrames);
  const cli = await startCli();
  try {
    for (const request of calls) {
      const answer = JSON.parse((await send(cli.url, { body: request, headers: headersOf(request) })).body);
      // 2026-07-28 adds `resultType` and the server's identity in `_meta` to every result.
      const { _meta: identity, resultType, ...rest } = answer.result;
      assert.equal(resultType, 'complete');
      assert.equal(identity['io.modelcontextprotocol/serverInfo'].name, 'agentic-system-core');
      assert.equal(JSON.stringify(rest), JSON.stringify(legacy.get(request.id).result), `${request.params.name}: the tool result differs`);
    }
    const initialize = legacyFrames[0];
    const refused = await send(cli.url, { body: initialize, headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' } });
    assert.equal(refused.status, 400);
    assert.deepEqual(JSON.parse(refused.body).error.data, { requested: LEGACY, supported: [MODERN] });
  } finally {
    await cli.stop();
  }
});

/* ------------------------------------------- the official client, end to end */

/** A connected official client over HTTP, opening as `mode` says. */
async function connectOverHttp(endpoint, mode) {
  const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/client');
  const client = new Client({ name: 'agsc-http-test', version: '1.0.0' }, { capabilities: {}, versionNegotiation: { mode } });
  await client.connect(new StreamableHTTPClientTransport(endpoint));
  return client;
}

for (const mode of [{ pin: MODERN }, 'auto']) {
  test(`the official client over Streamable HTTP (${JSON.stringify(mode)}) is served 2026-07-28 with the ten tools (AGSC-09-18)`, async () => {
    const cli = await startCli();
    const client = await connectOverHttp(cli.endpoint, mode);
    try {
      assert.equal(client.getNegotiatedProtocolVersion(), MODERN);
      const listed = await client.listTools();
      assert.deepEqual(listed.tools.map((t) => t.name), ['ask', 'brief', 'check', 'compose', 'explain', 'links', 'propose', 'read', 'remember', 'search']);
      const found = await client.callTool({ arguments: { query: 'supervisor' }, name: 'search' });
      assert.equal(found.isError, false);
      assert.equal(found.structuredContent.trust, 'untrusted');
      assert.equal(found.structuredContent.source, 'search');
      await assert.rejects(client.readResource({ uri: 'memory://agenticsystemcore/no-such-item' }), ResourceNotFoundError);
    } finally {
      await client.close();
      await cli.stop();
    }
  });
}

test('the official client that opens with the 2025-11-25 handshake is refused over HTTP (AGSC-09-18 (4))', async () => {
  const cli = await startCli();
  try {
    await assert.rejects(connectOverHttp(cli.endpoint, 'legacy'));
  } finally {
    await cli.stop();
  }
});
