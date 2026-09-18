'use strict';
// AGSC-02-20 (CommonMark 0.31.2 + GFM tables), AGSC-02-22 (info strings),
// AGSC-03-13 (heading anchors). Owner: C (WP-10-C).
//
// No clock, no network, no randomness: `render` is a function of its string.

const test = require('node:test');
const assert = require('node:assert');
const markdown = require('../../src/knowledge/markdown.js');

test('AGSC-03-13: the anchor algorithm, step by step', () => {
  assert.strictEqual(markdown.anchorOf('Intent'), 'intent');
  assert.strictEqual(markdown.anchorOf('Context & Forces'), 'context-forces');
  assert.strictEqual(markdown.anchorOf('- Item'), 'item', 'leading punctuation is trimmed');
  assert.strictEqual(markdown.anchorOf('A  B'), 'a-b', 'runs of - collapse');
  assert.strictEqual(markdown.anchorOf('trailing -'), 'trailing');
  assert.strictEqual(markdown.anchorOf('ASCII UPPER'), 'ascii-upper');
  assert.strictEqual(markdown.anchorOf('ÉCOLE'), 'cole', 'non-ASCII is removed, never folded');
  assert.strictEqual(markdown.anchorOf(''), '');
});

test('AGSC-03-13: every produced anchor matches the link_target grammar', () => {
  const grammar = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;
  const produced = markdown.assignAnchors(['- Item', '第一章', 'A', 'A 2', 'A', '✦', '--', 'x-']);
  for (const anchor of produced) assert.match(anchor, grammar, `"${anchor}" is not a link target`);
});

test('AGSC-03-13: empty anchors are numbered over the empty ones only', () => {
  assert.deepStrictEqual(markdown.assignAnchors(['A', '第一章', 'B', '✦']),
    ['a', 'section-1', 'b', 'section-2']);
});

test('AGSC-03-13: a suffixed anchor never collides with a natural one', () => {
  assert.deepStrictEqual(markdown.assignAnchors(['A', 'A 2', 'A', 'A']),
    ['a', 'a-2', 'a-3', 'a-4']);
});

test('AGSC-03-13: the anchors of a body, in document order', () => {
  const result = markdown.anchors('# - Item\n\n# 第一章\n\n## A\n\n## A 2\n\n## A\n\n## ✦\n');
  assert.deepStrictEqual(result.anchors, ['item', 'section-1', 'a', 'a-2', 'a-3', 'section-2']);
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(result.headings.length, 6);
  assert.strictEqual(result.headings[0].level, 1);
});

test('a heading inside a fence is content, not a heading', () => {
  const headings = markdown.headings('# Real\n\n```text\n## Not a heading\n```\n');
  assert.deepStrictEqual(headings.map((h) => h.text), ['Real']);
});

test('AGSC-02-20: the subset renders, and raw HTML never passes through', () => {
  const { html } = markdown.render('## Intent\n\ntext *em* `code`\n\n- a\n- b\n\n<script>x</script>\n');
  assert.match(html, /<h2 id="intent">Intent<\/h2>/u);
  assert.match(html, /<em>em<\/em>/u);
  assert.match(html, /<li>a<\/li>/u);
  assert.ok(!html.includes('<script>'), 'raw HTML is escaped, never emitted');
});

test('AGSC-02-20: GFM tables render', () => {
  const { html } = markdown.render('| a | b |\n|---|---|\n| 1 | 2 |\n');
  assert.match(html, /<table>/u);
  assert.match(html, /<td>1<\/td>/u);
});

test('AGSC-04-01: rendering is a pure function of the body', () => {
  const body = '# T\n\np\n\n```js\nx\n```\n';
  assert.strictEqual(markdown.render(body).html, markdown.render(body).html);
});

test('AGSC-02-22: fenced info strings are preserved verbatim', () => {
  const fences = markdown.fences('```turtle export\n@prefix a: <x> .\n```\n\n```\nplain\n```\n');
  assert.deepStrictEqual(fences.map((f) => f.info), ['turtle export', '']);
  assert.strictEqual(fences[0].content, '@prefix a: <x> .\n');
  assert.strictEqual(fences[0].line, 1);
});

test('AGSC-02-97: the agsc-selection fence is found and nothing else is', () => {
  const body = '```yaml agsc-selection\n- a\n- b\n```\n\n```yaml\n- c\n```\n';
  const found = markdown.selectionFences(body);
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].content, '- a\n- b\n');
});

test('AGSC-03-11: inline links and images are inventoried with their line', () => {
  const found = markdown.links('a [x](y.md)\n\n![alt](z.svg)\n');
  assert.deepStrictEqual(found, [
    { kind: 'link', target: 'y.md', line: 1 },
    { kind: 'image', target: 'z.svg', line: 3 },
  ]);
});

test('an empty body yields nothing and never throws', () => {
  const result = markdown.render('');
  assert.strictEqual(result.html, '');
  assert.deepStrictEqual(result.headings, []);
  assert.deepStrictEqual(result.anchors, []);
  assert.deepStrictEqual(markdown.links(''), []);
});

test('a heading built only of inline code still yields its text', () => {
  assert.deepStrictEqual(markdown.headings('# `agsc lint`\n').map((h) => h.id), ['agsc-lint']);
});
