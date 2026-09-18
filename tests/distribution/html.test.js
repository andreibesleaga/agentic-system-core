'use strict';
// AGSC-06-02, AGSC-06-05, AGSC-06-18, AGSC-06-19, AGSC-06-20, AGSC-06-24 and
// AGSC-06-25: the page templates. Generated HTML is byte-identical within this
// implementation and is deliberately NOT part of the cross-implementation vector
// set (AGSC-04-24), so these are the obligations that ARE rules.

const test = require('node:test');
const assert = require('node:assert');
const html = require('../../src/distribution/html.js');
const { WELLKNOWN_PATH } = require('../../src/distribution/discovery.js');

const RENDER = (body) => ({ html: `<p>${body.trim()}</p>`, headings: [], anchors: [] });
const OPTIONS = { render: RENDER, licenseProse: 'CC-BY-4.0', nav: [['/', 'Home']] };

test('every page carries the describedby link in its head (AGSC-06-25)', () => {
  const page = html.itemPage({ slug: 'a', title: 'A', description: 'D', body: 'Body' }, OPTIONS);
  assert.ok(page.includes(`<link rel="describedby" href="${WELLKNOWN_PATH}" type="application/linkset+json">`));
});

test('every page carries the Content Use Terms line (AGSC-06-18)', () => {
  const page = html.itemPage({ slug: 'a', title: 'A', body: '' }, OPTIONS);
  assert.ok(page.includes('LicenseRef-AgenticSystemCore-Content-Use-1.0'));
  assert.ok(page.includes('CC-BY-4.0'), 'the prose licence and the terms are two members');
});

test('an item page links its own .md and .jsonld views (AGSC-06-02)', () => {
  const page = html.itemPage({ slug: 'a', title: 'A', body: '' }, OPTIONS);
  assert.ok(page.includes('href="/pages/a.md"'));
  assert.ok(page.includes('href="/pages/a.jsonld"'));
});

test('a retired item keeps its page and carries a visible notice (AGSC-11-22)', () => {
  const retired = html.itemPage({ slug: 'a', title: 'A', body: '', status: 'retired' }, OPTIONS);
  assert.ok(retired.includes('role="note"') && retired.includes('retired'));
  const deprecated = html.itemPage({ slug: 'a', title: 'A', body: '', status: 'deprecated' }, OPTIONS);
  assert.ok(deprecated.includes('deprecated'));
});

test('an attachment renders with its alt text (AGSC-06-20, AGSC-02-98)', () => {
  const page = html.itemPage({
    slug: 'a', title: 'A', body: '',
    attachments: [{ file: 'd.svg', media_type: 'image/svg+xml', alt: 'A flow diagram' }],
  }, OPTIONS);
  assert.ok(page.includes('src="/attachments/a/d.svg"'));
  assert.ok(page.includes('alt="A flow diagram"'));
});

test('the canonical link, the alternates and the JSON-LD head are emitted (AGSC-06-19)', () => {
  const page = html.shell({
    ...OPTIONS,
    title: 'T', description: 'D', body: '<p>x</p>',
    canonical: 'https://a.example/concepts/a/',
    alternates: [{ href: '/pages/a.md', type: 'text/markdown' }],
    jsonld: '{"@type":"TechArticle"}',
  });
  assert.ok(page.includes('<link rel="canonical" href="https://a.example/concepts/a/">'));
  assert.ok(page.includes('<link rel="alternate" href="/pages/a.md" type="text/markdown">'));
  assert.ok(page.includes('<script type="application/ld+json">{"@type":"TechArticle"}</script>'));
});

test('no third-party origin is referenced anywhere in a page (AGSC-06-05)', () => {
  const pages = [
    html.itemPage({ slug: 'a', title: 'A', body: '' }, OPTIONS),
    html.indexPage({ title: 'concepts', description: 'D', entries: [] }, OPTIONS),
    html.indexPage({ title: 'concepts', description: 'D', entries: [{ href: '/a/', title: 'A', description: 'D' }] }, OPTIONS),
    html.nowPage('# Now\n', OPTIONS),
    html.notFoundPage(OPTIONS),
  ];
  for (const page of pages) {
    assert.ok(!/(?:src|href)="https?:\/\//u.test(page.replace(/href="https:\/\/a\.example[^"]*"/gu, '')),
      'a page referenced another origin');
    assert.ok(!page.includes('localStorage') && !page.includes('document.cookie'));
  }
});

test('/about/ is generated from the verb set and carries the honest limit verbatim (AGSC-06-24)', () => {
  const page = html.aboutPage({
    verbs: ['init', 'lint', 'ci'],
    personas: [{ id: 'P0', title: 'Drop-in', steps: ['agsc init', 'agsc ci', 'agsc build'] }],
  }, OPTIONS);
  assert.ok(page.includes('<code>agsc init</code>'));
  assert.ok(page.includes(html.HONEST_LIMIT.slice(0, 40)));
  assert.strictEqual(html.HONEST_LIMIT.includes('MUST NOT claim more'), true);
});

test('every interpolated value is escaped', () => {
  const page = html.itemPage({ slug: 'a', title: '<script>x</script>', body: '' }, OPTIONS);
  assert.ok(!page.includes('<script>x</script>'));
  assert.ok(page.includes('&lt;script&gt;'));
  assert.strictEqual(html.escapeHtml(null), '');
});
