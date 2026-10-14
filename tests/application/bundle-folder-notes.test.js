'use strict';
// application/bundle.js: a `README.md` or `_index.md` inside a type folder is never
// an item (AGSC-01-05, as amended 2026-09-25). The reader skips it and says so with
// the warning AGSC-E506, so that a publisher may keep a folder note beside the items
// without `lint`, `build` and `ci` reading it as one and failing.

const test = require('node:test');
const assert = require('node:assert');

const { loadBundle } = require('../../src/application/bundle.js');

const ITEM = '---\ntype: concept\nkind: explainer\ntitle: A Concept\n---\n\nA body.\n';

function port(entries) {
  return {
    exists: (p) => ['agsc.config.json', 'content/concepts'].includes(p),
    readdir: (dir) => (dir === 'content/concepts' ? entries : []),
    readFile: (p) => {
      if (p === 'agsc.config.json') return '{}';
      if (p === 'content/concepts/a.md') return ITEM;
      throw Object.assign(new Error(`${p} must never be read as an item`), { code: 'AGSC-E101' });
    },
    walk: () => [],
  };
}

test('a folder README.md or _index.md is skipped with AGSC-E506 and never parsed (AGSC-01-05)', () => {
  const bundle = loadBundle(port(['README.md', '_index.md', 'a.md', 'readme.md']), {});
  assert.deepStrictEqual(bundle.items.map((i) => i.slug), ['a']);
  const skipped = bundle.findings.filter((f) => f.code === 'AGSC-E506');
  assert.deepStrictEqual(skipped.map((f) => [f.file, f.severity]), [
    ['content/concepts/README.md', 'warn'],
    ['content/concepts/_index.md', 'warn'],
    ['content/concepts/readme.md', 'warn'],
  ]);
  for (const f of skipped) assert.match(f.message, /AGSC-01-05/u);
  assert.ok(!bundle.findings.some((f) => f.severity === 'error'), JSON.stringify(bundle.findings));
});

test('an item file beside them is read as before', () => {
  const bundle = loadBundle(port(['a.md']), {});
  assert.deepStrictEqual(bundle.items.map((i) => i.slug), ['a']);
  assert.deepStrictEqual(bundle.findings.filter((f) => f.code === 'AGSC-E506'), []);
});

// AGSC-01-05 (amended 2026-10-10 for 1.0.0): `index.md` MAY exist in any folder, so an
// `index.md` inside a type folder is a folder note as well. Read as an item it failed
// lint (`AGSC-E202`, `AGSC-E205`, `AGSC-E501`) in a Bundle the rule says may hold it.
test('an index.md inside a type folder is a folder note: skipped with AGSC-E506, never parsed', () => {
  const bundle = loadBundle(port(['a.md', 'index.md']), {});
  assert.deepStrictEqual(bundle.items.map((i) => i.slug), ['a']);
  assert.deepStrictEqual(bundle.findings.map((f) => [f.code, f.file, f.severity]), [
    ['AGSC-E506', 'content/concepts/index.md', 'warn'],
  ]);
  assert.match(bundle.findings[0].message, /AGSC-01-05/u);
});

test('the three names are compared ASCII case-insensitively (AGSC-01-05)', () => {
  const bundle = loadBundle(port(['INDEX.md', 'Index.md', 'a.md']), {});
  assert.deepStrictEqual(bundle.items.map((i) => i.slug), ['a']);
  assert.deepStrictEqual(bundle.findings.map((f) => [f.code, f.file]), [
    ['AGSC-E506', 'content/concepts/INDEX.md'],
    ['AGSC-E506', 'content/concepts/Index.md'],
  ]);
});
