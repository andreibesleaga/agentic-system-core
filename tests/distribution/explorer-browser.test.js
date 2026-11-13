'use strict';
// Requirement: PRD-077 (docs/PRD.md).
/* global document, window, getComputedStyle */
// verifies AGSC-06-38, AGSC-06-20, AGSC-06-17, AGSC-06-05
// tests/distribution/explorer-browser.test.js — the explorer of `/clusters/` in a REAL
// browser, the part of it the Node suite cannot run (src/distribution/explorer/main.js).
// The rich fixture of tests/standard/_fixture.js is built with the real command line and
// served from 127.0.0.1 with the Content-Security-Policy of its own `_headers`; a headless
// Chromium opens `/clusters/` and checks:
//   * the explorer appears, draws every published item and every link of the graph, and
//     loads nothing from another origin, with no console error and no CSP violation;
//   * keyboard use alone: Tab reaches the list, the arrow keys, Home and End move, the
//     tooltip follows the focus and describes the focused entry, Enter selects and fills
//     the detail panel, Escape closes the tooltip, then clears the selection;
//   * the tooltip's place: after a second's rest on a node it opens inside the picture,
//     never over its own node, and over no more nodes than the plain place to the right;
//     the pointer can move onto it, and it closes after the pointer leaves;
//   * accessibility: axe-core finds no violation on the ready page, in the light and the
//     dark colour scheme;
//   * the relation filter of the overview table with script turned off: a small node whose
//     clusters are linked by two relations, each radio button showing its rows alone.
//
// Runs only with AGSC_BROWSER=1, CHROME_EXE naming a Chromium or chrome-headless-shell
// binary, and `playwright-core` and `axe-core` resolvable (NODE_PATH may point at an
// install outside the repository); otherwise it is skipped and says which is missing.
// Nothing leaves loopback.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const { richBuild } = require('../standard/_fixture.js');
const { buildNode } = require('./_scratch-node.js');

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
const TYPES = { '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.jsonld': 'application/ld+json' };
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

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

/** One served build and one browser for every test of this file. */
async function session() {
  const { chromium } = require('playwright-core');
  const { out } = richBuild();
  const server = serve(out);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE, headless: true });
  const close = async () => { await browser.close(); server.close(); };
  return { base, browser, close, out };
}

/** `/clusters/` with the explorer ready, every console error and off-origin request recorded. */
async function openExplorer({ base, browser }, options = {}) {
  const context = await browser.newContext({ colorScheme: options.scheme || 'light', viewport: { height: 900, width: 1280 } });
  const page = await context.newPage();
  const errors = [];
  const offOrigin = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => { if (!r.url().startsWith(base)) offOrigin.push(r.url()); });
  await page.goto(`${base}/clusters/`, { waitUntil: 'load' });
  await page.waitForSelector('#explorer[data-state="ready"]', { timeout: 15000 });
  return { context, errors, offOrigin, page };
}

/**
 * The number of items the explorer must draw: the listed items (AGSC-00-05), read from
 * `search.json`, which holds exactly those (AGSC-06-30), not from the graph file the
 * explorer itself reads, which also keeps the retired items (AGSC-11-22).
 */
function expectedCounts(out) {
  return JSON.parse(fs.readFileSync(path.join(out, 'search.json'), 'utf8')).docs.length;
}

/** A scratch node written to a folder: two clusters whose members are linked by `uses` and `requires`. */
function filterNode() {
  const built = buildNode([
    { slug: 'k', type: 'cluster', title: 'Kilo', description: 'The first cluster, whose member links to the other cluster.' },
    { slug: 'l', type: 'cluster', title: 'Lima', description: 'The second cluster, whose member is the target of the links.' },
    { slug: 'a', type: 'concept', kind: 'explainer', title: 'Alpha', clusters: ['k'], uses: ['c'], requires: ['c'] },
    { slug: 'c', type: 'concept', kind: 'explainer', title: 'Charlie', clusters: ['l'] },
  ]);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-filter-node-'));
  for (const [route, bytes] of built.files) {
    fs.mkdirSync(path.dirname(path.join(out, route)), { recursive: true });
    fs.writeFileSync(path.join(out, route), bytes);
  }
  return out;
}

test('the explorer of /clusters/ in a browser', { skip: SKIP || false }, async (t) => {
  const run = await session();
  try {
    await t.test('it draws every published item and nothing leaves the origin', async () => {
      const { context, errors, offOrigin, page } = await openExplorer(run);
      const drawn = await page.evaluate(() => ({
        buttons: document.querySelectorAll('#explorer-items button[data-id]').length,
        circles: document.querySelectorAll('#explorer-picture circle').length,
        hidden: document.getElementById('explorer').hidden,
        links: document.querySelectorAll('#explorer-picture line').length,
        status: document.getElementById('explorer-status').textContent,
      }));
      const count = expectedCounts(run.out);
      assert.strictEqual(drawn.hidden, false);
      assert.strictEqual(drawn.circles, count);
      assert.strictEqual(drawn.buttons, count);
      assert.ok(drawn.links > 0, 'no link is drawn');
      assert.strictEqual(drawn.status, `${count} items and ${drawn.links} links are drawn.`);
      assert.deepStrictEqual(errors, [], 'the page logged errors (a CSP violation is one)');
      assert.deepStrictEqual(offOrigin, [], 'the page requested another origin');
      await context.close();
    });

    await t.test('keyboard alone: reach the list, move, select, and Escape', async () => {
      const { context, errors, page } = await openExplorer(run);
      const focused = () => page.evaluate(() => {
        const el = document.activeElement;
        return el && el.closest('#explorer-items') ? el.getAttribute('data-id') : null;
      });
      let id = null;
      for (let i = 0; i < 80 && id === null; i += 1) {
        await page.keyboard.press('Tab');
        id = await focused();
      }
      const order = await page.evaluate(() => [...document.querySelectorAll('#explorer-items button[data-id]')].map((b) => b.getAttribute('data-id')));
      assert.strictEqual(id, order[0], 'Tab does not reach the first entry of the list');
      const tipFor = () => page.evaluate(() => {
        const tip = document.getElementById('explorer-tip');
        const by = document.querySelector('[aria-describedby="explorer-tip"]');
        return { describes: by ? by.getAttribute('data-id') : null, shown: !tip.hidden, text: tip.textContent };
      });
      assert.deepStrictEqual((await tipFor()).describes, order[0], 'the tooltip does not describe the focused entry');
      await page.keyboard.press('ArrowDown');
      assert.strictEqual(await focused(), order[1]);
      assert.strictEqual((await tipFor()).describes, order[1], 'the tooltip does not follow the focus');
      await page.keyboard.press('End');
      assert.strictEqual(await focused(), order[order.length - 1]);
      await page.keyboard.press('Home');
      assert.strictEqual(await focused(), order[0]);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      const selected = await page.evaluate(() => ({
        circle: document.querySelector('#explorer-picture circle.is-selected').getAttribute('data-id'),
        heading: document.getElementById('explorer-detail-title').textContent,
        pressed: document.querySelector('#explorer-items button[aria-pressed="true"]').getAttribute('data-id'),
      }));
      assert.deepStrictEqual([selected.circle, selected.pressed], [order[1], order[1]]);
      assert.strictEqual(await focused(), order[1], 'selecting moved the focus away from the list');
      assert.strictEqual((await tipFor()).shown, false, 'the tooltip stayed over the selection it repeats');
      // Moving on brings the tooltip back for the next entry, the selection kept.
      await page.keyboard.press('ArrowDown');
      assert.strictEqual((await tipFor()).describes, order[2]);
      await page.keyboard.press('Escape');
      assert.strictEqual((await tipFor()).shown, false, 'Escape did not close the tooltip first');
      assert.ok(await page.evaluate(() => document.querySelector('#explorer-picture circle.is-selected') !== null));
      await page.keyboard.press('Escape');
      assert.ok(await page.evaluate(() => document.querySelector('#explorer-picture circle.is-selected') === null), 'Escape did not clear the selection');
      // The find box narrows the list, and the status line says how many match.
      await page.fill('#explorer-find', 'handoff');
      const found = await page.evaluate(() => ({
        labels: [...document.querySelectorAll('#explorer-items button[data-id]')].map((b) => b.firstChild.textContent),
        status: document.getElementById('explorer-status').textContent,
      }));
      assert.ok(found.labels.length > 0 && found.labels.every((l) => /handoff/iu.test(l)), JSON.stringify(found));
      assert.match(found.status, /^\d+ items? match(es)?\.$/u);
      assert.deepStrictEqual(errors, []);
      await context.close();
    });

    await t.test('the tooltip opens after a rest, inside the picture, clear of its node and of the nodes beside it', async () => {
      const { context, errors, page } = await openExplorer(run);
      await page.locator('#explorer-picture').scrollIntoViewIfNeeded();
      const target = await page.evaluate(() => {
        // The node with the most other nodes within 120 px: the hardest place to put a tooltip.
        const circles = [...document.querySelectorAll('#explorer-picture circle')].map((c) => {
          const r = c.getBoundingClientRect();
          return { id: c.getAttribute('data-id'), r: r.width / 2, x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
        const crowd = (a) => circles.filter((b) => b !== a && Math.hypot(a.x - b.x, a.y - b.y) < 120).length;
        return circles.sort((a, b) => crowd(b) - crowd(a))[0];
      });
      await page.mouse.move(target.x, target.y);
      await page.waitForTimeout(400);
      assert.strictEqual(await page.evaluate(() => document.getElementById('explorer-tip').hidden), true, 'the tooltip opened before the rest');
      await page.waitForSelector('#explorer-tip:not([hidden])', { timeout: 3000 });
      const placed = await page.evaluate((anchor) => {
        const tip = document.getElementById('explorer-tip').getBoundingClientRect();
        const box = document.getElementById('explorer-picture').getBoundingClientRect();
        const others = [...document.querySelectorAll('#explorer-picture circle')].filter((c) => c.getAttribute('data-id') !== anchor.id).map((c) => {
          const r = c.getBoundingClientRect();
          return { r: r.width / 2, x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
        const meets = (rect, c) => {
          const x = Math.max(rect.left, Math.min(c.x, rect.left + rect.width));
          const y = Math.max(rect.top, Math.min(c.y, rect.top + rect.height));
          return Math.hypot(c.x - x, c.y - y) < c.r;
        };
        const right = { height: tip.height, left: Math.min(anchor.x + anchor.r + 8, box.right - tip.width), top: anchor.y - tip.height / 2, width: tip.width };
        return {
          coveredByRight: others.filter((c) => meets(right, c)).length,
          coveredHere: others.filter((c) => meets(tip, c)).length,
          inside: tip.left >= box.left - 1 && tip.right <= box.right + 1 && tip.top >= box.top - 1 && tip.bottom <= box.bottom + 1,
          overOwn: meets(tip, anchor),
          text: document.getElementById('explorer-tip').textContent,
        };
      }, target);
      assert.ok(placed.inside, 'the tooltip leaves the picture');
      assert.strictEqual(placed.overOwn, false, 'the tooltip covers its own node');
      assert.ok(placed.coveredHere <= placed.coveredByRight, `covers ${placed.coveredHere}, the plain place ${placed.coveredByRight}`);
      assert.match(placed.text, /Open the page|Concept|Cluster|Lesson|Gate|Episode|Procedure/u);
      // The pointer moves onto the tooltip and it stays; it leaves and the tooltip closes.
      const tip = await page.evaluate(() => {
        const r = document.getElementById('explorer-tip').getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      await page.mouse.move(tip.x, tip.y, { steps: 4 });
      await page.waitForTimeout(700);
      assert.strictEqual(await page.evaluate(() => document.getElementById('explorer-tip').hidden), false, 'the tooltip closed under the pointer');
      await page.mouse.move(2, 2, { steps: 4 });
      await page.waitForSelector('#explorer-tip[hidden]', { state: 'attached', timeout: 3000 });
      assert.deepStrictEqual(errors, []);
      await context.close();
    });

    await t.test('axe-core finds no violation on the ready page, in both colour schemes', async () => {
      const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
      for (const scheme of ['light', 'dark']) {
        const { context, page } = await openExplorer(run, { scheme });
        // Select an item so the detail panel and the faded picture are checked too.
        await page.click('#explorer-items button[data-id]');
        await page.evaluate(axe);
        const result = await page.evaluate((tags) => window.axe.run(document, { runOnly: { type: 'tag', values: tags } }), AXE_TAGS);
        const violations = result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
        assert.deepStrictEqual(violations, [], `${scheme}: ${violations.join('; ')}`);
        const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        assert.strictEqual(background, scheme === 'dark' ? 'rgb(15, 17, 21)' : 'rgb(251, 251, 250)', 'the scheme did not apply');
        await context.close();
      }
    });

    await t.test('with script turned off, each radio button of the relation filter shows its rows alone', async () => {
      const out = filterNode();
      const server = serve(out);
      try {
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const context = await run.browser.newContext({ javaScriptEnabled: false });
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${server.address().port}/clusters/`, { waitUntil: 'load' });
        const shown = () => page.evaluate(() => [...document.querySelectorAll('tr[data-relation]')]
          .filter((row) => getComputedStyle(row).display !== 'none').map((row) => row.getAttribute('data-relation')));
        assert.deepStrictEqual(await shown(), ['uses', 'requires'], 'every row is shown at first');
        for (const key of ['uses', 'requires']) {
          await page.check(`#relation-filter-${key}`);
          assert.deepStrictEqual(await shown(), [key], `the filter ${key}`);
        }
        await page.check('#relation-filter-all');
        assert.deepStrictEqual(await shown(), ['uses', 'requires'], 'every relation again');
        await context.close();
      } finally {
        server.close();
        fs.rmSync(out, { force: true, recursive: true });
      }
    });
  } finally {
    await run.close();
  }
});
