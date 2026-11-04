'use strict';
/* global document, window, getComputedStyle */
// verifies AGSC-06-39, AGSC-06-17, AGSC-06-05, AGSC-06-20
// tests/distribution/query-browser.test.js — the `/query/` page in a REAL browser, the part
// the Node suite cannot run (src/distribution/query/main.js, the worker, the engine's
// WebAssembly). The rich fixture of tests/standard/_fixture.js is built with the real
// command line and served from 127.0.0.1 the way the reference host serves it: each request
// gets every matching `_headers` block, a detach line removing what a block before it set
// (`hosts/local.js#respond`, the semantics of `agsc-host serve`), so `/query/` and its files
// carry the one policy of their own block. A headless Chromium opens `/query/` and checks:
//   * the engine starts under that policy and loads `/graph.nq`, with no console error and
//     no CSP violation, and nothing is requested from another origin;
//   * SELECT, ASK, CONSTRUCT and DESCRIBE answer; a table is shown, and a picture for a
//     graph result; an update and a SERVICE clause are refused before anything runs;
//   * the CSV and JSON downloads are the page's own links and hold the W3C formats;
//   * the share link holds the query in its fragment; opening it fills the editor and runs
//     nothing; no request carries the query text; nothing is stored;
//   * Stop ends a long query and the page is ready again;
//   * axe-core finds no violation in the light and the dark colour scheme.
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
const { createHash } = require('node:crypto');

const { richBuild } = require('../standard/_fixture.js');
const rules = require('../../src/distribution/hosts/rules.js');
const local = require('../../src/distribution/hosts/local.js');

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
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/** The built node served on loopback as `agsc-host serve` serves it: every header set of `_headers`, applied the host's way. */
function serve(out) {
  const sets = rules.parseHeaders(fs.readFileSync(path.join(out, '_headers'), 'utf8')).sets;
  const redirects = rules.parseRedirects(fs.readFileSync(path.join(out, '_redirects'), 'utf8')).rules;
  const at = (rel) => path.join(out, ...rel.split('/'));
  const site = {
    hosts: ['127.0.0.1'],
    isDirectory: (rel) => fs.existsSync(at(rel)) && fs.statSync(at(rel)).isDirectory(),
    isFile: (rel) => fs.existsSync(at(rel)) && fs.statSync(at(rel)).isFile(),
    redirects,
    sets,
    sha256: (rel) => createHash('sha256').update(fs.readFileSync(at(rel))).digest('hex'),
  };
  return http.createServer((req, res) => {
    const answer = local.respond({ host: req.headers.host, method: req.method, path: req.url.split('?')[0] }, site);
    res.writeHead(answer.status, Object.fromEntries(answer.headers));
    res.end(answer.file === null ? '' : fs.readFileSync(at(answer.file)));
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

/** `/query/` (or a share link) with the engine ready; every console error and request recorded. */
async function openQuery({ base, browser }, options = {}) {
  const context = await browser.newContext({ acceptDownloads: true, colorScheme: options.scheme || 'light', viewport: { height: 900, width: 1280 } });
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(String(e)));
  context.on('request', (r) => requests.push(r.url()));
  await page.goto(`${base}/query/${options.hash || ''}`, { waitUntil: 'load' });
  await page.waitForSelector('#query[data-state="ready"]', { timeout: 20000 });
  return { context, errors, page, requests };
}

/** Put a query into the editor, run it and wait for the answer. */
async function runQuery(page, text) {
  await page.fill('#query-text', text);
  await page.evaluate(() => document.getElementById('query').removeAttribute('data-result'));
  await page.click('#query-run');
  await page.waitForSelector('#query[data-result]', { timeout: 20000 });
  return page.evaluate(() => ({
    caption: document.querySelector('#query-table caption') ? document.querySelector('#query-table caption').textContent : null,
    circles: document.querySelectorAll('#query-picture circle').length,
    csvHidden: document.getElementById('query-csv').hidden,
    csvNone: !document.getElementById('query-csv-none').hidden,
    pictureHidden: document.getElementById('query-picture').hidden,
    result: document.getElementById('query').getAttribute('data-result'),
    resultHidden: document.getElementById('query-result').hidden,
    rows: document.querySelectorAll('#query-table tbody tr').length,
    status: document.getElementById('query-status').textContent,
    text: document.getElementById('query-table').textContent,
  }));
}

/** The file a download link gives, as text. */
async function download(page, selector) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
  return { name: file.suggestedFilename(), text: fs.readFileSync(await file.path(), 'utf8') };
}

const PREFIX = 'PREFIX skos: <http://www.w3.org/2004/02/skos/core#>\nPREFIX dcterms: <http://purl.org/dc/terms/>\n';

test('the /query/ page in a browser', { skip: SKIP || false }, async (t) => {
  const run = await session();
  try {
    await t.test('the engine starts under the page\'s own policy and loads the node\'s graph, asking nothing of another origin', async () => {
      const { context, errors, page, requests } = await openQuery(run);
      const quads = fs.readFileSync(path.join(run.out, 'graph.nq'), 'utf8').split('\n').filter((line) => line.trim() !== '').length;
      assert.match(await page.textContent('#query-status'), new RegExp(`^The graph is loaded: ${quads} statements\\.`, 'u'));
      assert.strictEqual(await page.isHidden('#query-noscript'), true);
      assert.deepStrictEqual(errors, [], 'a console error or warning (a CSP violation is one)');
      assert.deepStrictEqual(requests.filter((url) => !url.startsWith(run.base)), []);
      for (const file of ['/query/agsc-query-worker.js', '/query/vendor/oxigraph-0.5.13/web.js', '/query/vendor/oxigraph-0.5.13/web_bg.wasm', '/graph.nq']) {
        assert.ok(requests.includes(`${run.base}${file}`), `${file} was not loaded`);
      }
      await context.close();
    });

    await t.test('SELECT, ASK, CONSTRUCT and DESCRIBE answer; a graph result is also drawn', async () => {
      const { context, errors, page } = await openQuery(run);
      const select = await runQuery(page, `${PREFIX}SELECT ?item ?name WHERE { ?item skos:prefLabel ?name } ORDER BY ?item`);
      assert.strictEqual(select.result, 'answered');
      assert.ok(select.rows > 3, `${select.rows} rows`);
      assert.match(select.status, /^SELECT answered with \d+ rows\.$/u);
      assert.strictEqual(select.pictureHidden, true, 'two columns are not drawn');
      const ask = await runQuery(page, `${PREFIX}ASK { ?a dcterms:requires ?b }`);
      assert.strictEqual(ask.text, 'The answer is yes (true).');
      assert.strictEqual(ask.csvHidden, true);
      assert.strictEqual(ask.csvNone, true);
      const construct = await runQuery(page, `${PREFIX}CONSTRUCT { ?a dcterms:requires ?b } WHERE { ?a dcterms:requires ?b }`);
      assert.match(construct.status, /^CONSTRUCT answered with \d+ triples?\.$/u);
      assert.strictEqual(construct.pictureHidden, false);
      assert.ok(construct.circles >= 2, `${construct.circles} nodes drawn`);
      assert.strictEqual(await page.locator('#query-picture line.rel-requires').count() > 0, true, 'a requires link is classed by its key');
      const item = await page.evaluate(() => document.querySelector('#query-table td').textContent);
      const describe = await runQuery(page, `DESCRIBE ${item}`);
      assert.match(describe.status, /^DESCRIBE answered with \d+ triples?\.$/u);
      assert.match(describe.text, /\?subject\?predicate\?object/u);
      assert.deepStrictEqual(errors, []);
      await context.close();
    });

    await t.test('an update and a SERVICE clause are refused before anything runs', async () => {
      const { context, page } = await openQuery(run);
      const update = await runQuery(page, 'INSERT DATA { <https://x.example/a> <https://x.example/b> "c" }');
      assert.strictEqual(update.result, 'refused');
      assert.strictEqual(update.status, 'This page does not change the graph: INSERT is an update, and an update is refused.');
      assert.strictEqual(update.resultHidden, true);
      const service = await runQuery(page, 'SELECT * WHERE { SERVICE SILENT <https://example.org/sparql> { ?s ?p ?o } }');
      assert.strictEqual(service.status, 'This page sends no query to another server: a SERVICE clause is refused.');
      assert.strictEqual(await page.getAttribute('#query', 'data-state'), 'ready', 'the worker was never asked');
      await context.close();
    });

    await t.test('the CSV and JSON downloads are the page\'s own links and hold the W3C formats', async () => {
      const { context, page } = await openQuery(run);
      await runQuery(page, `${PREFIX}SELECT ?item ?name WHERE { ?item skos:prefLabel ?name } ORDER BY ?item LIMIT 3`);
      assert.match(await page.getAttribute('#query-csv', 'href'), /^blob:http:\/\/127\.0\.0\.1:\d+\//u);
      const csv = await download(page, '#query-csv');
      assert.strictEqual(csv.name, 'query-result.csv');
      const lines = csv.text.split('\r\n');
      assert.strictEqual(lines[0], 'item,name');
      assert.strictEqual(lines.length, 5, 'three rows, the header and the final line end');
      const json = await download(page, '#query-json');
      assert.strictEqual(json.name, 'query-result.json');
      const parsed = JSON.parse(json.text);
      assert.deepStrictEqual(parsed.head.vars, ['item', 'name']);
      assert.strictEqual(parsed.results.bindings.length, 3);
      assert.strictEqual(parsed.results.bindings[0].item.type, 'uri');
      assert.strictEqual(lines[1].split(',')[0], parsed.results.bindings[0].item.value);
      await runQuery(page, 'ASK { ?s ?p ?o }');
      assert.deepStrictEqual(JSON.parse((await download(page, '#query-json')).text), { boolean: true, head: {} });
      await context.close();
    });

    await t.test('the share link holds the query in its fragment; opening it fills the editor and runs nothing', async () => {
      const text = `${PREFIX}SELECT ?item WHERE { ?item skos:prefLabel "secret words # & ?" } # a note`;
      const first = await openQuery(run);
      await first.page.fill('#query-text', text);
      const href = await first.page.getAttribute('#query-share', 'href');
      assert.ok(href.startsWith('#query='), href);
      await first.context.close();
      const opened = await openQuery(run, { hash: href });
      assert.strictEqual(await opened.page.inputValue('#query-text'), text);
      assert.strictEqual(await opened.page.getAttribute('#query', 'data-result'), null, 'the query of a link is not run');
      assert.match(await opened.page.textContent('#query-status'), /The query of the link is in the editor\. Select Run to run it\.$/u);
      await opened.page.click('#query-run');
      await opened.page.waitForSelector('#query[data-result="answered"]');
      assert.ok(opened.requests.every((url) => !url.includes('secret') && !url.includes('query=')), 'a request carried the query');
      const stored = await opened.page.evaluate(() => ({ cookie: document.cookie, local: localStorage.length, session: sessionStorage.length }));
      assert.deepStrictEqual(stored, { cookie: '', local: 0, session: 0 }, 'the page stored something');
      assert.deepStrictEqual(opened.errors, []);
      await opened.context.close();
    });

    await t.test('an example fills the editor; Ctrl+Enter runs it; Stop ends a long query and the page is ready again', async () => {
      const { context, errors, page } = await openQuery(run);
      await page.click('button[data-example="example-1-query"]');
      assert.strictEqual(await page.inputValue('#query-text'), await page.textContent('#example-1-query'));
      assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'query-text');
      await page.fill('#query-text', 'SELECT (COUNT(*) AS ?n) WHERE { ?a ?b ?c . ?d ?e ?f . ?g ?h ?i . ?j ?k ?l }');
      await page.focus('#query-text');
      await page.keyboard.press('Control+Enter');
      await page.waitForSelector('#query[data-state="running"]');
      await page.click('#query-stop');
      assert.match(await page.textContent('#query-status'), /^The query was stopped\./u);
      await page.waitForSelector('#query[data-state="ready"]', { timeout: 20000 });
      assert.strictEqual(await page.getAttribute('#query', 'data-result'), null, 'a stopped query shows no result');
      assert.deepStrictEqual(errors, []);
      await context.close();
    });

    await t.test('axe-core finds no violation on the page with a result, in both colour schemes', async () => {
      const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
      for (const scheme of ['light', 'dark']) {
        const { context, page } = await openQuery(run, { scheme });
        await runQuery(page, `${PREFIX}CONSTRUCT { ?a dcterms:requires ?b } WHERE { ?a dcterms:requires ?b }`);
        await page.evaluate(axe);
        const result = await page.evaluate((tags) => window.axe.run(document, { runOnly: { type: 'tag', values: tags } }), AXE_TAGS);
        const violations = result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
        assert.deepStrictEqual(violations, [], `${scheme}: ${violations.join('; ')}`);
        const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        assert.strictEqual(background, scheme === 'dark' ? 'rgb(15, 17, 21)' : 'rgb(251, 251, 250)', 'the scheme did not apply');
        await context.close();
      }
    });
  } finally {
    await run.close();
  }
});
