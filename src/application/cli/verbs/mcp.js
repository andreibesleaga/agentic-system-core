'use strict';
// src/application/cli/verbs/mcp.js — `mcp` (AGSC-09-07, AGSC-09-13): the ten
// tools over stdio JSON-RPC or, with `--http <port>`, over the Streamable HTTP
// transport on a loopback address (AGSC-09-18). A STREAMING verb: stdout carries
// protocol frames and nothing else, which `application/cli/main.js` guarantees by
// printing no diagnostic line and no envelope for it; over HTTP stdout stays
// empty and the address the server listens on is reported on stderr (AGSC-09-09).
//
// The application layer loads the Bundle and hands it to the Surface; the
// Surface reads no file (the context map). The HTTP socket is the HTTP server
// adapter's (`adapters/node-http-server.js#listenWith`), wired here as
// `application/hosting.js` wires it for `agsc-host serve`: Distribution may not
// open a socket, so `distribution/mcp-http.js` answers the requests this layer
// hands it.
//
// AGSC-09-14b also obliges the server to expose every item, `graph.jsonld` and
// `llms.txt` as MCP RESOURCES. Their bytes must be the ones the node publishes,
// so this verb runs the ordinary site build IN MEMORY — the same call the
// `build` verb makes, with the same options — and hands the route map over
// (`site.write` is never called, so nothing is written to disk). That is the
// only way the two can be the same bytes by construction rather than by two
// renderings agreeing; and it keeps Distribution free of file reads.
//
// The same route map gives the tools what a page reads (AGSC-09-16): the discovery
// document (the build instant and content version of `brief` and of the citation records
// of `read`) and the chunk lines `read` cites (AGSC-09-13). The site vocabulary, loaded as
// `lint` loads it, gives the brief its domain links (AGSC-07-25, AGSC-03-27).
//
// A build that fails must never stop the tool server: the tools read the loaded
// Bundle. In that case the resource list is empty, `read` carries no chunk and no
// byte is invented.

const site = require('../../../distribution/site.js');
const stdio = require('../../../distribution/mcp-stdio.js');
const mcpHttp = require('../../../distribution/mcp-http.js');
const { isLoopbackLiteral } = require('../../../boundary/federation.js');
const httpServer = require('../../../adapters/node-http-server.js');
const helpers = require('./_helpers.js');
const { siteModel } = require('./lint.js');

/** The address the HTTP transport binds when `--bind` names none (AGSC-09-18 (1)). */
const DEFAULT_BIND = '127.0.0.1';

/** The published route map, or an empty one. Never throws, never writes, never prints. */
function artifactsOf(ctx, bundle) {
  try {
    const built = site.build(bundle, ctx.ports, helpers.buildOptions(ctx));
    return built.files;
  } catch (e) {
    return new Map();
  }
}

/** A usage fault of the flags: `AGSC-E003`, exit 2, nothing started (AGSC-09-08). */
function usage(message) {
  const fault = new Error(message);
  fault.code = 'AGSC-E003';
  return fault;
}

/**
 * AGSC-09-09 and AGSC-09-18 (1): `--http <port>`, one decimal port from 0 to 65535, and
 * `--bind <address>`, an address in 127.0.0.0/8 or `::1`, which needs `--http`. Returns
 * `{port, bind}`, or null for the stdio form; a bad value throws the usage fault.
 */
function httpAddress(verbFlags) {
  const { bind, http } = verbFlags || {};
  if (http === undefined) {
    if (bind !== undefined) throw usage('--bind needs --http <port>: the address is the one the HTTP transport binds (AGSC-09-09)');
    return null;
  }
  if (!/^\d{1,5}$/u.test(http) || Number(http) > 65535) {
    throw usage(`--http needs one decimal port from 0 to 65535, not ${JSON.stringify(http)} (AGSC-09-09)`);
  }
  const address = bind === undefined ? DEFAULT_BIND : bind;
  if (!isLoopbackLiteral(address)) {
    throw usage(`--bind ${JSON.stringify(address)} is not a loopback address: one in 127.0.0.0/8, or ::1 (AGSC-09-18)`);
  }
  return { bind: address, port: Number(http) };
}

/**
 * The HTTP form: the transport over the Bundle, listening through the adapter; the address
 * goes to stderr. Resolves `{close}` once listening; a port that cannot be had rejects, and
 * the shell reports it (AGSC-E901).
 */
async function serveHttp(ctx, bundle, options, address) {
  const transport = mcpHttp.createHttpHandler(bundle, { ...options, bind: address.bind });
  const running = await httpServer.listenWith(transport.handle, address);
  const stderr = ctx.stderr || process.stderr;
  stderr.write(`agsc mcp: the ten tools over Streamable HTTP at ${running.url}${mcpHttp.MCP_HTTP_PATH.slice(1)}`
    + ' (loopback only, read-only); stop with Ctrl-C\n');
  return {
    close: () => Promise.all([transport.close(), new Promise((resolve) => running.server.close(resolve))]).then(() => undefined),
  };
}

function run(ctx) {
  // AGSC-09-08: a flag fault is a usage error before anything is read or started.
  const address = httpAddress(ctx.verbFlags);
  // AGSC-01-01: outside a Bundle there is no memory to serve; the server refuses
  // (exit 1, one AGSC-E901 line on stderr) instead of serving an empty one.
  const outside = helpers.outsideBundle(ctx, 'mcp');
  if (outside !== null) {
    const refusal = new Error(outside.message);
    refusal.code = outside.code;
    throw refusal;
  }
  const bundle = helpers.bundleOf(ctx);
  const options = {
    artifacts: artifactsOf(ctx, bundle),
    config: ctx.config,
    // AGSC-03-27: the site vocabulary, against which the brief reads the domain links (AGSC-07-25).
    domain: siteModel(bundle),
    version: ctx.version,
  };
  if (address !== null) return serveHttp(ctx, bundle, options, address);
  // The process streams are the host's; the application layer hands them in.
  return stdio.serve({ ...options, bundle, stdin: ctx.stdin || process.stdin, stdout: ctx.stdout || process.stdout });
}

module.exports = { artifactsOf, httpAddress, name: 'mcp', run };
