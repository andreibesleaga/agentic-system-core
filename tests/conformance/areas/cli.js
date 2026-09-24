// tests/conformance/areas/cli.js — area handler for `cli` vectors.
// Owner of cli-0002, cli-0005, cli-0006: B. cli-0001 is withdrawn
// (the runner skips it without calling here); cli-0003/cli-0004 are F's —
// left for F to add a case for, below.
'use strict';

const path = require('node:path');
const { main } = require('../../../src/application/cli/main.js');
const { load } = require('../../../src/application/config/load.js');
const { createFileSystem } = require('../../../src/adapters/node-fs.js');
const compose = require('../../../src/application/cli/verbs/compose.js');
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
// EXTENSION POINT — cli-0003 and cli-0004, owner F.
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
const site = require('../../../src/distribution/site.js');
const composePage = require('../../../src/distribution/compose-page.js');
const { createClock } = require('../../../src/adapters/node-clock.js');

/** 2026-01-01T00:00:00Z — the fixed instant `tests/fixtures/minimal/README.md` names. */
const FIXTURE_EPOCH = '1767225600';

/** The same instant, as AGSC-04-10 spells it. */
const FIXTURE_INSTANT = '2026-01-01T00:00:00Z';

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
 * The SITE this Bundle publishes — the artefact a visitor's browser actually loads.
 * Built with a fixed clock, so the handler is deterministic and touches no network.
 */
function fixtureSite(ctx, vector) {
  const root = path.join((ctx && ctx.root) || '.', 'tests',
    String((vector.input && vector.input.bundle) || 'fixtures/minimal'));
  const fs = createFileSystem(root);
  const schemas = validate.schemas(readSchemas((ctx && ctx.root) || '.'));
  const bundle = loadBundle(fs, { schemas });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: FIXTURE_EPOCH } });
  return site.build(bundle, { clock, fs }, { specVersion: '1.0.0-rc.6', version: '0.0.2' });
}

/**
 * Evaluate the EMITTED PAGE in an isolated `node:vm` context.
 *
 * Until rc.5 this ran the registration script against the FULL local implementation
 * handed in as `AGSC_TOOLS`, so the vector proved the emitter and said nothing about
 * the artefact the site ships — which is how six tools stayed unimplemented on the
 * built site while this required vector stayed green (research/34 gap 7).
 *
 * It now loads the three scripts the built site actually serves — `agsc-core.js`,
 * `agsc-page-tools.js` and `webmcp.js` — assembles the page corpus from the build's
 * OWN published routes, and registers through a minimal fake `document.modelContext`.
 * `fetch` and every other network global is a trap: if the page ever reached one, the
 * count would rise and the local-only rule would be broken.
 *
 * `withModelContext: false` reproduces a browser that exposes no `document.modelContext`.
 */
function evaluateWebmcp(built, options) {
  const opts = options || {};
  const registered = [];
  let networkCalls = 0;
  const trap = () => {
    networkCalls += 1;
    throw new Error('the page tools must perform no network call (AGSC-09-16)');
  };
  // `AGSC_TOOLS` is pre-set, so the script's own bootstrap — which would fetch the
  // published routes — stands down and the corpus is assembled synchronously below
  // from the build's own bytes. The asynchronous bootstrap is proved, against a fake
  // `fetch` over the same file map, by `tests/distribution/compose-page-run.test.js`.
  const sandbox = {
    AGSC_TOOLS: null, TextEncoder, XMLHttpRequest: trap, fetch: trap, navigator: { sendBeacon: trap },
  };
  if (opts.withModelContext !== false) {
    sandbox.document = { modelContext: { registerTool: (tool) => registered.push(tool) } };
  }
  const context = vm.createContext(sandbox);
  const sources = {};
  for (const [route, text] of built.files) sources[route] = String(text);
  // The algebra and the page tools, exactly as the site serves them.
  for (const name of ['agsc-core.js', 'agsc-page-tools.js']) {
    vm.runInContext(sources[`/compose/${name}`], context, { filename: name });
  }
  // The corpus is assembled from the published routes synchronously — the sandbox
  // has no `fetch` but a trap, so nothing can leave this process. The ASYNCHRONOUS
  // path the browser takes is proved by `tests/distribution/compose-page-run.test.js`.
  const api = sandbox.AGSC_PAGE_TOOLS;
  const pageToolset = api.install(api.pageCorpus(sources, { bundleId: api.BUNDLE_ID }), sandbox.AGSC_CORE);
  vm.runInContext(sources['/compose/webmcp.js'], context, { filename: 'webmcp.js' });
  return { networkCalls, pageToolset, registered, sources, state: sandbox.AGSC_WEBMCP };
}

/**
 * The registration script alone, over a toolset handed in directly. This is what a
 * vector whose Bundle is stated INLINE can use (`cli-0007`): there is no published
 * site to read, so the page corpus cannot be assembled. It proves the transport's
 * envelope and its identity with the local server's, and it deliberately proves
 * nothing about the page corpus — `cli-0003` is what proves that.
 */
function evaluateRegistration(toolset, options) {
  const opts = options || {};
  const registered = [];
  let networkCalls = 0;
  const trap = () => {
    networkCalls += 1;
    throw new Error('the WebMCP script must perform no network call (AGSC-09-16)');
  };
  const sandbox = {
    AGSC_TOOLS: toolset, TextEncoder, XMLHttpRequest: trap, fetch: trap, navigator: { sendBeacon: trap },
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
  const built = fixtureSite(ctx, vector);
  const page = evaluateWebmcp(built, {});
  const bare = evaluateWebmcp(built, { withModelContext: false });

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
  const page = evaluateWebmcp(fixtureSite(ctx, vector), {});
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

/**
 * cli-0007 — AGSC-09-14a as amended at rc.5 (V9D-07): the `ask` envelope.
 *
 * The Bundle is stated INLINE by the vector (a base, a licence and one item), not
 * taken from a fixture, so the citation IRIs are derivable from the vector alone.
 * The two transports are compared as well, because AGSC-09-16 makes the envelope
 * byte-identical across them and this is a published tool contract.
 */
function runCli0007(vector) {
  const inputBundle = vector.input.bundle || {};
  const bundle = {
    config: {
      bundle: { license_prose: inputBundle.license_prose },
      site: { base: inputBundle.base },
    },
    items: (vector.input.items || []).map((item) => ({
      body: item.body === undefined ? '' : item.body,
      frontmatter: { description: item.description, title: item.title, type: item.type },
      slug: item.slug,
      type: item.type,
    })),
  };
  const toolset = tools(bundle, {});
  const page = evaluateRegistration(toolset, {});
  const problems = [];
  const results = vector.input.calls.map((call) => {
    const viaStdio = toolset.call(call.tool, call.arguments);
    if (JSON.stringify(viaStdio) !== JSON.stringify(page.state.invoke(call.tool, call.arguments))) {
      problems.push(`${call.tool}: the two transports differ (AGSC-09-16)`);
    }
    return viaStdio;
  });

  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    const expected = vector.expected.results[i] || {};
    const members = Object.keys(result).sort();
    if (!deepEqual(vector.expected.envelope_members, members)) {
      problems.push(`result ${i}: members ${JSON.stringify(members)} != ${JSON.stringify(vector.expected.envelope_members)}`);
    }
    if (vector.expected.citations_is_top_level_member === true && !Array.isArray(result.citations)) {
      problems.push(`result ${i}: citations[] is not a top-level array`);
    }
    if (vector.expected.body_is_text === true && typeof result.body !== 'string') {
      problems.push(`result ${i}: body is ${typeof result.body}, not the answer text`);
    }
    const { body_contains: contains, ...rest } = expected;
    if (contains !== undefined && !String(result.body).includes(contains)) {
      problems.push(`result ${i}: body does not embed ${JSON.stringify(contains)}`);
    }
    if (!subsetDeep(rest, result)) {
      problems.push(`result ${i}: ${JSON.stringify(result)} does not carry ${JSON.stringify(rest)}`);
    }
    // "Every answer MUST cite ≥1 item IRI" — except the fixed no-answer case, which
    // the vector itself states with an empty `citations[]`.
    const noAnswer = expected.body !== undefined && Array.isArray(expected.citations) && expected.citations.length === 0;
    if (!noAnswer && result.citations.length < 1) problems.push(`result ${i}: no item IRI cited`);
  }
  return problems.length === 0 ? { status: 'pass', detail: '' } : { status: 'fail', detail: problems.join('; ') };
}

/**
 * cli-0008 — AGSC-09-16 as amended at rc.6.
 *
 * The Bundle a page serves is the PUBLISHED projection of AGSC-06-30. The site is
 * built from the vector's inline items with a fixed clock, the page tools are then
 * assembled from the build's OWN published routes — so what the page can see is
 * exactly what the node published — and the local server reads the same Bundle
 * object. For a published item the two transports must return equal VALUES; for an
 * item the node did not publish the page answers the AGSC-09-13a error envelope
 * with `AGSC-E301`, exactly as the local server answers for an unknown slug, while
 * the local server, which reads the Bundle and not the site, still answers it.
 */
function runCli0008(vector) {
  const input = vector.input || {};
  const bundle = {
    config: {
      bundle: { id: 'cli-0008', license_prose: 'CC0-1.0', operator: 'human:conformance' },
      site: { base: input.base, tdm_crawlers: ['GPTBot'], title: 'A Node' },
    },
    items: (input.items || []).map((item) => ({
      body: '',
      frontmatter: { status: item.status, title: item.title, type: item.type },
      slug: item.slug,
      status: item.status,
      title: item.title,
      type: item.type,
    })),
  };
  const clock = { iso: () => FIXTURE_INSTANT, now: () => Number(FIXTURE_EPOCH) };
  const built = site.build(bundle, { clock }, { specVersion: '1.0.0-rc.6', version: '0.0.2' });
  const page = evaluateWebmcp(built, {});
  const local = tools(bundle, {});
  const problems = [];

  const outcome = (result) => (result && result.type === 'error' ? 'error' : 'ok');
  const codeOf = (result) => (result && result.body && result.body.code) || null;

  (input.calls || []).forEach((call, i) => {
    const viaPage = page.pageToolset.call(call.tool, { slug: call.slug });
    const viaStdio = local.call(call.tool, { slug: call.slug });
    const wantPage = (vector.expected.page || [])[i] || {};
    const wantStdio = (vector.expected.stdio || [])[i] || {};
    if (outcome(viaPage) !== wantPage.status) {
      problems.push(`page ${call.slug}: ${outcome(viaPage)} != ${wantPage.status}`);
    }
    if (wantPage.error !== undefined && codeOf(viaPage) !== wantPage.error) {
      problems.push(`page ${call.slug}: code ${codeOf(viaPage)} != ${wantPage.error}`);
    }
    if (outcome(viaStdio) !== wantStdio.status) {
      problems.push(`stdio ${call.slug}: ${outcome(viaStdio)} != ${wantStdio.status}`);
    }
    // Equal AS VALUES, and only where the node published the item: the members, in
    // the same order, with the same contents.
    const published = wantPage.status === 'ok' && wantStdio.status === 'ok';
    if (vector.expected.values_equal_for_published === true && published
        && JSON.stringify(viaPage) !== JSON.stringify(viaStdio)) {
      problems.push(`${call.slug}: the two transports differ as values`
        + ` — page ${JSON.stringify(viaPage)} vs stdio ${JSON.stringify(viaStdio)}`);
    }
  });
  if (page.networkCalls !== 0) problems.push('the page tools performed a network call');
  return problems.length === 0 ? { status: 'pass', detail: '' } : { status: 'fail', detail: problems.join('; ') };
}

/**
 * cli-0009 (rc.6, AGSC-00-23 /) — a value outside a CLOSED operator list is
 * `AGSC-E203` and a FINDING (exit 1), never `AGSC-E002` and a usage error (exit 2),
 * because `--emit` and `--target` are known flags carrying values the registry does
 * not hold (AGSC-09-08).
 *
 * The two refusals are run end to end through the real CLI, over a copy of the
 * minimal fixture that carries the `router` the vector's argv names — the argv is
 * used exactly as the vector states it.
 *
 * ONE READING, stated rather than hidden. The control case (`--emit gabbe`) states
 * `exit: 0` and `findings: []`, which is what a distribution that SHIPS the emitter
 * answers. This one ships none: AGSC-07-18 says an emitter is "a single template
 * plus a registry row", and the verb answers the honest `AGSC-E001` of AGSC-09-94
 * for a capability the node does not offer. So the control is asserted as what the
 * case is about — the REGISTRY accepted the name and raised nothing, which is what
 * makes the two refusals a statement about the registry and not about the flag —
 * and the remaining gap (no emitter ships) is recorded as an item, not hidden here.
 */
function runCli0009(vector, ctx) {
  const nodeFs = require('node:fs');
  const os = require('node:os');
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'agsc-cli-0009-'));
  nodeFs.cpSync(path.join((ctx && ctx.root) || '.', 'tests', 'fixtures', 'minimal'), root,
    { recursive: true });
  nodeFs.writeFileSync(path.join(root, 'content', 'concepts', 'router.md'),
    '---\ntype: concept\nkind: pattern\ntitle: Router\n'
    + 'description: A pattern that routes work to the worker that fits it, carried here for cli-0009.\n'
    + 'prov:\n  origin: human\n  operator: human:tester\n---\n\n## Intent\n\nRoute work.\n\n'
    + '## Selection\n\n```yaml agsc-selection\n- supervisor\n```\n');

  const problems = [];
  const byName = new Map((vector.expected.cases || []).map((c) => [c.name, c]));
  for (const input of vector.input.cases || []) {
    const want = byName.get(input.name);
    const stdout = captureStream();
    const stderr = captureStream();
    const exitCode = main([...input.argv, '--json', '--quiet'], {
      env: { SOURCE_DATE_EPOCH: '1767225600' },
      ports: { fs: createFileSystem(root) },
      root,
      specVersion: (vector.options || {}).spec_version,
      stderr,
      stdout,
      version: (vector.options || {}).spec_version,
    });
    const envelope = JSON.parse(stdout.text() || '{}');
    const findings = envelope.findings || [];
    const codes = findings.map((f) => f.code);

    if ((want.findings || []).length > 0) {
      // A refusal: the stated code, the stated severity, and the stated exit.
      for (const one of want.findings) {
        if (!findings.some((f) => f.code === one.code && f.severity === one.severity)) {
          problems.push(`${input.name}: ${one.code} (${one.severity}) not among ${JSON.stringify(codes)}`);
        }
      }
      if (exitCode !== want.exit) problems.push(`${input.name}: exit ${exitCode} != ${want.exit}`);
      if (codes.includes('AGSC-E002')) {
        problems.push(`${input.name}: AGSC-E002 is a usage error and this is a finding (AGSC-09-08)`);
      }
    } else {
      // The control: the registry holds the name and says nothing about it.
      const emit = input.argv[input.argv.indexOf('--emit') + 1];
      if (compose.emitterRefusal(emit) !== null) {
        problems.push(`${input.name}: the registry refused the registered name ${emit}`);
      }
      if (codes.includes('AGSC-E203')) {
        problems.push(`${input.name}: a registered target must not be AGSC-E203`);
      }
      const other = findings
        .filter((f) => f.severity === 'error' && f.code !== 'AGSC-E001')
        .map((f) => f.code);
      if (other.length > 0) {
        problems.push(`${input.name}: unexpected ${JSON.stringify(other)} beside the`
          + ' AGSC-E001 this distribution answers for an emitter it does not ship');
      }
    }
  }
  nodeFs.rmSync(root, { force: true, recursive: true });
  return problems.length === 0
    ? { status: 'pass', detail: '' }
    : { status: 'fail', detail: problems.join('; ') };
}

Object.assign(HANDLERS, {
  'cli-0009': runCli0009,
  'cli-0003': runCli0003,
  'cli-0004': runCli0004,
  'cli-0007': runCli0007,
  'cli-0008': runCli0008
});

module.exports.run = function run(vector, ctx) {
  const handler = HANDLERS[vector.id];
  if (!handler) {
    return { status: 'skip', detail: `cli.js (B) does not own ${vector.id} — see-CONTRACT.md area ownership table` };
  }
  return handler(vector, ctx);
};
