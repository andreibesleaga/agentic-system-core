'use strict';
// Three lint checks the rules named on 2026-09-24 and no lane raised before:
//   AGSC-02-20  each unsupported Markdown construct is one AGSC-E109 warning;
//   AGSC-05-21  overlapping labels — two published items of one type with equal
//               titles after NFC and case folding — are the warning AGSC-E416;
//   AGSC-01-07  a compiled .svg under content/diagrams/ is AGSC-E205.

const test = require('node:test');
const assert = require('node:assert');
const lint = require('../../src/governance/lint.js');
const markdown = require('../../src/knowledge/markdown.js');

function item({ slug, title = 'T', body = '', type = 'concept', status }) {
  const frontmatter = { type, title, ...(status === undefined ? {} : { status }) };
  return { body, frontmatter, path: `content/${type}s/${slug}.md`, slug, type };
}
const codes = (findings) => findings.map((f) => f.code);

test('AGSC-02-20: every unsupported construct is one AGSC-E109 warning, with its line', () => {
  const body = [
    'A paragraph with <b>inline HTML</b> and a footnote[^1].', // 1
    '', // 2
    '<div>a raw block</div>', // 3
    '', // 4
    '[^1]: the footnote definition', // 5
    '', // 6
    '- [ ] a task-list marker', // 7
    '- plain item', // 8
    '', // 9
    'Struck ~~through~~ text and a bare https://example.org/path literal.', // 10
  ].join('\n');
  const found = markdown.constructs(body);
  assert.deepStrictEqual(found.map((c) => [c.construct, c.line]), [
    ['raw HTML', 1], ['raw HTML', 1], ['footnote reference', 1],
    ['raw HTML', 3], ['raw HTML', 3],
    ['footnote definition', 5],
    ['task-list marker', 7],
    ['strikethrough', 10], ['autolink literal', 10],
  ]);
  const findings = lint.checkConstructs(item({ slug: 'c', body }));
  assert.strictEqual(findings.length, found.length);
  assert.ok(findings.every((f) => f.code === 'AGSC-E109' && f.severity === 'warn' && f.file === 'content/concepts/c.md'));
  assert.deepStrictEqual(findings.map((f) => f.line), found.map((c) => c.line));
});

test('AGSC-02-20: code spans, fenced blocks, real links, autolinks and tables raise nothing', () => {
  const body = [
    'Inline `<b>code</b>` and `[^1]` and `~~x~~` and `https://example.org` stay quiet.',
    '',
    '```html',
    '<div>fenced</div> [^2] - [ ] ~~y~~ https://example.org/in-fence',
    '```',
    '',
    'A [link](https://example.org/target) and an autolink <https://example.org/auto>.',
    '',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
  ].join('\n');
  assert.deepStrictEqual(markdown.constructs(body), []);
  assert.deepStrictEqual(lint.checkConstructs(item({ slug: 'c', body })), []);
});

test('AGSC-05-21: two published items of one type with equal folded titles are one AGSC-E416 on the later path', () => {
  const items = [
    item({ slug: 'handoff', title: 'Handoff' }),
    item({ slug: 'hand-off', title: 'HANDOFF' }),
    item({ slug: 'other', title: 'Other' }),
    item({ slug: 'handoff-procedure', title: 'handoff', type: 'procedure' }), // another type: no overlap
    item({ slug: 'handoff-draft', title: 'handoff', status: 'draft' }), // held back: not published
  ];
  const findings = lint.checkOverlappingLabels(items, {});
  assert.deepStrictEqual(codes(findings), ['AGSC-E416']);
  assert.strictEqual(findings[0].severity, 'warn');
  assert.strictEqual(findings[0].file, 'content/concepts/handoff.md', 'reported on the later path in code-point order');
  assert.match(findings[0].message, /"hand-off"/u);
  // NFC: a decomposed title equals its composed form.
  const nfc = [item({ slug: 'a', title: 'Café' }), item({ slug: 'b', title: 'Café' })];
  assert.deepStrictEqual(codes(lint.checkOverlappingLabels(nfc, {})), ['AGSC-E416']);
  // The lint entry point raises it too, and a `releases` switch holds an item back.
  assert.ok(codes(lint.lint({ items })).includes('AGSC-E416'));
  const released = [item({ slug: 'x', title: 'Same' }), { ...item({ slug: 'y', title: 'same' }), frontmatter: { type: 'concept', title: 'same', release: 'r2' } }];
  assert.deepStrictEqual(codes(lint.checkOverlappingLabels(released, { releases: { r2: false } })), []);
});

test('AGSC-01-07: a compiled .svg under content/diagrams/ is AGSC-E205; a source or an attachment is not', () => {
  const findings = lint.checkCompiledSvg([
    'content/diagrams/handoff.svg', 'content/diagrams/handoff.diagram',
    'content/attachments/handoff/picture.svg', 'content/diagrams/handoff.svg',
  ]);
  assert.deepStrictEqual(findings.map((f) => [f.code, f.file, f.severity]),
    [['AGSC-E205', 'content/diagrams/handoff.svg', 'error']]);
  assert.ok(codes(lint.lint({ items: [] }, { diagramPaths: ['content/diagrams/x.svg'] })).includes('AGSC-E205'));
  assert.ok(codes(lint.lint({ items: [] }, { trackedPaths: ['content/diagrams/y.SVG'] })).includes('AGSC-E205'));
  assert.ok(!codes(lint.lint({ items: [] }, { diagramPaths: ['content/diagrams/x.diagram'] })).includes('AGSC-E205'));
});
