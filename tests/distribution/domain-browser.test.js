'use strict';
/* global document, window, getComputedStyle */
// verifies AGSC-06-38, AGSC-06-20, AGSC-06-17
// tests/distribution/domain-browser.test.js — the domain parts of an item page in a REAL
// browser (src/distribution/domain-view.js): a node that uses the domain layer, with a site
// vocabulary, a declared context and items that state a domain type, a role and a warrant, is
// built and served from 127.0.0.1 with the Content-Security-Policy of its own `_headers`; a
// headless Chromium opens the item page and checks that the relations table shows the two
// domain columns and the definition list stands under it, that nothing loads from another
// origin and no console error is logged, and that axe-core finds no violation in the light and
// the dark colour scheme (the tags of `bench/a11y.js`).
//
// Runs only with AGSC_BROWSER=1, CHROME_EXE naming a Chromium or chrome-headless-shell
// binary, and `playwright-core` and `axe-core` resolvable (NODE_PATH may point at an install
// outside the repository); otherwise it is skipped and says which is missing. Nothing leaves
// loopback.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

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
const TYPES = { '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json' };
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const NS = 'https://minimal.example/ns/propulsion#';

/** A node that uses the domain layer, written to a folder: the vocabulary, one context, three items. */
function domainNode() {
  const vocabulary = ['@prefix asc: <https://w3id.org/agentic-system-core/ns#> .', '@prefix owl: <http://www.w3.org/2002/07/owl#> .',
    '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .', '',
    '<https://minimal.example/ns/domain> a owl:Ontology ; rdfs:label "Propulsion domain" .', 'asc:Concept a owl:Class .',
    `<${NS}engine> a owl:Class ; rdfs:subClassOf asc:Concept ; rdfs:label "Aircraft engine" .`,
    `<${NS}pump> a owl:Class ; rdfs:subClassOf asc:Concept ; rdfs:label "Fuel pump" .`, ''].join('\n');
  const built = buildNode([
    { slug: 'propulsion', type: 'cluster', title: 'Propulsion', description: 'What moves the aircraft, and the parts that feed it.' },
    { slug: 'engine', type: 'concept', kind: 'explainer', title: 'Engine', clusters: ['propulsion'], requires: ['fuel-pump'],
      domain_type: 'engine', domain_role: 'aggregate-root', warrant: { source: 'https://example.org/standards/engine-handbook', type: 'literary' } },
    { slug: 'fuel-pump', type: 'concept', kind: 'explainer', title: 'Fuel pump', clusters: ['propulsion'], domain_type: 'pump', domain_role: 'entity' },
  ], { contexts: [{ cluster: 'propulsion', namespace: NS }], vocabulary });
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-domain-node-'));
  for (const [route, bytes] of built.files) {
    fs.mkdirSync(path.dirname(path.join(out, route)), { recursive: true });
    fs.writeFileSync(path.join(out, route), bytes);
  }
  return out;
}

/** The built node served on loopback with its own CSP. */
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

test('the domain parts of an item page in a browser', { skip: SKIP || false }, async (t) => {
  const { chromium } = require('playwright-core');
  const out = domainNode();
  const server = serve(out);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE, headless: true });
  const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  try {
    for (const scheme of ['light', 'dark']) {
      await t.test(`the columns and the list are shown, nothing leaves the origin, and axe-core finds no violation (${scheme})`, async () => {
        const context = await browser.newContext({ colorScheme: scheme, viewport: { height: 900, width: 1280 } });
        const page = await context.newPage();
        const errors = [];
        const offOrigin = [];
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('request', (r) => { if (!r.url().startsWith(base)) offOrigin.push(r.url()); });
        await page.goto(`${base}/concepts/engine/`, { waitUntil: 'load' });
        const shown = await page.evaluate(() => ({
          headings: [...document.querySelectorAll('table.relations th')].map((th) => th.textContent),
          list: [...document.querySelectorAll('dl.domain dt')].map((dt) => `${dt.textContent}: ${dt.nextElementSibling.textContent}`),
          row: [...document.querySelectorAll('table.relations tbody td')].map((td) => td.textContent),
          under: Boolean(document.querySelector('table.relations').closest('.table-wrap').nextElementSibling.matches('dl.domain')),
        }));
        assert.deepStrictEqual(shown.headings, ['Relation', 'Direction', 'Item', 'Meaning', 'Domain type', 'Domain context']);
        assert.deepStrictEqual(shown.row.slice(-2), ['Fuel pump', 'Propulsion']);
        assert.deepStrictEqual(shown.list, ['Domain type: Aircraft engine', 'Domain role: aggregate root', 'Domain context: Propulsion',
          'Warrant: literary: https://example.org/standards/engine-handbook']);
        assert.ok(shown.under, 'the definition list is not right under the relations table');
        await page.evaluate(axe);
        const result = await page.evaluate((tags) => window.axe.run(document, { runOnly: { type: 'tag', values: tags } }), AXE_TAGS);
        const violations = result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
        assert.deepStrictEqual(violations, [], `${scheme}: ${violations.join('; ')}`);
        const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        assert.strictEqual(background, scheme === 'dark' ? 'rgb(15, 17, 21)' : 'rgb(251, 251, 250)', 'the scheme did not apply');
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
