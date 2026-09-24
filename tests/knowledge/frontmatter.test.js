'use strict';
// AGSC-02-01 (the block), AGSC-01-14 (encoding), AGSC-01-16 (cap) and the Item record.

const test = require('node:test');
const assert = require('node:assert');
const fm = require('../../src/knowledge/frontmatter.js');
const validate = require('../../src/knowledge/validate.js');
const { readSchemas } = require('../../src/adapters/node-fs.js');

const S = validate.schemas(readSchemas());
const VALID = '---\ntype: concept\ntitle: Supervisor\n'
  + 'description: A coordinating agent that routes work to specialised workers and collects their results.\n'
  + 'kind: pattern\nprov:\n  origin: human\n  operator: human:andreibesleaga\n---\n\n## Intent\n\nRoute.\n';

test('split finds the block and the body line (AGSC-02-01)', () => {
  const s = fm.split(VALID);
  assert.strictEqual(s.hasFrontmatter, true);
  assert.deepStrictEqual(s.errors, []);
  assert.strictEqual(s.bodyLine, 10);
  assert.strictEqual(s.body, '\n## Intent\n\nRoute.\n');
  assert.ok(s.yamlText.startsWith('type: concept'));
});

test('a missing, unclosed or multi-document block (AGSC-E101/E102/E107)', () => {
  assert.strictEqual(fm.split('# Notes\n').errors[0].code, 'AGSC-E101');
  assert.strictEqual(fm.split('---\na: 1\n').errors[0].code, 'AGSC-E102');
  assert.strictEqual(fm.split('---\na: 1\n...\n---\n').errors[0].code, 'AGSC-E107');
  assert.strictEqual(fm.split('---\n\n# Rules\n').hasFrontmatter, false, 'a thematic break is not a fence');
});

test('AGSC-01-14 encoding faults are reported and then repaired in memory', () => {
  const bom = fm.split(`﻿${VALID}`);
  assert.strictEqual(bom.errors[0].code, 'AGSC-E108');
  assert.strictEqual(bom.hasFrontmatter, true);
  const crlf = fm.split(VALID.replace(/\n/gu, '\r\n'));
  assert.ok(crlf.errors.some((e) => e.code === 'AGSC-E108'));
  assert.strictEqual(crlf.hasFrontmatter, true);
});

test('AGSC-01-16: a file above the cap is AGSC-E904 and is not parsed', () => {
  const huge = `---\na: ${'x'.repeat(1024 * 1024 + 10)}\n---\n`;
  const s = fm.split(huge);
  assert.strictEqual(s.errors[0].code, 'AGSC-E904');
  assert.strictEqual(s.hasFrontmatter, false);
});

test('hasClosedFrontmatter is the AGSC-02-91 adoption guard', () => {
  assert.strictEqual(fm.hasClosedFrontmatter(VALID), true);
  assert.strictEqual(fm.hasClosedFrontmatter('---\n\n# Rules\n'), false);
  assert.strictEqual(fm.hasClosedFrontmatter('# Rules\n'), false);
});

test('keyLines points a Finding at its key', () => {
  const lines = fm.keyLines('type: concept\ntitle: S\n"q k": v\n', 1);
  assert.strictEqual(lines.get('type'), 2);
  assert.strictEqual(lines.get('title'), 3);
  assert.strictEqual(lines.get('q k'), 4);
});

test('firstHeading reads the first ATX heading (AGSC-02-90)', () => {
  assert.strictEqual(fm.firstHeading('# Handoff\n\nbody\n'), 'Handoff');
  assert.strictEqual(fm.firstHeading('text\n## Two\n# One\n'), 'One');
  assert.strictEqual(fm.firstHeading('no heading\n'), null);
});

test('parseItem returns the Item record and carries the YAML line (fm-0005)', () => {
  const item = fm.parseItem(VALID, { path: 'content/concepts/supervisor.md', schemas: S });
  assert.strictEqual(item.slug, 'supervisor');
  assert.strictEqual(item.type, 'concept');
  assert.deepStrictEqual(item.findings, []);
  assert.strictEqual(item.frontmatter.kind, 'pattern');
  assert.strictEqual(item.lineOffset, 10);

  const anchored = fm.parseItem('---\ntype: concept\ntitle: S\nx: &a 1\n---\n', { schemas: S });
  assert.strictEqual(anchored.findings[0].code, 'AGSC-E103');
  assert.strictEqual(anchored.findings[0].line, 4);
  assert.strictEqual(anchored.frontmatter, null);
});

test('parseItem is total: no frontmatter, no schemas, wrong folder', () => {
  const bare = fm.parseItem('# Notes\n', { path: 'notes.md' });
  assert.strictEqual(bare.frontmatter, null);
  assert.strictEqual(bare.findings[0].code, 'AGSC-E101');
  const noSchema = fm.parseItem(VALID, {});
  assert.strictEqual(noSchema.frontmatter.type, 'concept');
  assert.deepStrictEqual(noSchema.findings, []);
  const misplaced = fm.parseItem(VALID, { path: 'content/procedures/supervisor.md', schemas: S });
  assert.deepStrictEqual(misplaced.findings.map((f) => f.code), ['AGSC-E205']);
});

test('firstHeading ignores an empty heading and is linear on a long line', () => {
  assert.strictEqual(fm.firstHeading('#    \n# Real title\n'), 'Real title');
  assert.strictEqual(fm.firstHeading(`# ${' '.repeat(100000)}\n# Real\n`), 'Real');
  assert.strictEqual(fm.firstHeading('#no space\n'), null);
});

// AGSC-01-14 places FOUR obligations on every file — UTF-8 without BOM, LF
// endings, NFC, and exactly one trailing LF. Only the first two were checked, so a
// non-NFC file and a file with a missing or doubled trailing LF passed `lint` silently.
test('AGSC-01-14: a non-NFC file is AGSC-E108', () => {
  const decomposed = VALID.replace('Supervisor', 'Supervisor\u0301'); // r + COMBINING ACUTE
  assert.notStrictEqual(decomposed.normalize('NFC'), decomposed, 'the fixture really is decomposed');
  const s = fm.split(decomposed, { file: 'content/concepts/a.md' });
  const nfcFault = s.errors.filter((e) => e.code === 'AGSC-E108' && /NFC/u.test(e.message));
  assert.strictEqual(nfcFault.length, 1);
  assert.strictEqual(nfcFault[0].file, 'content/concepts/a.md');
  assert.strictEqual(s.hasFrontmatter, true, 'the rest of the diagnosis still runs');
  // The bytes are reported, never rewritten: AGSC-04-07's byte identity is the caller's.
  assert.ok(s.yamlText.includes('\u0301'), 'the bytes are handed on unchanged');
  assert.deepStrictEqual(fm.split(VALID).errors, [], 'an NFC file is clean');
});

test('AGSC-01-14: a missing or doubled trailing LF is AGSC-E108', () => {
  const none = fm.split(VALID.replace(/\n$/u, ''));
  assert.deepStrictEqual(none.errors.map((e) => e.code), ['AGSC-E108']);
  assert.match(none.errors[0].message, /does not end with an LF/u);
  const doubled = fm.split(`${VALID}\n`);
  assert.deepStrictEqual(doubled.errors.map((e) => e.code), ['AGSC-E108']);
  assert.match(doubled.errors[0].message, /more than one LF/u);
  assert.deepStrictEqual(fm.split('').errors.map((e) => e.code), ['AGSC-E101'],
    'an empty file is a missing block, not a trailing-LF fault');
});
