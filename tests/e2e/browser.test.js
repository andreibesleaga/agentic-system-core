'use strict';
// verifies AGSC-09-16, AGSC-11-18
// BROWSER END TO END — an optional lane like the accessibility lane. The rich
// fixture of tests/standard/_fixture.js is built with the real command line and
// served from 127.0.0.1 with the Content-Security-Policy of its own `_headers`.
// A real headless Chromium then opens pages:
//   * with a stubbed `document.modelContext` injected before load, every one of
//     the seven page tools registers and answers a call with the AGSC-08-18
//     envelope (`trust: "untrusted"`), no call an error;
//   * with no stub, the page registers nothing and logs no console error and no
//     uncaught exception, and no page requests anything off the local origin.
//
// Runs only with AGSC_BROWSER=1 and CHROME_EXE naming a Chromium or
// chrome-headless-shell binary, and `playwright-core` resolvable (NODE_PATH may
// point at an install outside the repository, which never carries it); otherwise
// it is skipped and says which of the three is missing. Nothing leaves loopback.

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

const CALLS = [
  ['search', { query: 'handoff' }], ['read', { slug: 'handoff' }], ['links', { slug: 'handoff' }],
  ['compose', { selection: ['handoff'] }], ['propose', { slug: 'handoff' }], ['ask', { question: 'handoff' }],
  ['remember', { body: 'Noted from a page.', kind: 'lesson', severity: 'info', title: 'A lesson from the page' }],
];

const SKIP = skipReason();

test('the page tools answer through document.modelContext, and a page without it stays silent', { skip: SKIP || false }, async () => {
  const { chromium } = require('playwright-core');
  const { out } = richBuild();
  const csp = /Content-Security-Policy: (.*)/u.exec(fs.readFileSync(path.join(out, '_headers'), 'utf8'))[1];
  const server = http.createServer((req, res) => {
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
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE, headless: true });
  try {
    // AGSC-06-01: /compose/ and every item page load the page tools; the home page does not.
    for (const route of ['/compose/', '/concepts/handoff/', '/lessons/record-why-a-handoff-happened/', '/']) {
      const hasTools = route !== '/';
      // With the stub.
      const withStub = await browser.newContext();
      await withStub.addInitScript(() => {
        window.__tools = [];
        Object.defineProperty(document, 'modelContext', {
          configurable: true,
          value: { registerTool(tool) { window.__tools.push(tool); } },
        });
      });
      const page = await withStub.newPage();
      const offOrigin = [];
      page.on('request', (r) => { if (!r.url().startsWith(base)) offOrigin.push(r.url()); });
      await page.goto(`${base}${route}`, { waitUntil: 'load' });
      if (!hasTools) {
        await page.waitForTimeout(200);
        assert.strictEqual(await page.evaluate(() => window.__tools.length), 0, `${route} registered tools`);
        await withStub.close();
      } else {
        await page.waitForFunction(() => window.__tools && window.__tools.length >= 7, null, { timeout: 10000 });
        const answers = await page.evaluate(async (calls) => {
          const byName = Object.fromEntries(window.__tools.map((t) => [t.name, t]));
          const out = {};
          for (const [name, args] of calls) out[name] = await byName[name].execute(args);
          return { answers: out, names: window.__tools.map((t) => t.name).sort() };
        }, CALLS);
        assert.deepStrictEqual(answers.names, ['ask', 'compose', 'links', 'propose', 'read', 'remember', 'search'], route);
        for (const [name] of CALLS) {
          const envelope = answers.answers[name];
          assert.strictEqual(envelope.trust, 'untrusted', `${route} ${name}`);
          assert.strictEqual(envelope.source, name, `${route} ${name}`);
          assert.notStrictEqual(envelope.type, 'error', `${route} ${name}: ${JSON.stringify(envelope)}`);
        }
        assert.deepStrictEqual(offOrigin, [], `${route} requested another origin`);
        await withStub.close();
      }

      // Without it.
      const plain = await browser.newContext();
      const quiet = await plain.newPage();
      const errors = [];
      quiet.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      quiet.on('pageerror', (e) => errors.push(String(e)));
      await quiet.goto(`${base}${route}`, { waitUntil: 'load' });
      await quiet.waitForTimeout(200);
      assert.deepStrictEqual(errors, [], `${route} logged errors without document.modelContext`);
      await plain.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
});
