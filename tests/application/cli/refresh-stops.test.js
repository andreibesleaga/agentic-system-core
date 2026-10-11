'use strict';
// verifies AGSC-08-28, AGSC-10-17, AGSC-01-38, AGSC-04-09
// `refresh --agent <lane> --dry-run` stops where the rules say a lane run stops,
// BEFORE it writes anything:
//   - AGSC-08-28(e): the lane's own `budget_usd_month`, or the node's `budget.usd_month`
//     (AGSC-01-38), is reached for the calendar month — the warning `AGSC-E510`, exit 0;
//   - AGSC-10-17: a lane whose `tasks[]` include `work` runs only while a board it may
//     touch holds a task it can claim (`TASK_STATE_SUBMITTED`, or `TASK_STATE_WORKING`
//     under its own name) — otherwise a note that nothing can be claimed, exit 0;
//   - AGSC-04-09: with no `SOURCE_DATE_EPOCH` and no git history the build instant
//     defaults to 0, so the run's Episode would be dated 1970 and land in no month the
//     meter counts — refused with `AGSC-E204`, exit 1, as `build` refuses.
// Over a real copy of `tests/fixtures/minimal`, the real command-line shell, a fixed
// instant and no network.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { main } = require('../../../src/application/cli/main.js');
const { createFileSystem } = require('../../../src/adapters/node-fs.js');
const { captureStream } = require('../../conformance/areas/_shared.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
/** 2026-01-01T00:00:00Z — the fixed instant; its calendar month is 2026-01. */
const EPOCH = '1767225600';
const IN_MONTH = '2026-01-01T00:00:00Z';

const temporaries = [];
test.after(() => {
  for (const dir of temporaries) fs.rmSync(dir, { force: true, recursive: true });
});

const LANE = {
  author: 'lane-bot', budget_usd_month: 5, channel: 'lane', enabled: true, kind: 'llm', model: 'example-model-1',
  name: 'worker', operator: 'human:alice', tasks: ['plan', 'claim', 'work', 'edit'], types: ['concept', 'episode', 'lesson'],
};

function write(dir, rel, text) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
}

function task(dir, slug, state, extra = []) {
  write(dir, `content/concepts/${slug}.md`, ['---', 'type: concept', `title: Sprint task ${slug}`,
    'description: A task on the sprint board that an agent lane may claim, work on and complete.',
    'clusters:', '  - agent-patterns', 'prov:', '  origin: human', '  operator: human:alice', ...extra,
    'kind: task', `task_state: ${state}`, '---', '', 'Do the work the title names.', ''].join('\n'));
}

function episode(dir, slug, actor, cost, started = IN_MONTH) {
  write(dir, `content/episodes/${slug}.md`, ['---', 'type: episode', `title: A run ${slug}`,
    'description: One run of an agent lane, recorded with the spend its usage carries.',
    `actor: ${actor}`, `started: "${started}"`, 'outcome: partial',
    'usage:', '  model: example-model-1', '  tokens_in: 0', '  tokens_out: 0', `  cost_usd: ${cost}`, '  estimate: true',
    'prov:', '  origin: ai-generated', '  agent: worker', '  model: example-model-1', '  operator: human:alice',
    '---', '', '## What happened', '', 'The lane ran once.', ''].join('\n'));
}

/** A copy of the fixture with a channel, the `worker` lane and a board of two tasks. */
function laneBundle({ lane = LANE, states = ['TASK_STATE_SUBMITTED', 'TASK_STATE_SUBMITTED'], budget } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-refresh-stops-'));
  temporaries.push(dir);
  fs.cpSync(FIXTURE, dir, { recursive: true });
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8'));
  config.channels = [{ adapter: 'stub', author: 'lane-bot', name: 'lane', owner: 'human:alice', publish: 'auto' }];
  config.agents = [lane];
  if (budget !== undefined) config.budget = { usd_month: budget };
  write(dir, 'agsc.config.json', `${JSON.stringify(config, null, 2)}\n`);
  states.forEach((state, i) => task(dir, `task-${String.fromCharCode(97 + i)}`, state));
  return dir;
}

/** The real shell over the directory; `epoch: null` runs with no SOURCE_DATE_EPOCH. */
function refresh(dir, { epoch = EPOCH, json = true, agent = 'worker' } = {}) {
  const stdout = captureStream();
  const stderr = captureStream();
  const argv = ['refresh', '--agent', agent, '--dry-run', ...(json ? ['--json'] : [])];
  const exit = main(argv, {
    env: epoch === null ? {} : { SOURCE_DATE_EPOCH: epoch },
    ports: { fs: createFileSystem(dir) },
    root: dir,
    specVersion: '1.0.0',
    stderr,
    stdout,
    version: '0.0.0',
  });
  const text = stdout.text();
  return { envelope: json && text !== '' ? JSON.parse(text) : null, exit, stderr: stderr.text() };
}

const wroteNothing = (dir) => !fs.existsSync(path.join(dir, 'dist', 'proposal'));
const codes = (r) => r.envelope.findings.map((f) => [f.code, f.severity]);

test('AGSC-08-28(e): the lane\'s own budget spent stops the dry run with AGSC-E510, nothing written, exit 0', () => {
  const dir = laneBundle();
  episode(dir, 'worker-run-1', 'process:worker', 5);
  const r = refresh(dir);
  assert.strictEqual(r.exit, 0, JSON.stringify(r.envelope));
  assert.deepStrictEqual(codes(r), [['AGSC-E510', 'warn']]);
  assert.match(r.envelope.findings[0].message, /"worker"/u);
  assert.ok(wroteNothing(dir), 'a Proposal was written with the lane\'s budget spent');
});

test('AGSC-08-28(e): one cent below the lane\'s budget the dry run still writes its Proposal', () => {
  const dir = laneBundle();
  episode(dir, 'worker-run-1', 'process:worker', 4.99);
  const r = refresh(dir);
  assert.strictEqual(r.exit, 0, JSON.stringify(r.envelope));
  assert.deepStrictEqual(r.envelope.findings, []);
  assert.ok(fs.existsSync(path.join(dir, 'dist', 'proposal', '1.patch')));
});

test('AGSC-01-38: the node-wide cap reached stops every lane, even one below its own budget', () => {
  const dir = laneBundle({ budget: 6 });
  episode(dir, 'worker-run-1', 'process:worker', 3);
  episode(dir, 'planner-run-1', 'process:planner', 3);
  const r = refresh(dir);
  assert.strictEqual(r.exit, 0, JSON.stringify(r.envelope));
  assert.deepStrictEqual(codes(r), [['AGSC-E510', 'warn']]);
  assert.match(r.envelope.findings[0].message, /node's monthly budget of 6 USD/u);
  assert.ok(wroteNothing(dir));
});

test('AGSC-08-25: spend of another calendar month does not stop the lane', () => {
  const dir = laneBundle();
  episode(dir, 'worker-run-old', 'process:worker', 50, '2025-12-31T23:59:59Z');
  const r = refresh(dir);
  assert.deepStrictEqual(r.envelope.findings, []);
  assert.ok(fs.existsSync(path.join(dir, 'dist', 'proposal', '1.patch')));
});

test('AGSC-08-25: ten runs of 0.1 USD reach a lane budget of 1 USD (decimal sum)', () => {
  const dir = laneBundle({ lane: { ...LANE, budget_usd_month: 1 } });
  for (let i = 0; i < 10; i += 1) episode(dir, `worker-run-${i}`, 'process:worker', 0.1);
  const r = refresh(dir);
  assert.deepStrictEqual(codes(r), [['AGSC-E510', 'warn']]);
  assert.ok(wroteNothing(dir));
});

test('AGSC-10-17: a done board stops the lane — a note that nothing can be claimed, nothing written, exit 0', () => {
  const dir = laneBundle({ states: ['TASK_STATE_COMPLETED', 'TASK_STATE_CANCELED'] });
  const r = refresh(dir, { json: false });
  assert.strictEqual(r.exit, 0, r.stderr);
  assert.match(r.stderr, /nothing can be claimed/u);
  assert.ok(wroteNothing(dir));
  // Under --json the envelope is clean and the stop is seen by what was not written.
  const quiet = refresh(dir);
  assert.strictEqual(quiet.exit, 0);
  assert.deepStrictEqual(quiet.envelope.findings, []);
  assert.ok(wroteNothing(dir));
});

test('AGSC-10-17: tasks that need a person are not claimable, so the lane stops', () => {
  const dir = laneBundle({ states: ['TASK_STATE_INPUT_REQUIRED', 'TASK_STATE_AUTH_REQUIRED'] });
  const r = refresh(dir, { json: false });
  assert.strictEqual(r.exit, 0, r.stderr);
  assert.match(r.stderr, /nothing can be claimed/u);
  assert.ok(wroteNothing(dir));
});

test('AGSC-10-17: a task held by another participant is not claimable; one held by the lane is', () => {
  const dir = laneBundle({ states: ['TASK_STATE_COMPLETED'] });
  task(dir, 'task-b', 'TASK_STATE_WORKING', ['  agent: someone-else']);
  const other = refresh(dir, { json: false });
  assert.match(other.stderr, /nothing can be claimed/u);
  assert.ok(wroteNothing(dir));
  task(dir, 'task-b', 'TASK_STATE_WORKING', ['  agent: worker']);
  const own = refresh(dir);
  assert.strictEqual(own.exit, 0, JSON.stringify(own.envelope));
  assert.ok(fs.existsSync(path.join(dir, 'dist', 'proposal', '1.patch')), 'the lane\'s own task in progress was not claimable');
});

test('AGSC-10-17: the board rule binds a lane that works tasks; a refresh-only lane runs without a board', () => {
  const dir = laneBundle({ lane: { ...LANE, tasks: ['refresh'] }, states: ['TASK_STATE_COMPLETED'] });
  const r = refresh(dir);
  assert.strictEqual(r.exit, 0, JSON.stringify(r.envelope));
  assert.ok(fs.existsSync(path.join(dir, 'dist', 'proposal', '1.patch')));
});

test('AGSC-04-09: with no build instant the dry run is refused with AGSC-E204, as build is, and writes nothing', () => {
  const dir = laneBundle();
  const r = refresh(dir, { epoch: null });
  assert.strictEqual(r.exit, 1, JSON.stringify(r.envelope));
  assert.deepStrictEqual(codes(r), [['AGSC-E204', 'error'], ['AGSC-E606', 'warn']]);
  assert.match(r.envelope.findings.find((f) => f.code === 'AGSC-E204').message, /1970-01-01T00:00:00Z/u);
  assert.ok(wroteNothing(dir));
});
