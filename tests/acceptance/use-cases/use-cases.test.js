'use strict';
// ACCEPTANCE — the use-case scenarios of docs/USE-CASES.md that run OFFLINE, each
// through the REAL command line (`bin/agsc.js`) exactly as the document prints the
// commands.
//
// Deterministic: a fixed build instant, no network, no git identity (HOME and the
// global git configuration point at empty scratch files), scratch Bundles under
// `os.tmpdir()`. Every command runs under the network trap of `../steps/_offline.js`,
// which refuses and records every network call; a command that recorded one fails its
// step, even when it caught the refusal and went on. The scenarios that need a forge, a model, a live peer or a browser
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
const OFFLINE = path.join(ROOT, 'tests', 'acceptance', 'steps', '_offline.js');

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
const TRAP = path.join(HOME, 'network-attempts.txt');
const ENV = {
  ACCEPTANCE_NETWORK_TRAP: TRAP,
  GIT_CONFIG_GLOBAL: path.join(HOME, '.gitconfig-empty'),
  GIT_CONFIG_NOSYSTEM: '1',
  HOME,
  NODE_OPTIONS: `--require ${JSON.stringify(OFFLINE)}`,
  NO_COLOR: '1',
  PATH: process.env.PATH,
  SOURCE_DATE_EPOCH: EPOCH,
};

/**
 * Run one command line in `cwd`; return `{status, stdout, stderr}`. Throws when the
 * command recorded a network attempt (the record is cleared once reported).
 */
function sh(cwd, script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', env: ENV });
  const attempts = fs.existsSync(TRAP) ? fs.readFileSync(TRAP, 'utf8').split('\n').filter(Boolean) : [];
  fs.rmSync(TRAP, { force: true });
  if (attempts.length > 0) throw new Error(`${path.basename(script)} ${args.join(' ')} reached for the network: ${attempts.join(', ')}`);
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

/** Every file under `dir`, relative, with its text, in code-point order (empty when absent). */
function tree(dir) {
  const out = new Map();
  const walk = (sub) => {
    for (const name of fs.readdirSync(path.join(dir, sub)).sort()) {
      const rel = sub === '' ? name : `${sub}/${name}`;
      if (fs.statSync(path.join(dir, rel)).isDirectory()) walk(rel);
      else out.set(rel, fs.readFileSync(path.join(dir, rel), 'utf8'));
    }
  };
  if (fs.existsSync(dir)) walk('');
  return out;
}

/** The same node checked out again with no item yet: its configuration, root document and contact. */
function emptied(dir) {
  const copy = temp('agsc-uc-copy-');
  for (const at of ['agsc.config.json', 'content/index.md', '.well-known/security.txt']) {
    fs.mkdirSync(path.dirname(path.join(copy, at)), { recursive: true });
    fs.copyFileSync(path.join(dir, at), path.join(copy, at));
  }
  return copy;
}

/** An item file as {frontmatter, body}, with the `prov.source_version` an import adds removed. */
function authored(text) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/u.exec(text);
  assert.ok(m, 'the file has no frontmatter block');
  const frontmatter = require('yaml').parse(m[1]);
  if (frontmatter.prov) delete frontmatter.prov.source_version;
  return { body: m[2].replace(/^\n+/u, ''), frontmatter };
}

/** Assert that every item of `back` came back as `source` holds it, plus the source's content version. */
function cameBack(source, back, version = '0.0.0+20260101T000000Z') {
  const items = [...tree(path.join(back, 'content')).entries()].filter(([at]) => at !== 'index.md');
  assert.ok(items.length > 0, 'nothing came back');
  for (const [at, text] of items) {
    assert.match(text, new RegExp(`^ {2}source_version: ${version.replace(/[+.]/gu, '\\$&')}$`, 'mu'), at);
    assert.deepStrictEqual(authored(text), authored(read(source, `content/${at}`)), at);
  }
  return items.map(([at]) => at);
}

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

test('L6 — an agent kit and the node, both ways: export into GABBE, read the kit back', () => {
  const dir = bundle();
  const r = agsc(dir, 'export', '--to', 'gabbe');
  assert.strictEqual(r.status, 0, r.stderr);
  const kit = path.join(dir, 'dist', 'export', 'gabbe');
  const files = [...tree(kit).keys()];
  assert.ok(files.includes('agents/guides/agsc/steering.md'), files.join(', '));
  for (const slug of ['agent-patterns', 'handoff', 'supervisor']) {
    assert.ok(files.includes(`agents/memory/semantic/agsc/${slug}.md`), `${slug} is not semantic memory`);
  }
  for (const [at, text] of tree(kit)) assert.match(text, /<!-- agsc:provenance\n/u, `${at} has no provenance block`);
  // Back from the kit: the plan first, then the import, then the same import again.
  const copy = emptied(dir);
  const plan = agsc(copy, 'import', '--from', 'gabbe', kit, '--dry-run');
  assert.strictEqual(plan.status, 0, plan.stderr);
  assert.ok(!fs.existsSync(path.join(copy, 'content', 'concepts')), 'the plan wrote an item');
  const back = agsc(copy, 'import', '--from', 'gabbe', kit);
  assert.strictEqual(back.status, 0, back.stderr);
  assert.deepStrictEqual(cameBack(dir, copy), ['clusters/agent-patterns.md', 'concepts/handoff.md', 'concepts/supervisor.md']);
  assert.match(agsc(copy, 'import', '--from', 'gabbe', kit).stderr, /import: 0 written, 0 replaced, 3 unchanged/u);
  assert.strictEqual(agsc(copy, 'build').status, 0);
});

test('L7 — a skills collection becomes procedures, and the packs of the node go back out as a collection', () => {
  const dir = bundle();
  // `git clone` is the person's step; the engine reads the local clone and fetches nothing.
  fs.cpSync(path.join(ROOT, 'tests', 'fixtures', 'skills-marketplace'), path.join(dir, 'clone'), { recursive: true });
  const before = tree(path.join(dir, 'content'));
  const list = agsc(dir, 'import', '--from', 'skills', '--list', 'clone');
  assert.strictEqual(list.status, 0, list.stderr);
  assert.match(list.stderr, /\[marketplace\] skill csv-helper skills\/csv-helper\/SKILL\.md licence Apache-2\.0[^\n]*-> importable/u);
  assert.strictEqual(agsc(dir, 'import', '--from', 'skills', 'clone', '--dry-run').status, 0);
  assert.deepStrictEqual(tree(path.join(dir, 'content')), before, 'the plan wrote something');
  const imported = agsc(dir, 'import', '--from', 'skills', 'clone');
  assert.strictEqual(imported.status, 0, imported.stderr);
  const procedure = read(dir, 'content/procedures/csv-helper.md');
  assert.match(procedure, /^type: procedure$/mu);
  assert.match(procedure, /^x-skills-layout: marketplace$/mu);
  assert.match(procedure, /^x-skills-license: Apache-2\.0/mu);
  assert.match(agsc(dir, 'import', '--from', 'skills', 'clone').stderr, /import: 0 written, 0 replaced, 1 unchanged/u);
  // Out again, in a layout another tool reads; and that folder read back loses nothing.
  const out = agsc(dir, 'export', '--to', 'skills', '--layout', 'marketplace');
  assert.strictEqual(out.status, 0, out.stderr);
  const exported = path.join(dir, 'dist', 'export', 'skills', 'marketplace');
  assert.ok(fs.existsSync(path.join(exported, '.claude-plugin', 'marketplace.json')));
  const copy = emptied(dir);
  const back = agsc(copy, 'import', '--from', 'skills', exported);
  assert.strictEqual(back.status, 0, back.stderr);
  assert.deepStrictEqual(cameBack(dir, copy), ['clusters/agent-patterns.md', 'concepts/handoff.md', 'concepts/supervisor.md']);
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

test('M7 — a board comes in from the export file of a tracker, is published, and goes back out', () => {
  const dir = bundle();
  fs.cpSync(path.join(ROOT, 'tests', 'fixtures', 'pm-jira'), path.join(dir, 'from-jira'), { recursive: true });
  const before = tree(path.join(dir, 'content'));
  const plan = agsc(dir, 'import', '--from', 'board', '--format', 'jira', './from-jira', '--dry-run');
  assert.strictEqual(plan.status, 0, plan.stderr);
  assert.match(plan.stderr, /import: --dry-run: 4 file\(s\) would be written/u);
  assert.deepStrictEqual(tree(path.join(dir, 'content')), before, 'the plan wrote something');
  const imported = agsc(dir, 'import', '--from', 'board', '--format', 'jira', './from-jira');
  assert.strictEqual(imported.status, 0, imported.stderr);
  const added = [...tree(path.join(dir, 'content')).keys()].filter((at) => !before.has(at));
  assert.deepStrictEqual(added, ['clusters/apollo.md', 'concepts/choose-the-storage.md', 'concepts/set-up-the-board.md',
    'concepts/sum-a1.md']);
  // Every row is a draft until a person publishes it; the person does, here, for all of them.
  for (const at of added) {
    const text = read(dir, `content/${at}`);
    assert.match(text, /^status: draft$/mu, at);
    fs.writeFileSync(path.join(dir, 'content', at), text.replace(/^status: draft\n/mu, ''));
  }
  assert.strictEqual(agsc(dir, 'build').status, 0);
  assert.deepStrictEqual(JSON.parse(read(dir, 'www/boards/index.json')).boards.map((b) => b.cluster), ['apollo']);
  const out = agsc(dir, 'export', '--to', 'board', '--format', 'jira');
  assert.strictEqual(out.status, 0, out.stderr);
  assert.deepStrictEqual(fs.readdirSync(path.join(dir, 'dist', 'export', 'board', 'jira')), ['apollo.csv']);
  // Our own import reads that file back exactly.
  const copy = emptied(dir);
  const back = agsc(copy, 'import', '--from', 'board', '--format', 'jira', path.join(dir, 'dist', 'export', 'board', 'jira'));
  assert.strictEqual(back.status, 0, back.stderr);
  assert.deepStrictEqual(cameBack(dir, copy), added);
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

test('every command of this file runs under the network trap: an attempt it ignored still fails the step', () => {
  assert.match(ENV.NODE_OPTIONS || '', /--require\s+\S*_offline\.js/u, 'the commands here do not load steps/_offline.js');
  // Loopback port 9: nothing listens there, and nothing leaves the machine.
  const swallowed = "try { require('node:net').connect(9, '127.0.0.1').on('error', () => {}); } catch (e) { /* ignored */ }";
  assert.throws(() => sh(ROOT, '-e', [swallowed]), /reached for the network: net\.connect/u);
  // The record is cleared once reported, so the next command starts clean.
  assert.strictEqual(agsc(bundle(), 'lint').status, 0);
});

test('docs/USE-CASES.md: every scenario is present, and each says how it is proven', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'docs', 'USE-CASES.md'), 'utf8');
  const ids = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6',
    'M7', 'M8'];
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
  // The count in the introduction is the number of sections.
  const words = { 21: 'Twenty-one' };
  assert.match(doc, new RegExp(`^${words[ids.length]} concrete scenarios`, 'mu'));
  // Every use case whose offline part runs here says so.
  for (const id of ['L6', 'L7', 'M7']) {
    const section = doc.split(new RegExp(`^### ${id} — `, 'mu'))[1].split(/^### /mu)[0];
    assert.match(section, /\*\*Proven by:\*\* `tests\/acceptance\/use-cases\/use-cases\.test\.js`/u, `${id} is not proven here`);
  }
});
