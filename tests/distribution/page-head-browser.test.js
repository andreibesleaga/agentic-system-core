'use strict';
/* global document, window, getComputedStyle, location */
// verifies PRD-069
// tests/distribution/page-head-browser.test.js — the page head and the reader's way around a
// node in a REAL browser (`page-head.test.js` holds the bytes). The minimal fixture, given an
// icon that an item's body shows, is built and served from 127.0.0.1 with the
// Content-Security-Policy of its own `_headers`; a headless Chromium opens the home page, an
// item page, an empty type folder, a tag page and a missing page, in the light and the dark
// colour scheme, and checks that the icon loads under that policy, that an item page's tag
// link leads to its tag page, that the element a #fragment link lands on is marked (a
// heading; the heading of a chunk anchor; never `main`, the skip link's target), that nothing
// loads from another origin and no console error is logged, and that axe-core finds no
// violation (the tags of `bench/a11y.js`).
//
// Runs only with AGSC_BROWSER=1, CHROME_EXE naming a Chromium or chrome-headless-shell
// binary, and `playwright-core` and `axe-core` resolvable (NODE_PATH may point at an install
// outside the repository); otherwise it is skipped and says which is missing. Nothing leaves
// loopback. The clock is fixed at 2026-01-01T00:00:00Z.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const site = require('../../src/distribution/site.js');
const validate = require('../../src/knowledge/validate.js');
const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const { loadBundle } = require('../../src/application/bundle.js');

const ROOT = path.resolve(__dirname, '..', '..');

function skipReason() {
  if (process.env.AGSC_BROWSER !== '1') return 'the browser lane runs only with AGSC_BROWSER=1';
  if (!process.env.CHROME_EXE || !fs.existsSync(process.env.CHROME_EXE)) return 'CHROME_EXE names no browser binary';
  for (const name of ['playwright-core', 'axe-core']) {
    try {
      require.resolve(name);
    } catch (e) {
      return `${name} is not installed (npm i --no-save ${name} outside the repository, then NODE_PATH)`;
    }
  }
  return null;
}

const SKIP = skipReason();
const TYPES = { '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const PAGES = ['/', '/concepts/handoff/', '/gates/', '/tags/agents/', '/no-such-page/'];

/** The minimal fixture with an icon one item's body shows, built and written to a scratch folder. */
function iconNode() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-page-head-src-'));
  fs.cpSync(path.join(ROOT, 'tests', 'fixtures', 'minimal'), dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'content', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'content', 'assets', 'favicon.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#245a9c"/></svg>\n');
  const item = path.join(dir, 'content', 'concepts', 'supervisor.md');
  fs.writeFileSync(item, `${fs.readFileSync(item, 'utf8')}\n![The node's mark](../assets/favicon.svg)\n`);
  const port = createFileSystem(dir);
  const bundle = loadBundle(port, { schemas: validate.schemas(readSchemas(ROOT)) });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } });
  const { files } = site.build(bundle, { fs: port, clock }, { specVersion: '1.0.0', version: '0.0.2' });
  fs.rmSync(dir, { force: true, recursive: true });
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-page-head-www-'));
  for (const [route, bytes] of files) {
    fs.mkdirSync(path.dirname(path.join(out, route)), { recursive: true });
    fs.writeFileSync(path.join(out, route), bytes);
  }
  return out;
}

/** The built node served on loopback with its own CSP; a missing file is the 404 page. */
function serve(out) {
  const csp = /Content-Security-Policy: (.*)/u.exec(fs.readFileSync(path.join(out, '_headers'), 'utf8'))[1];
  return http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(out, url.endsWith('/') ? `${url}index.html` : url);
    res.setHeader('Content-Security-Policy', csp);
    if (!file.startsWith(out) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'Content-Type': TYPES['.html'] });
      res.end(fs.readFileSync(path.join(out, '404.html')));
      return;
    }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
}

/** The outline style of the element a selector names, on the page as it is. */
const outlineOf = (page, selector) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).outlineStyle, selector);

test('the page head, the tag links and the :target mark in a browser', { skip: SKIP || false }, async (t) => {
  const { chromium } = require('playwright-core');
  const out = iconNode();
  const server = serve(out);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE, headless: true });
  const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  try {
    for (const scheme of ['light', 'dark']) {
      await t.test(`icon, tags, :target, one origin and no axe-core violation (${scheme})`, async () => {
        const context = await browser.newContext({ colorScheme: scheme, viewport: { height: 900, width: 1280 } });
        const page = await context.newPage();
        const errors = [];
        const offOrigin = [];
        page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/u.test(m.text())) errors.push(m.text()); });
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('request', (r) => { if (!r.url().startsWith(base)) offOrigin.push(r.url()); });
        for (const route of PAGES) {
          await page.goto(`${base}${route}`, { waitUntil: 'load' });
          await page.evaluate(axe);
          const result = await page.evaluate((tags) => window.axe.run(document, { runOnly: { type: 'tag', values: tags } }), AXE_TAGS);
          const violations = result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
          assert.deepStrictEqual(violations, [], `${scheme} ${route}: ${violations.join('; ')}`);
          assert.strictEqual(await page.evaluate(() => document.querySelector('link[rel="icon"]').getAttribute('href')), '/assets/favicon.svg', route);
          // a headless browser asks for no icon, so the page loads the linked one as an image, under the node's img-src policy
          assert.ok(await page.evaluate(() => new Promise((resolve) => {
            const img = new window.Image();
            img.onload = () => resolve(img.naturalWidth > 0);
            img.onerror = () => resolve(false);
            img.src = document.querySelector('link[rel="icon"]').href;
          })), `${scheme} ${route}: the icon does not load`);
        }
        const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        assert.strictEqual(background, scheme === 'dark' ? 'rgb(15, 17, 21)' : 'rgb(251, 251, 250)', 'the scheme did not apply');

        // the tag link of an item page leads to its tag page, which lists the item
        await page.goto(`${base}/concepts/handoff/`, { waitUntil: 'load' });
        await Promise.all([page.waitForURL(`${base}/tags/agents/`), page.click('dd a[href="/tags/agents/"]')]);
        assert.ok(await page.evaluate(() => Boolean(document.querySelector('main a[href="/concepts/handoff/"]'))));

        // the element a #fragment link lands on is marked; main, the skip link's target, is not
        await page.goto(`${base}/concepts/handoff/#intent`, { waitUntil: 'load' });
        assert.strictEqual(await outlineOf(page, 'h2#intent'), 'dashed', 'a heading that is the target');
        assert.strictEqual(await outlineOf(page, 'h2#structure'), 'none', 'a heading that is not the target');
        const chunk = await page.evaluate(() => document.querySelector('h2#structure > span[id]').id);
        await page.goto(`${base}/concepts/handoff/#${chunk}`, { waitUntil: 'load' });
        assert.strictEqual(await page.evaluate(() => location.hash.slice(1)), chunk);
        assert.strictEqual(await outlineOf(page, 'h2#structure'), 'dashed', 'the heading of a chunk anchor that is the target');
        await page.goto(`${base}/concepts/handoff/#main`, { waitUntil: 'load' });
        assert.strictEqual(await outlineOf(page, 'main'), 'none', 'the skip link target is not outlined');

        assert.deepStrictEqual(errors, [], 'the page logged errors (a CSP violation is one)');
        assert.deepStrictEqual(offOrigin, []);
        await context.close();
      });
    }
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(out, { force: true, recursive: true });
  }
});
