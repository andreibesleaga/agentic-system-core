'use strict';
// verifies AGSC-01-36, AGSC-08-20, AGSC-08-30
// Steps of features/persona-k-live-board.feature that run offline. The lanes that
// call a model are pending (the reference engine ships no model adapter); what
// runs here is the Background — a live board and an agent lane a person declared,
// accepted by lint — and the determinism boundary: whatever the lane wrote, the
// model-free lanes reproduce the same bytes and the ledger records the lane.

const assert = require('node:assert');

const { built } = require('./_world.js');

const REL = 'content/concepts';

function task(world, slug, state) {
  world.write(`${REL}/${slug}.md`, ['---', 'type: concept', `title: Sprint task ${slug.slice(-1).toUpperCase()}`,
    `description: A task on the sprint-1 board that an agent lane may claim, work on and complete.`,
    'clusters:', '  - sprint-1', 'prov:', '  origin: human', '  operator: human:alice',
    'kind: task', `task_state: ${state}`, '---', '', 'Do the work the title names.', ''].join('\n'));
}

function config(world, change) {
  const value = JSON.parse(world.read('agsc.config.json'));
  change(value);
  world.write('agsc.config.json', `${JSON.stringify(value, null, 2)}\n`);
}

function lintClean(world) {
  const lint = world.agsc(['lint', '--json'], { offline: true });
  const errors = JSON.parse(lint.stdout).findings.filter((f) => f.severity === 'error');
  assert.deepStrictEqual(errors, []);
}

module.exports = [
  {
    pattern: 'a Bundle with a board cluster "sprint-1" holding tasks of kind task with task_state "TASK_STATE_SUBMITTED"',
    run(world) {
      world.bundle();
      world.write('content/clusters/sprint-1.md', ['---', 'type: cluster', 'title: Sprint 1',
        'description: The first sprint of the project, whose tasks agents and people claim and finish on one board.',
        'prov:', '  origin: human', '  operator: human:alice', '---', '', '# Sprint 1', ''].join('\n'));
      task(world, 'task-a', 'TASK_STATE_SUBMITTED');
      task(world, 'task-b', 'TASK_STATE_SUBMITTED');
      built(world, { offline: true });
      const board = JSON.parse(world.read('www/boards/sprint-1.json'));
      assert.ok(JSON.stringify(board).includes('task-a') && JSON.stringify(board).includes('task-b'), JSON.stringify(board));
    },
  },
  {
    pattern: 'agsc.config.json declares contribute[]',
    run(world) {
      const { contribute } = JSON.parse(world.read('agsc.config.json'));
      assert.ok(Array.isArray(contribute) && contribute.length > 0);
    },
  },
  {
    pattern: 'a channel "lane" with author "lane-bot", owner "human:alice" and publish "auto"',
    run(world) {
      config(world, (c) => {
        c.channels = [{ adapter: 'stub', author: 'lane-bot', name: 'lane', owner: 'human:alice', publish: 'auto' }];
      });
    },
  },
  {
    pattern: 'an agents[] entry "worker" of kind "llm" with tasks "plan, claim, work, edit" and types "concept, episode, lesson", channel "lane", budget_usd_month 5, enabled true',
    run(world) {
      config(world, (c) => {
        c.agents = [{
          author: 'lane-bot', budget_usd_month: 5, channel: 'lane', enabled: true, kind: 'llm',
          model: 'example-model-1', name: 'worker', operator: 'human:alice',
          tasks: ['plan', 'claim', 'work', 'edit'], types: ['concept', 'episode', 'lesson'],
        }];
      });
      // AGSC-01-36: the declared lane is accepted as written.
      lintClean(world);
    },
  },
  {
    pattern: 'the lane\'s Proposal claiming a task was merged with the trailer "Channel-Auto: lane"',
    run(world) {
      world.commitAll('Open the sprint-1 board');
      task(world, 'task-a', 'TASK_STATE_WORKING');
      world.commitAll('Claim task-a\n\nChannel-Auto: lane',
        { GIT_AUTHOR_DATE: '2026-01-02T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-02T00:00:00Z' });
      world.state.laneCommit = world.git(['rev-parse', 'HEAD']).trim();
    },
  },
  {
    pattern: '"npx agentic-system-core ci" runs twice on the merged content',
    run(world) {
      world.state.runs = [];
      for (let i = 0; i < 2; i += 1) {
        const r = world.agsc(['ci'], { offline: true });
        assert.strictEqual(r.exit, 0, r.stdout + r.stderr);
        world.state.runs.push({ exit: r.exit, gate: world.read('dist/gate.json') });
      }
    },
  },
  {
    pattern: 'the two runs give the same verdict, two builds give byte-identical output, and no model or network call is reachable from lint, build, verify or ci (AGSC-08-30)',
    run(world) {
      const [first, second] = world.state.runs;
      assert.deepStrictEqual(second, first);
      built(world, { offline: true });
      const once = world.snapshot('www');
      built(world, { offline: true });
      assert.deepStrictEqual(world.snapshot('www'), once);
      assert.ok(world.read('www/boards/sprint-1.json').includes('TASK_STATE_WORKING'));
      for (const verb of ['lint', 'verify']) {
        const r = world.agsc([verb], { offline: true });
        assert.strictEqual(r.exit, 0, `${verb}: ${r.stdout}${r.stderr}`);
      }
      assert.deepStrictEqual(world.networkAttempts(), []);
    },
  },
  {
    pattern: '"npx agentic-system-core verify --ledger" re-verifies the ledger, which records the lane\'s commit with mode "auto"',
    run(world) {
      const verify = world.agsc(['verify', '--ledger', '--json'], { offline: true });
      assert.strictEqual(verify.exit, 0, verify.stdout + verify.stderr);
      assert.strictEqual(JSON.parse(verify.stdout).status, 'pass');
      const entries = world.read('www/ledger.jsonl').split('\n').filter(Boolean).map((l) => JSON.parse(l));
      const lane = entries.find((e) => e.ref === world.state.laneCommit);
      assert.ok(lane, 'the lane commit is not in the ledger');
      assert.strictEqual(lane.mode, 'auto');
      assert.ok(entries.filter((e) => e.mode === 'auto').length === 1, 'a person\'s commit was recorded as the lane\'s');
    },
  },
];
