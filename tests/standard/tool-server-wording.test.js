'use strict';
// tests/standard/tool-server-wording.test.js — which items the local tool server,
// its resources and the page tools see, and the two words "published" and "listed"
// as spec/00 defines them. The local tool server is the author's own tool over the
// Bundle it is started in, drafts included (the required case on the page tools'
// published projection pins that); its resources are the published items; a page
// tool sees the listed items only, because a page reads what the node lists.
//
// The first tests are assertions on plain text: a sentence is there, or a wrong one
// is gone. The last test checks the engine against those sentences on a scratch
// Bundle that holds a draft, a retired and a release-gated item, so the wording can
// never state a behaviour the engine does not have. The test titles name chapters
// and topics, not rule ids: a rule counts as verified only through the conformance
// cases and unit tests that check its behaviour.
//
// Deterministic: a fixed build instant, a scratch copy under the system temporary
// directory, no git history, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8');

const CH00 = read('spec/00-overview.md');
const CH01 = read('spec/01-bundle.md');
const CH09 = read('spec/09-conformance.md');

/** The text of one rule: from its bold id to the next rule bullet or heading. */
function rule(text, id) {
  const at = text.indexOf(`- **${id}**`);
  assert.ok(at >= 0, `${id} is not in this chapter`);
  const rest = text.slice(at + 1);
  const next = rest.search(/\n- \*\*AGSC-|\n#{1,6} /u);
  return next < 0 ? text.slice(at) : text.slice(at, at + 1 + next);
}

/**
 * A rule's plain words: no dated amendment note (a note quotes the wording it
 * replaced), no code-span ticks, no emphasis, one space between words.
 */
const plainWords = (text) => text.replace(/\*\(Amended [^)]*?\)\*/gu, '').replace(/[`*]/gu, '').replace(/\s+/gu, ' ');

test('spec/09, the tool table: read returns one item of the Bundle, and the local server reads drafts too', () => {
  const text = rule(CH09, 'AGSC-09-13');
  const row = text.split('\n').find((l) => l.startsWith('  | `read` |'));
  assert.ok(row, 'the tool table has no read row');
  assert.doesNotMatch(row, /one published item/u);
  assert.match(row, /of one item of the Bundle/u);
  const words = plainWords(text);
  assert.match(words, /The local server answers from the Bundle it is started in, as it is on disk: draft, retired and release-gated items included/u);
  assert.match(words, /it is the author's own tool, not a published surface/u);
});

test('spec/09, the channel responder: ask answers from its own Bundle locally and from the published exports on a page', () => {
  const words = plainWords(rule(CH09, 'AGSC-09-14a'));
  assert.doesNotMatch(words, /using only the Bundle's published exports/u);
  assert.match(words, /from its own Bundle when served locally/u);
  assert.match(words, /from the published exports on a page/u);
  assert.doesNotMatch(words, /when no published item shares a token/u);
  assert.match(words, /when no item the responder reads shares a token/u);
});

test('spec/09, the tool server resources: the published items, a retired item included, and no draft or held-back one', () => {
  const words = plainWords(rule(CH09, 'AGSC-09-14b'));
  assert.doesNotMatch(words, /expose every item as an MCP resource/u);
  assert.doesNotMatch(words, /only a published item \(AGSC-06-30\) is exposed/u);
  assert.match(words, /expose every published item \(AGSC-00-05\) as an MCP resource/u);
  assert.match(words, /a retired item included and a draft or held-back item never/u);
  assert.match(words, /its text is the item's per-item copy \/pages\/<slug>\.md/u);
});

test('spec/09, WebMCP: a page tool sees the listed items, and the two transports agree on those', () => {
  const words = plainWords(rule(CH09, 'AGSC-09-16'));
  assert.doesNotMatch(words, /The Bundle a page serves is the published projection/u);
  assert.match(words, /The Bundle a page serves is the listed set \(AGSC-00-05\)/u);
  assert.match(words, /an item that is not listed — a draft, a retired or a release-gated item — is not visible to a page tool/u);
  assert.match(words, /The equality of this rule's first sentence therefore holds for every call on a Bundle whose items are all listed/u);
  assert.match(words, /the local server's answers may also name them or carry the Links to them that a page's copies leave out/u);
  assert.doesNotMatch(words, /The one input on which the two transports MUST differ/u);
});

test('spec/01, the byte-preserving export: no published surface lets a draft item leave a node', () => {
  const words = plainWords(rule(CH01, 'AGSC-01-26'));
  assert.doesNotMatch(words, /so no surface lets a draft item leave a node/u);
  assert.match(words, /so no published surface lets a draft item leave a node/u);
  assert.match(words, /the local tool server of AGSC-09-13 is not a published surface/u);
});

test('spec/00, published and listed: the list names llms-full.txt, the page tools and the tool resources', () => {
  const words = plainWords(rule(CH00, 'AGSC-00-05'));
  assert.match(words, /it leaves search\.json, \/llms\.txt, \/llms-full\.txt, \/chunks\.jsonl/u);
  assert.match(words, /what the page tools see \(AGSC-09-16\)/u);
  assert.match(words, /its resource on the local tool server \(AGSC-09-14b\)/u);
  assert.match(words, /The local tool server of AGSC-09-13 is not a published surface/u);
});

// ------------------------------------------------------------- the behaviour

/** A concept in the given state, written into a scratch Bundle. */
function concept(slug, title, extra) {
  return ['---', 'type: concept', `title: ${title}`,
    'description: A probe concept about routing work between agents, for the tool server check.',
    'date: "2026-01-01"', ...extra, 'prov:', '  origin: human', '  operator: human:andreibesleaga',
    'kind: explainer', '---', '', `# ${title}`, '', 'Routing probe text about agents and routing.', ''].join('\n');
}

/** Every file under `dir`, as a route map `/<path>` -> text. */
function routesOf(dir) {
  const map = new Map();
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(child);
      else map.set(`/${child}`, fs.readFileSync(path.join(dir, child), 'utf8'));
    }
  };
  walk('');
  return map;
}

test('the engine: the local tools read every item, the resources are the published items, a page tool sees the listed ones', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-tool-server-'));
  t.after(() => fs.rmSync(home, { force: true, recursive: true }));
  const dir = path.join(home, 'bundle');
  fs.cpSync(path.join(ROOT, 'tests', 'fixtures', 'minimal'), dir, { recursive: true });
  const write = (rel, text) => fs.writeFileSync(path.join(dir, ...rel.split('/')), text);
  write('content/concepts/unfinished.md', concept('unfinished', 'Unfinished route', ['status: draft']));
  write('content/concepts/former.md', concept('former', 'Former route', ['status: retired']));
  write('content/concepts/later.md', concept('later', 'Later route', ['status: stable', 'release: later']));
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8'));
  config.releases = { later: false };
  write('agsc.config.json', `${JSON.stringify(config, null, 2)}\n`);

  const env = { ...process.env, NO_COLOR: '1', SOURCE_DATE_EPOCH: '1767225600' };
  delete env.AGSC_DOI;
  const built = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'agsc.js'), 'build'], { cwd: dir, encoding: 'utf8', env });
  assert.strictEqual(built.status, 0, built.stderr);
  const routes = routesOf(path.join(dir, 'www'));

  const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
  const validate = require('../../src/knowledge/validate.js');
  const { loadBundle } = require('../../src/application/bundle.js');
  const { tools } = require('../../src/distribution/mcp-tools.js');
  const { catalogue } = require('../../src/distribution/mcp-resources.js');
  const pageTools = require('../../src/distribution/page-tools.js');

  const bundle = loadBundle(createFileSystem(dir), { schemas: validate.schemas(readSchemas(ROOT)) });
  const unlisted = ['former', 'later', 'unfinished'];

  // The local server: every item of the Bundle it is started in.
  const local = tools(bundle, { artifacts: routes, config });
  for (const slug of unlisted) assert.strictEqual(local.call('read', { slug }).type, 'item', `local read ${slug}`);
  const localHits = local.call('search', { query: 'routing probe' }).body.hits.map((h) => h.slug);
  for (const slug of unlisted) assert.ok(localHits.includes(slug), `local search ${slug}`);

  // Its resources: the published items (the retired one included), then the two artefacts.
  const names = catalogue(bundle, { artifacts: routes, config }).list().resources.map((r) => r.name);
  assert.deepStrictEqual(names, ['agent-patterns', 'former', 'graph.jsonld', 'handoff', 'llms.txt', 'supervisor']);

  // The page tools, loaded as a browser loads them: the listed items only.
  const sandbox = { TextDecoder, TextEncoder };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(pageTools.bundle({ bundleId: config.bundle.id }), sandbox);
  const fetchLike = (route) => Promise.resolve(routes.has(route)
    ? { ok: true, text: () => Promise.resolve(routes.get(route)) }
    : { ok: false, text: () => Promise.resolve('') });
  const corpus = await sandbox.AGSC_PAGE_TOOLS.load(fetchLike);
  // Array.from: the sandbox's arrays belong to another realm.
  assert.deepStrictEqual(Array.from(corpus.items, (i) => i.slug), ['agent-patterns', 'handoff', 'supervisor']);
  const page = sandbox.AGSC_PAGE_TOOLS.pageToolset(corpus);
  for (const slug of unlisted) {
    const answer = await page.call('read', { slug });
    assert.strictEqual(answer.type, 'error', `page read ${slug}`);
    assert.strictEqual(answer.body.code, 'AGSC-E301', `page read ${slug}`);
  }
  const pageHits = (await page.call('search', { query: 'routing probe' })).body.hits.map((h) => h.slug);
  for (const slug of unlisted) assert.ok(!pageHits.includes(slug), `page search ${slug}`);
});
