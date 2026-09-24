'use strict';
// verifies AGSC-07-12, AGSC-07-18, AGSC-09-94, AGSC-08-25
// MODE 4 — runnable knowledge: a person composes a Harness with `compose --zip`, an
// agent composes the same selection through the tool server; `run --dry-run` lists
// the steps and refuses a program outside `run.allow[]`; `run` refuses honestly when
// no isolating runner exists; `trace` records a run as an Episode whose spend the
// NOW page counts in the month it STARTED. The page's Harness equals the CLI's byte
// for byte — tests/distribution/compose-page-run.test.js proves it on the real
// command line; the browser lane (tests/e2e/modes/browser.test.js) in Chromium.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const kit = require('./_kit.js');

const RUNNABLE = kit.item({
  type: 'procedure', title: 'Greet',
  description: 'A tiny runnable procedure that prints one line, so the run verb has something real.',
  when: 'the run verb needs a step', clusters: ['login'], prov: kit.PROV,
}, '# Greet\n\n```run\necho hello\n```\n\n```expect\nhello\n```');
const FETCHING = kit.item({
  type: 'procedure', title: 'Fetch',
  description: 'A procedure whose one step names a program the configuration does not allow.',
  when: 'the run verb meets a program outside the allow list', clusters: ['login'], prov: kit.PROV,
}, '# Fetch\n\n```run\ncurl https://example.org/\n```');

test('Mode 4, a person and an agent: compose a Harness, run it dry, trace a run, count its spend', async () => {
  const dir = kit.projectBundle('m4');
  const config = JSON.parse(kit.read(dir, 'agsc.config.json'));
  config.run = { allow: ['echo'], enabled: true };
  config.budget = { usd_month: 1 };
  kit.write(dir, 'agsc.config.json', `${JSON.stringify(config, null, 2)}\n`);
  kit.write(dir, 'content/procedures/greet.md', RUNNABLE);
  kit.write(dir, 'content/procedures/fetch.md', FETCHING);
  kit.commitAll(dir, 'runnable knowledge');

  // compose: the seven file kinds and the archive beside them.
  const composed = kit.agsc(dir, ['compose', 'handoff', 'run-the-tests', 'task-login-form', '--zip']);
  assert.strictEqual(composed.code, 0, composed.stderr);
  const root = path.join(dir, 'dist', 'harness');
  const name = fs.readdirSync(root).find((n) => fs.statSync(path.join(root, n)).isDirectory());
  assert.ok(fs.readdirSync(root).some((n) => n.endsWith('.zip')), 'no archive beside the Harness');
  const agents = kit.read(dir, `dist/harness/${name}/AGENTS.md`);
  assert.match(agents, /bundle: https:\/\/proj\.example\//u);
  assert.match(agents, /- type: concept \(task\)/u);
  // A runtime rendering is named by the registry and not shipped at 1.0: it says so.
  const crewai = kit.agsc(dir, ['compose', 'handoff', '--emit', 'crewai', '--json']);
  assert.strictEqual(crewai.code, 1);
  assert.ok(kit.codes(crewai).includes('AGSC-E001'));

  // An agent composes the same selection through the tool server.
  const mcp = await kit.mcpClient(dir);
  try {
    const verdict = await mcp.call('compose', { selection: ['handoff', 'run-the-tests', 'task-login-form'] });
    assert.strictEqual(verdict.type, 'verdict');
    assert.strictEqual(verdict.body.valid, true);
  } finally {
    await mcp.close();
  }

  // run --dry-run lists the steps and marks the program outside run.allow[]; run
  // itself refuses, because this engine's runner does not isolate the network.
  const dry = kit.agsc(dir, ['run', 'greet', '--dry-run']);
  assert.strictEqual(dry.code, 0, dry.stderr);
  assert.match(dry.stderr, /run: step 1: echo hello/u);
  const outside = kit.agsc(dir, ['run', 'fetch', '--dry-run', '--json']);
  assert.strictEqual(outside.code, 1);
  assert.match(outside.stderr, /curl https:\/\/example\.org\/ +\[REFUSED: not in run\.allow\[\]\]/u);
  assert.ok(kit.codes(outside).includes('AGSC-E203'));
  const live = kit.agsc(dir, ['run', 'greet', '--json']);
  assert.strictEqual(live.code, 1);
  assert.ok(kit.codes(live).includes('AGSC-E001'));

  // trace: a captured run becomes an Episode; NOW counts its spend in the month it started.
  kit.write(dir, 'run1.json', `${JSON.stringify({
    actor: 'process:worker', outcome: 'success', started: '2026-09-02T10:00:00Z', title: 'First run',
    usage: { cost_usd: 0.25, estimate: false, model: 'm', tokens_in: 100, tokens_out: 50 },
  })}\n`);
  const traced = kit.agsc(dir, ['trace', 'run1.json']);
  assert.strictEqual(traced.code, 0, traced.stderr);
  assert.match(kit.read(dir, 'content/episodes/first-run.md'), /^started: "?2026-09-02T10:00:00Z"?$/mu);
  const built = kit.agsc(dir, ['build']);
  assert.strictEqual(built.code, 0, built.stderr);
  assert.match(kit.read(dir, 'www/now.md'), /0\.25 USD/u, 'NOW does not count the traced spend');
});
