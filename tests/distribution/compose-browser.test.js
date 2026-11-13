'use strict';
/* global document */
// verifies AGSC-07-25, AGSC-06-20, AGSC-06-17, AGSC-06-05
// tests/distribution/compose-browser.test.js — the `/compose/` page in a REAL browser: the
// parts of its controller the Node suite runs only against a minimal DOM. The rich fixture
// of tests/standard/_fixture.js is built with the real command line and served from
// 127.0.0.1 with the Content-Security-Policy of its own `_headers`; a headless Chromium
// opens `/compose/` and checks:
//   * no layout shift of the page's own content while it loads: no layout-shift entry the
//     browser records has a source inside <main> (the workspace appears where the loading
//     paragraph was, so nothing a reader already sees moves; only the footer below moves as
//     the page grows), and the cumulative score stays under 0.1, the "good" bound of the
//     Core Web Vitals, at a desktop and a phone width;
//   * the filters, from the keyboard alone: Tab reaches the text box, the cluster and the
//     tag lists, and the arrow keys choose a cluster, which narrows the list;
//   * the brief appears inline once an item is ticked — the verdict in words, the
//     dependency order, the gaps, the checklist and the brief's downloads — with no console
//     error, no CSP violation and nothing from another origin;
//   * accessibility: axe-core finds no violation on the page with a brief shown, in the
//     light and the dark colour scheme.
//
// Runs only with AGSC_BROWSER=1, CHROME_EXE naming a Chromium or chrome-headless-shell
// binary, and `playwright-core` and `axe-core` resolvable (NODE_PATH may point at an
// install outside the repository); otherwise it is skipped and says which is missing.
// Nothing leaves loopback.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const { richBuild } = require('../standard/_fixture.js');

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
const TYPES = { '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.jsonl': 'application/jsonl', '.jsonld': 'application/ld+json', '.md': 'text/markdown; charset=utf-8' };
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/** The built fixture served on loopback with its own CSP; every response waits `delay` ms. */
function serve(out, delay) {
  const csp = /Content-Security-Policy: (.*)/u.exec(fs.readFileSync(path.join(out, '_headers'), 'utf8'))[1];
  return http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(out, url.endsWith('/') ? `${url}index.html` : url);
    setTimeout(() => {
      if (!file.startsWith(out) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(fs.readFileSync(path.join(out, '404.html')));
        return;
      }
      res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
      res.setHeader('Content-Security-Policy', csp);
      res.end(fs.readFileSync(file));
    }, url.endsWith('.json') || url.endsWith('.jsonld') ? delay : 0);
  });
}

/** One served build and one browser for every test of this file. */
async function session() {
  const { chromium } = require('playwright-core');
  const { out } = richBuild();
  // The data files arrive late, so the page is seen before and after its list is painted.
  const server = serve(out, 300);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE, headless: true });
  const close = async () => { await browser.close(); server.close(); };
  return { base, browser, close, out };
}

/** `/compose/`, every console error and off-origin request recorded, the layout shifts summed. */
async function openCompose({ base, browser }, scheme = 'light', viewport = { height: 900, width: 1280 }) {
  const context = await browser.newContext({ colorScheme: scheme, viewport });
  const page = await context.newPage();
  const errors = [];
  const offOrigin = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => { if (!r.url().startsWith(base)) offOrigin.push(r.url()); });
  await page.addInitScript(() => {
    globalThis.AGSC_SHIFT = { inMain: [], score: 0 };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        globalThis.AGSC_SHIFT.score += entry.value;
        for (const source of entry.sources) {
          const main = document.getElementById('main');
          // <main> itself moves when the site header above it gains the theme control
          // (theme.js, every page); what this page adds is what lies inside it.
          if (source.node && main && source.node !== main && main.contains(source.node)) globalThis.AGSC_SHIFT.inMain.push(source.node.id || source.node.nodeName);
        }
      }
    }).observe({ buffered: true, type: 'layout-shift' });
  });
  await page.goto(`${base}/compose/`, { waitUntil: 'load' });
  await page.waitForSelector('#workspace:not([hidden]) #items input[type="checkbox"]', { timeout: 15000 });
  return { context, errors, offOrigin, page };
}

test('the /compose/ page in a browser: no layout shift, filters from the keyboard, the brief inline, axe in both schemes', { skip: SKIP || false, timeout: 120000 }, async (t) => {
  const s = await session();
  try {
    for (const viewport of [{ height: 900, width: 1280 }, { height: 844, width: 390 }]) {
      await t.test(`nothing in the page moves while it loads and paints its list (${viewport.width} px)`, async () => {
        const { context, page } = await openCompose(s, 'light', viewport);
        assert.strictEqual(await page.evaluate(() => document.getElementById('loading').hidden), true);
        await page.waitForTimeout(300);
        const shift = await page.evaluate(() => globalThis.AGSC_SHIFT);
        assert.deepStrictEqual(shift.inMain, [], 'an element of the page moved');
        assert.ok(shift.score < 0.1, `cumulative layout shift ${shift.score}`);
        await context.close();
      });
    }

    await t.test('the filters are reached and used with the keyboard alone, and narrow the list', async () => {
      const { context, page } = await openCompose(s);
      await page.focus('#filter');
      await page.keyboard.press('Tab');
      assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'filter-cluster');
      const total = await page.evaluate(() => document.querySelectorAll('#items li').length);
      await page.keyboard.press('ArrowDown');
      const shown = await page.evaluate(() => [...document.querySelectorAll('#items li')].filter((li) => !li.hidden).length);
      assert.ok(shown > 0 && shown < total, `${shown} of ${total} shown`);
      assert.match(await page.evaluate(() => document.getElementById('filter-status').textContent), /items match in the cluster /u);
      await page.keyboard.press('Tab');
      assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'filter-tag');
      await context.close();
    });

    for (const scheme of ['light', 'dark']) {
      await t.test(`the brief inline, and axe finds no violation (${scheme})`, async () => {
        const { context, errors, offOrigin, page } = await openCompose(s, scheme);
        await page.check('#items input[value="handoff"]');
        await page.waitForSelector('#brief-order:not([hidden])', { timeout: 15000 });
        await page.waitForSelector('#brief-archive a', { timeout: 15000 });
        assert.match(await page.evaluate(() => document.getElementById('verdict-words').textContent), /^Items in the selection: \d+\./u);
        assert.ok(await page.evaluate(() => document.querySelectorAll('#brief-checklist li').length) > 0);
        assert.strictEqual(await page.evaluate(() => document.querySelectorAll('#brief-files li a').length), 4);
        await page.evaluate(fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'));
        const result = await page.evaluate((tags) => globalThis.axe.run(document, { runOnly: { type: 'tag', values: tags } }), AXE_TAGS);
        assert.deepStrictEqual(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), []);
        assert.deepStrictEqual(errors, []);
        assert.deepStrictEqual(offOrigin, []);
        await context.close();
      });
    }
  } finally {
    await s.close();
  }
});
