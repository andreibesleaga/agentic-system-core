// tests/conformance/areas/cli.js — area handler for `cli` vectors.
// Owner of cli-0002, cli-0005, cli-0006: B (WP-10-B). cli-0001 is withdrawn
// (the runner skips it without calling here); cli-0003/cli-0004 are F's —
// left for F to add a case for, below.
'use strict';

const path = require('node:path');
const { main } = require('../../../src/application/cli/main.js');
const { load } = require('../../../src/application/config/load.js');
const { createFileSystem } = require('../../../src/adapters/node-fs.js');
const { memoryPorts, captureStream } = require('./_shared.js');

function runCli0002(vector, ctx) {
  // AGSC-09-11/AGSC-09-12: the whole CLI, end to end, over the real fixture —
  // configuration precedence, the item-level lint lane and the JCS-canonical
  // envelope. No ProcessRunner port is supplied, so the run depends on no git
  // checkout and is reproducible from the fixture alone.
  const root = path.join((ctx && ctx.root) || '.', 'tests', String(vector.input.bundle));
  const stdout = captureStream();
  const stderr = captureStream();
  const exitCode = main(vector.input.argv, {
    env: {},
    ports: { fs: createFileSystem(root) },
    root,
    specVersion: (vector.options || {}).spec_version,
    stderr,
    stdout,
    version: (vector.options || {}).version
  });

  const problems = [];
  if (exitCode !== vector.expected.exit) problems.push(`exit ${exitCode} != ${vector.expected.exit}`);
  if (stdout.text() !== vector.expected.stdout) {
    problems.push(`stdout ${JSON.stringify(stdout.text())} != ${JSON.stringify(vector.expected.stdout)}`);
  }
  return problems.length === 0
    ? { status: 'pass', detail: '' }
    : { status: 'fail', detail: problems.join('; ') };
}

function runCli0005(vector) {
  const stdout = captureStream();
  const stderr = captureStream();
  const exitCode = main(vector.input.argv, { ports: undefined, env: {}, stdout, stderr, root: '.' });

  const problems = [];
  if (exitCode !== vector.expected.exit) problems.push(`exit ${exitCode} != ${vector.expected.exit}`);
  if (stdout.text() !== vector.expected.stdout) problems.push(`stdout ${JSON.stringify(stdout.text())} != ${JSON.stringify(vector.expected.stdout)}`);
  const stderrText = stderr.text();
  if (!stderrText.includes(vector.expected.error)) problems.push(`stderr does not mention ${vector.expected.error}`);

  return problems.length === 0
    ? { status: 'pass', detail: '' }
    : { status: 'fail', detail: problems.join('; ') };
}

function runCli0006(vector) {
  const input = vector.input;
  const root = 'fixtures/minimal';
  // Ports are rooted at `root` (src/ports/filesystem.js: repository-relative
  // paths), so the in-memory files map is keyed relative to it, not prefixed.
  const files = { 'agsc.config.json': JSON.stringify(input.config) };
  if (input.env_file !== undefined) files['.env'] = input.env_file;
  const ports = memoryPorts(files);

  // 1. AGSC-01-37 precedence, checked directly against config/load.js.
  const loaded = load({ root, ports, env: input.environment || {}, argvFlags: {} });
  const problems = [];

  const expectedResolved = vector.expected.resolved || {};
  for (const [topKey, sub] of Object.entries(expectedResolved)) {
    for (const [leafKey, val] of Object.entries(sub)) {
      const actual = loaded.config && loaded.config[topKey] && loaded.config[topKey][leafKey];
      if (actual !== val) problems.push(`resolved.${topKey}.${leafKey} = ${JSON.stringify(actual)} != ${JSON.stringify(val)}`);
    }
  }

  const expectedOverrides = (vector.expected.overrides_in_effect || []).slice().sort();
  const actualOverrides = (loaded.envOverrides || []).slice().sort();
  if (JSON.stringify(actualOverrides) !== JSON.stringify(expectedOverrides)) {
    problems.push(`overrides_in_effect ${JSON.stringify(actualOverrides)} != ${JSON.stringify(expectedOverrides)}`);
  }

  const expectedIgnored = (vector.expected.ignored || []).slice().sort();
  const actualIgnored = (loaded.ignoredEnvNames || []).slice().sort();
  if (JSON.stringify(actualIgnored) !== JSON.stringify(expectedIgnored)) {
    problems.push(`ignored ${JSON.stringify(actualIgnored)} != ${JSON.stringify(expectedIgnored)}`);
  }

  // 2. AGSC-01-37 "never the values": run the real CLI over the same inputs
  // and check the forbidden substrings never reach stdout or stderr.
  const stdout = captureStream();
  const stderr = captureStream();
  main(input.argv, { ports, env: input.environment || {}, stdout, stderr, root });
  const combined = stdout.text() + stderr.text();
  for (const forbidden of vector.expected.stdout_must_not_contain || []) {
    if (combined.includes(forbidden)) problems.push(`output leaked forbidden substring ${JSON.stringify(forbidden)}`);
  }

  return problems.length === 0
    ? { status: 'pass', detail: '' }
    : { status: 'fail', detail: problems.join('; ') };
}

const HANDLERS = {
  'cli-0002': runCli0002,
  'cli-0005': runCli0005,
  'cli-0006': runCli0006
};

// ---------------------------------------------------------------------------
// EXTENSION POINT — cli-0003 and cli-0004, owner F (WP-10-F).
// Appended below B's handlers; nothing above this line is modified.
// Rules: AGSC-09-16 (one tool contract, two transports) and AGSC-09-13a (the
// tool error envelope, never a JSON-RPC transport error).
// ---------------------------------------------------------------------------

const vm = require('node:vm');
const { readSchemas } = require('../../../src/adapters/node-fs.js');
const validate = require('../../../src/knowledge/validate.js');
const { loadBundle } = require('../../../src/application/bundle.js');
const { tools } = require('../../../src/distribution/mcp-tools.js');
const webmcp = require('../../../src/distribution/webmcp.js');

/** The Bundle both transports serve (`cli-0003` names `fixtures/minimal`). */
function fixtureToolset(ctx, vector) {
  // The path is resolved against the ENGINE root the runner supplies, never
  // against `process.cwd()`: a handler that depended on the working directory
  // would pass under `node --test` and fail under `agsc conform` (AGSC-04-03).
  const root = path.join((ctx && ctx.root) || '.', 'tests',
    String((vector.input && vector.input.bundle) || 'fixtures/minimal'));
  const ports = createFileSystem(root);
  const schemas = validate.schemas(readSchemas((ctx && ctx.root) || '.'));
  return tools(loadBundle(ports, { schemas }), {});
}

/**
 * Evaluate the emitted WebMCP script in an isolated `node:vm` context.
 * `withModelContext: false` reproduces a page whose browser exposes no
 * `document.modelContext`. Network globals are traps: if the script ever
 * reached one, the count would rise and the local-only rule would be broken.
 */
function evaluateWebmcp(toolset, options) {
  const opts = options || {};
  const registered = [];
  let networkCalls = 0;
  const trap = () => { networkCalls += 1; throw new Error('the WebMCP script must perform no network call (AGSC-09-16)'); };
  const sandbox = {
    AGSC_TOOLS: toolset,
    XMLHttpRequest: trap,
    fetch: trap,
    navigator: { sendBeacon: trap },
  };
  if (opts.withModelContext !== false) {
    sandbox.document = { modelContext: { registerTool: (tool) => registered.push(tool) } };
  }
  const context = vm.createContext(sandbox);
  vm.runInContext(webmcp.script({ manifest: toolset.manifest() }), context, { filename: 'webmcp.js' });
  return { networkCalls, registered, state: sandbox.AGSC_WEBMCP };
}

/** cli-0003 — WebMCP mirrors MCP: same names, same argument names, same bytes. */
function runCli0003(vector, ctx) {
  const toolset = fixtureToolset(ctx, vector);
  const stdioManifest = toolset.manifest();
  const page = evaluateWebmcp(toolset, {});
  const bare = evaluateWebmcp(toolset, { withModelContext: false });

  const names = (m) => m.tools.map((t) => t.name).slice().sort();
  const argumentNames = (m) => Object.fromEntries(m.tools
    .map((t) => [t.name, Object.keys(t.inputSchema.properties).sort()]));

  // The same calls over both transports; every tool exercised, both reads and
  // writes, so byte identity is asserted over the whole surface.
  const calls = [
    ['search', { query: 'supervisor' }],
    ['read', { slug: 'handoff' }],
    ['links', { slug: 'supervisor' }],
    ['compose', { selection: ['supervisor', 'handoff'] }],
    ['ask', { question: 'handoff' }],
    ['propose', { slug: 'handoff' }],
    ['remember', { at: '2026-01-01T00:00:00Z', body: 'A note.', kind: 'episode', title: 'A Recorded Run' }],
    ['read', { slug: 'no-such-item' }],
  ];
  const differing = [];
  for (const [name, args] of calls) {
    const viaStdio = JSON.stringify(toolset.call(name, args));
    const viaWeb = JSON.stringify(page.state.invoke(name, args));
    if (viaStdio !== viaWeb) differing.push(name);
  }

  const problems = [];
  if (!deepEqual(vector.expected.tools, names(stdioManifest))) {
    problems.push(`tools ${JSON.stringify(names(stdioManifest))} != ${JSON.stringify(vector.expected.tools)}`);
  }
  const webManifest = { tools: page.registered };
  const identicalManifests = deepEqual(names(stdioManifest), names(webManifest))
    && deepEqual(argumentNames(stdioManifest), argumentNames(webManifest));
  if (identicalManifests !== vector.expected.manifests_identical) {
    problems.push(`manifests_identical ${identicalManifests}: ${JSON.stringify(names(webManifest))}`);
  }
  if ((differing.length === 0) !== vector.expected.results_byte_identical) {
    problems.push(`results differ for ${JSON.stringify(differing)}`);
  }
  // AGSC-09-16: on this transport the write tools are local-only — they return
  // the Proposal payload and perform no network write at all.
  const localOnly = page.state.localOnlyCalls === 2 && page.networkCalls === 0
    && webmcp.LOCAL_ONLY_TOOLS.every((t) => vector.expected.tools.includes(t));
  if (localOnly !== vector.expected.webmcp_write_tools_local_only) {
    problems.push(`webmcp_write_tools_local_only ${localOnly} (network calls: ${page.networkCalls})`);
  }
  const expectedBare = vector.expected.without_model_context;
  if (bare.registered.length !== expectedBare.tools_registered) {
    problems.push(`without document.modelContext ${bare.registered.length} tools registered`);
  }
  const pageFunctional = typeof bare.state.invoke === 'function'
    && bare.state.invoke('read', { slug: 'handoff' }).type === 'item';
  if (pageFunctional !== expectedBare.page_functional) {
    problems.push('the page is not functional without document.modelContext');
  }

  return problems.length === 0 ? { status: 'pass', detail: '' } : { status: 'fail', detail: problems.join('; ') };
}

/**
 * cli-0004 — the AGSC-09-13a error envelope, byte-identical on both transports.
 *
 * The stdio transport's wire behaviour (a JSON-RPC RESULT carrying this
 * envelope, never a JSON-RPC `error` member) is proved end to end by
 * `tests/distribution/mcp-stdio.test.js`, which spawns `bin/agsc.js mcp` and
 * exchanges real frames; this handler proves the envelope itself and its
 * identity across the two transports, in process.
 */
function runCli0004(vector, ctx) {
  const toolset = fixtureToolset(ctx, vector);
  const page = evaluateWebmcp(toolset, {});
  const problems = [];
  const actual = [];
  let threw = false;
  for (const call of vector.input.calls) {
    let viaStdio;
    try {
      viaStdio = toolset.call(call.tool, call.arguments);
    } catch (e) {
      threw = true;
      viaStdio = { error: e.message };
    }
    const viaWeb = page.state.invoke(call.tool, call.arguments);
    if (JSON.stringify(viaStdio) !== JSON.stringify(viaWeb)) {
      problems.push(`${call.tool}: the two transports differ`);
    }
    actual.push(viaStdio);
  }
  // AGSC-09-06/09-13a: only the CODE is asserted; `message` is deliberately
  // unspecified so that ports may localise it, so the comparison is a
  // RECURSIVE subset — `_assert.js#subsetOf` compares nested objects whole.
  for (let i = 0; i < vector.expected.results.length; i += 1) {
    if (!subsetDeep(vector.expected.results[i], actual[i])) {
      problems.push(`result ${i}: ${JSON.stringify(actual[i])} does not carry ${JSON.stringify(vector.expected.results[i])}`);
    }
  }
  if (threw !== false || vector.expected.jsonrpc_error !== false) {
    problems.push('a domain fault must be an envelope, never a thrown or transport error');
  }
  if (vector.expected.transports_byte_identical !== true) problems.push('vector expects differing transports');
  return problems.length === 0 ? { status: 'pass', detail: '' } : { status: 'fail', detail: problems.join('; ') };
}

const { deepEqual } = require('./_assert.js');

/** Every member the vector states, at every depth, present and equal in `actual`. */
function subsetDeep(expected, actual) {
  if (expected === null || typeof expected !== 'object') return deepEqual(expected, actual);
  if (actual === null || typeof actual !== 'object') return false;
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && expected.length === actual.length
      && expected.every((e, i) => subsetDeep(e, actual[i]));
  }
  return Object.keys(expected).every((k) => subsetDeep(expected[k], actual[k]));
}

Object.assign(HANDLERS, {
  'cli-0003': runCli0003,
  'cli-0004': runCli0004
});

module.exports.run = function run(vector, ctx) {
  const handler = HANDLERS[vector.id];
  if (!handler) {
    return { status: 'skip', detail: `cli.js (B) does not own ${vector.id} — see WP-10-CONTRACT.md area ownership table` };
  }
  return handler(vector, ctx);
};
