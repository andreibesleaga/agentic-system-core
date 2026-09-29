'use strict';
// Three small surface facts of an engine-built node:
//   - every page with a route of its own names its absolute address in
//     `<link rel="canonical">`, derived from the configured site base; the 404 page
//     names none, and a build with no base names none;
//   - the page tools ask for `/boards/index.json` only when the discovery document
//     carries the `…/rel#boards` link (AGSC-10-13), so a node with no board logs no 404;
//   - `/.well-known/tdmrep.json` states `location` as a path pattern (`/`), as the
//     TDMRep report defines it, never an absolute URL (AGSC-06-18).
// Deterministic: fixed build instant, no network.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const site = require('../../src/distribution/site.js');
const html = require('../../src/distribution/html.js');
const pageTools = require('../../src/distribution/page-tools.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');

function built() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-canonical-'));
  try {
    fs.cpSync(FIXTURE, dir, { recursive: true });
    const port = createFileSystem(dir);
    const bundle = loadBundle(port, { schemas: validate.schemas(readSchemas(ROOT)) });
    const clock = createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } });
    return site.build(bundle, { clock, fs: port }, { specVersion: '1.0.0-rc.6', version: '0.0.0' });
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
}

const canonicalOf = (text) => {
  const all = [...String(text).matchAll(/<link rel="canonical" href="([^"]*)">/gu)].map((m) => m[1]);
  assert.ok(all.length <= 1, 'a page names two canonical addresses');
  return all.length === 0 ? null : all[0];
};

test('every page with a route names its own absolute address; the 404 page names none', () => {
  const { files } = built();
  const pages = [...files.keys()].filter((route) => route.endsWith('index.html'));
  assert.ok(pages.length > 5, pages.join(' '));
  for (const route of pages) {
    const expected = `https://minimal.example${route.slice(0, -'index.html'.length)}`;
    assert.strictEqual(canonicalOf(files.get(route)), expected, route);
  }
  assert.strictEqual(canonicalOf(files.get('/404.html')), null);
});

test('a page shell with no site base, or with no route, carries no canonical link', () => {
  const page = (options) => html.composePage({ assets: [] }, options);
  assert.strictEqual(canonicalOf(page({ route: '/compose/' })), null);
  assert.strictEqual(canonicalOf(page({ siteBase: 'https://a.example' })), null);
  assert.strictEqual(canonicalOf(page({ route: '/compose/', siteBase: 'https://a.example/' })), 'https://a.example/compose/');
});

test('AGSC-10-13: the page tools read /boards/index.json only when the node declares its boards', async () => {
  const rel = 'https://w3id.org/agentic-system-core/rel#boards';
  const linkset = (extra) => JSON.stringify({ linkset: [{ anchor: 'https://a.example/', ...extra }] });
  assert.strictEqual(pageTools.pageDeclaresBoards({ '/.well-known/knowledge-linkset': linkset({}) }), false);
  assert.strictEqual(pageTools.pageDeclaresBoards({
    '/.well-known/knowledge-linkset': linkset({ [rel]: [{ href: 'https://a.example/boards/index.json' }] }),
  }), true);
  assert.strictEqual(pageTools.pageDeclaresBoards({}), false);
  assert.strictEqual(pageTools.pageDeclaresBoards({ '/.well-known/knowledge-linkset': 'not json' }), false);

  // The loader of the emitted script, over a node with no board: no request for it.
  const { files } = built();
  assert.ok(!files.has('/boards/index.json'), 'the fixture has no board');
  const vm = require('node:vm');
  const requested = [];
  const sandbox = {
    fetch: (route) => {
      requested.push(String(route));
      const body = files.get(String(route));
      return Promise.resolve({ ok: body !== undefined, text: () => Promise.resolve(body === undefined ? '' : String(body)) });
    },
    Promise,
  };
  vm.createContext(sandbox);
  vm.runInContext(String(files.get('/compose/agsc-page-tools.js')), sandbox);
  await vm.runInContext('globalThis.AGSC_PAGE_TOOLS.load(fetch)', sandbox);
  assert.ok(requested.includes('/search.json'), requested.join(' '));
  assert.ok(!requested.includes('/boards/index.json'), 'the page asked for a board the node does not declare');
});

test('AGSC-06-18: tdmrep.json states the location as the path pattern "/"', () => {
  const { files } = built();
  assert.deepStrictEqual(JSON.parse(String(files.get('/.well-known/tdmrep.json'))), [{ location: '/', 'tdm-reservation': 1 }]);
});
