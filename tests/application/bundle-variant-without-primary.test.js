'use strict';
// application/bundle.js: AGSC-01-13 (amended 2026-10-10 for 1.0.0). Language variants are
// reserved to 1.1, and at 1.0 a file named `<slug>.<lang>.md` beside its primary is a
// second use of the primary's slug (`AGSC-E206`, raised by the slug check of `lint`).
// Such a file with NO primary has a stem that is not a slug (AGSC-01-10, AGSC-01-11),
// so the reader reports it as `AGSC-E204`; until this amendment it was read silently
// as the primary's slug and published under it.

const test = require('node:test');
const assert = require('node:assert');

const { loadBundle } = require('../../src/application/bundle.js');

const ITEM = '---\ntype: concept\nkind: explainer\ntitle: A Concept\n---\n\nA body.\n';
const LESSON = '---\ntype: lesson\ntitle: A Lesson\n---\n\nA body.\n';

/** A FileSystem port over `{folder: [entries]}`; every entry reads as an item of its folder. */
function port(tree) {
  const dirs = Object.keys(tree).map((folder) => `content/${folder}`);
  return {
    exists: (p) => p === 'agsc.config.json' || dirs.includes(p),
    readdir: (dir) => tree[dir.slice('content/'.length)] || [],
    readFile: (p) => {
      if (p === 'agsc.config.json') return '{}';
      return p.startsWith('content/lessons/') ? LESSON : ITEM;
    },
    walk: () => [],
  };
}

const e204 = (bundle) => bundle.findings.filter((f) => f.code === 'AGSC-E204');

test('a variant file whose primary is absent is AGSC-E204, naming the file and the slug', () => {
  const bundle = loadBundle(port({ concepts: ['a.md', 'lonely.fr.md'] }), {});
  const found = e204(bundle);
  assert.strictEqual(found.length, 1, JSON.stringify(bundle.findings));
  assert.strictEqual(found[0].file, 'content/concepts/lonely.fr.md');
  assert.strictEqual(found[0].slug, 'lonely');
  assert.strictEqual(found[0].severity, 'error');
  assert.match(found[0].message, /AGSC-01-13/u);
});

test('any stem holding a dot with no primary is the same fault, whatever follows the dot', () => {
  const bundle = loadBundle(port({ concepts: ['notes.v2.md'] }), {});
  assert.deepStrictEqual(e204(bundle).map((f) => [f.file, f.slug]), [['content/concepts/notes.v2.md', 'notes']]);
});

test('a variant beside its primary is left to the slug check (AGSC-E206), not reported here', () => {
  const bundle = loadBundle(port({ concepts: ['handoff.fr.md', 'handoff.md'] }), {});
  assert.deepStrictEqual(e204(bundle), []);
});

test('a primary in another type folder still owns the slug: no AGSC-E204', () => {
  const bundle = loadBundle(port({ concepts: ['handoff.fr.md'], lessons: ['handoff.md'] }), {});
  assert.deepStrictEqual(e204(bundle), []);
});

test('two variants with no primary are each reported', () => {
  const bundle = loadBundle(port({ concepts: ['solo.de.md', 'solo.fr.md'] }), {});
  assert.deepStrictEqual(e204(bundle).map((f) => f.file),
    ['content/concepts/solo.de.md', 'content/concepts/solo.fr.md']);
});

test('a Bundle with no dotted stem is unchanged', () => {
  const bundle = loadBundle(port({ concepts: ['a.md', 'b.md'] }), {});
  assert.deepStrictEqual(bundle.findings, []);
});
