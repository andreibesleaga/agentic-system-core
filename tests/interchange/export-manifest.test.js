'use strict';
// Requirement: PRD-083 (docs/PRD.md).
// verifies AGSC-09-17
// tests/interchange/export-manifest.test.js — the export manifest of AGSC-09-17 (a): the
// pure module that writes it and the check `import` runs against a folder that holds one.
// The CLI path (`export --manifest`, `import` of the folder it wrote) is proved in
// `export-manifest-cli.test.js`, the bytes in the cases `export-0003` and `export-0004`.
//
// Deterministic: no clock, no network, seeded generation.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const manifest = require('../../src/interchange/export-manifest.js');
const { canonicalize } = require('../../src/knowledge/jcs.js');

const FILES = [
  { path: 'content/concepts/b.md', text: 'B\n' },
  { path: 'LICENSE-CONTENT', text: 'Terms.\n' },
  { path: 'content/concepts/a.md', text: 'Ä\n' },
];
const IRIS = ['https://example.org/concepts/b/', 'https://example.org/concepts/a/'];
const FACTS = { bundleHash: 'a'.repeat(64), bundleVersion: '1.2.3', itemIris: IRIS, specVersion: '1.1.0' };

const observed = (files, itemIris = IRIS) => ({ files: new Map(files.map((f) => [f.path, f.text])), itemIris });

test('AGSC-09-17: content_digest is the Content-Digest value of RFC 9530 over the bytes', () => {
  // RFC 9530 §5 writes the SHA-256 of "abc" as base64 with padding, between colons.
  assert.strictEqual(manifest.contentDigest('abc'), 'sha-256=:ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=:');
  // Bytes, not characters: "Ä" is two bytes in UTF-8.
  assert.notStrictEqual(manifest.contentDigest('Ä'), manifest.contentDigest('A'));
});

test('AGSC-09-17: items_digest is the SHA-256 of the JCS array of the IRIs in code-point order', () => {
  const sorted = [...IRIS].sort();
  assert.strictEqual(manifest.itemsDigest(IRIS), manifest.itemsDigest(sorted), 'the order given does not matter');
  assert.match(manifest.itemsDigest(IRIS), /^[0-9a-f]{64}$/u);
  assert.notStrictEqual(manifest.itemsDigest(IRIS), manifest.itemsDigest(IRIS.slice(1)));
});

test('AGSC-09-17: the manifest is one JCS object with six members and one LF, and never lists itself', () => {
  const text = manifest.build([...FILES, { path: manifest.FILE, text: 'ignored' }], FACTS);
  const parsed = JSON.parse(text);
  assert.strictEqual(text, `${canonicalize(parsed)}\n`);
  assert.deepStrictEqual(Object.keys(parsed), ['bundle_hash', 'bundle_version', 'files', 'item_count', 'items_digest', 'spec_version']);
  assert.deepStrictEqual(parsed.files.map((f) => f.path), ['LICENSE-CONTENT', 'content/concepts/a.md', 'content/concepts/b.md']);
  assert.strictEqual(parsed.item_count, 2);
  assert.strictEqual(parsed.files[1].content_digest, manifest.contentDigest('Ä\n'));
});

test('AGSC-09-17: a folder that matches its manifest reports nothing', () => {
  const text = manifest.build(FILES, FACTS);
  assert.deepStrictEqual(manifest.check(text, observed(FILES)), []);
});

test('AGSC-09-17: a changed file, a missing file, a different count and a different item set are each one warning', () => {
  const text = manifest.build(FILES, FACTS);
  const changed = manifest.check(text, observed(FILES.map((f) => (f.path.endsWith('a.md') ? { ...f, text: 'changed\n' } : f))));
  assert.strictEqual(changed.length, 1);
  assert.match(changed[0].message, /content\/concepts\/a\.md/u);
  const missing = manifest.check(text, observed(FILES.filter((f) => !f.path.endsWith('b.md'))));
  assert.strictEqual(missing.length, 1);
  assert.match(missing[0].message, /content\/concepts\/b\.md.*absent/u);
  const count = manifest.check(text, observed(FILES, IRIS.slice(1)));
  assert.deepStrictEqual(count.map((f) => /item_count/u.test(f.message) || /items_digest/u.test(f.message)), [true, true]);
  const swapped = manifest.check(text, observed(FILES, ['https://example.org/concepts/b/', 'https://example.org/concepts/z/']));
  assert.strictEqual(swapped.length, 1);
  assert.match(swapped[0].message, /items_digest/u);
  for (const one of [...changed, ...missing, ...count, ...swapped]) {
    assert.strictEqual(one.code, 'AGSC-E506');
    assert.strictEqual(one.severity, 'warn');
  }
});

test('AGSC-09-17: a manifest that cannot be read is one warning, and an import without item IRIs says it cannot count', () => {
  for (const bad of ['not json', '[]', '{}', '{"files":"x"}']) {
    const found = manifest.check(bad, observed(FILES));
    assert.strictEqual(found.length, 1, bad);
    assert.match(found[0].message, /manifest/u);
    assert.strictEqual(found[0].severity, 'warn');
  }
  const text = manifest.build(FILES, FACTS);
  const none = manifest.check(text, { files: new Map(FILES.map((f) => [f.path, f.text])), itemIris: null });
  assert.strictEqual(none.length, 1);
  assert.match(none[0].message, /item_count and items_digest/u);
});

// ---------------------------------------------------------------- properties

const fileSet = fc.uniqueArray(fc.tuple(fc.stringMatching(/^[a-z]{1,6}(\/[a-z]{1,6}){0,2}\.md$/u), fc.string({ maxLength: 40 })),
  { minLength: 1, maxLength: 6, selector: ([path]) => path }).map((pairs) => pairs.map(([path, text]) => ({ path, text })));

test('property: whatever build writes, check accepts, and building twice gives the same bytes', () => {
  fc.assert(fc.property(fileSet, (files) => {
    const text = manifest.build(files, FACTS);
    assert.strictEqual(text, manifest.build([...files].reverse(), FACTS));
    assert.deepStrictEqual(manifest.check(text, observed(files)), []);
  }), { numRuns: 100, seed: 20261031 });
});

test('property: changing the bytes of any one listed file is exactly one warning, about that file', () => {
  fc.assert(fc.property(fileSet, fc.nat(), (files, pick) => {
    const at = pick % files.length;
    const text = manifest.build(files, FACTS);
    const edited = files.map((f, i) => (i === at ? { ...f, text: `${f.text}x` } : f));
    const found = manifest.check(text, observed(edited));
    assert.strictEqual(found.length, 1);
    assert.ok(found[0].message.includes(files[at].path));
  }), { numRuns: 100, seed: 20261031 });
});
