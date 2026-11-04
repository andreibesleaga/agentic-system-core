'use strict';
// verifies AGSC-06-39, AGSC-06-20, AGSC-05-34
// END TO END, `/query/` on every real site: the demonstration node (`agsc-demo-node`, the
// public export of the patterns node), the Bundle the main site's generator hands the engine,
// and the patterns node. Each is copied, built with this engine at a fixed instant (the main
// site keeps `site.query_page` at its default, decision D-2), served on 127.0.0.1 with each
// address's own header set, and opened in a headless Chromium:
//   * `/query/` exists, the engine starts under the page's own policy, loads `/graph.nq` and
//     asks nothing of another origin, with no console error;
//   * each of the ten examples, run from the keyboard alone, answers what the question's own
//     function answers over that node's published items (src/knowledge/questions.js, the
//     functions of graph-0030 to graph-0039);
//   * axe-core finds no violation in the light and the dark colour scheme (bench/a11y.js tags);
//   * the time from the request to the engine being ready is printed (a figure to record, not
//     a gate: the gate of 3 s is measured on the 5,000-item Bundle at a throttled link).
//
// An OPTIONAL lane, like the real-Bundle lane: the sites live in sibling repositories, so it
// runs only with AGSC_E2E=1 and the browser lane (AGSC_BROWSER=1, CHROME_EXE, playwright-core
// and axe-core, see tests/distribution/_query-lane.js). Paths: AGSC_E2E_DEMO (default
// ../agsc-demo-node), AGSC_E2E_SITE (default ../AgenticSystemCore.com/dist/engine-bundle),
// AGSC_E2E_PATTERNS (default ../AgenticSystemCore-Patterns). A path with no Bundle is skipped
// and says so. Deterministic: fixed build instant and git dates, scratch copies; nothing
// leaves loopback.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const lane = require('../distribution/_query-lane.js');

const ROOT = path.resolve(__dirname, '..', '..');
const AGSC = path.join(ROOT, 'bin', 'agsc.js');
const SITES = [
  ['demonstration node', process.env.AGSC_E2E_DEMO || path.join(ROOT, '..', 'agsc-demo-node')],
  ['main site Bundle', process.env.AGSC_E2E_SITE || path.join(ROOT, '..', 'AgenticSystemCore.com', 'dist', 'engine-bundle')],
  ['patterns node', process.env.AGSC_E2E_PATTERNS || path.join(ROOT, '..', 'AgenticSystemCore-Patterns')],
];
const COPIED = ['.git', '.well-known', 'agsc.config.json', 'content', 'domain', 'LICENSE', 'LICENSE-CONTENT', 'NOTICE',
  'PRIVACY.md', 'DISCLAIMER.md', 'README.md', 'publish-set.json'];

function reason(dir) {
  if (process.env.AGSC_E2E !== '1') return 'the real-site lane runs only with AGSC_E2E=1';
  const browser = lane.browserSkipReason();
  if (browser !== null) return browser;
  if (!fs.existsSync(path.join(dir, 'agsc.config.json'))) return `no Bundle at ${dir}`;
  return null;
}

/** A scratch copy of the Bundle at `source`, built with this engine at a fixed instant: `{dir, out, home}`. */
function buildCopy(source) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-e2e-query-'));
  fs.writeFileSync(path.join(home, '.gitconfig-empty'), '');
  const dir = path.join(home, 'bundle');
  fs.mkdirSync(dir);
  for (const entry of COPIED) {
    if (fs.existsSync(path.join(source, entry))) fs.cpSync(path.join(source, entry), path.join(dir, entry), { recursive: true });
  }
  const env = {
    GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_AUTHOR_EMAIL: 'operator@example.org', GIT_AUTHOR_NAME: 'Operator',
    GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_EMAIL: 'operator@example.org', GIT_COMMITTER_NAME: 'Operator',
    GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig-empty'), GIT_CONFIG_NOSYSTEM: '1', HOME: home, NO_COLOR: '1',
    PATH: process.env.PATH, SOURCE_DATE_EPOCH: '1767225600',
    ...(process.env.SYSTEMROOT ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}),
  };
  const run = (cmd, argv) => spawnSync(cmd, argv, { cwd: dir, encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 });
  if (!fs.existsSync(path.join(dir, '.git'))) {
    // A Bundle handed over without history gets one commit, so the ledger derives.
    for (const argv of [['init', '-q', '-b', 'main'], ['add', '-A'], ['commit', '-q', '-m', 'Bundle']]) assert.strictEqual(run('git', argv).status, 0);
  }
  const built = run(process.execPath, [AGSC, 'build', '--json']);
  assert.strictEqual(built.status, 0, `agsc build: ${built.stdout}${built.stderr}`);
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8'));
  return { dir, home, out: path.join(dir, (config.build && config.build.out) || 'www') };
}

for (const [name, source] of SITES) {
  test(`/query/ on the ${name}: it loads, the ten examples answer as the functions do, and axe finds nothing in either scheme`,
    { skip: reason(source) || false }, async () => {
      const copy = buildCopy(source);
      const run = await lane.session(copy.out);
      try {
        assert.ok(fs.existsSync(path.join(copy.out, 'query', 'index.html')), 'the build wrote no /query/');
        const { context, errors, ms, page, requests } = await lane.openQuery(run);
        const runs = await lane.runTenExamples(page, lane.publishedItems(copy.dir));
        for (const r of runs) assert.deepStrictEqual(r.got, r.expected, `${name}, example ${r.number}: ${r.shown}`);
        assert.deepStrictEqual(errors, [], `${name}: a console error or warning`);
        assert.deepStrictEqual(requests.filter((url) => !url.startsWith(run.base)), [], `${name}: a request left the origin`);
        process.stdout.write(`# ${name}: /query/ ready in ${ms} ms on loopback; ${runs.filter((r) => JSON.stringify(r.expected) !== '[]').length} of 10 examples answer something\n`);
        await context.close();
        for (const scheme of ['light', 'dark']) {
          const opened = await lane.openQuery(run, { scheme });
          const violations = await lane.axeViolations(opened.page);
          assert.deepStrictEqual(violations, [], `${name}, ${scheme}: ${violations.join('; ')}`);
          await opened.context.close();
        }
      } finally {
        await run.close();
        fs.rmSync(copy.home, { force: true, recursive: true });
      }
    });
}
