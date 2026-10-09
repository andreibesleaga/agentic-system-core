'use strict';
// verifies AGSC-01-36, AGSC-08-20, AGSC-08-30
// Steps of features/persona-k-live-board.feature that run offline. An agent lane
// works the board as a client of the real local tool server (`agsc mcp`, reached
// through the official SDK client): every call hands back a prepared Proposal, a
// person applies the patch with git and commits it, and the build derives who holds
// each task from that history. The lane run of `refresh --agent <name> --dry-run`
// calls no model, so its stop conditions run here too. What needs a forge (the
// auto-merge job) or a model (a planner writing items) is pending. The Background
// is a live board and an agent lane a person declared, accepted by lint.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { EPOCH, built } = require('./_world.js');

const REL = 'content/concepts';
/** The calendar month of the fixed build instant (AGSC-08-25 counts that month). */
const MONTH_START = new Date(Number(EPOCH) * 1000).toISOString().replace(/\.\d{3}Z$/u, 'Z');

/** The AGSC-08-18 envelope a tool call returned, as plain data. */
async function callTool(world, name, args) {
  // The server loads the Bundle once when it starts, so each call starts its own
  // server over the Bundle as it is now (what was applied and committed included).
  const client = await world.mcp({ offline: true });
  const result = await client.callTool({ arguments: args, name });
  return result.structuredContent;
}

/** One task's line of the board export. */
function boardTask(world, slug) {
  const board = JSON.parse(world.read('www/boards/sprint-1.json'));
  const found = board.tasks.find((t) => t.slug === slug);
  assert.ok(found, `the board export holds no task ${slug}: ${JSON.stringify(board)}`);
  return found;
}

/** `git apply` a prepared patch, kept outside the Bundle so it is never committed. */
function applyPatch(world, patch) {
  const file = path.join(world.home, 'prepared.patch');
  fs.writeFileSync(file, patch);
  world.git(['apply', file]);
}

/** Claim a task through the tool server, apply the patch and commit it as the lane. */
async function claimAndMerge(world, lane, slug, state) {
  const result = await callTool(world, 'propose', { agent: lane, slug, task_state: state });
  assert.strictEqual(result.type, 'proposal', JSON.stringify(result));
  applyPatch(world, result.body.patch);
  world.commit(`Move ${slug} to ${state}`, [`Channel-Auto: ${lane}`]);
}

/** One Episode of a lane's run this month, with the spend its usage records. */
function episode(world, lane, cost) {
  world.write(`content/episodes/${lane}-run-this-month.md`, ['---', 'type: episode',
    `title: A run of the ${lane} lane this month`,
    `description: One run of the ${lane} agent lane, recorded with the spend its usage carries.`,
    `actor: process:${lane}`, `started: "${MONTH_START}"`, 'outcome: partial',
    'usage:', '  model: example-model-1', '  tokens_in: 0', '  tokens_out: 0', `  cost_usd: ${cost}`, '  estimate: true',
    'prov:', '  origin: ai-generated', `  agent: ${lane}`, '  model: example-model-1', '  operator: human:alice',
    '---', '', '## What happened', '', `The ${lane} lane ran once this month.`, ''].join('\n'));
}

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
  {
    pattern: /^the agent "([a-z-]+)" calls propose for "(task-[a-z])" with task_state "(TASK_STATE_[A-Z_]+)" through the tool server$/u,
    async run(world, lane, slug, state) {
      world.state.before = world.snapshot('content');
      world.state.slug = slug;
      world.state.result = await callTool(world, 'propose', { agent: lane, slug, task_state: state });
    },
  },
  {
    pattern: 'the prepared Proposal\'s patch changes only task_state and modified of "task-a", and the tool server wrote nothing (AGSC-10-17)',
    run(world) {
      const { result } = world.state;
      assert.strictEqual(result.type, 'proposal', JSON.stringify(result));
      assert.strictEqual(result.body.path, `${REL}/task-a.md`);
      // AGSC-10-17: the claim's diff touches task_state, modified and nothing else of
      // the task; the provenance of a lane's run belongs to the Episode, not the task.
      const changed = result.body.patch.split('\n')
        .filter((l) => /^[-+]/u.test(l) && !/^(?:---|\+\+\+) /u.test(l));
      assert.ok(changed.includes('+task_state: TASK_STATE_WORKING'), result.body.patch);
      for (const line of changed) assert.match(line, /^[-+](?:task_state|modified): /u, result.body.patch);
      // The tool server prepares; it never writes (AGSC-08-28 b).
      assert.deepStrictEqual(world.snapshot('content'), world.state.before);
    },
  },
  {
    pattern: 'the operator applies the prepared patch with git apply',
    run(world) {
      const { result } = world.state;
      assert.strictEqual(result.type, 'proposal', JSON.stringify(result));
      applyPatch(world, result.body.patch);
    },
  },
  {
    pattern: /^"\/boards\/sprint-1\.json" shows "(task-[a-z])" with state "(TASK_STATE_[A-Z_]+)" and claimed_by "([^"]+)" \(AGSC-10-13\)$/u,
    run(world, slug, state, holder) {
      const task = boardTask(world, slug);
      assert.strictEqual(task.state, state, JSON.stringify(task));
      assert.strictEqual(task.claimed_by, holder, JSON.stringify(task));
    },
  },
  {
    pattern: /^the agent "([a-z-]+)" calls remember with kind "([a-z]+)" through the tool server$/u,
    async run(world, lane, kind) {
      world.state.before = world.snapshot('content');
      world.state.result = await callTool(world, 'remember', {
        agent: lane, body: 'Roll back first, then redeploy.', kind, title: 'Deploy the release',
      });
    },
  },
  {
    pattern: /^the tool server refuses it with "(AGSC-E\d{3})" and prepares nothing \((AGSC-\d{2}-\d{2})\)$/u,
    run(world, code) {
      const { result } = world.state;
      assert.strictEqual(result.type, 'error', JSON.stringify(result));
      assert.strictEqual(result.body.code, code, JSON.stringify(result));
      assert.ok(!('patch' in result.body) && !('frontmatter' in result.body), JSON.stringify(result));
      assert.deepStrictEqual(world.snapshot('content'), world.state.before);
    },
  },
  {
    pattern: 'the same procedure from the person "human:alice" is prepared, and a gate is refused to every caller (AGSC-10-18)',
    async run(world) {
      // The slow lane stays a person's: the same item, asked for by the operator
      // with no agent, is a Proposal a person reviews.
      const person = await callTool(world, 'remember', {
        body: 'Roll back first, then redeploy.', kind: 'procedure', operator: 'human:alice', title: 'Deploy the release',
      });
      assert.strictEqual(person.type, 'proposal', JSON.stringify(person));
      assert.strictEqual(person.body.path, 'content/procedures/deploy-the-release.md');
      assert.strictEqual(person.body.frontmatter.prov.operator, 'human:alice');
      // A Gate's Level is a governance decision: no tool call files one (AGSC-09-14b).
      for (const caller of [{ agent: 'worker' }, { operator: 'human:alice' }]) {
        const gate = await callTool(world, 'remember', { ...caller, body: 'x', kind: 'gate', title: 'Release gate' });
        assert.strictEqual(gate.type, 'error', JSON.stringify(gate));
        assert.strictEqual(gate.body.code, 'AGSC-E203', JSON.stringify(gate));
      }
    },
  },
  {
    pattern: '"worker" already holds "task-a" in "TASK_STATE_WORKING" and max_claims is 1',
    async run(world) {
      const lane = JSON.parse(world.read('agsc.config.json')).agents.find((a) => a.name === 'worker');
      // AGSC-01-36: max_claims defaults to one.
      assert.ok(lane.max_claims === undefined || lane.max_claims === 1, JSON.stringify(lane));
      world.commitAll('Open the sprint-1 board');
      await claimAndMerge(world, 'worker', 'task-a', 'TASK_STATE_WORKING');
      built(world, { offline: true });
      assert.strictEqual(boardTask(world, 'task-a').claimed_by, 'process:worker');
    },
  },
  {
    pattern: /^the episodes of "([a-z-]+)" this month sum to usage cost_usd (\d+)$/u,
    run(world, lane, cost) {
      episode(world, lane, Number(cost));
      lintClean(world);
    },
  },
  {
    pattern: /^agsc\.config\.json has budget\.usd_month (\d+)$/u,
    run(world, cap) {
      config(world, (c) => {
        c.budget = { usd_month: Number(cap) };
      });
      lintClean(world);
    },
  },
  {
    pattern: /^a \.env file in the Bundle root, ignored by git, sets "(AGSC_[A-Z_]+)" to "([^"]+)"$/u,
    run(world, name, value) {
      // AGSC-01-37: the .env file is read from the Bundle root and never committed.
      world.write('.gitignore', '.env\n');
      world.write('.env', `${name}=${value}\n`);
      world.state.dotenv = { name, value };
    },
  },
  {
    pattern: 'the output never carries the value the .env file gave "AGSC_BUDGET_USD_MONTH" (AGSC-01-37)',
    run(world) {
      const { name, value } = world.state.dotenv;
      const out = `${world.last.stdout}${world.last.stderr}`;
      assert.ok(!out.includes(`${name}=`), out);
      // No JSON value anywhere in the envelope is the override's value.
      const values = [];
      const walk = (v) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v !== null && typeof v === 'object') Object.values(v).forEach(walk);
        else values.push(String(v));
      };
      walk(world.json());
      assert.ok(!values.includes(value), `the value ${value} of ${name} is printed: ${out}`);
      for (const line of out.split('\n').filter((l) => l.includes(name))) {
        assert.ok(!line.includes(value), `the line naming ${name} carries its value: ${line}`);
      }
    },
  },
  {
    pattern: /^every task of "sprint-1" is in "(TASK_STATE_[A-Z_]+)"$/u,
    run(world, state) {
      task(world, 'task-a', state);
      task(world, 'task-b', state);
      lintClean(world);
    },
  },
  {
    pattern: '"/boards/sprint-1.json" carries done true (AGSC-10-13)',
    run(world) {
      assert.strictEqual(JSON.parse(world.read('www/boards/sprint-1.json')).done, true);
    },
  },
  {
    pattern: '"now.md" and "now/index.html" of the built node name "AGSC-E510" (AGSC-08-28)',
    run(world) {
      for (const page of ['www/now.md', 'www/now/index.html']) {
        assert.ok(world.read(page).includes('AGSC-E510'), `${page} does not name AGSC-E510`);
      }
    },
  },
  {
    pattern: 'the Bundle has no git history and its security.txt leaves Expires to the build',
    run(world) {
      // AGSC-04-09: with no git history and no SOURCE_DATE_EPOCH the build instant
      // defaults to 0, and a build that must derive the security contact's Expires
      // from that instant refuses (AGSC-E204); an authored Expires would let it pass.
      assert.ok(!world.exists('.git'), 'the Bundle is a git repository');
      const rel = '.well-known/security.txt';
      world.write(rel, world.read(rel).split('\n').filter((l) => !l.startsWith('Expires:')).join('\n'));
    },
  },
];
