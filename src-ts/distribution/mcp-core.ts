// src-ts/distribution/mcp-core.ts — CONTEXT Distribution (Emission) — the MCP core: the ten tools,
// the resources and the prompt of the local tool server on the OFFICIAL MCP TypeScript SDK
// (`@modelcontextprotocol/server`), for both MCP revisions the server speaks.
//
// Implements AGSC-09-13 (the ten tools, stdout protocol-only), AGSC-09-13a (a tool error is the
// AGSC-08-18 envelope in a result whose `isError` is true; a tool the server does not serve is a
// JSON-RPC error), AGSC-09-14b (the items, `graph.jsonld` and `llms.txt` as resources, one prompt),
// AGSC-09-19 (revision 2026-07-28, stateless, beside 2025-11-25 on standard input and output) and
// AGSC-11-18 (the capabilities and the extension map). Requirements: PRD-023.
//
// Why it is a thin adapter: the JSON-RPC framing, the version negotiation of both eras, the
// `initialize` handshake, `server/discover`, `resultType`, `ttlMs` and `cacheScope` are the SDK's
// (`serveStdio` picks the era from how a client opens and pins one server instance per process).
// The tools stay the JavaScript of `mcp-tools.js`, `mcp-resources.js` and `tool-answers.js`, so a
// tool answer is the same envelope on every transport (AGSC-09-16).
//
// What the SDK does not do, and the stdio gate below adds, each a sentence of AGSC-09-19 that SDK
// 2.4.0 answers otherwise (found by exchanging the vectors' frames with the SDK alone; the tests in
// tests/distribution/mcp-core.test.js hold each one):
//   1. `server/discover` lists both revisions of the stdio server; the SDK lists 2026-07-28 only.
//   2. A request whose `_meta` names a revision other than 2026-07-28 is -32022 naming both
//      revisions; the SDK names 2026-07-28 only, and serves such a request once the process has
//      answered a first one. Once a first request has fixed the revision of the process (point
//      5), the error names that revision only, so that a client retrying with a revision the
//      error names is served.
//   3. `subscriptions/listen` is answered as an unknown method (-32601); the SDK serves it. Only a
//      request that passes the checks before it is one: a listen request of another revision is
//      the -32022 of point 2, and one whose `_meta` lacks `clientCapabilities` is the SDK's -32602.
//   4. Under 2025-11-25 a missing resource is -32002, as that revision says; the SDK sends -32602.
//   5. The first request fixes the revision of the process, as the SDK pins one era per process
//      (MCP 2026-07-28, basic/versioning: legacy semantics are "scoped to the stdio process"; a
//      `server/discover` probe fixes nothing). Opened with `initialize`, the process answers a later
//      request of 2026-07-28 with -32022 naming 2025-11-25, instead of serving it with the members
//      of 2025-11-25; opened with 2026-07-28, the SDK answers a later `initialize` with -32022
//      naming 2026-07-28. A client that wants the other revision starts another process.
//
// PURE over the Bundle it is given: no clock, no network, no file read; the only I/O is the two
// streams the application layer hands in.

import {
  CLIENT_CAPABILITIES_META_KEY,
  JSONRPC_VERSION,
  PROTOCOL_VERSION_META_KEY,
  ProtocolError,
  ProtocolErrorCode,
  ResourceNotFoundError,
  SUPPORTED_PROTOCOL_VERSIONS,
  Server,
  UnsupportedProtocolVersionError,
  isJSONRPCErrorResponse,
  isJSONRPCRequest,
  isJSONRPCResultResponse,
} from '@modelcontextprotocol/server';
import type {
  CacheHint,
  GetPromptResult,
  JSONRPCMessage,
  JSONRPCRequest,
  ListPromptsResult,
  ListResourcesResult,
  ReadResourceResult,
  RequestId,
  Tool,
  Transport,
  TransportSendOptions,
} from '@modelcontextprotocol/server';
import { StdioServerTransport, serveStdio as serveOverStdio } from '@modelcontextprotocol/server/stdio';

import {
  MCP_ANNOTATIONS,
  MCP_PROTOCOL_VERSION,
  MCP_STDIO_REVISIONS,
  TOOL_NAMES,
  mcpCapabilities,
} from '../../src/boundary/surfaces.js';
import { catalogue } from '../../src/distribution/mcp-resources.js';
import { tools } from '../../src/distribution/mcp-tools.js';

/** The server's `name` in `serverInfo` (2025-11-25) and `io.modelcontextprotocol/serverInfo` (2026-07-28). */
export const SERVER_NAME = 'agentic-system-core';

/** What the application layer hands the core: the loaded Bundle's build and the engine version. */
export interface CoreOptions {
  /** The route map of the build the `mcp` verb made in memory; without one there is no resource. */
  readonly artifacts?: unknown;
  readonly config?: unknown;
  /** The site vocabulary (`knowledge/domain.js#load`) the brief reads domain links against. */
  readonly domain?: unknown;
  readonly version?: string;
}

/** The stdio entry: the Bundle, the options and the two process streams. */
export interface StdioContext extends CoreOptions {
  readonly bundle: object;
  readonly stdin: NodeJS.ReadableStream;
  readonly stdout: NodeJS.WritableStream;
}

/** The tool contract of `mcp-tools.js`, shared with the page tools (AGSC-09-16). */
interface Toolset {
  call(name: string, args: object): unknown;
  manifest(): { tools: readonly Tool[] };
}

/** The resources and the prompt of `mcp-resources.js` (AGSC-09-14b); a miss is null. */
interface Catalogue {
  list(): ListResourcesResult;
  read(uri: string): ReadResourceResult | null;
  prompts(): ListPromptsResult;
  prompt(name: string, args: object): GetPromptResult | null;
}

/**
 * AGSC-09-19 (2): the results that carry `ttlMs` 0 and `cacheScope` "private" under 2026-07-28.
 * The server answers from the Bundle on disk, which can change between two requests and holds
 * items that are not listed, so no result is fresh for a moment and none may be shared.
 */
const NOT_CACHED: CacheHint = { cacheScope: 'private', ttlMs: 0 };
const CACHED_METHODS = ['server/discover', 'tools/list', 'prompts/list', 'resources/list', 'resources/templates/list',
  'resources/read'] as const;

/** Code-point order of `name` (AGSC-09-19 (3)): the order is stated, not inherited from a manifest. */
function byName(a: { readonly name: string }, b: { readonly name: string }): number {
  if (a.name === b.name) return 0;
  return a.name < b.name ? -1 : 1;
}

/** The tool list of `tools/list`: the shared manifest with the MCP annotations, in code-point order. */
function listed(toolset: Toolset): Tool[] {
  return [...toolset.manifest().tools].sort(byName)
    .map((tool) => ({ ...tool, annotations: MCP_ANNOTATIONS[tool.name as keyof typeof MCP_ANNOTATIONS] }));
}

/** A tool's result: the envelope as JSON text and as `structuredContent`, and MCP's `isError` (AGSC-09-13a). */
function toolResult(envelope: { readonly type?: unknown }): { content: { type: 'text'; text: string }[]; isError: boolean; structuredContent: Record<string, unknown> } {
  return {
    content: [{ type: 'text', text: JSON.stringify(envelope) }],
    structuredContent: envelope as Record<string, unknown>,
    isError: envelope.type === 'error',
  };
}

/** What `createServer` returns: the SDK server, and the toolset and catalogue it serves. */
export interface CoreServer {
  readonly resources: Catalogue;
  readonly server: Server;
  readonly toolset: Toolset;
}

/**
 * A factory of official SDK servers over one loaded Bundle: the ten tools, the resources and the
 * prompt, for both revisions. The toolset and the catalogue are built once and shared by every
 * server the factory makes, so a transport that wants one server per request (the HTTP transport,
 * `mcp-http.ts`) pays for the Bundle once. The capabilities are those AGSC-11-18 pins: `prompts`,
 * `resources` and `tools`, none with `listChanged` or `subscribe` (a Bundle is loaded once and never
 * changes under the server), and the extension map of `surfaces.mcpCapabilities`.
 */
export function serverFactory(bundle: object, options: CoreOptions = {}): () => CoreServer {
  const toolset = tools(bundle, options) as unknown as Toolset;
  const resources = catalogue(bundle, options) as unknown as Catalogue;
  const base = (bundle as { config?: { site?: { base?: string } } }).config?.site?.base;
  return () => ({ resources, server: serve(toolset, resources, base, options.version), toolset });
}

/** One official SDK server over a loaded Bundle; the stdio entry builds its one server here. */
export function createServer(bundle: object, options: CoreOptions = {}): CoreServer {
  return serverFactory(bundle, options)();
}

/** The SDK server of the toolset and the catalogue, with the handlers of AGSC-09-13, 09-14b and 09-19. */
function serve(toolset: Toolset, resources: Catalogue, base: string | undefined, version: string | undefined): Server {
  const server = new Server({ name: SERVER_NAME, version: version ?? '0.0.0' }, {
    cacheHints: Object.fromEntries(CACHED_METHODS.map((method) => [method, NOT_CACHED])),
    capabilities: { ...mcpCapabilities(base === undefined ? {} : { base }), prompts: {}, resources: {}, tools: {} },
    // 2026-07-28 and every handshake revision the SDK negotiates, as 1.0 negotiated them.
    supportedProtocolVersions: [MCP_PROTOCOL_VERSION, ...SUPPORTED_PROTOCOL_VERSIONS],
  });
  server.setRequestHandler('tools/list', () => ({ tools: listed(toolset) }));
  server.setRequestHandler('tools/call', async (request) => {
    const { name } = request.params;
    // AGSC-09-19 (5): a tool the server does not serve is -32602, under both revisions.
    if (!(TOOL_NAMES as readonly string[]).includes(name)) {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Unknown tool: ${name}`, { name });
    }
    // `await`: the page's `brief` answers a promise; this server's answers are values.
    return toolResult(await toolset.call(name, request.params.arguments ?? {}) as { type?: unknown });
  });
  server.setRequestHandler('resources/list', () => resources.list());
  // AGSC-09-19 (2): the server holds no templates; the empty list still carries the cache members.
  server.setRequestHandler('resources/templates/list', () => ({ resourceTemplates: [] }));
  server.setRequestHandler('resources/read', (request) => {
    const found = resources.read(request.params.uri);
    // AGSC-09-19 (4): a protocol fault, -32602 with the URI as data (-32002 under 2025-11-25, below).
    if (found === null) throw new ResourceNotFoundError(request.params.uri, 'Resource not found');
    return found;
  });
  server.setRequestHandler('prompts/list', () => resources.prompts());
  server.setRequestHandler('prompts/get', (request) => {
    const found = resources.prompt(request.params.name, request.params.arguments ?? {});
    if (found === null) {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'Unknown prompt, or the required argument "question" is missing',
        { name: request.params.name });
    }
    return found;
  });
  return server;
}

/** The `_meta` of a request, when it has one. */
function metaOf(request: JSONRPCRequest): Record<string, unknown> | undefined {
  return (request.params as { _meta?: Record<string, unknown> } | undefined)?._meta;
}

/** The revision a request's `_meta` names (2026-07-28 and later), or undefined for a handshake-era request. */
function claimedRevision(request: JSONRPCRequest): unknown {
  return metaOf(request)?.[PROTOCOL_VERSION_META_KEY];
}

/** The `_meta` of 2026-07-28 carries the client's capabilities (MCP basic/index, "Request Metadata"). */
function hasClientCapabilities(request: JSONRPCRequest): boolean {
  const capabilities = metaOf(request)?.[CLIENT_CAPABILITIES_META_KEY];
  return typeof capabilities === 'object' && capabilities !== null;
}

/** The SDK's error for a revision the process does not serve, naming the ones it does. */
function unsupported(id: RequestId, requested: string, supported: readonly string[]): JSONRPCMessage {
  const fault = new UnsupportedProtocolVersionError({ requested, supported: [...supported] });
  return { error: { code: fault.code, data: fault.data, message: fault.message }, id, jsonrpc: JSONRPC_VERSION };
}

/** The handshake revisions of the stdio server: every one it speaks but 2026-07-28. */
const HANDSHAKE_REVISIONS: readonly string[] = MCP_STDIO_REVISIONS.filter((revision) => revision !== MCP_PROTOCOL_VERSION);

/**
 * Point 5: the server of a process the SDK has pinned to the handshake era. Each request of
 * 2026-07-28 that reaches it — in the order the SDK serves the requests, so a request sent right
 * after `initialize` is held too — is answered by the gate with -32022 naming the handshake
 * revision; every other message reaches the SDK server as before. From the moment the SDK pins
 * the era, before it serves `initialize`, the gate names the handshake revision alone in point 2.
 */
function pinnedToHandshake(server: Server, gate: StdioRevisionGate): Server {
  const connect = server.connect.bind(server);
  server.connect = async (channel: Transport): Promise<void> => {
    await connect(channel);
    gate.fix(HANDSHAKE_REVISIONS);
    const deliver = channel.onmessage;
    channel.onmessage = (message, extra) => {
      if (isJSONRPCRequest(message) && claimedRevision(message) === MCP_PROTOCOL_VERSION) {
        gate.answer(unsupported(message.id, MCP_PROTOCOL_VERSION, HANDSHAKE_REVISIONS));
        return;
      }
      deliver?.(message, extra);
    };
  };
  return server;
}

/**
 * The stdio gate: a Transport between the SDK's stdio transport and `serveStdio` that adds what
 * AGSC-09-19 asks of a server speaking both revisions and the SDK does not do (the four points
 * of the header). It answers two kinds of request itself, with the SDK's error codes, and
 * corrects two kinds of answer; every other message passes through untouched. `answer` also
 * writes the refusals of point 5, which the handshake-era server asks it for, and `fix` narrows
 * the revisions point 2 names once that server is pinned.
 */
export class StdioRevisionGate implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: Transport['onmessage'];
  readonly #wire: Transport;
  /** Requests of `server/discover`, and `resources/read` requests sent under a handshake revision. */
  readonly #discover = new Set<RequestId>();
  readonly #handshakeReads = new Set<RequestId>();
  /** The revisions the process still serves: both until the SDK pins the handshake era (point 5). */
  #served: readonly string[] = MCP_STDIO_REVISIONS;

  constructor(wire: Transport) {
    this.#wire = wire;
    wire.onmessage = (message, extra) => { this.#inbound(message, extra); };
    wire.onerror = (error) => { this.onerror?.(error); };
    wire.onclose = () => { this.onclose?.(); };
  }

  start(): Promise<void> { return this.#wire.start(); }

  close(): Promise<void> { return this.#wire.close(); }

  send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    return this.#wire.send(this.#outbound(message), options);
  }

  #inbound(message: JSONRPCMessage, extra: Parameters<NonNullable<Transport['onmessage']>>[1]): void {
    if (isJSONRPCRequest(message)) {
      const refusal = this.#refusal(message);
      if (refusal !== undefined) {
        this.answer(refusal);
        return;
      }
      const revision = claimedRevision(message);
      if (message.method === 'server/discover') this.#discover.add(message.id);
      // Point 5 the other way: the first served request of 2026-07-28 fixes that revision too.
      else if (revision === MCP_PROTOCOL_VERSION) this.fix([MCP_PROTOCOL_VERSION]);
      if (message.method === 'resources/read' && revision === undefined) this.#handshakeReads.add(message.id);
    }
    this.onmessage?.(message, extra);
  }

  /** Points 2 and 3, in that order: the answer of a request the server must not serve, or undefined. */
  #refusal(request: JSONRPCRequest): JSONRPCMessage | undefined {
    const revision = claimedRevision(request);
    if (typeof revision === 'string' && revision !== MCP_PROTOCOL_VERSION) {
      return unsupported(request.id, revision, this.#served);
    }
    if (request.method === 'subscriptions/listen' && revision === MCP_PROTOCOL_VERSION && hasClientCapabilities(request)) {
      return { error: { code: ProtocolErrorCode.MethodNotFound, message: 'Method not found' }, id: request.id, jsonrpc: JSONRPC_VERSION };
    }
    return undefined;
  }

  /** Point 2 after point 5: from now on the refusals of point 2 name only `revisions`. */
  fix(revisions: readonly string[]): void {
    this.#served = revisions;
  }

  /** Writes an answer the gate gives itself; a failed write is reported, as every write of the gate. */
  answer(message: JSONRPCMessage): void {
    this.#wire.send(message).catch((error: unknown) => { this.onerror?.(error as Error); });
  }

  /** Points 1 and 4: the answer as AGSC-09-19 words it. */
  #outbound(message: JSONRPCMessage): JSONRPCMessage {
    if (isJSONRPCResultResponse(message) && this.#discover.delete(message.id)) {
      return { ...message, result: { ...message.result, supportedVersions: [...MCP_STDIO_REVISIONS] } };
    }
    if (isJSONRPCErrorResponse(message) && message.id !== undefined && this.#handshakeReads.delete(message.id)) {
      const data = message.error.data as { uri?: unknown } | undefined;
      if (message.error.code === ProtocolErrorCode.InvalidParams && typeof data?.uri === 'string') {
        return { ...message, error: { ...message.error, code: ProtocolErrorCode.ResourceNotFound } };
      }
    }
    if ((isJSONRPCResultResponse(message) || isJSONRPCErrorResponse(message)) && message.id !== undefined) {
      this.#discover.delete(message.id);
      this.#handshakeReads.delete(message.id);
    }
    return message;
  }
}

/**
 * The stdio tool server (AGSC-09-13, AGSC-09-19): the SDK's `serveStdio` over the two streams,
 * through the gate, one server instance per process built by `createServer` (a handshake-era one
 * holds the requests of 2026-07-28 back, point 5). The SDK closes on
 * end of input, and the process then exits. Returns the SDK's handle (`close()`).
 */
export function serveStdio(context: StdioContext): { close(): Promise<void> } {
  const { bundle, stdin, stdout, ...options } = context;
  const wire = new StdioRevisionGate(new StdioServerTransport(stdin as never, stdout as never));
  return serveOverStdio(({ era }) => {
    const { server } = createServer(bundle, options);
    return era === 'legacy' ? pinnedToHandshake(server, wire) : server;
  }, { transport: wire });
}
