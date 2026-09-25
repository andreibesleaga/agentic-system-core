'use strict';
/* global document */
// tests/distribution/search-page-browser.test.js — the `/search/` page in a REAL
// browser. An optional lane like tests/e2e/browser.test.js: the rich fixture of
// tests/standard/_fixture.js is built with the real command line and served from
// 127.0.0.1 with the Content-Security-Policy of its own `_headers`. A headless
// Chromium then opens `/search/`:
//   * the form appears (it is hidden until the page's script shows it), and a person
//     using only the keyboard reaches the box, types a query and presses Enter;
//   * the results list names the item, its description and its page;
//   * `/search/?q=<words>` opens already searched;
//   * no console error, no uncaught exception, no request off the local origin, and
//     no CSP violation — the page loads one same-origin script (AGSC-06-17).
//
// Runs only with AGSC_BROWSER=1 and CHROME_EXE naming a Chromium or
// chrome-headless-shell binary, and `playwright-core` resolvable (NODE_PATH may
// point at an install outside the repository); otherwise it is skipped and says which
// of the three is missing. Nothing leaves loopback.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const { richBuild } = require('../standard/_fixture.js');

function skipReason() {
  if (process.env.AGSC_BROWSER !== '1') return 'the browser lane runs only with AGSC_BROWSER=1';
  if (!process.env.CHROME_EXE || !fs.existsSync(process.env.CHROME_EXE)) return 'CHROME_EXE names no browser binary';
  try {
    require.resolve('playwright-core');
  } catch (e) {
    return 'playwright-core is not installed (npm i --no-save playwright-core outside the repository, then NODE_PATH)';
  }
  return null;
}

const TYPES = { '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };

const SKIP = skipReason();

/** The built fixture served on loopback with its own CSP. */
function serve(out) {
  const csp = /Content-Security-Policy: (.*)/u.exec(fs.readFileSync(path.join(out, '_headers'), 'utf8'))[1];
  return http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(out, url.endsWith('/') ? `${url}index.html` : url);
    if (!file.startsWith(out) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(fs.readFileSync(path.join(out, '404.html')));
      return;
    }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Content-Security-Policy', csp);
    res.end(fs.readFileSync(file));
  });
}

/** A page that records every console error, page error and off-origin request. */
async function watched(browser, base) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  const offOrigin = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => { if (!r.url().startsWith(base)) offOrigin.push(r.url()); });
  return { context, errors, offOrigin, page };
}

test('the search page works in a browser, by keyboard alone, and nothing leaves the origin', { skip: SKIP || false }, async () => {
  const { chromium } = require('playwright-core');
  const { out } = richBuild();
  const server = serve(out);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE, headless: true });
  try {
    // Keyboard only: Tab from the top of the page until the search box has focus.
    const first = await watched(browser, base);
    await first.page.goto(`${base}/search/`, { waitUntil: 'load' });
    await first.page.waitForSelector('#search-form:not([hidden])', { timeout: 10000 });
    let focused = '';
    for (let i = 0; i < 40 && focused !== 'q'; i += 1) {
      await first.page.keyboard.press('Tab');
      focused = await first.page.evaluate(() => (document.activeElement && document.activeElement.id) || '');
    }
    assert.strictEqual(focused, 'q', 'the search box is not reachable by Tab');
    await first.page.keyboard.type('handoff');
    await first.page.keyboard.press('Enter');
    await first.page.waitForSelector('#results li a', { timeout: 10000 });
    const hits = await first.page.evaluate(() => [...document.querySelectorAll('#results li')]
      .map((li) => ({ href: li.querySelector('a').getAttribute('href'), text: li.textContent, title: li.querySelector('a').textContent })));
    assert.ok(hits.some((h) => h.href === '/concepts/handoff/' && h.title === 'Handoff'), JSON.stringify(hits));
    assert.ok(hits.every((h) => /^\/[a-z]+\/[a-z0-9-]+\/$/u.test(h.href)), 'a hit links outside the item routes');
    assert.ok(hits.some((h) => h.text.includes(': ')), 'no hit shows its description');
    const status = await first.page.evaluate(() => document.getElementById('search-status').textContent);
    assert.match(status, /^\d+ results?$/u, status);
    assert.strictEqual(await first.page.evaluate(() => document.getElementById('site-index').hidden), true,
      'the fallback list stayed visible beside the results');
    // The hits are links a keyboard reaches: Tab on from the box (past the button)
    // to the first result and open it.
    let onResult = false;
    for (let i = 0; i < 10 && !onResult; i += 1) {
      await first.page.keyboard.press('Tab');
      onResult = await first.page.evaluate(() => {
        const el = document.activeElement;
        return Boolean(el && el.tagName === 'A' && el.closest('#results') !== null);
      });
    }
    assert.ok(onResult, 'no result link is reachable by Tab');
    await first.page.keyboard.press('Enter');
    await first.page.waitForURL(/\/[a-z]+\/[a-z0-9-]+\/$/u, { timeout: 10000 });
    assert.ok(first.page.url().endsWith(hits[0].href), `${first.page.url()} is not the first hit ${hits[0].href}`);
    assert.deepStrictEqual(first.errors, [], 'the page logged errors');
    assert.deepStrictEqual(first.offOrigin, [], 'the page requested another origin');
    await first.context.close();

    // A pre-filled link, a query with no hit, and an emptied box.
    const second = await watched(browser, base);
    await second.page.goto(`${base}/search/?q=supervisor`, { waitUntil: 'load' });
    await second.page.waitForSelector('#results li a', { timeout: 10000 });
    assert.strictEqual(await second.page.evaluate(() => document.getElementById('q').value), 'supervisor');
    assert.ok((await second.page.evaluate(() => [...document.querySelectorAll('#results li a')].map((a) => a.getAttribute('href'))))
      .includes('/concepts/supervisor/'));
    await second.page.fill('#q', 'nothingmatchesthisquery');
    await second.page.waitForFunction(() => document.getElementById('search-status').textContent.startsWith('No results'), null, { timeout: 10000 });
    assert.strictEqual(await second.page.evaluate(() => document.querySelectorAll('#results li').length), 0);
    await second.page.fill('#q', '');
    await second.page.waitForFunction(() => document.getElementById('site-index').hidden === false, null, { timeout: 10000 });
    assert.strictEqual(await second.page.evaluate(() => document.getElementById('search-status').textContent), '');
    assert.deepStrictEqual(second.errors, [], 'the page logged errors');
    assert.deepStrictEqual(second.offOrigin, [], 'the page requested another origin');
    await second.context.close();
  } finally {
    await browser.close();
    server.close();
  }
});
