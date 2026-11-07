// generated from src-ts/distribution/mcp-core.ts by tsc 6.0.3; do not edit
"use strict";
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
//      answered a first one. Once `initialize` has fixed 2025-11-25 (point 5), the error names
//      that revision only, so that a client retrying with a revision the error names is served.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.StdioRevisionGate = exports.SERVER_NAME = void 0;
exports.serverFactory = serverFactory;
exports.createServer = createServer;
exports.serveStdio = serveStdio;
const server_1 = require("@modelcontextprotocol/server");
const stdio_1 = require("@modelcontextprotocol/server/stdio");
const surfaces_js_1 = require("../../src/boundary/surfaces.js");
const mcp_resources_js_1 = require("../../src/distribution/mcp-resources.js");
const mcp_tools_js_1 = require("../../src/distribution/mcp-tools.js");
/** The server's `name` in `serverInfo` (2025-11-25) and `io.modelcontextprotocol/serverInfo` (2026-07-28). */
exports.SERVER_NAME = 'agentic-system-core';
/**
 * AGSC-09-19 (2): the results that carry `ttlMs` 0 and `cacheScope` "private" under 2026-07-28.
 * The server answers from the Bundle on disk, which can change between two requests and holds
 * items that are not listed, so no result is fresh for a moment and none may be shared.
 */
const NOT_CACHED = { cacheScope: 'private', ttlMs: 0 };
const CACHED_METHODS = ['server/discover', 'tools/list', 'prompts/list', 'resources/list', 'resources/templates/list',
    'resources/read'];
/** Code-point order of `name` (AGSC-09-19 (3)): the order is stated, not inherited from a manifest. */
function byName(a, b) {
    if (a.name === b.name)
        return 0;
    return a.name < b.name ? -1 : 1;
}
/** The tool list of `tools/list`: the shared manifest with the MCP annotations, in code-point order. */
function listed(toolset) {
    return [...toolset.manifest().tools].sort(byName)
        .map((tool) => ({ ...tool, annotations: surfaces_js_1.MCP_ANNOTATIONS[tool.name] }));
}
/** A tool's result: the envelope as JSON text and as `structuredContent`, and MCP's `isError` (AGSC-09-13a). */
function toolResult(envelope) {
    return {
        content: [{ type: 'text', text: JSON.stringify(envelope) }],
        structuredContent: envelope,
        isError: envelope.type === 'error',
    };
}
/**
 * A factory of official SDK servers over one loaded Bundle: the ten tools, the resources and the
 * prompt, for both revisions. The toolset and the catalogue are built once and shared by every
 * server the factory makes, so a transport that wants one server per request (the HTTP transport,
 * `mcp-http.ts`) pays for the Bundle once. The capabilities are those AGSC-11-18 pins: `prompts`,
 * `resources` and `tools`, none with `listChanged` or `subscribe` (a Bundle is loaded once and never
 * changes under the server), and the extension map of `surfaces.mcpCapabilities`.
 */
function serverFactory(bundle, options = {}) {
    const toolset = (0, mcp_tools_js_1.tools)(bundle, options);
    const resources = (0, mcp_resources_js_1.catalogue)(bundle, options);
    const base = bundle.config?.site?.base;
    return () => ({ resources, server: serve(toolset, resources, base, options.version), toolset });
}
/** One official SDK server over a loaded Bundle; the stdio entry builds its one server here. */
function createServer(bundle, options = {}) {
    return serverFactory(bundle, options)();
}
/** The SDK server of the toolset and the catalogue, with the handlers of AGSC-09-13, 09-14b and 09-19. */
function serve(toolset, resources, base, version) {
    const server = new server_1.Server({ name: exports.SERVER_NAME, version: version ?? '0.0.0' }, {
        cacheHints: Object.fromEntries(CACHED_METHODS.map((method) => [method, NOT_CACHED])),
        capabilities: { ...(0, surfaces_js_1.mcpCapabilities)(base === undefined ? {} : { base }), prompts: {}, resources: {}, tools: {} },
        // 2026-07-28 and every handshake revision the SDK negotiates, as 1.0 negotiated them.
        supportedProtocolVersions: [surfaces_js_1.MCP_PROTOCOL_VERSION, ...server_1.SUPPORTED_PROTOCOL_VERSIONS],
    });
    server.setRequestHandler('tools/list', () => ({ tools: listed(toolset) }));
    server.setRequestHandler('tools/call', async (request) => {
        const { name } = request.params;
        // AGSC-09-19 (5): a tool the server does not serve is -32602, under both revisions.
        if (!surfaces_js_1.TOOL_NAMES.includes(name)) {
            throw new server_1.ProtocolError(server_1.ProtocolErrorCode.InvalidParams, `Unknown tool: ${name}`, { name });
        }
        // `await`: the page's `brief` answers a promise; this server's answers are values.
        return toolResult(await toolset.call(name, request.params.arguments ?? {}));
    });
    server.setRequestHandler('resources/list', () => resources.list());
    // AGSC-09-19 (2): the server holds no templates; the empty list still carries the cache members.
    server.setRequestHandler('resources/templates/list', () => ({ resourceTemplates: [] }));
    server.setRequestHandler('resources/read', (request) => {
        const found = resources.read(request.params.uri);
        // AGSC-09-19 (4): a protocol fault, -32602 with the URI as data (-32002 under 2025-11-25, below).
        if (found === null)
            throw new server_1.ResourceNotFoundError(request.params.uri, 'Resource not found');
        return found;
    });
    server.setRequestHandler('prompts/list', () => resources.prompts());
    server.setRequestHandler('prompts/get', (request) => {
        const found = resources.prompt(request.params.name, request.params.arguments ?? {});
        if (found === null) {
            throw new server_1.ProtocolError(server_1.ProtocolErrorCode.InvalidParams, 'Unknown prompt, or the required argument "question" is missing', { name: request.params.name });
        }
        return found;
    });
    return server;
}
/** The `_meta` of a request, when it has one. */
function metaOf(request) {
    return request.params?._meta;
}
/** The revision a request's `_meta` names (2026-07-28 and later), or undefined for a handshake-era request. */
function claimedRevision(request) {
    return metaOf(request)?.[server_1.PROTOCOL_VERSION_META_KEY];
}
/** The `_meta` of 2026-07-28 carries the client's capabilities (MCP basic/index, "Request Metadata"). */
function hasClientCapabilities(request) {
    const capabilities = metaOf(request)?.[server_1.CLIENT_CAPABILITIES_META_KEY];
    return typeof capabilities === 'object' && capabilities !== null;
}
/** The SDK's error for a revision the process does not serve, naming the ones it does. */
function unsupported(id, requested, supported) {
    const fault = new server_1.UnsupportedProtocolVersionError({ requested, supported: [...supported] });
    return { error: { code: fault.code, data: fault.data, message: fault.message }, id, jsonrpc: server_1.JSONRPC_VERSION };
}
/** The handshake revisions of the stdio server: every one it speaks but 2026-07-28. */
const HANDSHAKE_REVISIONS = surfaces_js_1.MCP_STDIO_REVISIONS.filter((revision) => revision !== surfaces_js_1.MCP_PROTOCOL_VERSION);
/**
 * Point 5: the server of a process the SDK has pinned to the handshake era. Each request of
 * 2026-07-28 that reaches it — in the order the SDK serves the requests, so a request sent right
 * after `initialize` is held too — is answered by the gate with -32022 naming the handshake
 * revision; every other message reaches the SDK server as before. From the moment the SDK pins
 * the era, before it serves `initialize`, the gate names the handshake revision alone in point 2.
 */
function pinnedToHandshake(server, gate) {
    const connect = server.connect.bind(server);
    server.connect = async (channel) => {
        await connect(channel);
        gate.fix(HANDSHAKE_REVISIONS);
        const deliver = channel.onmessage;
        channel.onmessage = (message, extra) => {
            if ((0, server_1.isJSONRPCRequest)(message) && claimedRevision(message) === surfaces_js_1.MCP_PROTOCOL_VERSION) {
                gate.answer(unsupported(message.id, surfaces_js_1.MCP_PROTOCOL_VERSION, HANDSHAKE_REVISIONS));
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
class StdioRevisionGate {
    onclose;
    onerror;
    onmessage;
    #wire;
    /** Requests of `server/discover`, and `resources/read` requests sent under a handshake revision. */
    #discover = new Set();
    #handshakeReads = new Set();
    /** The revisions the process still serves: both until the SDK pins the handshake era (point 5). */
    #served = surfaces_js_1.MCP_STDIO_REVISIONS;
    constructor(wire) {
        this.#wire = wire;
        wire.onmessage = (message, extra) => { this.#inbound(message, extra); };
        wire.onerror = (error) => { this.onerror?.(error); };
        wire.onclose = () => { this.onclose?.(); };
    }
    start() { return this.#wire.start(); }
    close() { return this.#wire.close(); }
    send(message, options) {
        return this.#wire.send(this.#outbound(message), options);
    }
    #inbound(message, extra) {
        if ((0, server_1.isJSONRPCRequest)(message)) {
            const refusal = this.#refusal(message);
            if (refusal !== undefined) {
                this.answer(refusal);
                return;
            }
            const revision = claimedRevision(message);
            if (message.method === 'server/discover')
                this.#discover.add(message.id);
            if (message.method === 'resources/read' && revision === undefined)
                this.#handshakeReads.add(message.id);
        }
        this.onmessage?.(message, extra);
    }
    /** Points 2 and 3, in that order: the answer of a request the server must not serve, or undefined. */
    #refusal(request) {
        const revision = claimedRevision(request);
        if (typeof revision === 'string' && revision !== surfaces_js_1.MCP_PROTOCOL_VERSION) {
            return unsupported(request.id, revision, this.#served);
        }
        if (request.method === 'subscriptions/listen' && revision === surfaces_js_1.MCP_PROTOCOL_VERSION && hasClientCapabilities(request)) {
            return { error: { code: server_1.ProtocolErrorCode.MethodNotFound, message: 'Method not found' }, id: request.id, jsonrpc: server_1.JSONRPC_VERSION };
        }
        return undefined;
    }
    /** Point 2 after point 5: from now on the refusals of point 2 name only `revisions`. */
    fix(revisions) {
        this.#served = revisions;
    }
    /** Writes an answer the gate gives itself; a failed write is reported, as every write of the gate. */
    answer(message) {
        this.#wire.send(message).catch((error) => { this.onerror?.(error); });
    }
    /** Points 1 and 4: the answer as AGSC-09-19 words it. */
    #outbound(message) {
        if ((0, server_1.isJSONRPCResultResponse)(message) && this.#discover.delete(message.id)) {
            return { ...message, result: { ...message.result, supportedVersions: [...surfaces_js_1.MCP_STDIO_REVISIONS] } };
        }
        if ((0, server_1.isJSONRPCErrorResponse)(message) && message.id !== undefined && this.#handshakeReads.delete(message.id)) {
            const data = message.error.data;
            if (message.error.code === server_1.ProtocolErrorCode.InvalidParams && typeof data?.uri === 'string') {
                return { ...message, error: { ...message.error, code: server_1.ProtocolErrorCode.ResourceNotFound } };
            }
        }
        if (((0, server_1.isJSONRPCResultResponse)(message) || (0, server_1.isJSONRPCErrorResponse)(message)) && message.id !== undefined) {
            this.#discover.delete(message.id);
            this.#handshakeReads.delete(message.id);
        }
        return message;
    }
}
exports.StdioRevisionGate = StdioRevisionGate;
/**
 * The stdio tool server (AGSC-09-13, AGSC-09-19): the SDK's `serveStdio` over the two streams,
 * through the gate, one server instance per process built by `createServer` (a handshake-era one
 * holds the requests of 2026-07-28 back, point 5). The SDK closes on
 * end of input, and the process then exits. Returns the SDK's handle (`close()`).
 */
function serveStdio(context) {
    const { bundle, stdin, stdout, ...options } = context;
    const wire = new StdioRevisionGate(new stdio_1.StdioServerTransport(stdin, stdout));
    return (0, stdio_1.serveStdio)(({ era }) => {
        const { server } = createServer(bundle, options);
        return era === 'legacy' ? pinnedToHandshake(server, wire) : server;
    }, { transport: wire });
}
