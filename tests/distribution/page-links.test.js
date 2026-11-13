'use strict';
// Requirement: PRD-079 (docs/PRD.md).
// Requirement: PRD-086 (docs/PRD.md), the llms.txt v2 relations (AGSC-06-46).
// tests/distribution/page-links.test.js — AGSC-06-46: the two page-level link relations of
// llms.txt v2 (modified 2026-08-10, llmstxt.org, read again 2026-11-07).
//
//   * Every generated HTML page carries `<link rel="describedby" href="/llms.txt"
//     type="text/plain">` in its `<head>`, beside the 1.0 `describedby` link of the discovery
//     document (AGSC-06-25), which stays the first link of the head.
//   * Every item page also carries `<link rel="alternate" href="/pages/<slug>.md"
//     type="text/markdown">`; a page that is not an item page carries none.
//   * fast-check: for any slug the alternate names that slug's Markdown copy, once.
//
// Deterministic: no clock, no network, fixed seed.

const test = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');

const html = require('../../src/distribution/html.js');
const llms = require('../../src/distribution/llms.js');
const { WELLKNOWN_PATH, MEDIA_TYPE } = require('../../src/distribution/discovery.js');

const RENDER = (body) => ({ html: `<p>${body.trim()}</p>`, headings: [], anchors: [] });
const OPTIONS = { render: RENDER, licenseProse: 'CC-BY-4.0', nav: [['/', 'Home']] };
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** The `<link>` elements of the page's `<head>`, each as a map of its attributes. */
function headLinks(page) {
  const head = /<head>([\s\S]*?)<\/head>/u.exec(page)[1];
  return [...head.matchAll(/<link\b([^>]*)>/gu)]
    .map((m) => Object.fromEntries([...m[1].matchAll(/([a-z-]+)="([^"]*)"/gu)].map((a) => [a[1], a[2]])));
}

const llmsLinks = (page) => headLinks(page).filter((l) => l.rel === 'describedby' && l.href === '/llms.txt');
const markdownLinks = (page) => headLinks(page).filter((l) => l.rel === 'alternate' && l.type === 'text/markdown');

/** One page of each template the build writes. */
const PAGES = {
  item: html.itemPage({ body: 'Body', description: 'D', slug: 'a', title: 'A' }, OPTIONS),
  index: html.indexPage({ description: 'All', entries: [], title: 'Concepts' }, OPTIONS),
  now: html.nowPage('# Now\n', OPTIONS),
  notFound: html.notFoundPage(OPTIONS),
  search: html.searchPage({ description: 'Search', entries: [], title: 'Search' }, OPTIONS),
  compose: html.composePage({ assets: [] }, OPTIONS),
};

test('AGSC-06-46: the route and media type of the file the relation names are those of AGSC-06-13', () => {
  assert.equal(llms.LLMS_ROUTE, '/llms.txt');
  assert.equal(llms.LLMS_MEDIA_TYPE, 'text/plain');
});

test('AGSC-06-46: every page template carries one describedby link to /llms.txt of type text/plain', () => {
  for (const [name, page] of Object.entries(PAGES)) {
    assert.deepEqual(llmsLinks(page), [{ href: '/llms.txt', rel: 'describedby', type: 'text/plain' }], name);
  }
});

test('AGSC-06-25 with AGSC-06-46: the discovery document keeps the first link of the head, found by its type', () => {
  for (const [name, page] of Object.entries(PAGES)) {
    assert.deepEqual(headLinks(page)[0], { href: WELLKNOWN_PATH, rel: 'describedby', type: MEDIA_TYPE }, name);
  }
});

test('AGSC-06-46: an item page carries the alternate link to its Markdown copy; no other page does', () => {
  assert.deepEqual(markdownLinks(PAGES.item), [{ href: '/pages/a.md', rel: 'alternate', type: 'text/markdown' }]);
  for (const [name, page] of Object.entries(PAGES)) {
    if (name !== 'item') assert.deepEqual(markdownLinks(page), [], name);
  }
});

test('AGSC-06-46 (property): for any slug the item page names that slug\'s Markdown copy, once', () => {
  fc.assert(fc.property(fc.stringMatching(SLUG).filter((s) => s.length <= 64), (slug) => {
    const page = html.itemPage({ body: '', slug, title: 'T' }, OPTIONS);
    assert.deepEqual(markdownLinks(page), [{ href: `/pages/${slug}.md`, rel: 'alternate', type: 'text/markdown' }]);
    assert.equal(llmsLinks(page).length, 1);
  }), { numRuns: 200, seed: 46 });
});
