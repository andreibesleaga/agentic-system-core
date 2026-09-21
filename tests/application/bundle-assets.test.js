'use strict';
// FV28-03 — AGSC-03-11's ASSET branch, wired.
//
// "A relative Markdown link or image whose target is inside the Bundle MUST resolve
// to an existing item, an existing asset under `content/assets/`, or an existing
// anchor of one of them" (AGSC-03-11). `knowledge/links.js#resolve` reads that asset
// set from `options.assets` — and until rc.5 NO CALLER SUPPLIED IT, so the branch was
// unreachable and every body image reference to a real asset was `AGSC-E310`. The
// defect was masked by FV28-02, which failed such a reference one step earlier.
//
// The wiring is: `loadBundle` lists `content/assets/**` through the FileSystem port
// into `bundle.assets`, and every caller of `links.resolve` passes it. This file
// asserts the whole path on a fixture that carries a REAL file on disk.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
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
  // ENG-5, rc.5: the branch resolves, and AGSC-06-01 publishes the target at NO
  // route, so the reference works in the repository and 404s on the built site.
  // The engine cannot emit a route without a rule change (item 56 / FIX28-01), so
  // it warns under the same registered code and says exactly why.
  assert.deepStrictEqual(withAssets.errors.map((f) => [f.code, f.severity]),
    [['AGSC-E310', 'warn'], ['AGSC-E310', 'warn']]);
  for (const one of withAssets.errors) {
    assert.match(one.message, /publishes at no route/u);
  }
});

test('the lint VERB passes on the fixture: it supplies the set (FV28-03)', () => {
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
  // Two warnings and no error: the two asset references resolve (FV28-03) and are
  // published at no route (ENG-5; item 56 / FIX28-01). `status` stays `pass` and
  // the exit code stays 0, because a warning is not a failed gate (AGSC-09-08).
  assert.deepStrictEqual(envelope.findings.map((f) => [f.code, f.severity]),
    [['AGSC-E310', 'warn'], ['AGSC-E310', 'warn']], stdout.text());
  assert.deepStrictEqual(envelope.counts, { error: 0, warn: 2 });
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
