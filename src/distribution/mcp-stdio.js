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
const {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const { MCP_PROTOCOL_VERSION, mcpCapabilities } = require('../boundary/surfaces.js');
const { catalogue } = require('./mcp-resources.js');
const { tools } = require('./mcp-tools.js');

const SERVER_NAME = 'agentic-system-core';

/**
 * createServer(bundle, options) -> { server, toolset, resources }
 * The wiring alone: one `tools/list` handler returning the shared manifest and
 * one `tools/call` handler returning the shared envelope. The envelope is
 * carried as the single `structuredContent` member plus its JSON text, so a
 * client that reads either sees the same bytes.
 *
 * Beside the seven tools it wires AGSC-09-14b's other two MCP primitives — the
 * items, `graph.jsonld` and `llms.txt` as read-only resources, and the one
 * prompt — from `distribution/mcp-resources.js`. `options.artifacts` is the
 * route map of a build, supplied by the application layer; without one the
 * resource list is empty and no byte is invented.
 */
function createServer(bundle, options) {
  const opts = options || {};
  const toolset = tools(bundle, opts);
  const resources = catalogue(bundle, opts);
  // AGSC-11-18 as amended at rc.5: `extensions` is MCP's map of extension
  // identifier to settings object, and this node's settings object carries exactly
  // `linkset`. The Boundary context owns both the identifier and the object
  // (`surfaces.mcpCapabilities`); the transport only carries what it is given, so
  // `server/discover` and the per-request capabilities cannot drift apart.
  const base = ((bundle && bundle.config && bundle.config.site) || {}).base;
  const server = new Server(
    { name: SERVER_NAME, version: opts.version || '0.0.0' },
    // AGSC-09-14b: a server that serves resources and prompts MUST say so —
    // "Servers that support resources MUST declare the `resources` capability",
    // "Servers that support prompts MUST declare the `prompts` capability"
    // (MCP, Resources and Prompts, revision 2026-07-28, read 2026-09-22).
    // Neither `listChanged` nor `subscribe` is declared: a Bundle is loaded once
    // and this server never mutates it, so it would promise a notification it
    // could never have cause to send.
    { capabilities: { ...mcpCapabilities({ base }), prompts: {}, resources: {}, tools: {} } },
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

  // AGSC-09-14b's resources and prompt. A MISS here is a PROTOCOL fault, not a
  // domain fault, so AGSC-09-13a's envelope does not apply and MCP's own rule
  // does: "If the requested resource does not exist, servers MUST return a
  // JSON-RPC error with code `-32602` (Invalid Params)" (MCP, Resources,
  // revision 2026-07-28, read 2026-09-22), and for prompts "Invalid prompt
  // name: `-32602`; Missing required arguments: `-32602`" (MCP, Prompts, same
  // revision, same day). The envelope stays what a TOOL returns.
  server.setRequestHandler(ListResourcesRequestSchema, async () => resources.list());

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const found = resources.read(request.params.uri);
    if (found === null) {
      throw new McpError(ErrorCode.InvalidParams, 'Resource not found', { uri: request.params.uri });
    }
    return found;
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => resources.prompts());

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const found = resources.prompt(request.params.name, request.params.arguments || {});
    if (found === null) {
      throw new McpError(ErrorCode.InvalidParams, 'Unknown prompt, or the required argument "question" is missing',
        { name: request.params.name });
    }
    return found;
  });

  return { resources, server, toolset };
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
 * STREAMING verb and prints no diagnostic line for it (F's interim
 * `protocolOnlyStdout` monkey-patch of the host stream is deleted).
 */
function serve(ctx) {
  const context = ctx || {};
  // The Bundle is LOADED BY THE APPLICATION LAYER and injected: Distribution
  // reads the other contexts' results and assembles nothing (the context map
  // of docs/ARCHITECTURE-DDD.md §2; `application/bundle.js` owns the loader
  // since). A caller that supplies none gets a programming fault, not
  // a silent empty Bundle.
  const bundle = context.bundle;
  if (bundle === undefined || bundle === null) {
    throw new TypeError('mcp-stdio.serve: ctx.bundle is required (application/bundle.js#loadBundle loads it)');
  }
  const { server } = createServer(bundle, {
    artifacts: context.artifacts,
    config: context.config,
    version: context.version,
  });
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
