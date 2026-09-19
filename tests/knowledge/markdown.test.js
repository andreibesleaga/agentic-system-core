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

// ---------------------------------------------------------------------------
// V9-D lens (b): `assignAnchors` remembers the highest suffix it has consumed per
// base, so a body of identical headings does not rescan `-2`, `-3`, … from the
// start every time. The memo may never change an emitted anchor, and these are
// the cases that would notice if it did.

test('AGSC-03-13: the suffix memo never changes an emitted anchor', () => {
  // a derived `-2` must step past a LITERAL `-2` heading that came first
  assert.deepStrictEqual(markdown.assignAnchors(['a', 'a-2', 'a']), ['a', 'a-2', 'a-3']);
  // and past one that comes later, which the memo must not skip over
  assert.deepStrictEqual(markdown.assignAnchors(['a', 'a', 'a-3', 'a']), ['a', 'a-2', 'a-3', 'a-4']);
  assert.deepStrictEqual(markdown.assignAnchors(['a', 'a', 'a', 'b', 'a']), ['a', 'a-2', 'a-3', 'b', 'a-4']);
  // empty headings are numbered independently of the suffix memo
  assert.deepStrictEqual(markdown.assignAnchors(['', '!!', '']), ['section-1', 'section-2', 'section-3']);
});

test('AGSC-03-13: anchors are unique and stable for a large run of repeats', () => {
  const n = 5000;
  const anchors = markdown.assignAnchors(Array.from({ length: n }, () => 'same'));
  assert.strictEqual(new Set(anchors).size, n, 'every anchor is distinct');
  assert.strictEqual(anchors[0], 'same');
  assert.strictEqual(anchors[1], 'same-2');
  assert.strictEqual(anchors[n - 1], `same-${n}`);
});

test('AGSC-03-13: the memo agrees with an unmemoised search on every generated list', () => {
  // The reference implementation of the rule, written out longhand: for each
  // heading take the first candidate not already taken, searching from `-2`.
  const reference = (texts) => {
    let empties = 0;
    const bases = texts.map((t) => {
      const a = markdown.anchorOf(t);
      if (a !== '') return a;
      empties += 1;
      return `section-${empties}`;
    });
    const taken = new Set();
    return bases.map((base) => {
      let candidate = base;
      let n = 1;
      while (taken.has(candidate)) { n += 1; candidate = `${base}-${n}`; }
      taken.add(candidate);
      return candidate;
    });
  };
  // A fixed generator, not a clock or a random seed: the same 4 000 lists every run.
  let s = 20260919;
  const rnd = () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const words = ['a', 'a-2', 'a-3', 'a-2-2', 'b', 'b-2', 'same', '', '!!', 'x y', 'A B', 'section-1'];
  for (let trial = 0; trial < 4000; trial += 1) {
    const k = 1 + Math.floor(rnd() * 12);
    const texts = Array.from({ length: k }, () => words[Math.floor(rnd() * words.length)]);
    assert.deepStrictEqual(markdown.assignAnchors(texts), reference(texts), JSON.stringify(texts));
  }
});
