'use strict';
// tests/application/cli/mcp-http-verb.test.js — the `mcp` verb's HTTP form (AGSC-09-09, AGSC-09-18),
// in process: the flags `--http <port>` and `--bind <address>`, the address reported on standard
// error, and a port that cannot be had. The vectors cli-0029 to cli-0031 run the same verb as a
// child process; this file is where its lines are measured.
//
// Deterministic: the fixture Bundle at the fixed instant, loopback only, every server closed.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

const mcp = require('../../../src/application/cli/verbs/mcp.js');
const { main } = require('../../../src/application/cli/main.js');
const { createFileSystem } = require('../../../src/adapters/node-fs.js');
const { createClock } = require('../../../src/adapters/node-clock.js');

const FIXTURE = path.join(__dirname, '..', '..', 'fixtures', 'minimal');

/** The verb's context as `application/cli/main.js` builds it, for the HTTP form. */
function context(verbFlags) {
  let stderr = '';
  return {
    ctx: {
      config: {},
      env: {},
      ports: { clock: createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } }), fs: createFileSystem(FIXTURE) },
      root: FIXTURE,
      specVersion: '1.0.0',
      stderr: { write: (text) => { stderr += text; } },
      verbFlags,
      version: '0.0.2',
    },
    stderr: () => stderr,
  };
}

test('AGSC-09-09: --http takes one decimal port from 0 to 65535 and --bind one loopback address', () => {
  assert.equal(mcp.httpAddress({}), null);
  assert.equal(mcp.httpAddress(undefined), null);
  assert.deepEqual(mcp.httpAddress({ http: '0' }), { bind: '127.0.0.1', port: 0 });
  assert.deepEqual(mcp.httpAddress({ http: '65535', bind: '127.8.9.10' }), { bind: '127.8.9.10', port: 65535 });
  assert.deepEqual(mcp.httpAddress({ http: '8080', bind: '::1' }), { bind: '::1', port: 8080 });
  for (const flags of [{ http: '65536' }, { http: '-1' }, { http: 'abc' }, { http: '' }, { http: '1e3' }, { http: '123456' },
    { bind: '127.0.0.1' }, { http: '0', bind: '0.0.0.0' }, { http: '0', bind: 'localhost' }, { http: '0', bind: '::ffff:127.0.0.1' },
    { http: '0', bind: '[::1]' }, { http: '0', bind: '10.0.0.1' }]) {
    assert.throws(() => mcp.httpAddress(flags), (e) => e.code === 'AGSC-E003', JSON.stringify(flags));
  }
});

test('AGSC-09-08: a flag fault of mcp is a usage error, exit 2, with the code on standard error', async () => {
  let stderr = '';
  const exit = await main(['mcp', '--http', '0', '--bind', '0.0.0.0'], {
    env: { SOURCE_DATE_EPOCH: '1767225600' }, ports: { fs: createFileSystem(FIXTURE) }, root: FIXTURE,
    stderr: { write: (text) => { stderr += text; } }, stdout: { write: () => {} },
  });
  assert.equal(exit, 2);
  assert.match(stderr, /AGSC-E003/u);
});

test('AGSC-09-18: mcp --http 0 listens on the loopback address, reports it on standard error and serves /mcp', async () => {
  const { ctx, stderr } = context({ http: '0' });
  const running = await mcp.run(ctx);
  try {
    const m = /at (http:\/\/127\.0\.0\.1:(\d+)\/mcp) \(loopback only, read-only\)/u.exec(stderr());
    assert.ok(m, stderr());
    const answer = await new Promise((resolve, reject) => {
      const body = JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'server/discover', params: { _meta: {
        'io.modelcontextprotocol/clientCapabilities': {},
        'io.modelcontextprotocol/clientInfo': { name: 'verb-test', version: '0' },
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      } } });
      const outgoing = http.request(m[1], { headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'server/discover' }, method: 'POST' }, (response) => {
        let text = '';
        response.on('data', (chunk) => { text += chunk; });
        response.on('end', () => resolve({ body: JSON.parse(text), status: response.statusCode }));
      });
      outgoing.on('error', reject);
      outgoing.end(body);
    });
    assert.equal(answer.status, 200);
    assert.deepEqual(answer.body.result.supportedVersions, ['2026-07-28']);
  } finally {
    await running.close();
  }
});

test('a port that cannot be had rejects, so the shell reports it and nothing listens', async () => {
  const taken = http.createServer();
  await new Promise((resolve) => taken.listen(0, '127.0.0.1', resolve));
  try {
    const { ctx, stderr } = context({ http: String(taken.address().port) });
    await assert.rejects(mcp.run(ctx), /EADDRINUSE/u);
    assert.equal(stderr(), '');
  } finally {
    await new Promise((resolve) => taken.close(resolve));
  }
});
