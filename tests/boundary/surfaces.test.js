'use strict';
// Unit tests for the surface half of the Boundary context.
// AGSC-11-16..11-19, AGSC-11-21, AGSC-10-14.

const test = require('node:test');
const assert = require('node:assert');

const s = require('../../src/boundary/surfaces.js');

const plain = (v) => JSON.parse(JSON.stringify(v));

test('the foreign protocol versions live in the anti-corruption layer and nowhere else', () => {
  // AGSC-09-19: the newest revision the tool server speaks is the one constant a distribution
  // names as its protocol version, and the one value the `mcp` surface declares (cli-0035).
  assert.strictEqual(s.MCP_PROTOCOL_VERSION, '2026-07-28');
  assert.strictEqual(s.MCP_LEGACY_VERSION, '2025-11-25');
  assert.deepStrictEqual(s.MCP_STDIO_REVISIONS, ['2026-07-28', '2025-11-25']);
  assert.strictEqual(s.MCP_PROTOCOL_MIN_VERSION, '2025-03-26');
  assert.strictEqual(s.MCP_SURFACE_VERSION, '2026-07-28');
  // AGSC-11-16: the reference default is the Draft Community Group Report of 27 October 2026
  // the rule names (no rule pins a date; any YYYY-MM-DD is conforming).
  assert.strictEqual(s.WEBMCP_SURFACE_VERSION, '2026-10-27');
  assert.strictEqual(s.MCP_EXTENSION_ID, 'com.agenticsystemcore/knowledge');
  // The revisions are the official SDK's: the newest handshake revision it negotiates, and the
  // oldest it still accepts, are the two named here.
  const sdk = require('@modelcontextprotocol/server');
  assert.strictEqual(sdk.LATEST_PROTOCOL_VERSION, s.MCP_LEGACY_VERSION);
  assert.ok(sdk.SUPPORTED_PROTOCOL_VERSIONS.includes(s.MCP_PROTOCOL_MIN_VERSION));
});

test('AGSC-09-19 (6): the MCP annotations add openWorldHint false to every tool and destructiveHint false to the two writes', () => {
  for (const name of s.TOOL_NAMES) {
    const writes = name === 'propose' || name === 'remember';
    assert.deepStrictEqual(plain(s.MCP_ANNOTATIONS[name]), {
      ...plain(s.WEBMCP_ANNOTATIONS[name]),
      ...(writes ? { destructiveHint: false } : {}),
      openWorldHint: false,
    }, name);
    assert.deepStrictEqual(Object.keys(s.MCP_ANNOTATIONS[name]), Object.keys(s.MCP_ANNOTATIONS[name]).sort(), `${name}: members in code-point order`);
    assert.ok(Object.isFrozen(s.MCP_ANNOTATIONS[name]));
  }
  // The page tools keep their WebMCP vocabulary unchanged: no MCP member reaches the page.
  for (const name of s.TOOL_NAMES) assert.strictEqual(s.WEBMCP_ANNOTATIONS[name].openWorldHint, undefined);
});

test('AGSC-09-13: exactly ten tools, in code-point order', () => {
  assert.deepStrictEqual(s.TOOL_NAMES, ['ask', 'brief', 'check', 'compose', 'explain', 'links', 'propose', 'read',
    'remember', 'search']);
  assert.deepStrictEqual([...s.TOOL_NAMES].sort(), s.TOOL_NAMES);
});

test('AGSC-11-18: readOnlyHint on the eight reads, consequentialHint on the two writes', () => {
  for (const name of ['search', 'read', 'links', 'compose', 'ask', 'brief', 'explain', 'check']) {
    assert.strictEqual(s.WEBMCP_ANNOTATIONS[name].readOnlyHint, true, name);
    assert.strictEqual(s.WEBMCP_ANNOTATIONS[name].consequentialHint, undefined, name);
  }
  for (const name of ['propose', 'remember']) {
    assert.strictEqual(s.WEBMCP_ANNOTATIONS[name].consequentialHint, true, name);
    assert.strictEqual(s.WEBMCP_ANNOTATIONS[name].readOnlyHint, false, name);
  }
  // `links`, `explain` and `check` return slugs, keys, rule names and codes, not prose, so
  // they carry no untrustedContentHint; `brief` carries prose (bnd-0050).
  for (const name of ['links', 'explain', 'check']) assert.strictEqual(s.WEBMCP_ANNOTATIONS[name].untrustedContentHint, false, name);
  assert.strictEqual(s.WEBMCP_ANNOTATIONS.brief.untrustedContentHint, true);
  assert.strictEqual(s.WEBMCP_ANNOTATIONS.read.untrustedContentHint, true);
  // AGSC-11-18 (bnd-0042, bnd-0036): `extensions` is MCP's map of
  // extension identifier to settings object, and this node's settings object carries
  // exactly `linkset` — the absolute URL of its discovery document (AGSC-06-07).
  assert.deepStrictEqual(plain(s.mcpCapabilities({ base: 'https://a.example/' })), {
    extensions: { 'com.agenticsystemcore/knowledge': { linkset: 'https://a.example/.well-known/knowledge-linkset' } },
  });
  assert.deepStrictEqual(plain(s.checkMcpExtensions(
    s.mcpCapabilities({ base: 'https://a.example/' }).extensions, { base: 'https://a.example/' })), []);
  // MUST emit that member and MUST emit no other; anything else is AGSC-E210.
  const cases = [
    {},
    { 'com.agenticsystemcore/knowledge': {} },
    { 'com.agenticsystemcore/knowledge': { linkset: 'https://a.example/.well-known/knowledge-linkset', more: 1 } },
    { 'com.agenticsystemcore/knowledge': { linkset: 'https://other.example/.well-known/knowledge-linkset' } },
    ['com.agenticsystemcore/knowledge'],
    null,
  ];
  for (const extensions of cases) {
    const findings = s.checkMcpExtensions(extensions, { base: 'https://a.example/' });
    assert.ok(findings.length > 0, JSON.stringify(extensions));
    assert.ok(findings.every((f) => f.code === 'AGSC-E210'), JSON.stringify(plain(findings)));
  }
});

test('AGSC-11-16: a surface is declared only when it is served, ordered by href', () => {
  const links = plain(s.declare({
    base: 'https://a.example/', emitted: ['/llms.txt', '/chunks.jsonl', '/compose/'], mcpServed: true,
  }));
  assert.deepStrictEqual(links.map((l) => l['agsc-surface'][0]), ['chunks', 'webmcp', 'llms-txt', 'mcp']);
  assert.deepStrictEqual(links.map((l) => l.href), [
    'https://a.example/chunks.jsonl', 'https://a.example/compose/',
    'https://a.example/llms.txt', 'https://a.example/specs/mcp/',
  ]);
  assert.deepStrictEqual(links[0], {
    'agsc-access': ['none'],
    'agsc-surface': ['chunks'],
    href: 'https://a.example/chunks.jsonl',
    rel: 'https://w3id.org/agentic-system-core/rel#surface',
  });
  // AGSC-11-16: the revision the transport speaks, by default.
  assert.deepStrictEqual(links[3]['agsc-surface-version'], [s.MCP_PROTOCOL_VERSION]);
  assert.deepStrictEqual(links[1]['agsc-surface-version'], ['2026-10-27']);
  // Nothing emitted, no server: nothing declared.
  assert.deepStrictEqual(plain(s.declare({ base: 'https://a.example/' })), []);
  assert.deepStrictEqual(plain(s.declare(undefined)), []);
});

test('AGSC-11-16: the three declaration-only surfaces come from surfaces[]', () => {
  const links = plain(s.declare({
    base: 'https://a.example/',
    surfaces: [{ access: 'credential', surface: 'responder', target: 'https://a.example/mcp/', version: 'mcp:2026-07-28' },
      { surface: 'solid', target: 'https://pod.example/agsc/' }],
  }));
  assert.deepStrictEqual(links.map((l) => l['agsc-surface'][0]), ['responder', 'solid']);
  assert.deepStrictEqual(links[1]['agsc-access'], ['credential']);
  assert.strictEqual(links[1]['agsc-surface-version'], undefined);
});

test('AGSC-11-19: an unresolved declaration is AGSC-E210, an undeclared surface AGSC-E211', () => {
  const findings = plain(s.validate({
    declared: [{ 'agsc-surface': ['a2a-card'], href: 'https://a.example/.well-known/agent-card.json' }],
    emittedUndeclared: ['https://a.example/chunks.jsonl'],
    resolves: { 'https://a.example/.well-known/agent-card.json': false },
    responderDeclared: true,
  }));
  assert.deepStrictEqual(findings.map((f) => [f.code, f.severity]), [['AGSC-E210', 'error'], ['AGSC-E211', 'warn']]);
  assert.deepStrictEqual(plain(s.validate(undefined)), []);
});

test('AGSC-11-17: an extension surface without a pinning vector is AGSC-E210', () => {
  const declared = [
    { 'agsc-surface': ['a2a-card'], href: 'https://a.example/.well-known/agent-card.json' },
    { 'agsc-surface': ['x-acme-holo'], href: 'https://a.example/holo/' },
    { 'agsc-surface': ['llms-txt'], href: 'https://a.example/llms.txt' },
    { 'agsc-surface': ['chunks'], href: 'https://a.example/chunks.jsonl' },
  ];
  const findings = s.validate({ declared, pinningVectors: { 'x-acme-holo': [] }, responderDeclared: false });
  assert.deepStrictEqual(plain(findings).map((f) => f.href),
    ['https://a.example/.well-known/agent-card.json', 'https://a.example/holo/']);
  assert.deepStrictEqual(plain(s.acceptedSurfaces(declared, findings)), ['llms-txt', 'chunks']);
  // A pinning vector rescues the extension surface.
  assert.deepStrictEqual(plain(s.validate({
    declared: [declared[1]], pinningVectors: { 'x-acme-holo': ['holo-0001'] },
  })), []);
  assert.ok(s.PINNED_BY_SPEC.includes('webmcp'));
});

test('AGSC-11-21: responder and solid need a version, and a responder names its protocol', () => {
  const declared = [
    { 'agsc-access': ['credential'], 'agsc-surface': ['responder'], 'agsc-surface-version': ['mcp:2026-07-28'], href: 'https://a.example/mcp/' },
    { 'agsc-access': ['credential'], 'agsc-surface': ['solid'], 'agsc-surface-version': ['0.11.0'], href: 'https://pod.example/agsc/' },
    { 'agsc-access': ['none'], 'agsc-surface': ['responder'], href: 'https://a.example/mcp2/' },
  ];
  const findings = s.validate({ declared, responderDeclared: true });
  assert.deepStrictEqual(plain(findings).map((f) => [f.code, f.href]), [['AGSC-E210', 'https://a.example/mcp2/']]);
  assert.deepStrictEqual(plain(s.acceptedHrefs(declared, findings)), ['https://a.example/mcp/', 'https://pod.example/agsc/']);
  // AGSC-10-14: an Agent2Agent live board is a responder, declared and not served.
  assert.deepStrictEqual(plain(s.validate({
    declared: [{ 'agsc-surface': ['responder'], 'agsc-surface-version': ['a2a:1.0'], href: 'https://a.example/a2a/' }],
    responderDeclared: true,
  })), []);
  assert.strictEqual(s.validate({
    declared: [{ 'agsc-surface': ['responder'], 'agsc-surface-version': ['grpc:1'], href: 'https://a.example/g/' }],
    responderDeclared: true,
  })[0].code, 'AGSC-E210');
  assert.deepStrictEqual(s.DECLARATION_ONLY, ['a2a-card', 'solid', 'responder']);
  assert.strictEqual(s.STATIC_BOARD_ROUTE, '/boards/index.json');
});

test('AGSC-06-34/AGSC-11-17: an agent card with a version but no responder is AGSC-E210', () => {
  const card = {
    'agsc-access': ['none'],
    'agsc-surface': ['a2a-card'],
    'agsc-surface-version': ['1.0'],
    href: 'https://a.example/.well-known/agent-card.json',
  };
  assert.strictEqual(s.validate({ declared: [card] })[0].code, 'AGSC-E210');
  assert.deepStrictEqual(plain(s.validate({ declared: [card], responderDeclared: true })), []);
});

test('AGSC-11-16: an agsc-access value outside the closed list is AGSC-E210', () => {
  assert.strictEqual(s.validate({
    declared: [{ 'agsc-access': ['telepathy'], 'agsc-surface': ['chunks'], href: 'https://a.example/chunks.jsonl' }],
  })[0].code, 'AGSC-E210');
  assert.deepStrictEqual(s.ACCESS_CLASSES, ['none', 'consent', 'credential']);
  assert.deepStrictEqual(s.VERSION_REQUIRED, ['mcp', 'webmcp', 'a2a-card', 'solid', 'responder']);
  assert.ok(s.SURFACE_NAMES.includes('llms-txt'));
  assert.strictEqual(s.BUILT_IN.webmcp.route, '/compose/');
  assert.strictEqual(s.REL.peer, 'https://w3id.org/agentic-system-core/rel#peer');
  assert.deepStrictEqual(s.RESPONDER_PROTOCOLS, ['mcp', 'a2a']);
  assert.deepStrictEqual(plain(s.accepted(undefined, undefined)), []);
});
