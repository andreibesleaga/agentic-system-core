// src-ts/distribution/mcp-http.ts — CONTEXT Distribution (Emission) — the Streamable HTTP transport
// of the local tool server (`agsc mcp --http <port>`) on the OFFICIAL MCP TypeScript SDK.
//
// Implements AGSC-09-18 (Streamable HTTP of MCP revision 2026-07-28 on a loopback address: one
// endpoint `/mcp`, POST only; `Origin` and `Host` checked against DNS rebinding; the request
// headers checked against the body; one `application/json` answer and never a stream; no
// session) and AGSC-09-19 for its results (`supportedVersions` of this transport is
// `["2026-07-28"]`, `subscriptions/listen` is an unknown method). Requirements: PRD-023.
//
// Wiring only. The protocol is the SDK's: `createMcpHandler` of `@modelcontextprotocol/server`
// serves 2026-07-28 statelessly with one server per request from the core's factory
// (`mcp-core.ts#serverFactory`, the same tools, resources and prompt as standard input and
// output), validates `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` against the body (-32020)
// and the `_meta` envelope (-32602), refuses every other revision (-32022) — `legacy: 'reject'`
// is how the 2025-11-25 handshake is refused on this transport —, answers GET and DELETE with 405,
// a notification with 202 and an unknown method with 404 and -32601, mints no `Mcp-Session-Id`
// and ignores one a client sends. Each answer is one JSON object: the SDK opens a stream only when
// a server sends a message before its result, and this server sends none (no progress, no log; the
// `responseMode: 'json'` option would say the same and print a warning about streams on each start).
// `@modelcontextprotocol/node` (the official Node adapter) turns the Node request into the web
// request the handler takes (`toNodeHandler`) and gives the two guards against DNS rebinding,
// `hostHeaderValidation` and `originValidation` (403), over the loopback names and the `--bind`
// address. Host names are compared as the WHATWG URL parser writes them, so ASCII case is ignored.
//
// Own code, each because the SDK has no option for it (audit record `B8-library-choice.md`):
//   1. the path: only `/mcp` is the endpoint, any other path is 404 (`toNodeHandler` routes no path);
//   2. `subscriptions/listen` is answered as an unknown method, 404 with -32601 (AGSC-09-19 (3));
//      `createMcpHandler` serves it from its own router whatever the server registers.
//
// No socket here: the Distribution context may not open one (`.dependency-cruiser.js`); the
// application layer listens through the HTTP server adapter and hands each request to `handle`.
// No file is written and no message sent: the tools return prepared text (AGSC-09-18, read-only).

import { createMcpHandler, JSONRPC_VERSION, ProtocolErrorCode } from '@modelcontextprotocol/server';
import type { McpHandlerRequestOptions } from '@modelcontextprotocol/server';
import { hostHeaderValidation, originValidation, toNodeHandler } from '@modelcontextprotocol/node';
import type { NodeIncomingMessageLike } from '@modelcontextprotocol/node';

import { serverFactory } from './mcp-core.js';
import type { CoreOptions } from './mcp-core.js';

/** The one endpoint of AGSC-09-18 (2). */
export const MCP_HTTP_PATH = '/mcp';

/** The loopback names every request may name in `Host` or `Origin` (AGSC-09-18 (3)). */
const LOOPBACK_NAMES = ['127.0.0.1', 'localhost', '[::1]'] as const;

/** What the application layer hands the transport: the core's options and the bound address. */
export interface HttpOptions extends CoreOptions {
  /** The address `--bind` names (a loopback address the application layer has checked). */
  readonly bind?: string;
}

/** The Node request and response, as the guards of `@modelcontextprotocol/node` take them. */
type NodeRequest = Parameters<ReturnType<typeof hostHeaderValidation>>[0];
type NodeResponse = Parameters<ReturnType<typeof hostHeaderValidation>>[1];

/** The transport: `handle` answers one Node request; `close` ends every exchange in flight. */
export interface HttpHandler {
  handle(req: NodeRequest, res: NodeResponse): Promise<void>;
  close(): Promise<void>;
}

/**
 * The host names a request may name (AGSC-09-18 (3)): the three loopback names and the `--bind`
 * address, written as the WHATWG URL parser writes a host (an IPv6 address in brackets, lower case),
 * which is how the SDK's guards read `Host` and `Origin`.
 */
export function allowedHosts(bind?: string): string[] {
  const hosts: string[] = [...LOOPBACK_NAMES];
  if (bind === undefined) return hosts;
  const named = new URL(`http://${bind.includes(':') ? `[${bind}]` : bind}/`).hostname;
  return hosts.includes(named) ? hosts : [...hosts, named];
}

/** Gap 2: a `subscriptions/listen` request (its header and its body agree) is answered as an unknown method. */
async function listenRefusal(request: Request): Promise<Response | undefined> {
  if (request.headers.get('mcp-method') !== 'subscriptions/listen') return undefined;
  const body: unknown = await request.clone().json().catch(() => undefined);
  const message = body as { id?: unknown; method?: unknown } | undefined;
  if (message?.method !== 'subscriptions/listen') return undefined;
  const id = typeof message.id === 'string' || typeof message.id === 'number' ? message.id : null;
  return Response.json({ error: { code: ProtocolErrorCode.MethodNotFound, message: 'Method not found' }, id, jsonrpc: JSONRPC_VERSION },
    { status: 404 });
}

/**
 * The Streamable HTTP transport over a loaded Bundle (AGSC-09-18). Each request passes the `Host`
 * guard, the `Origin` guard and the path, in that order, and then the SDK's handler; a request the
 * guards refuse runs no tool.
 */
export function createHttpHandler(bundle: object, options: HttpOptions = {}): HttpHandler {
  const { bind, ...core } = options;
  const factory = serverFactory(bundle, core);
  const mcp = createMcpHandler(() => factory().server, { legacy: 'reject' });
  const node = toNodeHandler({
    fetch: async (request: Request, extra?: McpHandlerRequestOptions) => await listenRefusal(request) ?? mcp.fetch(request, extra),
  });
  const hosts = allowedHosts(bind);
  const host = hostHeaderValidation(hosts);
  const origin = originValidation(hosts);
  return {
    async handle(req, res) {
      if (!host(req, res) || !origin(req, res)) return;
      if (new URL(req.url ?? '/', 'http://localhost').pathname !== MCP_HTTP_PATH) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found\n');
        return;
      }
      // The adapter's request type declares `method` and `url` without `undefined`, which Node's does not.
      await node(req as NodeIncomingMessageLike, res);
    },
    close: () => mcp.close(),
  };
}
