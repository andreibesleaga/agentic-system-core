'use strict';
/**
 * bench/a11y.js — accessibility counts per page type (research/39 Layer E), and
 * the HTML-only page-weight sweep against AGSC-06-21's ≤ 100 KB budget.
 *
 * Two halves. The PURE half — which template a route belongs to, the tally of
 * axe results per template, the page-weight sweep over `*.html` — is tested. The
 * BROWSER half runs axe-core in a headless Chromium through `playwright-core`;
 * neither is a dependency of this package (they are installed with
 * `npm i --no-save` in a scratch directory and reached through `NODE_PATH`), so
 * that half is outside the coverage set, exactly as the sites' own browser lane
 * (`scripts/a11y.js` of the site repository) is outside their zero-dependency gate.
 *
 * What a count here is worth. axe-core finds a subset of WCAG failures
 * automatically; a page with zero violations has passed that subset and nothing
 * more. Every published number carries that limit beside it.
 *
 * Deterministic in its inputs: the pages are served from disk by a local server
 * bound to 127.0.0.1 on an ephemeral port; no external request is allowed through
 * (any request to another origin is counted and reported).
 */

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

/** The WCAG tags the sites' own lane runs, so the two numbers mean the same thing. */
const AXE_TAGS = Object.freeze(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']);

/** AGSC-06-21: "≤100 KB per HTML page", KB the decimal prefix (1,000 bytes). */
const PAGE_BUDGET_BYTES = 100000;

/**
 * The template a route is rendered from. `/` is the home page; `/<section>/` an
 * index; `/<section>/page-<n>/` a paginated index; `/<section>/<slug>/` an item or
 * term page of that section; anything deeper keeps its first two segments.
 * @param {string} route a site-absolute route ending in `/`
 * @returns {string}
 */
function pageType(route) {
  const parts = String(route).split('/').filter((p) => p !== '');
  if (parts.length === 0) return 'home';
  if (parts.length === 1) return `${parts[0]} index`;
  if (/^page-\d+$/u.test(parts[1])) return `${parts[0]} index, paginated`;
  if (parts.length === 2) return `${parts[0]} page`;
  return `${parts[0]}/${parts[1]} subpage`;
}

/** Every `index.html` under `www` as its route, in code-point order. */
function routesOf(www) {
  return fs.readdirSync(www, { recursive: true })
    .map((rel) => String(rel).split(path.sep).join('/'))
    .filter((rel) => rel === 'index.html' || rel.endsWith('/index.html'))
    .map((rel) => `/${rel.slice(0, -'index.html'.length)}`)
    .sort();
}

/**
 * Group per-page axe results by template.
 * @param {Array<{route:string, scheme:string, violations:Array<{id:string, impact:string, nodes:number}>}>} results
 * @returns {Record<string, {pages:number, checks:number, violations:number, nodes:number, rules:string[]}>}
 */
function tallyByType(results) {
  const out = Object.create(null);
  for (const r of results) {
    const type = pageType(r.route);
    const row = out[type] || { checks: 0, nodes: 0, pages: 0, rules: [], violations: 0 };
    out[type] = row;
    row.checks += 1;
    if (r.scheme === 'light') row.pages += 1;
    row.violations += r.violations.length;
    for (const v of r.violations) {
      row.nodes += v.nodes;
      if (!row.rules.includes(v.id)) row.rules.push(v.id);
    }
    row.rules.sort();
  }
  return Object.keys(out).sort().reduce((acc, k) => { acc[k] = out[k]; return acc; }, Object.create(null));
}

/**
 * The HTML-only page-weight sweep: every `*.html` file under `www`, its size, and
 * the ones above the budget. Other files (index shards, chunk shards,
 * `llms-full.txt`) are not pages and are not in this sweep.
 * @param {string} www
 * @returns {{budget_bytes:number, largest:{bytes:number, path:string}|null, median_bytes:number|null, over_budget:Array<{bytes:number, path:string}>, pages:number, total_bytes:number}}
 */
function pageWeights(www) {
  const sizes = fs.readdirSync(www, { recursive: true })
    .map((rel) => String(rel).split(path.sep).join('/'))
    .filter((rel) => rel.endsWith('.html'))
    .map((rel) => ({ bytes: fs.statSync(path.join(www, rel)).size, path: rel }))
    .sort((a, b) => b.bytes - a.bytes || (a.path < b.path ? -1 : 1));
  const ordered = sizes.map((s) => s.bytes).sort((a, b) => a - b);
  const mid = Math.floor(ordered.length / 2);
  let median = null;
  if (ordered.length > 0) median = ordered.length % 2 === 1 ? ordered[mid] : (ordered[mid - 1] + ordered[mid]) / 2;
  return {
    budget_bytes: PAGE_BUDGET_BYTES,
    largest: sizes[0] || null,
    median_bytes: median,
    over_budget: sizes.filter((s) => s.bytes > PAGE_BUDGET_BYTES),
    pages: sizes.length,
    total_bytes: sizes.reduce((acc, s) => acc + s.bytes, 0),
  };
}

/* c8 ignore start */
/* node:coverage disable */
/**
 * Run axe-core over every page of `www` in both colour schemes. Needs
 * `playwright-core` and `axe-core` resolvable (NODE_PATH) and a Chromium binary.
 * @param {{www:string, chrome:string}} options
 * @returns {Promise<{axe_version:string, pages:number, results:Array<object>, third_party:number}>}
 */
async function runBrowser(options) {
  const { chromium } = require('playwright-core');
  const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  const axeVersion = require('axe-core/package.json').version;
  const www = options.www;
  const routes = routesOf(www);
  const TYPES = { '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/__axe.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(axeSource); return; }
    const file = path.join(www, u.endsWith('/') ? `${u}index.html` : u);
    if (!file.startsWith(www) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: options.chrome, headless: true });
  const results = [];
  let thirdParty = 0;
  try {
    for (const scheme of ['light', 'dark']) {
      const context = await browser.newContext({ colorScheme: scheme, viewport: { height: 900, width: 1200 } });
      await context.route('**/*', (route) => {
        if (route.request().url().startsWith(base)) return route.continue();
        thirdParty += 1;
        return route.abort();
      });
      for (const route of routes) {
        const page = await context.newPage();
        await page.goto(base + route, { waitUntil: 'load' });
        await page.addScriptTag({ url: `${base}/__axe.js` });
        const run = await page.evaluate((tags) => globalThis.axe.run(document, { runOnly: { type: 'tag', values: tags } }), AXE_TAGS);
        results.push({
          route, scheme,
          violations: run.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
        });
        await page.close();
      }
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  return { axe_version: axeVersion, pages: routes.length, results, third_party: thirdParty };
}
/* node:coverage enable */
/* c8 ignore stop */

module.exports = { AXE_TAGS, PAGE_BUDGET_BYTES, pageType, pageWeights, routesOf, runBrowser, tallyByType };
