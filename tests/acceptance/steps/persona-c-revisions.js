'use strict';
// verifies AGSC-09-19
// Steps of features/persona-c-agent-mcp.feature for the MCP revision 2026-07-28 (AGSC-09-19): an
// agent that sends its revision in the `_meta` of each request is answered with no `initialize`,
// `server/discover` names both revisions the stdio server speaks, and a missing resource is the
// error that revision defines. The frames go to the real `agsc mcp` with no SDK in between, so
// what is asserted is the bytes the server wrote. Offline: every network call is refused.

const assert = require('node:assert');
const { spawnSync } = require('node:child_process');

const { AGSC } = require('./_world.js');

module.exports = [
  {
    pattern: 'an MCP client that speaks the revision 2026-07-28 asks "server/discover" and reads the resource "memory://agenticsystemcore/no-such-item", with no "initialize"',
    run(world) {
      // Two stateless requests, each carrying its revision in `_meta` (AGSC-09-19); no SDK in
      // between, so what is asserted is the bytes the server wrote.
      const meta = {
        'io.modelcontextprotocol/clientCapabilities': {},
        'io.modelcontextprotocol/clientInfo': { name: 'acceptance', version: '1.0.0' },
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      };
      const lines = [
        { id: 1, jsonrpc: '2.0', method: 'server/discover', params: { _meta: meta } },
        { id: 2, jsonrpc: '2.0', method: 'resources/read', params: { _meta: meta, uri: 'memory://agenticsystemcore/no-such-item' } },
      ];
      const r = spawnSync(process.execPath, [AGSC, 'mcp'], {
        cwd: world.dir, encoding: 'utf8', env: world.offlineEnv(), input: `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`,
      });
      assert.strictEqual(r.status, 0, r.stderr);
      world.state.answers = new Map(r.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((m) => [m.id, m]));
      assert.deepStrictEqual(world.networkAttempts(), []);
    },
  },
  {
    pattern: 'the server names the revisions "2026-07-28" and "2025-11-25", and its answer is complete and may not be cached (AGSC-09-19)',
    run(world) {
      const discovered = world.state.answers.get(1);
      assert.ok(discovered && discovered.result, JSON.stringify(discovered));
      assert.deepStrictEqual(discovered.result.supportedVersions, ['2026-07-28', '2025-11-25']);
      assert.strictEqual(discovered.result.resultType, 'complete');
      assert.strictEqual(discovered.result.ttlMs, 0);
      assert.strictEqual(discovered.result.cacheScope, 'private');
    },
  },
  {
    pattern: 'the missing resource is the JSON-RPC error -32602 that revision defines',
    run(world) {
      const answer = world.state.answers.get(2);
      assert.ok(answer && answer.error, `no JSON-RPC error: ${JSON.stringify(answer)}`);
      assert.strictEqual(answer.result, undefined);
      assert.strictEqual(answer.error.code, -32602, `the server answered ${answer.error.code}`);
      assert.deepStrictEqual(answer.error.data, { uri: 'memory://agenticsystemcore/no-such-item' });
    },
  },
];
