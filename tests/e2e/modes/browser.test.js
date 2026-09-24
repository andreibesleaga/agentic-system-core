'use strict';
// verifies AGSC-07-13, AGSC-09-16
// THE MODE WALK IN A REAL BROWSER — an optional lane, like tests/e2e/browser.test.js.
// A project Bundle with a git history is built with the real command line and served
// read-only on 127.0.0.1 (an origin that is NOT its `site.base`, as a local preview
// is). In headless Chromium:
//   * a person on /compose/ ticks three items, builds the Harness and downloads the
//     archive — its bytes equal those `agsc compose --zip` writes for the same
//     selection (content version, `bundle:` base and member kinds included);
//   * an agent on an item page, through a stubbed `document.modelContext`, gets the
//     same answers the MCP tool server gives for the same calls.
// Runs only with AGSC_BROWSER=1, CHROME_EXE naming a Chromium binary and
// `playwright-core` resolvable (NODE_PATH may point outside the repository); otherwise
// skipped, saying which is missing. Nothing leaves loopback.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const kit = require('./_kit.js');

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

const SKIP = skipReason();
const SELECTION = ['handoff', 'run-the-tests', 'task-login-form'];

test('in Chromium: the /compose/ archive equals the CLI archive, and the page tools equal the tool server', { skip: SKIP || false }, async () => {
  const { chromium } = require('playwright-core');
  const dir = kit.projectBundle('browser');
  kit.commitAll(dir, 'the first state');
  kit.write(dir, 'content/concepts/task-login-tests.md',
    kit.read(dir, 'content/concepts/task-login-tests.md').replace('Test the login form.', 'Test the login form twice.'));
  kit.commitAll(dir, 'a second commit');
  assert.strictEqual(kit.agsc(dir, ['build']).code, 0);
  assert.strictEqual(kit.agsc(dir, ['compose', ...SELECTION, '--zip']).code, 0);
  const harness = path.join(dir, 'dist', 'harness');
  const cliZip = fs.readFileSync(path.join(harness, fs.readdirSync(harness).find((n) => n.endsWith('.zip'))));

  const node = await kit.serve(path.join(dir, 'www'));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE });
  const mcp = await kit.mcpClient(dir);
  try {
    // A person on /compose/.
    const person = await browser.newContext({ acceptDownloads: true });
    const page = await person.newPage();
    const errors = [];
    const offOrigin = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => { if (!r.url().startsWith(node.origin)) offOrigin.push(r.url()); });
    await page.goto(`${node.origin}/compose/`, { waitUntil: 'networkidle' });
    for (const slug of SELECTION) await page.check(`#items input[value="${slug}"]`);
    await page.click('#download');
    await page.waitForSelector('#archive a');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#archive a')]);
    const pageZip = fs.readFileSync(await download.path());
    assert.ok(pageZip.equals(cliZip), 'the archive the page built differs from `agsc compose --zip`');
    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(offOrigin, []);
    await person.close();

    // An agent on an item page, through document.modelContext.
    const agent = await browser.newContext();
    const itemPage = await agent.newPage();
    await itemPage.addInitScript(() => {
      window.__tools = {};
      document.modelContext = { clearContext() {}, provideContext() {}, registerTool(t) { window.__tools[t.name] = t; }, unregisterTool() {} };
    });
    await itemPage.goto(`${node.origin}/concepts/task-login-form/`, { waitUntil: 'networkidle' });
    await itemPage.waitForFunction(() => Object.keys(window.__tools).length === 7);
    const calls = [
      ['search', { query: 'login form' }], ['read', { slug: 'task-login-tests' }], ['links', { slug: 'handoff' }],
      ['ask', { question: 'who tests the login form' }], ['compose', { selection: SELECTION }],
      ['propose', { at: '2026-09-14', slug: 'task-login-tests', task_state: 'TASK_STATE_WORKING' }],
      ['remember', { body: 'Limit attempts per address.', cluster: 'login', kind: 'task', title: 'Add rate limiting' }],
    ];
    for (const [name, args] of calls) {
      const fromPage = await itemPage.evaluate(async ([n, a]) => {
        const out = await window.__tools[n].execute(a);
        // The bytes an agent receives: the JSON text of the envelope.
        return typeof out === 'string' ? out : JSON.stringify(out);
      }, [name, args]);
      const fromServer = await mcp.call(name, args);
      assert.deepStrictEqual(JSON.parse(fromPage), fromServer, `${name}: the page and the tool server disagree`);
    }
    await agent.close();
  } finally {
    await mcp.close();
    await browser.close();
    await node.close();
  }
});
