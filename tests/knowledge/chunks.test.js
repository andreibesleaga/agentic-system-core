'use strict';
// AGSC-06-26…31 beyond chk-0001…chk-0007: the empty chunk 0, the single oversized
// paragraph, the attachment `alt` fallback, the `releases` switchboard and the link
// ordering. (The chunk export is a Knowledge module, so its unit suite lives under
// tests/knowledge/ per the context rule of the module contract.)

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');
const chunks = require('../../src/knowledge/chunks.js');
const { canonicalize } = require('../../src/knowledge/jcs.js');

const BASE = 'https://a.example/';
const CONCEPT = (body, extra = {}) => ({ type: 'concept', slug: 'c', title: 'C', body, ...extra });

test('an empty chunk 0 is not emitted (AGSC-06-27)', () => {
  const list = chunks.records([CONCEPT('## Intent\n\nText.\n')], { base: BASE }).records;
  assert.deepStrictEqual(list.map((r) => r.section), ['intent']);
  assert.deepStrictEqual(chunks.records([CONCEPT('')], { base: BASE }).records, []);
});

test('a section text ends with exactly one LF and never begins with one (AGSC-06-27)', () => {
  const list = chunks.records([CONCEPT('Intro.\n\n\n\n## A\n\nText.\n\n\n')], { base: BASE }).records;
  for (const record of list) {
    assert.ok(record.text.endsWith('\n') && !record.text.endsWith('\n\n'), JSON.stringify(record.text));
    assert.ok(!record.text.startsWith('\n'), JSON.stringify(record.text));
  }
});

test('a single paragraph longer than the bound splits at the last LF, then at the bound', () => {
  const noLf = 'x'.repeat(50);
  assert.deepStrictEqual(chunks.splitBySize(noLf, 20), ['x'.repeat(20), 'x'.repeat(20), 'x'.repeat(10)]);
  const lines = `${'a'.repeat(15)}\n${'b'.repeat(15)}\n`;
  assert.deepStrictEqual(chunks.splitBySize(lines, 20), [`${'a'.repeat(15)}\n`, `${'b'.repeat(15)}\n`]);
});

test('property: the pieces partition the text, never overlap, and respect the bound', () => {
  fc.assert(fc.property(
    fc.stringMatching(/^[a-z \n]{1,400}$/u),
    fc.integer({ min: 4, max: 64 }),
    (text, bound) => {
      const parts = chunks.splitBySize(text, bound);
      let cursor = 0;
      for (const part of parts) {
        assert.notStrictEqual(part, '', 'an empty piece was emitted');
        // Each piece starts where the previous one ended, or one LF later — the
        // separating blank line of AGSC-06-27 belongs to neither piece.
        assert.ok(text.startsWith(part, cursor) || text.startsWith(part, cursor + 1),
          `piece ${JSON.stringify(part)} is not the next slice of the text (no overlap allowed)`);
        cursor = (text.startsWith(part, cursor) ? cursor : cursor + 1) + part.length;
        if (parts.length > 1) {
          assert.ok(chunks.byteLength(part) <= bound || [...part].length === 1,
            `piece of ${chunks.byteLength(part)} bytes exceeds the bound ${bound}`);
        }
      }
      assert.ok(cursor >= text.length - 1, 'text was lost past the last piece');
    }
  ), { numRuns: 300, seed: 20260918 });
});

test('an attachment that is not text contributes its alt text (AGSC-06-30)', () => {
  const item = CONCEPT('Body.\n', {
    attachments: [{ file: 'd.png', media_type: 'image/png', alt: 'A diagram of the flow.' }],
  });
  const record = chunks.records([item], { base: BASE }).records.find((r) => r.section === 'attachment-1');
  assert.strictEqual(record.text, 'A diagram of the flow.');
  assert.strictEqual(record.type, 'image/png');
});

test('the releases switchboard holds an item back (AGSC-01-20, AGSC-06-30)', () => {
  const item = CONCEPT('Body.\n', { release: 'next' });
  assert.strictEqual(chunks.records([item], { base: BASE, releases: { next: false } }).records.length, 0);
  assert.strictEqual(chunks.records([item], { base: BASE, releases: { next: true } }).records.length, 1);
});

test('links are key → slug arrays, anchors stripped, in code-point order (AGSC-06-29)', () => {
  assert.deepStrictEqual(chunks.linksOf({ requires: ['b#x', 'a'], related: [] }), { requires: ['a', 'b'] });
  assert.strictEqual(chunks.linksOf({ related: [] }), null, 'an empty links object is omitted');
});

test('a `## ` line inside a fence is content, and a setext heading is not a cut', () => {
  assert.deepStrictEqual(chunks.cutPoints('```\n## no\n```\n\nSetext\n---\n\n## Yes\n').map((c) => c.anchor), ['yes']);
});

test('the identifier is stable across runs and the citation anchor is its first 16 hex', () => {
  const id = chunks.chunkId('https://a.example/concepts/c/', 'intent', 0);
  assert.strictEqual(id, chunks.chunkId('https://a.example/concepts/c/', 'intent', 0));
  assert.strictEqual(chunks.citationAnchor(id), `#chunk-${id.slice(0, 16)}`);
  assert.notStrictEqual(id, chunks.chunkId('https://a.example/concepts/c/', 'intent', 1));
});

test('the export is one JCS line per record with no blank line (AGSC-06-26)', () => {
  const list = chunks.records([CONCEPT('A.\n\n## B\n\nC.\n')], { base: BASE }).records;
  const text = chunks.serialize(list, canonicalize);
  const lines = text.split('\n');
  assert.strictEqual(lines[lines.length - 1], '');
  assert.strictEqual(lines.filter((l) => l === '').length, 1);
  for (const line of lines.slice(0, -1)) assert.strictEqual(canonicalize(JSON.parse(line)), line);
});
