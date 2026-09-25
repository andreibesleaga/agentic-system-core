#!/usr/bin/env node
'use strict';
// examples/demos/agents/mcp-call.js — one tool call against `agsc mcp`, made the way
// a Model Context Protocol client makes it, with nothing but Node.
//
//   node mcp-call.js <tool> '<json arguments>'      (run inside a Bundle)
//
// It starts `agsc mcp` as a child process over standard input and output, sends the
// three JSON-RPC lines every MCP client sends first — `initialize`, the
// `notifications/initialized` notice, then `tools/call` — and prints the tool's
// answer (the `structuredContent` of the result) as indented JSON. The child reads
// the Bundle it is started in and writes nothing; the SDK a real assistant uses
// sends these same lines. Exit 0 on an answer, 1 on a refusal or a protocol error.

const path = require('node:path');
const { spawn } = require('node:child_process');

const AGSC = path.join(__dirname, '..', '..', '..', 'bin', 'agsc.js');

function main() {
  const [tool, rawArguments] = process.argv.slice(2);
  if (!tool) {
    process.stderr.write("usage: node mcp-call.js <tool> '<json arguments>'\n");
    return 2;
  }
  const args = rawArguments === undefined ? {} : JSON.parse(rawArguments);
  const requests = [
    { id: 1, jsonrpc: '2.0', method: 'initialize', params: { capabilities: {}, clientInfo: { name: 'mcp-call', version: '1.0.0' }, protocolVersion: '2025-11-25' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { id: 2, jsonrpc: '2.0', method: 'tools/call', params: { arguments: args, name: tool } },
  ];
  const child = spawn(process.execPath, [AGSC, 'mcp'], { cwd: process.cwd(), env: process.env, stdio: ['pipe', 'pipe', 'inherit'] });
  let out = '';
  child.stdout.on('data', (chunk) => { out += chunk; });
  child.on('close', () => {
    const lines = out.split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line));
    const reply = lines.find((line) => line.id === 2);
    if (reply === undefined || reply.error) {
      process.stderr.write(`mcp-call: no answer to tools/call${reply ? `: ${JSON.stringify(reply.error)}` : ''}\n`);
      process.exitCode = 1;
      return;
    }
    const envelope = reply.result.structuredContent || JSON.parse(reply.result.content[0].text);
    process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
    if (reply.result.isError || envelope.type === 'error') process.exitCode = 1;
  });
  child.stdin.end(requests.map((r) => `${JSON.stringify(r)}\n`).join(''));
  return 0;
}

process.exitCode = main();
