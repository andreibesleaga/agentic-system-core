'use strict';
/**
 * CONTEXT Distribution (Emission) — Surface: MCP over stdio.
 * Implements AGSC-09-13: the ten tools of `distribution/mcp-tools.js` over
 * stdio JSON-RPC, no non-protocol byte on stdout, logging to stderr only,
 * exiting on stdin EOF; AGSC-09-19: revision 2026-07-28, stateless, beside the
 * handshake revision 2025-11-25 that 1.0 spoke; AGSC-09-13a, AGSC-11-18 and
 * AGSC-09-16 through the core. Requirements: PRD-023.
 *
 * THE CLI ENTRY ONLY. The server itself — the official MCP SDK
 * (`@modelcontextprotocol/server`), the tools, the resources, the prompt and the
 * stdio gate of AGSC-09-19 — is `distribution/mcp-core.js`, compiled from
 * `src-ts/distribution/mcp-core.ts`; the HTTP transport builds its server there
 * too. This module checks what the application layer hands in and starts it.
 * The foreign protocol version strings live in `boundary/surfaces.js`, the
 * anti-corruption layer, and never in a tool function.
 */

const { MCP_PROTOCOL_VERSION } = require('../boundary/surfaces.js');
const core = require('./mcp-core.js');

/**
 * serve(ctx) -> Promise<{close}>
 * The CLI entry point of the `mcp` verb (AGSC-09-07). `ctx` carries the
 * already-loaded Bundle, the configuration and the two streams; nothing here
 * reads a file, a clock or a network. The process exits when stdin reaches
 * EOF (AGSC-09-13).
 *
 * AGSC-09-13 ("MUST NOT write non-protocol bytes to stdout") is kept by the
 * CLI shell, not by a guard here: `application/cli/main.js` knows `mcp` is a
 * STREAMING verb and prints no diagnostic line for it.
 */
function serve(ctx) {
  const context = ctx || {};
  // The Bundle is LOADED BY THE APPLICATION LAYER and injected: Distribution
  // reads the other contexts' results and assembles nothing (the context map
  // of docs/ARCHITECTURE-DDD.md §2; `application/bundle.js` owns the loader).
  // A caller that supplies none gets a programming fault, not a silent empty Bundle.
  const bundle = context.bundle;
  if (bundle === undefined || bundle === null) {
    throw new TypeError('mcp-stdio.serve: ctx.bundle is required (application/bundle.js#loadBundle loads it)');
  }
  const { stdin, stdout } = context;
  if (!stdin || !stdout) {
    throw new TypeError('mcp-stdio.serve: ctx.stdin and ctx.stdout are required (the application layer passes the process streams)');
  }
  return Promise.resolve(core.serveStdio({
    artifacts: context.artifacts,
    bundle,
    config: context.config,
    domain: context.domain,
    stdin,
    stdout,
    version: context.version,
  }));
}

module.exports = {
  MCP_PROTOCOL_VERSION,
  SERVER_NAME: core.SERVER_NAME,
  createServer: core.createServer,
  serve,
};
