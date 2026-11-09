'use strict';
// verifies PRD-069
// The page head and the reader's way around a node (the 1.0 site findings U7, U8, U9, U14
// and U21, engine half). No rule of the specification pins these bytes: generated HTML is
// not part of the cross-implementation vector set (AGSC-04-24). What IS pinned by rule is
// kept: the route set (AGSC-06-01), an empty type folder resolving and staying out of the
// navigation (AGSC-06-02), no third-party origin (AGSC-06-05), and every machine file.
// The clock is fixed at 2026-01-01T00:00:00Z; nothing here reaches outside the repository.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const html = require('../../src/distribution/html.js');
const theme = require('../../src/distribution/theme.js');
const site = require('../../src/distribution/site.js');
const validate = require('../../src/knowledge/validate.js');
const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const { loadBundle } = require('../../src/application/bundle.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const RENDER = (body) => ({ html: `<p>${body.trim()}</p>`, headings: [], anchors: [] });
const OPTIONS = { render: RENDER, licenseProse: 'CC-BY-4.0', nav: [['/', 'Home']], siteTitle: 'Node & Co', siteBase: 'https://n.example/' };

/** A scratch copy of the minimal fixture, changed by `edit(dir)`; removed at exit. */
function scratch(edit) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-page-head-'));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } });
  if (edit) edit(dir);
  return dir;
}

function build(dir = FIXTURE, extra = {}) {
  const port = createFileSystem(dir);
  const bundle = loadBundle(port, { schemas: validate.schemas(readSchemas(ROOT)) });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } });
  return site.build(bundle, { fs: port, clock }, { specVersion: '1.0.0', version: '0.0.2', ...extra });
}

const headOf = (page) => page.slice(0, page.indexOf('</head>'));
const mainOf = (page) => page.slice(page.indexOf('<main'), page.indexOf('</main>'));

// ---------------------------------------------------------------- U14: page titles

test('U14: a page title carries the site name after the page name', () => {
  const page = html.itemPage({ slug: 'a', title: 'Handoff', description: 'D', body: '' }, OPTIONS);
  assert.ok(page.includes('<title>Handoff — Node &amp; Co</title>'), headOf(page));
  // the visible heading stays the page's own name
  assert.ok(page.includes('<h1>Handoff</h1>'));
});

test('U14: a page named like the site (the home page) is not named twice', () => {
  const page = html.homePage({ title: 'Node & Co', description: 'D', introHtml: '', sections: [] }, OPTIONS);
  assert.ok(page.includes('<title>Node &amp; Co</title>'), headOf(page));
});

test('U14: a page with no name is not titled with the site name alone after a dash', () => {
  const page = html.shell({ ...OPTIONS, title: '', body: '<p>x</p>' });
  assert.ok(page.includes('<title></title>'), headOf(page));
});

test('U14: with no site name the title is the page name alone (the 1.0 bytes)', () => {
  const page = html.itemPage({ slug: 'a', title: 'Handoff', body: '' }, { ...OPTIONS, siteTitle: undefined });
  assert.ok(page.includes('<title>Handoff</title>'));
});

// ---------------------------------------------------------------- U8: Open Graph

test('U8: a page with a canonical address carries the Open Graph tags', () => {
  const page = html.itemPage({ slug: 'a', title: 'Handoff', description: 'The transfer of control.', body: '' },
    { ...OPTIONS, canonical: 'https://n.example/concepts/a/', route: '/concepts/a/' });
  const head = headOf(page);
  assert.ok(head.includes('<meta property="og:type" content="article">'), head);
  assert.ok(head.includes('<meta property="og:url" content="https://n.example/concepts/a/">'));
  assert.ok(head.includes('<meta property="og:title" content="Handoff">'));
  assert.ok(head.includes('<meta property="og:description" content="The transfer of control.">'));
  assert.ok(head.includes('<meta property="og:site_name" content="Node &amp; Co">'));
  assert.ok(!head.includes('og:image'), 'no image is named, so none is announced');
});

test('U8: the home page is og:type website; a page with no description has no og:description', () => {
  const page = html.homePage({ title: 'Node & Co', description: '', introHtml: '', sections: [] }, { ...OPTIONS, route: '/' });
  const head = headOf(page);
  assert.ok(head.includes('<meta property="og:type" content="website">'), head);
  assert.ok(head.includes('<meta property="og:url" content="https://n.example/">'));
  assert.ok(!head.includes('og:description'));
});

test('U8: a page with no address of its own (the 404 page) carries no Open Graph tag', () => {
  const page = html.notFoundPage(OPTIONS);
  assert.ok(!page.includes('property="og:'), headOf(page));
});

test('U8: og:image only when the build is given an image, with its alternative text', () => {
  const opts = { ...OPTIONS, canonical: 'https://n.example/concepts/a/', ogImage: { url: 'https://n.example/assets/card.png', alt: 'The name of the node' } };
  const head = headOf(html.itemPage({ slug: 'a', title: 'A', description: 'D', body: '' }, opts));
  assert.ok(head.includes('<meta property="og:image" content="https://n.example/assets/card.png">'), head);
  assert.ok(head.includes('<meta property="og:image:alt" content="The name of the node">'));
});

test('U8: the build option ogImage resolves a site path against site.base and is on every addressed page', () => {
  const { files } = build(FIXTURE, { ogImage: { url: '/assets/card.png', alt: 'Minimal Bundle' } });
  for (const route of ['/index.html', '/concepts/handoff/index.html', '/concepts/index.html', '/search/index.html']) {
    const head = headOf(files.get(route));
    assert.ok(head.includes('<meta property="og:image" content="https://minimal.example/assets/card.png">'), `${route}: ${head}`);
  }
  assert.ok(!files.get('/404.html').includes('og:image'));
});

test('U8: an ogImage that is neither an https address nor a site path is refused', () => {
  for (const url of ['http://a.example/x.png', 'javascript:alert(1)', 'card.png', '//cdn.example/x.png', '']) {
    assert.throws(() => build(FIXTURE, { ogImage: { url } }), /ogImage/u, url);
  }
  assert.throws(() => build(FIXTURE, { ogImage: '/assets/card.png' }), /ogImage\.url/u, 'a bare string is not the option');
});

test('U8: an https:// ogImage is announced as given; an alternative text that is no string is refused', () => {
  const { files } = build(FIXTURE, { ogImage: { url: 'https://cdn.example/card.png' } });
  const head = headOf(files.get('/concepts/handoff/index.html'));
  assert.ok(head.includes('<meta property="og:image" content="https://cdn.example/card.png">'), head);
  assert.ok(!head.includes('og:image:alt'), 'no alternative text is given, so none is announced');
  assert.throws(() => build(FIXTURE, { ogImage: { url: '/assets/card.png', alt: 7 } }), /ogImage\.alt/u);
});

test('U8: a build with no ogImage carries no og:image anywhere', () => {
  const { files } = build();
  for (const [route, bytes] of files) {
    if (route.endsWith('.html')) assert.ok(!String(bytes).includes('og:image'), route);
  }
});

// ---------------------------------------------------------------- U7: the icon

test('U7: no icon is linked when the node publishes none', () => {
  const { files } = build();
  assert.ok(!files.get('/index.html').includes('rel="icon"'));
});

test('U7: a published /assets/favicon.svg is linked as the icon of every page', () => {
  const dir = scratch((d) => {
    fs.mkdirSync(path.join(d, 'content', 'assets'), { recursive: true });
    fs.writeFileSync(path.join(d, 'content', 'assets', 'favicon.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16"/></svg>\n');
    const item = path.join(d, 'content', 'concepts', 'handoff.md');
    fs.writeFileSync(item, `${fs.readFileSync(item, 'utf8')}\n![The node's mark](../assets/favicon.svg)\n`);
  });
  const { files } = build(dir);
  assert.ok(files.has('/assets/favicon.svg'), 'the asset a body references is published (AGSC-06-01)');
  for (const route of ['/index.html', '/404.html', '/concepts/supervisor/index.html']) {
    assert.ok(headOf(files.get(route)).includes('<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">'), route);
  }
});

// ---------------------------------------------------------------- U9: tag pages reachable

test('U9: an item page lists its tags, each linked to its /tags/<tag>/ page', () => {
  const { files } = build();
  const main = mainOf(files.get('/concepts/handoff/index.html'));
  assert.ok(main.includes('<dt>Tags</dt><dd><a href="/tags/agents/">agents</a>, <a href="/tags/patterns/">patterns</a></dd>'), main);
  assert.ok(files.has('/tags/agents/index.html') && files.has('/tags/patterns/index.html'));
});

test('U9: every /tags/<tag>/ page the build emits is linked from at least one page', () => {
  const { files } = build();
  const tagPages = [...files.keys()].filter((r) => /^\/tags\/[^/]+\/index\.html$/u.test(r)).map((r) => r.replace(/index\.html$/u, ''));
  assert.ok(tagPages.length > 0);
  const pages = [...files].filter(([r]) => r.endsWith('.html')).map(([, b]) => String(b));
  for (const route of tagPages) {
    assert.ok(pages.some((p) => p.includes(`href="${route}"`)), `${route} has no incoming link`);
  }
});

test('U14: every page a build writes is titled with the site name, the home page with it alone', () => {
  const { files } = build();
  const titleOf = (route) => /<title>([^<]*)<\/title>/u.exec(files.get(route))[1];
  assert.strictEqual(titleOf('/concepts/handoff/index.html'), 'Handoff — Minimal Bundle');
  assert.strictEqual(titleOf('/now/index.html'), 'Now — Minimal Bundle');
  assert.strictEqual(titleOf('/index.html'), 'Minimal Bundle');
  // the visible heading keeps the page's own name
  assert.ok(mainOf(files.get('/now/index.html')).includes('<h1>Now</h1>'));
});

test('U9: an item page given no tag routes shows its tags as text', () => {
  const page = html.itemPage({ slug: 'a', title: 'A', body: '', tags: ['kept'] }, OPTIONS);
  assert.ok(page.includes('<dt>Tags</dt><dd>kept</dd>'), mainOf(page));
});

test('U9: a tag with no page (only a draft carries it) is shown as text, never as a dead link', () => {
  const page = html.itemPage({ slug: 'a', title: 'A', body: '', tags: ['kept', 'gone'] }, { ...OPTIONS, tagRoutes: new Map([['kept', '/tags/kept/']]) });
  assert.ok(page.includes('<dt>Tags</dt><dd><a href="/tags/kept/">kept</a>, gone</dd>'), mainOf(page));
});

// ---------------------------------------------------------------- U9: empty type folders

test('U9: an empty type folder still resolves, stays out of the navigation, and is no empty list', () => {
  const { files } = build();
  const page = files.get('/gates/index.html');
  assert.ok(page, 'AGSC-06-02: the empty type folder still resolves');
  assert.ok(!page.includes('href="/gates/"'), 'AGSC-06-02: omitted from the navigation');
  const main = mainOf(page);
  assert.ok(!main.includes('Nothing here yet.'), main);
  assert.ok(main.includes('<p>This node publishes no gates. <a href="/search/">The search page</a> lists every item it publishes.</p>'), main);
  // a type folder that has items is a list as before
  assert.ok(mainOf(files.get('/concepts/index.html')).includes('<ul><li><a href="/concepts/handoff/">'));
});

// ---------------------------------------------------------------- U21: the :target style

test('U21: the stylesheet marks the element a #fragment link lands on', () => {
  const css = theme.stylesheet();
  assert.match(css, /^:target \{ scroll-margin-top: 1rem; \}$/mu);
  assert.match(css, /^:target:not\(main, span\) \{ outline: 2px dashed var\(--accent\); outline-offset: 4px; \}$/mu);
  // a chunk anchor is an empty span inside its heading: the heading is marked instead
  assert.match(css, /^:is\(h2, h3\):has\(> span:target\) \{ outline: 2px dashed var\(--accent\); outline-offset: 4px; \}$/mu);
});

// ---------------------------------------------------------------- what does not move

test('the machine files do not change with the page head (the build with and without an image)', () => {
  const plain = build();
  const imaged = build(FIXTURE, { ogImage: { url: '/assets/card.png' } });
  assert.deepStrictEqual([...imaged.files.keys()], [...plain.files.keys()], 'the route set is the same');
  for (const [route, bytes] of plain.files) {
    if (!route.endsWith('.html')) assert.strictEqual(String(imaged.files.get(route)), String(bytes), route);
  }
});
