'use strict';
// verifies AGSC-09-18
// Steps of features/persona-c-agent-mcp.feature for the Streamable HTTP transport (AGSC-09-18): an
// agent on the same machine starts `agsc mcp --http 0` and calls a tool through the official MCP
// client over HTTP (`@modelcontextprotocol/client`, revision 2026-07-28); the answer is the envelope
// the stdio form gives for the same call, a request from a page of another site is refused before a
// tool runs, and nothing is written. The HTTP server runs without the network trap of the other
// persona-c steps, because Node resolves even an address literal through `dns.lookup` when a
// server listens; the same call over standard input and output, which the answer is compared
// with, runs with every network call refused.

const assert = require('node:assert');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');

const { AGSC } = require('./_world.js');

const MODERN = '2026-07-28';
const META = {
  'io.modelcontextprotocol/clientCapabilities': {},
  'io.modelcontextprotocol/clientInfo': { name: 'acceptance', version: '1.0.0' },
  'io.modelcontextprotocol/protocolVersion': MODERN,
};

/** Start `agsc mcp --http 0` in the Bundle; resolves `{endpoint, stop}` once it reports its address. */
function start(world) {
  const child = spawn(process.execPath, [AGSC, 'mcp', '--http', '0'], { cwd: world.dir, env: world.env(), stdio: ['ignore', 'ignore', 'pipe'] });
  return new Promise((resolve, reject) => {
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (text) => {
      stderr += text;
      const m = /(http:\/\/\S+?\/mcp)\b/u.exec(stderr);
      if (m) resolve({ endpoint: new URL(m[1]), stop: () => new Promise((done) => { child.once('exit', done); child.kill(); }) });
    });
    child.on('exit', (code) => reject(new Error(`agsc mcp --http exited ${code}: ${stderr}`)));
  });
}

/** A `tools/list` POST from a page whose origin is `origin`; resolves the HTTP status and body. */
function fromOrigin(endpoint, origin) {
  const body = JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'tools/list', params: { _meta: META } });
  return new Promise((resolve, reject) => {
    const outgoing = http.request(endpoint, {
      headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json', 'MCP-Protocol-Version': MODERN,
        'Mcp-Method': 'tools/list', Origin: origin },
      method: 'POST',
    }, (response) => {
      let text = '';
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => resolve({ body: text, status: response.statusCode }));
    });
    outgoing.on('error', reject);
    outgoing.end(body);
  });
}

module.exports = [
  {
    pattern: '"agsc mcp --http 0" serves the acceptance Bundle and an MCP client of the revision 2026-07-28 calls tool "search" with the query "protocol" over HTTP',
    async run(world) {
      const { Client, StreamableHTTPClientTransport } = require('@modelcontextprotocol/client');
      world.state.before = world.snapshot();
      const server = await start(world);
      const client = new Client({ name: 'acceptance', version: '1.0.0' }, { capabilities: {}, versionNegotiation: { mode: { pin: MODERN } } });
      try {
        await client.connect(new StreamableHTTPClientTransport(server.endpoint));
        assert.strictEqual(client.getNegotiatedProtocolVersion(), MODERN);
        world.state.overHttp = await client.callTool({ arguments: { query: 'protocol' }, name: 'search' });
        world.state.foreign = await fromOrigin(server.endpoint, 'https://evil.example');
      } finally {
        await client.close();
        await server.stop();
      }
    },
  },
  {
    pattern: 'the answer is the envelope the server gives over standard input and output for the same call (AGSC-09-18)',
    run(world) {
      const frame = { id: 1, jsonrpc: '2.0', method: 'tools/call', params: { _meta: META, arguments: { query: 'protocol' }, name: 'search' } };
      const r = spawnSync(process.execPath, [AGSC, 'mcp'], { cwd: world.dir, encoding: 'utf8', env: world.offlineEnv(), input: `${JSON.stringify(frame)}\n` });
      assert.strictEqual(r.status, 0, r.stderr);
      assert.deepStrictEqual(world.networkAttempts(), []);
      const overStdio = JSON.parse(r.stdout.split('\n')[0]).result;
      const { overHttp } = world.state;
      assert.strictEqual(overHttp.isError, false);
      assert.strictEqual(overHttp.structuredContent.trust, 'untrusted');
      assert.deepStrictEqual(overHttp.structuredContent, overStdio.structuredContent);
      assert.deepStrictEqual(overHttp.content, overStdio.content);
    },
  },
  {
    pattern: 'a request from the origin "https://evil.example" is refused with HTTP 403 and runs no tool',
    run(world) {
      const { body, status } = world.state.foreign;
      assert.strictEqual(status, 403);
      assert.ok(!body.includes('"result"'), body);
    },
  },
];
