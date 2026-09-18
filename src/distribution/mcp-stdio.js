'use strict';
/**
 * CONTEXT Distribution (Emission) — Surface: MCP over stdio.
 * Implements AGSC-09-13: the seven tools of `distribution/mcp-tools.js` over
 * stdio JSON-RPC, no non-protocol byte on stdout, logging to stderr only,
 * exiting on stdin EOF; AGSC-09-13a: a tool that cannot fulfil a call returns
 * the AGSC-08-18 envelope with `type: "error"`, never a JSON-RPC transport
 * error (those stay reserved for protocol faults); AGSC-11-18: the extension
 * identifier `com.agenticsystemcore/knowledge` is advertised in the server's
 * capabilities; AGSC-09-16: the manifest and the results are the same objects
 * the browser transport registers, because both call one implementation.
 * Requirements: PRD-023, D41, D68(2), research/25 R2-D2.
 *
 * The JSON-RPC framing, the initialize handshake and the version negotiation
 * are the official SDK's (`@modelcontextprotocol/sdk@1.30.0`, a real CommonJS
 * build) — never hand-rolled. The foreign protocol version strings live in
 * `boundary/surfaces.js`, the anti-corruption layer, and never in a tool
 * function.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { MCP_EXTENSION_ID, MCP_PROTOCOL_VERSION } = require('../boundary/surfaces.js');
const { tools } = require('./mcp-tools.js');

const SERVER_NAME = 'agentic-system-core';

/**
 * createServer(bundle, options) -> { server, toolset }
 * The wiring alone: one `tools/list` handler returning the shared manifest and
 * one `tools/call` handler returning the shared envelope. The envelope is
 * carried as the single `structuredContent` member plus its JSON text, so a
 * client that reads either sees the same bytes.
 */
function createServer(bundle, options) {
  const opts = options || {};
  const toolset = tools(bundle, opts);
  const server = new Server(
    { name: SERVER_NAME, version: opts.version || '0.0.0' },
    { capabilities: { extensions: [MCP_EXTENSION_ID], tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => toolset.manifest());

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const envelope = toolset.call(request.params.name, request.params.arguments || {});
    // AGSC-09-13a: a domain fault is an envelope with type "error", NOT a
    // JSON-RPC error and NOT `isError` — `isError` is MCP's own execution
    // flag and would hide the registered AGSC code from a conforming client.
    return {
      content: [{ text: JSON.stringify(envelope), type: 'text' }],
      structuredContent: envelope,
    };
  });

  return { server, toolset };
}

/**
 * serve(ctx) -> Promise<void>
 * The CLI entry point of the `mcp` verb (AGSC-09-07). `ctx` carries the
 * already-loaded Bundle, the configuration and the two streams; nothing here
 * reads a file, a clock or a network. The process exits when stdin reaches
 * EOF (AGSC-09-13).
 *
 * AGSC-09-13 ("MUST NOT write non-protocol bytes to stdout") is kept by the
 * CLI shell, not by a guard here: `application/cli/main.js` knows `mcp` is a
 * STREAMING verb and prints no diagnostic line for it (WP-10-G; F's interim
 * `protocolOnlyStdout` monkey-patch of the host stream is deleted).
 */
function serve(ctx) {
  const context = ctx || {};
  // The Bundle is LOADED BY THE APPLICATION LAYER and injected: Distribution
  // reads the other contexts' results and assembles nothing (the context map
  // of docs/ARCHITECTURE-DDD.md §2; `application/bundle.js` owns the loader
  // since WP-10-G). A caller that supplies none gets a programming fault, not
  // a silent empty Bundle.
  const bundle = context.bundle;
  if (bundle === undefined || bundle === null) {
    throw new TypeError('mcp-stdio.serve: ctx.bundle is required (application/bundle.js#loadBundle loads it)');
  }
  const { server } = createServer(bundle, { config: context.config, version: context.version });
  const stdin = context.stdin || process.stdin;
  const transport = new StdioServerTransport(stdin, context.stdout || process.stdout);
  stdin.on('end', () => {
    Promise.resolve(server.close()).catch(() => {});
  });
  return server.connect(transport);
}

module.exports = {
  MCP_PROTOCOL_VERSION,
  SERVER_NAME,
  createServer,
  serve,
};
