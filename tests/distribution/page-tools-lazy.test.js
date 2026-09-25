'use strict';
// WHEN a page reads the corpus of its page tools (AGSC-09-16). The corpus is every
// published item's Markdown view plus the index, the discovery document and the
// boards — one same-origin request per item, the whole node — so an item page opened
// by a person who never calls a tool must not pay for it. The read starts at once
// only where a caller is expected: a browser exposing `document.modelContext`, and
// the `/compose/` page; elsewhere the first call starts it. The answers are the same
// on every path: the same routes, the same bytes, the same toolset.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const site = require('../../src/distribution/site.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');

let built = null;
function build() {
  if (built !== null) return built;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-lazy-'));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  const port = createFileSystem(dir);
  const bundle = loadBundle(port, { schemas: validate.schemas(readSchemas(ROOT)) });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } });
  built = site.build(bundle, { clock, fs: port }, { specVersion: '1.0.0-rc.6', version: '0.0.0' }).files;
  fs.rmSync(dir, { force: true, recursive: true });
  return built;
}

/** A page realm: the three scripts of an item page, a same-origin `fetch`, a DOM stub. */
function open(files, { modelContext = false, compose = false } = {}) {
  const fetched = [];
  const context = vm.createContext({ TextEncoder, console: { error() {}, log() {}, warn() {} }, location: { origin: 'https://node.example', search: '' } });
  context.document = {
    getElementById: () => null,
    ...(modelContext ? { modelContext: { registerTool() { return Promise.resolve(); } } } : {}),
  };
  context.fetch = (route) => {
    fetched.push(String(route));
    const bytes = files.get(String(route));
    return Promise.resolve(bytes === undefined
      ? { ok: false, json: () => Promise.reject(new Error('404')), text: () => Promise.resolve('') }
      : { ok: true, json: () => Promise.resolve(JSON.parse(String(bytes))), text: () => Promise.resolve(String(bytes)) });
  };
  context.globalThis = context;
  const scripts = ['/compose/agsc-core.js', '/compose/agsc-page-tools.js', ...(compose ? ['/compose/agsc-compose.js'] : []), '/compose/webmcp.js'];
  for (const s of scripts) vm.runInContext(String(files.get(s)), context, { filename: s });
  return { context, fetched, api: vm.runInContext('globalThis.AGSC_PAGE_TOOLS', context) };
}

test('an item page without document.modelContext reads nothing until the first tool call', async () => {
  const files = build();
  const page = open(files);
  assert.strictEqual(page.api.ready, null, 'no read started');
  assert.deepStrictEqual(page.fetched, []);
  const tools = vm.runInContext('globalThis.AGSC_TOOLS', page.context);
  assert.strictEqual(typeof tools.call, 'function');
  const answer = tools.call('read', { slug: 'handoff' });
  assert.strictEqual(typeof answer.then, 'function', 'a call before the corpus is in is a promise of the envelope');
  const envelope = await answer;
  assert.strictEqual(envelope.type, 'item');
  assert.ok(page.fetched.includes('/.well-known/knowledge-linkset') && page.fetched.includes('/search.json') && page.fetched.includes('/pages/handoff.md'));
  // Afterwards the synchronous toolset is installed and a second call reads nothing more.
  const count = page.fetched.length;
  const sync = vm.runInContext('globalThis.AGSC_TOOLS', page.context);
  assert.strictEqual(sync.call('read', { slug: 'handoff' }).type, 'item');
  assert.strictEqual(page.fetched.length, count);
  // `start` is idempotent.
  assert.strictEqual(page.api.start(), page.api.ready);
});

test('with document.modelContext the read starts at once, and the answers equal the lazy path\'s', async () => {
  const files = build();
  const eager = open(files, { modelContext: true });
  assert.notStrictEqual(eager.api.ready, null, 'the read started with the page');
  await eager.api.ready;
  const lazy = open(files);
  await vm.runInContext('globalThis.AGSC_TOOLS', lazy.context).call('search', { query: 'agent' });
  assert.deepStrictEqual([...lazy.fetched].sort(), [...eager.fetched].sort(), 'the same routes, in both orders');
  const a = vm.runInContext('globalThis.AGSC_TOOLS', eager.context);
  const b = vm.runInContext('globalThis.AGSC_TOOLS', lazy.context);
  for (const [name, args] of [['search', { query: 'agent' }], ['read', { slug: 'handoff' }], ['links', { slug: 'handoff' }], ['compose', { selection: ['handoff'] }]]) {
    assert.deepStrictEqual(JSON.parse(JSON.stringify(a.call(name, args))), JSON.parse(JSON.stringify(b.call(name, args))), name);
  }
});

test('the compose page reads the corpus when its controller starts', async () => {
  const files = build();
  const page = open(files, { compose: true });
  // The controller starts itself in a document, and the corpus read with it.
  assert.notStrictEqual(page.api.ready, null, 'the controller started the read');
  const state = vm.runInContext('globalThis.AGSC_COMPOSE', page.context);
  await state.start();
  await page.api.ready;
  assert.strictEqual(vm.runInContext('globalThis.AGSC_TOOLS', page.context).call('read', { slug: 'handoff' }).type, 'item');
});
