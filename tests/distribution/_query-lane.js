'use strict';
/* global document, window */
// tests/distribution/_query-lane.js — what the browser tests of `/query/` share
// (tests/distribution/query-browser.test.js over the rich fixture, tests/e2e/query-sites.test.js
// over the demonstration node, the main site's Bundle and the Patterns node):
//   * whether the browser lane can run here, and why not;
//   * a built node served on 127.0.0.1 the way the reference host serves it: each request gets
//     every matching `_headers` block, a detach line removing what a block before it set
//     (`hosts/local.js#respond`), so `/query/` and its files carry the one policy of their block;
//   * `/query/` opened with the engine ready, every console error and request recorded;
//   * each of the ten examples run from the keyboard alone (focus its button, Enter, then
//     Ctrl+Enter in the editor) and its JSON file read back, beside what the question's own
//     function answers for the values the example names (src/knowledge/questions.js);
//   * axe-core over the page with the tags of bench/a11y.js, so the count means what the
//     accessibility measurement means.
// Nothing leaves loopback.

const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createHash } = require('node:crypto');

const rules = require('../../src/distribution/hosts/rules.js');
const local = require('../../src/distribution/hosts/local.js');
const site = require('../../src/distribution/site.js');
const examples = require('../../src/distribution/query-examples.js');
const questions = require('../../src/knowledge/questions.js');
const validate = require('../../src/knowledge/validate.js');
const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { loadBundle } = require('../../src/application/bundle.js');
const { AXE_TAGS } = require('../../bench/a11y.js');
const { rowsOf, toAnswer } = require('../knowledge/_question-answers.js');

const ROOT = path.resolve(__dirname, '..', '..');
const DOC = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'ontology-questions.json'), 'utf8'));

/** Why the browser lane cannot run here, or null. */
function browserSkipReason() {
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

/** The built node served on loopback as `agsc-host serve` serves it: every header set of `_headers`, applied the host's way. */
function serve(out) {
  const sets = rules.parseHeaders(fs.readFileSync(path.join(out, '_headers'), 'utf8')).sets;
  const redirects = rules.parseRedirects(fs.readFileSync(path.join(out, '_redirects'), 'utf8')).rules;
  const at = (rel) => path.join(out, ...rel.split('/'));
  const served = {
    hosts: ['127.0.0.1'],
    isDirectory: (rel) => fs.existsSync(at(rel)) && fs.statSync(at(rel)).isDirectory(),
    isFile: (rel) => fs.existsSync(at(rel)) && fs.statSync(at(rel)).isFile(),
    redirects,
    sets,
    sha256: (rel) => createHash('sha256').update(fs.readFileSync(at(rel))).digest('hex'),
  };
  return http.createServer((req, res) => {
    const answer = local.respond({ host: req.headers.host, method: req.method, path: req.url.split('?')[0] }, served);
    res.writeHead(answer.status, Object.fromEntries(answer.headers));
    res.end(answer.file === null ? '' : fs.readFileSync(at(answer.file)));
  });
}

/** One served build and one browser; `close` ends both. */
async function session(out) {
  const { chromium } = require('playwright-core');
  const server = serve(out);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE, headless: true });
  const close = async () => { await browser.close(); server.close(); };
  return { base, browser, close, out };
}

/**
 * `/query/` (or a share link) with the engine ready; every console error and request recorded; `ms` the time to ready.
 * `options.width` is the viewport width (1280 by default; 390 is the phone width of the sites' a11y lanes).
 */
async function openQuery({ base, browser }, options = {}) {
  const context = await browser.newContext({
    acceptDownloads: true, colorScheme: options.scheme || 'light', reducedMotion: options.reducedMotion || 'no-preference',
    viewport: { height: 900, width: options.width || 1280 },
  });
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(String(e)));
  context.on('request', (r) => requests.push(r.url()));
  const started = Date.now();
  await page.goto(`${base}/query/${options.hash || ''}`, { waitUntil: 'load' });
  await page.waitForSelector('#query[data-state="ready"]', { timeout: 30000 });
  return { context, errors, ms: Date.now() - started, page, requests };
}

/** The file a download link gives, as text. */
async function download(page, selector) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
  return { name: file.suggestedFilename(), text: fs.readFileSync(await file.path(), 'utf8') };
}

/** The items of the published projection of the Bundle at `dir`, as `/graph.nq` holds them (AGSC-06-30). */
function publishedItems(dir) {
  const bundle = loadBundle(createFileSystem(dir), { schemas: validate.schemas(readSchemas(ROOT)) });
  return site.pageItemsOf(bundle.items, bundle.config.releases);
}

/**
 * Run each of the ten examples from the keyboard alone and read its JSON file back. Returns,
 * for each, the page's query text, the values the examples choose for these items and the
 * build's instant (read from example 9), the rows mapped to the question's answer shape, and
 * the answer of the question's function for the same values.
 */
async function runTenExamples(page, items) {
  const text = (n) => page.textContent(`#example-${n}-query`);
  const instant = /"([^"]+)"\^\^xsd:dateTime/u.exec(await text(9));
  const values = examples.exampleValues(items, instant === null ? null : instant[1]);
  const runs = [];
  for (const q of DOC.questions) {
    await page.focus(`button[data-example="example-${q.number}-query"]`);
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'query-text', `example ${q.number}: the editor has the focus`);
    await page.evaluate(() => document.getElementById('query').removeAttribute('data-result'));
    await page.keyboard.press('Control+Enter');
    await page.waitForSelector('#query[data-result]', { timeout: 30000 });
    assert.strictEqual(await page.getAttribute('#query', 'data-result'), 'answered', `example ${q.number}: ${await page.textContent('#query-status')}`);
    const json = (await download(page, '#query-json')).text;
    runs.push({
      editor: await page.inputValue('#query-text'),
      expected: questions.answer(q.number, items, values[q.number - 1]),
      got: toAnswer(q.number, rowsOf(json), items),
      number: q.number,
      shown: await text(q.number),
      values: values[q.number - 1],
    });
  }
  return runs;
}

/** axe-core's violations on the page as it is, with the tags of bench/a11y.js. */
async function axeViolations(page) {
  await page.evaluate(fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'));
  const result = await page.evaluate((tags) => window.axe.run(document, { runOnly: { type: 'tag', values: tags } }), AXE_TAGS);
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

module.exports = { axeViolations, browserSkipReason, download, openQuery, publishedItems, runTenExamples, serve, session };
