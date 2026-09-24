'use strict';
// AGSC-03-11's ASSET branch, wired.
//
// "A relative Markdown link or image whose target is inside the Bundle MUST resolve
// to an existing item, an existing asset under `content/assets/`, or an existing
// anchor of one of them" (AGSC-03-11). `knowledge/links.js#resolve` reads that asset
// set from `options.assets` — and until rc.5 NO CALLER SUPPLIED IT, so the branch was
// unreachable and every body image reference to a real asset was `AGSC-E310`. The
// defect was masked, which failed such a reference one step earlier.
//
// The wiring is: `loadBundle` lists `content/assets/**` through the FileSystem port
// into `bundle.assets`, and every caller of `links.resolve` passes it. This file
// asserts the whole path on a fixture that carries a REAL file on disk.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const nodeFs = require('node:fs');
const site = require('../../src/distribution/site.js');
const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');

/** 2026-01-01T00:00:00Z — the fixed instant every test in this repository uses. */
const FIXED_CLOCK = { iso: () => '2026-01-01T00:00:00Z', now: () => 1767225600 };
const validate = require('../../src/knowledge/validate.js');
const links = require('../../src/knowledge/links.js');
const { loadBundle } = require('../../src/application/bundle.js');
const { main } = require('../../src/application/cli/main.js');
const { captureStream } = require('../conformance/areas/_shared.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'with-assets');
const MINIMAL = path.join(ROOT, 'tests', 'fixtures', 'minimal');

function load(root) {
  const fs = createFileSystem(root);
  return { bundle: loadBundle(fs, { schemas: validate.schemas(readSchemas(ROOT)) }), fs };
}

test('loadBundle lists content/assets/** through the port, recursively and ordered', () => {
  const { bundle } = load(FIXTURE);
  assert.deepStrictEqual([...bundle.assets],
    ['content/assets/img/nested.svg', 'content/assets/logo.svg']);
  assert.ok(Object.isFrozen(bundle.assets), 'assets must be frozen with the rest of the aggregate');
});

test('a Bundle with no content/assets/ directory gets an empty list, never undefined', () => {
  const { bundle } = load(MINIMAL);
  assert.deepStrictEqual([...bundle.assets], []);
});

test('the asset branch of AGSC-03-11 resolves once the set is supplied', () => {
  const { bundle } = load(FIXTURE);
  const items = bundle.items.map((i) => ({
    ...i.frontmatter, body: i.body, path: i.path, slug: i.slug, type: i.type,
  }));
  const without = links.resolve(items, { config: bundle.config });
  assert.deepStrictEqual(without.errors.map((f) => f.code), ['AGSC-E310', 'AGSC-E310'],
    'without the asset set the branch is unreachable — this is the defect itself');
  const withAssets = links.resolve(items, { assets: bundle.assets, config: bundle.config });
  assert.deepStrictEqual(withAssets.resolved.sort(),
    ['../assets/img/nested.svg', '../assets/logo.svg']);
  // CHANGED at rc.6: AGSC-06-01 now carries `/assets/<path>`, so the
  // resolved reference is not a fault of any severity. Until rc.6 it warned under
  // AGSC-E310, because the link worked in the repository and 404d on the site.
  assert.deepStrictEqual(withAssets.errors.map((f) => [f.code, f.severity]), []);
});

test('AGSC-06-01 (rc.6): a referenced asset is emitted at /assets/<path>, bytes unchanged', () => {
  const { bundle, fs } = load(FIXTURE);
  const { files } = site.build(bundle, { clock: FIXED_CLOCK, fs },
    { specVersion: '1.0.0-rc.6', version: '0.0.2' });
  for (const asset of ['logo.svg', 'img/nested.svg']) {
    const route = `/assets/${asset}`;
    assert.ok(files.has(route), `${route} was not emitted`);
    assert.strictEqual(Buffer.from(files.get(route)).toString('utf8'),
      nodeFs.readFileSync(path.join(FIXTURE, 'content', 'assets', asset), 'utf8'),
      `${route} does not carry the authored bytes`);
  }
  // The body's reference is rendered as the ROUTE, not as the authored path.
  const page = String(files.get('/concepts/diagrammed/index.html'));
  assert.match(page, /"\/assets\/logo\.svg"/u);
  assert.ok(!page.includes('../assets/logo.svg'), 'the authored path reached the page');
});

test('AGSC-06-01 (rc.6): an asset no published body references is published at no route', () => {
  const { bundle, fs } = load(FIXTURE);
  const stripped = {
    ...bundle,
    items: bundle.items.map((item) => ({ ...item, body: String(item.body).split('\n')
      .filter((line) => !line.includes('assets/')).join('\n') })),
  };
  const { files } = site.build(stripped, { clock: FIXED_CLOCK, fs },
    { specVersion: '1.0.0-rc.6', version: '0.0.2' });
  // The default theme's two files are the engine's own, not authored assets.
  assert.deepStrictEqual([...files.keys()].filter((r) => r.startsWith('/assets/')
    && r !== '/assets/site.css' && r !== '/assets/theme.js'), []);
});

test('the lint VERB passes on the fixture: it supplies the set', () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const exit = main(['lint', '--json'], {
    env: { SOURCE_DATE_EPOCH: '1767225600' },
    ports: { fs: createFileSystem(FIXTURE) },
    root: FIXTURE,
    specVersion: '1.0.0-rc.5',
    stderr,
    stdout,
  });
  const envelope = JSON.parse(stdout.text());
  // CHANGED at rc.6: nothing at all. The two asset references resolve
  // AND are published at `/assets/<path>`, so the warning that said the
  // link 404s on the built site is no longer true and is gone.
  assert.deepStrictEqual(envelope.findings.map((f) => [f.code, f.severity]), [], stdout.text());
  assert.deepStrictEqual(envelope.counts, { error: 0, warn: 0 });
  assert.strictEqual(envelope.status, 'pass');
  assert.strictEqual(exit, 0);
});

test('a reference to an asset that is NOT on disk is still AGSC-E310', () => {
  const { bundle } = load(FIXTURE);
  const items = [{
    slug: 'x', type: 'concept', path: 'content/concepts/x.md',
    body: '![missing](../assets/absent.svg)\n',
  }];
  const result = links.resolve(items, { assets: bundle.assets });
  assert.deepStrictEqual(result.errors.filter((f) => f.severity === 'error').map((f) => f.code),
    ['AGSC-E310']);
});

test('an asset the port refuses to read is published at no route, and nothing throws', () => {
  // A writer never invents bytes. If the port refuses the file — a link out of the
  // Bundle root, a permission, a disappearance between the walk and the read — the
  // route is simply not emitted, exactly as an unreadable attachment is not.
  const { bundle, fs: real } = load(FIXTURE);
  const refusing = {
    ...real,
    readFile: (at, encoding) => {
      if (String(at).startsWith('content/assets/')) throw new Error('refused');
      return real.readFile(at, encoding);
    },
  };
  const { files, findings } = site.build(bundle, { clock: FIXED_CLOCK, fs: refusing },
    { specVersion: '1.0.0-rc.6', version: '0.0.2' });
  // The default theme's two files are the engine's own, not authored assets.
  assert.deepStrictEqual([...files.keys()].filter((r) => r.startsWith('/assets/')
    && r !== '/assets/site.css' && r !== '/assets/theme.js'), []);
  assert.ok(Array.isArray(findings), 'the build must complete rather than throw');
});

