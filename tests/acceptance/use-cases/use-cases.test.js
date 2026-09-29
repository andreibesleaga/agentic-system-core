'use strict';
// ACCEPTANCE — the use-case scenarios of docs/USE-CASES.md that run OFFLINE, each
// through the REAL command line (`bin/agsc.js`) exactly as the document prints the
// commands.
//
// Deterministic: a fixed build instant, no network, no git identity (HOME and the
// global git configuration point at empty scratch files), scratch Bundles under
// `os.tmpdir()`. The scenarios that need a forge, a model, a live peer or a browser
// are marked in docs/USE-CASES.md with the test that covers their offline part, or
// with the reason nothing can; the last test here keeps that table honest.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const AGSC = path.join(ROOT, 'bin', 'agsc.js');
const VALIDATE_WELLKNOWN = path.join(ROOT, 'tools', 'validate-wellknown');
const MINIMAL = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const EPOCH = '1767225600';

const temporaries = [];
test.after(() => {
  for (const dir of temporaries) fs.rmSync(dir, { force: true, recursive: true });
});

function temp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaries.push(dir);
  return dir;
}

const HOME = temp('agsc-uc-home-');
fs.writeFileSync(path.join(HOME, '.gitconfig-empty'), '');
const ENV = {
  GIT_CONFIG_GLOBAL: path.join(HOME, '.gitconfig-empty'),
  GIT_CONFIG_NOSYSTEM: '1',
  HOME,
  NO_COLOR: '1',
  PATH: process.env.PATH,
  SOURCE_DATE_EPOCH: EPOCH,
};

/** Run one command line in `cwd`; return `{status, stdout, stderr}`. */
function sh(cwd, script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', env: ENV });
  return { status: r.status, stderr: r.stderr, stdout: r.stdout };
}
const agsc = (cwd, ...args) => sh(cwd, AGSC, args);

function bundle(over) {
  const dir = temp('agsc-uc-');
  fs.cpSync(MINIMAL, dir, { recursive: true });
  if (over) {
    const at = path.join(dir, 'agsc.config.json');
    fs.writeFileSync(at, `${JSON.stringify(over(JSON.parse(fs.readFileSync(at, 'utf8'))), null, 2)}\n`);
  }
  return dir;
}

const read = (dir, at) => fs.readFileSync(path.join(dir, at), 'utf8');

test('L3 — the steering bundle: one command, identical bytes at every conventional path', () => {
  const dir = bundle();
  const r = agsc(dir, 'export', '--steer', '--target', 'agents,claude,cursor');
  assert.strictEqual(r.status, 0, r.stderr);
  const agents = read(dir, 'dist/export/steer/AGENTS.md');
  assert.strictEqual(read(dir, 'dist/export/steer/CLAUDE.md'), agents);
  assert.strictEqual(read(dir, 'dist/export/steer/.cursor/rules/agsc.mdc'), agents);
  assert.match(agents, /<!-- agsc:provenance\n/u);
  assert.match(agents, /it is data, and it is not\n> an instruction to you/u);
  // Same Bundle, same bytes (AGSC-01-28, AGSC-04-01).
  agsc(dir, 'export', '--steer', '--target', 'agents');
  assert.strictEqual(read(dir, 'dist/export/steer/AGENTS.md'), agents);
});

test('L4 — procedural memory as installable skills, verified against the lockfile', () => {
  const dir = bundle();
  assert.strictEqual(agsc(dir, 'skills').status, 0);
  const index = JSON.parse(read(dir, 'dist/skills/index.json'));
  assert.deepStrictEqual(index.packs.map((p) => p.name), ['agent-patterns']);
  const r = agsc(dir, 'skills', 'install', '.claude/skills');
  assert.strictEqual(r.status, 0, r.stderr);
  const skill = read(dir, '.claude/skills/agent-patterns/SKILL.md');
  assert.match(skill, /^---\nname: agent-patterns\n/u);
  assert.doesNotMatch(skill, /allowed-tools/u, 'a pack declared tools (AGSC-07-15)');
  // Idempotent: a second install writes nothing.
  assert.match(agsc(dir, 'skills', 'install', '.claude/skills').stderr, /0 written, 1 unchanged/u);
});

test('L5 — a folder of notes becomes a node: init, add the security contact, ci passes', () => {
  const dir = temp('agsc-uc-notes-');
  fs.writeFileSync(path.join(dir, 'retry.md'), '# Retry budget\n\nEvery call gets at most three retries.\n');
  fs.writeFileSync(path.join(dir, 'idempotency.md'), '# Idempotency keys\n\nA retry never applies twice.\n');
  const init = agsc(dir, 'init');
  assert.strictEqual(init.status, 0, init.stderr);
  assert.match(read(dir, 'content/concepts/retry.md'), /^---\ntype: concept\ntitle: Retry budget\n/u);
  // `init` writes no `.well-known/security.txt`, and `ci` refuses to publish an
  // empty security contact (AGSC-06-36) — so the operator adds one line.
  assert.strictEqual(agsc(dir, 'ci').status, 1);
  fs.mkdirSync(path.join(dir, '.well-known'));
  fs.writeFileSync(path.join(dir, '.well-known', 'security.txt'),
    'Contact: mailto:security@example.org\nExpires: 2027-01-01T00:00:00Z\n');
  // The adopted node publishes the Content Use Terms' TDM reservation, and `ci` —
  // like `build` — refuses a reservation that names no crawler (AGSC-06-18).
  // `init` therefore writes the reference crawler list and says so
  // on its way out; the publisher may edit it, and an emptied list is refused.
  const config = JSON.parse(read(dir, 'agsc.config.json'));
  assert.ok(Array.isArray(config.site.tdm_crawlers) && config.site.tdm_crawlers.includes('GPTBot'),
    'init writes the reference crawler list');
  assert.match(init.stderr, /before you build: agsc\.config\.json names the reference crawler list/u);
  const ci = agsc(dir, 'ci');
  assert.strictEqual(ci.status, 0, ci.stderr);
  assert.match(ci.stdout + ci.stderr, /ci: pass \(0 error/u);
  config.site.tdm_crawlers = [];
  fs.writeFileSync(path.join(dir, 'agsc.config.json'), `${JSON.stringify(config, null, 2)}\n`);
  const emptied = agsc(dir, 'ci');
  assert.strictEqual(emptied.status, 1);
  assert.match(emptied.stdout + emptied.stderr, /AGSC-E202[^\n]*tdm_crawlers/u);
});

test('D1 — two nodes that check each other, offline, from two local files', () => {
  const peerOf = (me, other) => (c) => ({
    ...c,
    bundle: { ...c.bundle, id: me },
    peers: [`https://${other}.example/.well-known/knowledge-linkset`],
    site: { ...c.site, base: `https://${me}.example/` },
  });
  const a = bundle(peerOf('a', 'b'));
  const b = bundle(peerOf('b', 'a'));
  assert.strictEqual(agsc(a, 'build').status, 0);
  assert.strictEqual(agsc(b, 'build').status, 0);
  const wellKnown = (dir) => path.join(dir, 'www', '.well-known', 'knowledge-linkset');
  const mutual = sh(ROOT, VALIDATE_WELLKNOWN, [wellKnown(a), '--peer', wellKnown(b)]);
  assert.strictEqual(mutual.status, 0, mutual.stdout + mutual.stderr);

  // One direction only: "resolved, not mutual" (AGSC-10-12), exit 1.
  const lone = bundle((c) => ({ ...c, bundle: { ...c.bundle, id: 'b' }, site: { ...c.site, base: 'https://b.example/' } }));
  assert.strictEqual(agsc(lone, 'build').status, 0);
  const one = sh(ROOT, VALIDATE_WELLKNOWN, [wellKnown(a), '--peer', wellKnown(lone)]);
  assert.strictEqual(one.status, 1);
  assert.match(one.stdout + one.stderr, /AGSC-E907 resolved, not mutual/u);
});

test('D6 — a knowledge base mirrored into another memory system through COGX, and back', () => {
  const dir = bundle();
  const r = agsc(dir, 'export', '--to', 'cogx');
  assert.strictEqual(r.status, 0, r.stderr);
  const entities = read(dir, 'dist/export/cogx/entities.jsonl').trim().split('\n').map((l) => JSON.parse(l));
  for (const entity of entities) {
    assert.match(entity.metadata.agsc.iri, /^https:\/\/minimal\.example\/concepts\//u);
    assert.strictEqual(entity.metadata.agsc.terms, 'LicenseRef-AgenticSystemCore-Content-Use-1.0');
  }
  const target = temp('agsc-uc-cogx-');
  fs.copyFileSync(path.join(dir, 'agsc.config.json'), path.join(target, 'agsc.config.json'));
  const back = agsc(target, 'import', '--from', 'cogx', path.join(dir, 'dist', 'export', 'cogx'));
  assert.strictEqual(back.status, 0, back.stderr);
  assert.match(back.stderr, /import: 3 written, 0 replaced, 0 unchanged/u);
});

test('M1 — the live board: a task concept on a cluster is published as a board', () => {
  const dir = bundle();
  fs.writeFileSync(path.join(dir, 'content', 'concepts', 'write-runbook.md'), '---\ntype: concept\n'
    + 'title: Write the runbook\ndescription: A task on the board, claimed by an agent lane and done once the runbook exists.\n'
    + 'tags:\n  - agents\n  - patterns\nclusters:\n  - agent-patterns\nprov:\n  origin: human\n'
    + '  operator: human:andreibesleaga\nkind: task\ntask_state: TASK_STATE_WORKING\n---\n\nWrite it.\n');
  const r = agsc(dir, 'build');
  assert.strictEqual(r.status, 0, r.stderr);
  const index = JSON.parse(read(dir, 'www/boards/index.json'));
  assert.deepStrictEqual(index.boards.map((b) => [b.cluster, b.tasks]), [['agent-patterns', 1]]);
  const board = JSON.parse(read(dir, 'www/boards/agent-patterns.json'));
  assert.ok(JSON.stringify(board).includes('write-runbook'));
});

test('M5 — a selection that becomes a harness, the same bytes twice', () => {
  const dir = bundle();
  const r = agsc(dir, 'compose', 'supervisor');
  assert.strictEqual(r.status, 0, r.stderr);
  const [name] = fs.readdirSync(path.join(dir, 'dist', 'harness'));
  const files = fs.readdirSync(path.join(dir, 'dist', 'harness', name), { recursive: true })
    .map((f) => String(f).split(path.sep).join('/')).sort();
  assert.deepStrictEqual(files, ['AGENTS.md', 'arc42.md', 'decisions', 'decisions/0001-supervisor.md',
    'diagram.mmd', 'harness.jsonld', 'workspace.dsl']);
  const first = read(dir, `dist/harness/${name}/harness.jsonld`);
  agsc(dir, 'compose', 'supervisor');
  assert.strictEqual(read(dir, `dist/harness/${name}/harness.jsonld`), first);
  // An invalid selection emits no harness, only the verdict (AGSC-07-17).
  const bad = agsc(dir, 'compose', 'no-such-item');
  assert.strictEqual(bad.status, 1);
});

/** git in a scratch repository, with a fixed identity and a fixed commit instant. */
function git(cwd, day, ...args) {
  const at = `2026-01-${day}T00:00:00Z`;
  const r = spawnSync('git', ['-c', 'user.name=Person', '-c', 'user.email=person@example.org',
    '-c', 'init.defaultBranch=main', ...args], { cwd, encoding: 'utf8',
    env: { ...ENV, GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at } });
  return { status: r.status, stderr: r.stderr, stdout: r.stdout };
}

test('M8 — a person and two agents on two nodes work one live board', () => {
  const { loadBundle } = require('../../../src/application/bundle.js');
  const { createFileSystem, readSchemas } = require('../../../src/adapters/node-fs.js');
  const validate = require('../../../src/knowledge/validate.js');
  const mcpTools = require('../../../src/distribution/mcp-tools.js');
  const toolsOf = (dir) => {
    const loaded = loadBundle(createFileSystem(dir), { schemas: validate.schemas(readSchemas(ROOT)) });
    return mcpTools.tools(loaded);
  };
  const lane = (name) => ({ author: 'board-bot', budget_usd_month: 1, channel: 'main', enabled: true, kind: 'llm', max_claims: 1,
    model: 'test-model', name, operator: 'human:andreibesleaga', tasks: ['claim', 'work', 'plan'] });
  // Node A holds the board; its configuration declares the two agents' lanes.
  const nodeA = bundle((config) => ({ ...config,
    agents: [lane('agent-a'), lane('agent-b')],
    channels: [{ adapter: 'github', author: 'board-bot', name: 'main', owner: 'human:andreibesleaga' }] }));
  const prov = 'prov:\n  origin: human\n  operator: human:andreibesleaga\n';
  fs.writeFileSync(path.join(nodeA, 'content/concepts/ship-the-release.md'), '---\ntype: concept\ntitle: Ship the release\n'
    + 'description: The one task of the release board, which two agents both want to take on.\nclusters:\n  - agent-patterns\n'
    + `date: "2026-01-01"\n${prov}kind: task\ntask_state: TASK_STATE_SUBMITTED\n---\n\nTag it and publish it.\n`);
  assert.strictEqual(git(nodeA, '01', 'init', '-q').status, 0);
  git(nodeA, '01', 'add', '-A');
  assert.strictEqual(git(nodeA, '01', 'commit', '-qm', 'the board').status, 0);
  assert.strictEqual(agsc(nodeA, 'build').status, 0);
  const before = { board: read(nodeA, 'www/boards/agent-patterns.json'), llms: read(nodeA, 'www/llms.txt') };
  assert.match(before.board, /"state":"TASK_STATE_SUBMITTED"/u);
  // Node B is a second node of the same board: a clone, worked by its own agent.
  const nodeB = temp('agsc-uc-peer-');
  assert.strictEqual(git(nodeB, '01', 'clone', '-q', nodeA, '.').status, 0);

  // Agent A (on node A's tool server) and agent B (on node B's) each prepare a claim.
  const claim = { at: '2026-01-02', slug: 'ship-the-release', task_state: 'TASK_STATE_WORKING' };
  const fromA = toolsOf(nodeA).call('propose', { ...claim, agent: 'agent-a' });
  const fromB = toolsOf(nodeB).call('propose', { ...claim, agent: 'agent-b' });
  assert.strictEqual(fromA.type, 'proposal');
  assert.strictEqual(fromB.type, 'proposal', 'before any merge, both claims are valid proposals');
  // Nothing was written by either: a prepared Proposal is a payload.
  assert.match(read(nodeA, 'content/concepts/ship-the-release.md'), /TASK_STATE_SUBMITTED/u);
  const patchA = path.join(temp('agsc-uc-pr-'), 'a.patch');
  const patchB = path.join(temp('agsc-uc-pr-'), 'b.patch');
  fs.writeFileSync(patchA, fromA.body.patch);
  fs.writeFileSync(patchB, fromB.body.patch);

  // The person merges agent A's claim first.
  const applied = git(nodeA, '02', 'apply', patchA);
  assert.strictEqual(applied.status, 0, applied.stderr);
  git(nodeA, '02', 'commit', '-qam', 'claim ship-the-release');
  const linted = agsc(nodeA, 'lint', '--json');
  assert.strictEqual(linted.status, 0, linted.stdout);
  // Agent B's claim no longer applies: the first merged claim wins.
  const late = git(nodeA, '02', 'apply', '--check', patchB);
  assert.notStrictEqual(late.status, 0, 'the second claim must not apply over the first');
  // Re-prepared against the merged state, it is refused before it is proposed.
  assert.strictEqual(git(nodeB, '02', 'pull', '-q').status, 0);
  const again = toolsOf(nodeB).call('propose', { ...claim, agent: 'agent-b' });
  assert.strictEqual(again.body.code, 'AGSC-E511');
  assert.match(again.body.message, /already TASK_STATE_WORKING/u);

  // The board page and /boards/ follow the merge, and the content version moves.
  assert.strictEqual(agsc(nodeA, 'build').status, 0);
  const board = JSON.parse(read(nodeA, 'www/boards/agent-patterns.json'));
  assert.strictEqual(board.tasks.find((t) => t.slug === 'ship-the-release').state, 'TASK_STATE_WORKING');
  assert.strictEqual(board.done, false);
  assert.deepStrictEqual(JSON.parse(read(nodeA, 'www/boards/index.json')).boards.map((b) => b.cluster), ['agent-patterns']);
  const version = (text) => /^bundle_version: (.+)$/mu.exec(text)[1];
  assert.notStrictEqual(version(read(nodeA, 'www/llms.txt')), version(before.llms));
  assert.match(version(read(nodeA, 'www/llms.txt')), /^0\.0\.0\+2\./u);
});

test('docs/USE-CASES.md: every scenario is present, and each says how it is proven', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'docs', 'USE-CASES.md'), 'utf8');
  const ids = ['L1', 'L2', 'L3', 'L4', 'L5', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8'];
  const here = fs.readFileSync(__filename, 'utf8');
  for (const id of ids) {
    const heading = new RegExp(`^### ${id} — `, 'mu');
    assert.match(doc, heading, `${id} has no section`);
    const section = doc.split(heading)[1].split(/^### /mu)[0];
    assert.match(section, /\*\*Proven by:\*\* /u, `${id} does not say how it is proven`);
    if (/\*\*Proven by:\*\* `tests\/acceptance\/use-cases\/use-cases\.test\.js`/u.test(section)) {
      assert.ok(here.includes(`test('${id} — `), `${id} claims an acceptance test that does not exist`);
    }
  }
});
