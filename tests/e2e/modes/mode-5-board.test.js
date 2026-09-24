'use strict';
// verifies AGSC-10-13, AGSC-10-17, AGSC-08-28, AGSC-08-25
// MODE 5 — the live board, walked end to end: an agent lane claims a task through the
// tool server, a person applies the prepared patch and commits it, the build derives
// who holds the task from that commit, and from then on every other claim of the held
// task is refused — for the lane, for an agent that declares no lane and for a
// person on the page — and the lane's work-in-progress limit fires on a second
// claim. A dry run of the lane proposes its Episode, which NOW then counts. The page
// tools answer the same as the tool server. Real git, fixed dates, no network.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const kit = require('./_kit.js');

const LANE = {
  author: 'board-bot', budget_usd_month: 1, channel: 'main', enabled: true, kind: 'llm', max_claims: 1, model: 'test-model', name: 'worker',
  operator: 'human:tester', tasks: ['claim', 'work', 'plan', 'refresh'], types: ['concept', 'episode'],
};

test('Mode 5, a lane, a person and a stranger work one live board', async () => {
  const dir = kit.projectBundle('m5', { agents: [LANE] });
  const config = JSON.parse(kit.read(dir, 'agsc.config.json'));
  config.channels = [{ adapter: 'github', author: 'board-bot', name: 'main', owner: 'human:tester' }];
  config.budget = { usd_month: 1 };
  kit.write(dir, 'agsc.config.json', `${JSON.stringify(config, null, 2)}\n`);
  kit.commitAll(dir, 'the board');
  assert.strictEqual(kit.agsc(dir, ['build']).code, 0);
  assert.deepStrictEqual(JSON.parse(kit.read(dir, 'www/boards/index.json')).boards.map((b) => b.cluster), ['login']);

  // The lane claims a task: the tool server hands back a patch and writes nothing.
  let mcp = await kit.mcpClient(dir);
  let claim;
  try {
    claim = await mcp.call('propose', { agent: 'worker', at: '2026-09-14', slug: 'task-login-form', task_state: 'TASK_STATE_WORKING' });
  } finally {
    await mcp.close();
  }
  assert.strictEqual(claim.type, 'proposal', JSON.stringify(claim));
  kit.write(dir, 'claim.patch', claim.body.patch);
  const applied = spawnSync('git', ['apply', 'claim.patch'], { cwd: dir, encoding: 'utf8', env: kit.env(path.dirname(dir)) });
  assert.strictEqual(applied.status, 0, applied.stderr);
  kit.git(dir, ['add', 'content']);
  kit.git(dir, ['commit', '-q', '-m', 'claim task-login-form\n\nChannel-Auto: worker'], { date: '2026-09-14T09:00:00Z' });
  assert.strictEqual(kit.agsc(dir, ['lint']).code, 0);

  // The build derives who holds the task from that commit.
  assert.strictEqual(kit.agsc(dir, ['build']).code, 0);
  const board = JSON.parse(kit.read(dir, 'www/boards/login.json'));
  const held = board.tasks.find((t) => t.slug === 'task-login-form');
  assert.strictEqual(held.state, 'TASK_STATE_WORKING');
  assert.strictEqual(held.claimed_by, 'process:worker', JSON.stringify(board));
  assert.match(kit.read(dir, 'www/boards/login/index.html'), /claimed by <span>process:worker<\/span>/u);

  // Every other claim of the held task is refused, on both transports, and the lane's
  // work-in-progress limit (max_claims 1) refuses its second task.
  const page = await kit.pageTools(path.join(dir, 'www'));
  assert.ok(page.fetched.includes('/boards/login.json'), 'the page did not read the board export');
  mcp = await kit.mcpClient(dir);
  try {
    const cases = [
      [{ agent: 'someone-else', slug: 'task-login-form' }, 'AGSC-E511'],
      [{ slug: 'task-login-form' }, 'AGSC-E511'],
    ];
    for (const [args, code] of cases) {
      const move = { ...args, at: '2026-09-14', task_state: 'TASK_STATE_WORKING' };
      const local = await mcp.call('propose', move);
      const remote = await page.call('propose', move);
      assert.strictEqual(local.body.code, code, `${JSON.stringify(args)}: ${JSON.stringify(local)}`);
      assert.deepStrictEqual(remote, local, `${JSON.stringify(args)}: the page and the tool server disagree`);
    }
    const again = await mcp.call('propose', { agent: 'worker', at: '2026-09-14', slug: 'task-login-form', task_state: 'TASK_STATE_WORKING' });
    assert.strictEqual(again.type, 'proposal', 'the holder may re-propose its own claim');
    const second = await mcp.call('propose', { agent: 'worker', at: '2026-09-14', slug: 'task-login-tests', task_state: 'TASK_STATE_WORKING' });
    assert.strictEqual(second.body.code, 'AGSC-E511', `the WIP limit did not fire: ${JSON.stringify(second)}`);
    // Finishing is not claiming: the holder completes its task.
    const done = await mcp.call('propose', { agent: 'worker', at: '2026-09-14', slug: 'task-login-form', task_state: 'TASK_STATE_COMPLETED' });
    assert.strictEqual(done.type, 'proposal');
    assert.match(done.body.patch, /^\+task_state: TASK_STATE_COMPLETED$/mu);
    // A new task filed through the tools lands on the board it names.
    const filed = await mcp.call('remember', { agent: 'worker', body: 'Limit attempts per address.', cluster: 'login', kind: 'task',
      model: 'test-model', operator: 'human:tester', title: 'Add rate limiting to login' });
    assert.deepStrictEqual(filed.body.frontmatter.clusters, ['login']);
    assert.strictEqual(filed.body.frontmatter.task_state, 'TASK_STATE_SUBMITTED');
  } finally {
    await mcp.close();
  }

  // A dry run of the lane proposes the Episode of the run; applied and built, NOW counts it.
  const dry = kit.agsc(dir, ['refresh', '--agent', 'worker', '--dry-run']);
  assert.strictEqual(dry.code, 0, dry.stderr);
  assert.match(dry.stderr, /run: git apply dist\/proposal\/1\.patch/u);
  const episode = spawnSync('git', ['apply', 'dist/proposal/1.patch'], { cwd: dir, encoding: 'utf8', env: kit.env(path.dirname(dir)) });
  assert.strictEqual(episode.status, 0, episode.stderr);
  const linted = kit.agsc(dir, ['lint', '--json']);
  assert.strictEqual(linted.code, 0, JSON.stringify(linted.envelope && linted.envelope.findings));
  assert.strictEqual(kit.agsc(dir, ['build']).code, 0);
  const now = kit.read(dir, 'www/now.md');
  // The lane row: enabled, one run (the dry run's Episode), its spend of 0 counted.
  assert.match(now, /^\| worker \| yes \| 1 \| \d+ \| 0 \| 1 \|$/mu, now);
});
