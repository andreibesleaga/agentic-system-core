'use strict';
// tests/distribution/compose-page-run.test.js — the `/compose/` page, RUN.
//
// The three scripts a Level-2 build emits are loaded into a fresh `node:vm` context
// that holds the language, a minimal DOM, a `fetch` over the SAME build's own file map
// and Web Crypto — and nothing else: no `require`, no `process`, no real network. That
// is the only way to assert what AGSC-07-01 and AGSC-07-13 actually claim — "It MUST
// NOT require a network, a key or a server" and "Harness output computed in a browser
// MUST be byte-identical to the equivalent CLI invocation" — rather than to promise it.
//
// The page is exercised BOTH with and without `document.modelContext`, because
// AGSC-09-16 makes the registration feature-detected and the page has to work unchanged
// when the browser offers none.

const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash, webcrypto } = require('node:crypto');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const site = require('../../src/distribution/site.js');
const harness = require('../../src/composition/harness.js');
const archive = require('../../src/composition/archive.js');
const { compose, verdictOf } = require('../../src/composition/compose.js');
const mcpTools = require('../../src/distribution/mcp-tools.js');
const composePage = require('../../src/distribution/compose-page.js');
const pageTools = require('../../src/distribution/page-tools.js');

/** Wait for the page-tool corpus to load; afterwards `AGSC_TOOLS` is synchronous. */
async function pageToolsReady(context) {
  await vm.runInContext('globalThis.AGSC_PAGE_TOOLS.ready', context);
}

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const EPOCH = '1767225600';
const INSTANT = '2026-01-01T00:00:00Z';

/**
 * A value flattened out of the vm realm. `deepStrictEqual` compares prototypes, and a
 * cross-realm array has a different `Array.prototype`, so a structural comparison has
 * to be made on plain values — which is also exactly how the page's own output would
 * reach a consumer.
 */
function plain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

const temporaries = [];
test.after(() => {
  for (const dir of temporaries) nodeFs.rmSync(dir, { force: true, recursive: true });
});

function builtFixture() {
  const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'agsc-page-'));
  temporaries.push(dir);
  nodeFs.cpSync(FIXTURE, dir, { recursive: true });
  const fs = createFileSystem(dir);
  const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(ROOT)) });
  const ports = { clock: createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } }), fs };
  return { bundle, ...site.build(bundle, ports, { specVersion: '1.0.0-rc.6', version: '0.0.2' }) };
}

/** The smallest DOM the controller touches: ids, text, children and one listener. */
function fakeDocument(withModelContext) {
  const nodes = new Map();
  const make = (id) => {
    const node = {
      children: [],
      disabled: false,
      id,
      listeners: [],
      addEventListener(type, handler) { node.listeners.push([type, handler]); },
      appendChild(child) { node.children.push(child); return child; },
      set textContent(value) { node.text = String(value); node.children.length = 0; },
      get textContent() { return node.text === undefined ? '' : node.text; },
    };
    return node;
  };
  for (const id of ['items', 'validity', 'verdict', 'explanations', 'conflicts', 'download', 'files', 'archive']) {
    nodes.set(id, make(id));
  }
  const registered = [];
  const document = {
    createElement: (tag) => Object.assign(make(''), { tag }),
    getElementById: (id) => (nodes.has(id) ? nodes.get(id) : null),
    nodes,
  };
  if (withModelContext) {
    document.modelContext = { registerTool: (tool) => registered.push(tool) };
  }
  return { document, registered };
}

/**
 * Load the three emitted scripts into one throwaway context. `fetch` is served from
 * the build's own file map, so the page reads exactly the published routes and nothing
 * can reach a real network: an unknown path answers `ok: false`.
 */
function openPage({ files, modelContext }) {
  const { document, registered } = fakeDocument(modelContext);
  const sandbox = {
    crypto: webcrypto,
    document,
    location: { origin: 'https://minimal.example', search: '' },
    TextEncoder,
    URL: { createObjectURL: (blob) => `blob:${blob.parts.length}` },
    Blob: class { constructor(parts, options) { this.parts = parts; this.options = options; } },
    fetch: (url) => {
      const route = String(url);
      const body = files.get(route);
      if (body === undefined) return Promise.resolve({ ok: false, json: () => Promise.reject(new Error('404')), text: () => Promise.resolve('') });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(body)), text: () => Promise.resolve(body) });
    },
    Promise,
    setTimeout,
  };
  const context = vm.createContext(sandbox);
  // Every asset the emitted `/compose/` page loads, in the page's own load order —
  // including `agsc-page-tools.js`, which is what implements the seven tools.
  for (const name of composePage.ASSETS) {
    const asset = `/compose/${name}`;
    vm.runInContext(files.get(asset), context, { filename: asset });
  }
  return { context, document, registered, sandbox };
}

test('AGSC-07-01: the page loads and composes with no network, no key and no server', async () => {
  const { files } = builtFixture();
  const page = openPage({ files });
  // Nothing a page could use to reach outside this origin or to hold a key.
  for (const name of ['require', 'process', 'XMLHttpRequest', 'WebSocket', 'localStorage', 'EventSource']) {
    assert.strictEqual(vm.runInContext(`typeof ${name}`, page.context), 'undefined', `${name} is reachable`);
  }
  const state = vm.runInContext('globalThis.AGSC_COMPOSE', page.context);
  await state.start();
  assert.ok(state.items.length >= 3, `the page recovered ${state.items.length} items from the graph`);
  assert.strictEqual(state.instant, INSTANT, 'the page took no instant from the graph');
  // The checkbox list was painted from the graph, clusters excluded.
  assert.ok(page.document.nodes.get('items').children.length >= 2);
});

test('AGSC-07-13: the seven files the PAGE builds are byte-identical to the CLI\'s', async () => {
  const { files } = builtFixture();
  const page = openPage({ files });
  const state = vm.runInContext('globalThis.AGSC_COMPOSE', page.context);
  await state.start();
  const selection = state.items.filter((i) => i.type !== 'cluster').map((i) => i.slug).slice(0, 2);
  state.selection = [...selection];
  state.render();
  const emitted = await state.emitHarness();
  assert.ok(emitted !== null, 'the page emitted no Harness for a valid composition');

  // The CLI side, from the same published graph and the same instant.
  const core = vm.runInContext('globalThis.AGSC_CORE', page.context);
  const here = compose(core.itemsFromGraph(JSON.parse(files.get('/graph.jsonld'))), selection);
  const digest = createHash('sha256').update(harness.selectionDigestInput(here), 'utf8').digest('hex');
  const items = core.itemsFromGraph(JSON.parse(files.get('/graph.jsonld'))).map((item) => {
    // AGSC-05-07: the published Markdown view is the lint-normalized SOURCE FILE, so
    // the frontmatter block comes off before the body reaches the Harness emitter.
    const published = files.get(`/pages/${item.slug}.md`);
    return published === undefined
      ? item : { ...item, body: pageTools.pageSplitFrontmatter(published).body };
  });
  const there = harness.emit(here, {
    base: 'https://minimal.example/',
    instant: INSTANT,
    items,
    licenseProse: 'LicenseRef-AgenticSystemCore-Content-Use-1.0',
    name: harness.harnessName(digest),
    selectionDigest: digest,
    specVersion: '1.0.0-rc.6',
  });
  assert.deepStrictEqual([...emitted.files.keys()], [...there.files.keys()]);
  for (const [at, text] of there.files) {
    assert.strictEqual(emitted.files.get(at), text, `${at} differs between the page and the CLI`);
  }
  assert.strictEqual(emitted.emitted, there.emitted);
  // Per-file links stay: one download link per file.
  assert.strictEqual(page.document.nodes.get('files').children.length, emitted.files.size);
  // "Download all (.zip)" beside them — the SAME bytes `agsc compose --zip` writes
  // (the CLI's `_archive.js` calls this archive module over the CLI's own files and the
  // same instant), named with the content version, its SHA-256 shown beside it.
  const cli = archive.archiveBytes(there.files, { instant: INSTANT });
  assert.deepStrictEqual(cli.violations, []);
  assert.ok(Buffer.from(state.archive.bytes).equals(Buffer.from(cli.bytes)), 'the page archive differs from the CLI archive');
  const holder = page.document.nodes.get('archive');
  const [link, sum] = holder.children;
  assert.strictEqual(link.textContent, 'Download all (.zip)');
  const version = JSON.parse(files.get('/.well-known/knowledge-linkset')).linkset[0].describedby
    .find((l) => l['agsc-bundle-version'])['agsc-bundle-version'][0];
  assert.strictEqual(link.download, archive.archiveName(harness.harnessName(digest), version));
  assert.strictEqual(sum.textContent.trim(), `SHA-256 ${createHash('sha256').update(Buffer.from(cli.bytes)).digest('hex')}`);
});

test('AGSC-07-17: an invalid composition emits nothing, and the page says so', async () => {
  const { files } = builtFixture();
  const page = openPage({ files });
  const state = vm.runInContext('globalThis.AGSC_COMPOSE', page.context);
  await state.start();
  state.selection = ['no-such-slug'];
  state.render();
  assert.match(page.document.nodes.get('validity').textContent, /invalid — no Harness is emitted/u);
  assert.strictEqual(page.document.nodes.get('download').disabled, true);
  assert.strictEqual(await state.emitHarness(), null);
});

test('AGSC-07-24: /compose/?from=<slug> takes the selection from the saved architecture', async () => {
  const { files } = builtFixture();
  const withArchitecture = new Map(files);
  withArchitecture.set('/pages/saved.md',
    'Body.\n\n```yaml agsc-selection\n- supervisor\n- handoff\n```\n');
  const page = openPage({ files: withArchitecture });
  page.sandbox.location.search = '?from=saved';
  const state = vm.runInContext('globalThis.AGSC_COMPOSE', page.context);
  await state.start();
  assert.deepStrictEqual([...state.selection], ['supervisor', 'handoff']);
  // A `from` naming a page the build does not emit leaves the selection empty rather
  // than throwing: the page is a reader of published routes, not their author.
  const empty = openPage({ files });
  empty.sandbox.location.search = '?from=nothing-here';
  const other = vm.runInContext('globalThis.AGSC_COMPOSE', empty.context);
  await other.start();
  assert.deepStrictEqual([...other.selection], []);
});

test('AGSC-09-16: with document.modelContext the seven tools are registered, with the stdio manifest', async () => {
  const { bundle, files } = builtFixture();
  const page = openPage({ files, modelContext: true });
  const state = vm.runInContext('globalThis.AGSC_COMPOSE', page.context);
  await state.start();
  await pageToolsReady(page.context);
  const webmcp = vm.runInContext('globalThis.AGSC_WEBMCP', page.context);
  assert.strictEqual(webmcp.registered, 7);
  assert.deepStrictEqual(page.registered.map((t) => t.name).sort(),
    mcpTools.manifest().tools.map((t) => t.name).sort());
  for (const tool of page.registered) {
    assert.strictEqual(typeof tool.execute, 'function', tool.name);
    assert.ok(tool.inputSchema !== undefined, `${tool.name} registered no inputSchema`);
  }
  // AGSC-09-16: ALL SEVEN answer, and every answer is the local server's answer for
  // the same input and Bundle — the whole point of the rule, asserted against the
  // artefact the site ships rather than against the emitter.
  const local = mcpTools.tools(bundle, {});
  const selection = state.items.filter((i) => i.type !== 'cluster').map((i) => i.slug).slice(0, 2);
  const calls = [
    ['search', { query: 'supervisor' }],
    ['read', { slug: 'handoff' }],
    ['links', { slug: 'supervisor' }],
    ['compose', { selection }],
    ['ask', { question: 'handoff' }],
    ['propose', { slug: 'handoff' }],
    ['remember', { at: INSTANT, body: 'A note.', actor: 'process:ci', kind: 'episode', title: 'A Recorded Run' }],
    ['read', { slug: 'no-such-item' }],
  ];
  assert.ok(selection.length > 0, 'the page recovered no selectable item');
  for (const [name, args] of calls) {
    const answer = page.registered.find((t) => t.name === name).execute(args);
    assert.strictEqual(answer.trust, 'untrusted', name);
    assert.deepStrictEqual(plain(answer), plain(local.call(name, args)),
      `${name} differs between the page tools and the local server`);
  }
  // AGSC-08-18: `compose` is still the shared algebra's verdict.
  const verdict = page.registered.find((t) => t.name === 'compose').execute({ selection });
  assert.deepStrictEqual(plain(verdict.body), plain(verdictOf(compose(plain(state.items), selection))));
  // AGSC-09-16: `propose` and `remember` are counted as local-only on this transport,
  // and neither wrote anything: the vm holds no writable surface at all.
  assert.strictEqual(webmcp.localOnlyCalls, 2);
});

test('AGSC-09-16: without document.modelContext the page works unchanged and registers nothing', async () => {
  const { files } = builtFixture();
  const page = openPage({ files, modelContext: false });
  const state = vm.runInContext('globalThis.AGSC_COMPOSE', page.context);
  await state.start();
  await pageToolsReady(page.context);
  const webmcp = vm.runInContext('globalThis.AGSC_WEBMCP', page.context);
  assert.strictEqual(webmcp.registered, 0);
  assert.deepStrictEqual(page.registered, []);
  // The tool surface is still reachable in plain JavaScript, which is what makes the
  // page work for a browser that offers no WebMCP at all.
  const tools = vm.runInContext('globalThis.AGSC_TOOLS', page.context);
  const selection = state.items.filter((i) => i.type !== 'cluster').map((i) => i.slug).slice(0, 1);
  assert.ok(selection.length > 0, 'the page recovered no selectable item');
  assert.deepStrictEqual(plain(tools.call('compose', { selection }).body),
    plain(verdictOf(compose(plain(state.items), selection))));
  assert.strictEqual(tools.call('nosuchtool', {}).body.code, 'AGSC-E001');
  // And the Harness still builds.
  state.selection = [...selection];
  state.render();
  assert.ok((await state.emitHarness()).files.size >= 5);
});

test('AGSC-06-08: the build instant comes from the discovery document, never from a clock', async () => {
  const { files } = builtFixture();
  const page = openPage({ files });
  const state = vm.runInContext('globalThis.AGSC_COMPOSE', page.context);
  await state.start();
  assert.strictEqual(state.instant, INSTANT);
  assert.strictEqual(state.instantOf(JSON.parse(files.get('/.well-known/knowledge-linkset'))), INSTANT);
  // Every shape a document that carries no instant can take yields the empty string,
  // so the page never invents one (AGSC-04-11).
  for (const shape of [null, undefined, {}, { linkset: null }, { linkset: [null] },
    { linkset: [{ describedby: [] }] }, { linkset: [{ describedby: [{}] }] },
    { linkset: [{ describedby: [{ 'agsc-generated-at': [] }] }] }]) {
    assert.strictEqual(state.instantOf(shape), '', JSON.stringify(shape));
  }
  // With no discovery document at all the page still loads the graph and composes.
  const without = new Map(files);
  without.delete('/.well-known/knowledge-linkset');
  const second = openPage({ files: without });
  const other = vm.runInContext('globalThis.AGSC_COMPOSE', second.context);
  await other.start();
  assert.strictEqual(other.instant, '');
  assert.ok(other.items.length >= 3, 'the page stopped because the discovery document was absent');
});

test('the page survives a graph it cannot read, and says so instead of throwing', async () => {
  const { files } = builtFixture();
  const broken = new Map(files);
  broken.delete('/graph.jsonld');
  const page = openPage({ files: broken });
  const state = vm.runInContext('globalThis.AGSC_COMPOSE', page.context);
  await state.start();
  assert.match(page.document.nodes.get('validity').textContent, /could not be read/u);
  assert.deepStrictEqual([...state.items], []);
});

test('the download button is wired once, and clicking it emits the Harness', async () => {
  const { files } = builtFixture();
  const page = openPage({ files });
  const button = page.document.nodes.get('download');
  assert.strictEqual(button.listeners.length, 1);
  assert.strictEqual(button.listeners[0][0], 'click');
  const state = vm.runInContext('globalThis.AGSC_COMPOSE', page.context);
  await state.start();
  state.selection = state.items.filter((i) => i.type !== 'cluster').map((i) => i.slug).slice(0, 1);
  state.render();
  await button.listeners[0][1]();
  await state.emitHarness();
  assert.ok(page.document.nodes.get('files').children.length > 0, 'no download link was offered');
});

test('a checkbox toggle adds and removes exactly one slug', async () => {
  const { files } = builtFixture();
  const page = openPage({ files });
  const state = vm.runInContext('globalThis.AGSC_COMPOSE', page.context);
  await state.start();
  const list = page.document.nodes.get('items');
  const box = list.children[0].children[0];
  const [, onChange] = box.listeners[0];
  onChange({ target: { checked: true, value: box.value } });
  assert.deepStrictEqual([...state.selection], [box.value]);
  onChange({ target: { checked: true, value: box.value } });
  assert.deepStrictEqual([...state.selection], [box.value], 'a second tick added the slug twice');
  onChange({ target: { checked: false, value: box.value } });
  assert.deepStrictEqual([...state.selection], []);
  onChange({ target: { checked: false, value: box.value } });
  assert.deepStrictEqual([...state.selection], []);
});

test('the closure explanations and the conflict list are rendered from the verdict', async () => {
  const { files } = builtFixture();
  const page = openPage({ files });
  const state = vm.runInContext('globalThis.AGSC_COMPOSE', page.context);
  await state.start();
  state.selection = ['no-such-slug'];
  state.render();
  const conflicts = page.document.nodes.get('conflicts').children;
  assert.ok(conflicts.length >= 1, 'a conflict was not rendered');
  assert.match(conflicts[0].textContent, /AGSC-E\d{3} on selection/u);
  assert.match(page.document.nodes.get('verdict').textContent, /"valid":false/u);
});

// AGSC-07-13 against the REAL command line, not against `harness.emit` called by hand:
// a Bundle with a git history (so the content version is derived from it), a Concept
// with a `kind`, and a page served from an origin that is not `site.base` (a local
// preview). The three fields the page once took from the wrong place — the content
// version, the `bundle:` base and a member's `kind` — are asserted by name, then every
// file and the archive byte for byte.
test('AGSC-07-13: the page Harness equals `agsc compose --zip` — content version, base and kind included', async () => {
  const kit = require('../e2e/modes/_kit.js');
  const dir = kit.projectBundle('identity', { base: 'https://proj.example/' });
  kit.commitAll(dir, 'the first state');
  kit.write(dir, 'content/concepts/task-login-tests.md',
    kit.read(dir, 'content/concepts/task-login-tests.md').replace('Test the login form.', 'Test the login form twice.'));
  kit.commitAll(dir, 'a second commit');
  const built = kit.agsc(dir, ['build']);
  assert.strictEqual(built.code, 0, built.stderr);
  const selection = ['handoff', 'run-the-tests', 'task-login-form'];
  const cli = kit.agsc(dir, ['compose', ...selection, '--zip']);
  assert.strictEqual(cli.code, 0, cli.stderr);

  const www = path.join(dir, 'www');
  const files = new Map();
  const walk = (at) => {
    for (const entry of nodeFs.readdirSync(at, { withFileTypes: true })) {
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.set(`/${path.relative(www, full).split(path.sep).join('/')}`, nodeFs.readFileSync(full, 'utf8'));
    }
  };
  walk(www);
  const page = openPage({ files });
  page.sandbox.location.origin = 'http://127.0.0.1:8205';
  const state = vm.runInContext('globalThis.AGSC_COMPOSE', page.context);
  await state.start();
  state.selection = [...selection];
  state.render();
  const emitted = await state.emitHarness();
  assert.ok(emitted !== null, 'the page emitted no Harness');

  const harnessRoot = path.join(dir, 'dist', 'harness');
  const name = nodeFs.readdirSync(harnessRoot).find((n) => nodeFs.statSync(path.join(harnessRoot, n)).isDirectory());
  const zipName = nodeFs.readdirSync(harnessRoot).find((n) => n.endsWith('.zip'));
  const cliFiles = new Map();
  const collect = (at) => {
    for (const entry of nodeFs.readdirSync(at, { withFileTypes: true })) {
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) collect(full);
      else cliFiles.set(path.relative(path.join(harnessRoot, name), full).split(path.sep).join('/'), nodeFs.readFileSync(full, 'utf8'));
    }
  };
  collect(path.join(harnessRoot, name));

  const agents = emitted.files.get('AGENTS.md');
  const version = JSON.parse(files.get('/.well-known/knowledge-linkset')).linkset[0].describedby
    .find((l) => l['agsc-bundle-version'])['agsc-bundle-version'][0];
  assert.match(version, /^0\.0\.0\+2\.g[0-9a-f]{12}$/u, 'the content version is derived from the two commits');
  assert.match(agents, new RegExp(`bundle_version: ${version.replace(/[.+]/gu, '\\$&')}`, 'u'), 'content version');
  assert.match(agents, /bundle: https:\/\/proj\.example\//u, 'the base is site.base, not the serving origin');
  assert.doesNotMatch(agents, /127\.0\.0\.1/u);
  assert.match(agents, /- type: concept \(task\)/u, 'a member keeps its kind');
  assert.match(agents, /- type: concept \(pattern\)/u, 'a member keeps its kind');

  assert.deepStrictEqual([...emitted.files.keys()].sort(), [...cliFiles.keys()].sort());
  for (const [at, text] of cliFiles) assert.strictEqual(emitted.files.get(at), text, `${at} differs between the page and the CLI`);
  const cliZip = nodeFs.readFileSync(path.join(harnessRoot, zipName));
  assert.ok(Buffer.from(state.archive.bytes).equals(cliZip), 'the page archive differs from the CLI archive');
  assert.strictEqual(page.document.nodes.get('archive').children[0].download, zipName);
});
