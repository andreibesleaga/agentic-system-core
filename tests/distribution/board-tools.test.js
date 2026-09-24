'use strict';
// tests/distribution/board-tools.test.js — the live board, worked by agents through
// the seven tools (AGSC-10-16, AGSC-10-17): a board move (`propose` with
// `task_state`) and a new task or a comment (`remember` with `kind: task` or
// `about`) are PREPARED Proposals — a patch and the bytes after it, never a write —
// and both transports return the same payload (AGSC-09-16). A caller that declares
// one of the node's agent lanes is held to the lane's gates (AGSC-08-28): an
// undeclared task or type, `max_new_items`, `max_claims`, and the first-merged-claim
// rule. Offline, fixed build instant.

const test = require('node:test');
const assert = require('node:assert');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const site = require('../../src/distribution/site.js');
const mcpTools = require('../../src/distribution/mcp-tools.js');
const pageTools = require('../../src/distribution/page-tools.js');
const boardLanes = require('../../src/governance/board-lanes.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const EPOCH = '1767225600';
const PROV = 'prov:\n  origin: human\n  operator: human:andreibesleaga\n';
const DESC = 'A task of the delivery board, written for the board tools tests.';

const BOARD = {
  'content/clusters/delivery.md': `---\ntype: cluster\ntitle: Delivery\ndescription: The delivery board, which holds the tasks of the next release and nothing else.\n${PROV}---\n\nThe tasks.\n`,
  'content/concepts/build-the-importer.md': `---\ntype: concept\ntitle: Build the importer\ndescription: ${DESC}\nclusters:\n  - delivery\ndate: "2026-01-01"\n${PROV}kind: task\ntask_state: TASK_STATE_SUBMITTED\n---\n\nRead every export.\n`,
  'content/concepts/write-the-docs.md': `---\ntype: concept\ntitle: Write the docs\ndescription: ${DESC}\nclusters:\n  - delivery\n${PROV}kind: task\n---\n\nPer tool.\n`,
  'content/concepts/held-task.md': `---\ntype: concept\ntitle: Held task\ndescription: ${DESC}\nclusters:\n  - delivery\nmodified: "2026-01-01"\nprov:\n  origin: ai-generated\n  operator: human:andreibesleaga\n  agent: lane-a\nkind: task\ntask_state: TASK_STATE_WORKING\n---\n\nHeld by lane-a.\n`,
};

const LANES = {
  agents: [
    { channel: 'main', enabled: true, max_claims: 1, max_new_items: 1, model: 'm', name: 'lane-a', tasks: ['claim', 'work', 'plan'] },
    { channel: 'main', enabled: true, max_claims: 1, max_new_items: 0, model: 'm', name: 'lane-b', tasks: ['claim', 'work', 'plan'] },
    { channel: 'main', enabled: false, model: 'm', name: 'lane-off', tasks: ['claim'] },
    { channel: 'main', enabled: true, model: 'm', name: 'lane-review', tasks: ['review'] },
  ],
  channels: [{ kind: 'github', name: 'main', target: 'https://github.com/x/y' }],
};

const temporaries = [];
test.after(() => {
  for (const dir of temporaries) nodeFs.rmSync(dir, { force: true, recursive: true });
});

function workspace() {
  const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'agsc-board-tools-'));
  temporaries.push(dir);
  nodeFs.cpSync(FIXTURE, dir, { recursive: true });
  for (const [at, text] of Object.entries(BOARD)) {
    nodeFs.mkdirSync(path.dirname(path.join(dir, at)), { recursive: true });
    nodeFs.writeFileSync(path.join(dir, at), text);
  }
  return dir;
}

function built(dir) {
  const fs = createFileSystem(dir);
  const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(ROOT)) });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } });
  return { bundle, ...site.build(bundle, { clock, fs }, { specVersion: '1.0.0-rc.6', version: '0.0.2' }) };
}

/** The emitted page script, run as a page runs it, over the build's published bytes. */
function pageToolset(files, config) {
  const sources = {};
  for (const [route, text] of files) sources[route] = String(text);
  const context = vm.createContext({ TextEncoder });
  vm.runInContext(String(files.get('/compose/agsc-core.js')), context);
  vm.runInContext(String(files.get('/compose/agsc-page-tools.js')), context);
  const api = vm.runInContext('globalThis.AGSC_PAGE_TOOLS', context);
  const core = vm.runInContext('globalThis.AGSC_CORE', context);
  return api.pageToolset(api.pageCorpus(sources, { bundleId: (config.bundle || {}).id }), core);
}

/** The same functions, called as the module exports them (one implementation, two hosts). */
function moduleToolset(files, config) {
  const sources = {};
  for (const [route, text] of files) sources[route] = String(text);
  const compose = require('../../src/composition/compose.js');
  return pageTools.pageToolset(pageTools.pageCorpus(sources, { bundleId: (config.bundle || {}).id }), { compose: compose.compose });
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test('a board move and a new task are the same prepared Proposal on both transports', () => {
  const { bundle, files } = built(workspace());
  const local = mcpTools.tools(bundle);
  const page = pageToolset(files, bundle.config);
  const hosted = moduleToolset(files, bundle.config);
  const calls = [
    ['propose', { slug: 'build-the-importer', task_state: 'TASK_STATE_WORKING', at: '2026-01-02T10:00:00Z' }],
    ['propose', { slug: 'write-the-docs', task_state: 'TASK_STATE_COMPLETED' }],
    ['propose', { slug: 'build-the-importer', task_state: 'DONE' }],
    ['propose', { slug: 'delivery', task_state: 'TASK_STATE_WORKING' }],
    ['propose', { slug: 'build-the-importer', task_state: 'TASK_STATE_WORKING', at: 'soon' }],
    ['propose', { slug: 'build-the-importer' }],
    ['remember', { body: 'Map the columns.', cluster: 'delivery', kind: 'task', title: 'Map the columns' }],
    ['remember', { about: 'build-the-importer', body: 'CSV needs quoting.', kind: 'lesson', title: 'Quote the cells' }],
    ['remember', { about: 'Not A Slug', body: 'x', cluster: '../x', kind: 'task', title: 'Odd arguments' }],
  ];
  for (const [name, args] of calls) {
    assert.deepStrictEqual(plain(page.call(name, args)), plain(local.call(name, args)), `${name} ${JSON.stringify(args)}`);
    assert.deepStrictEqual(plain(hosted.call(name, args)), plain(local.call(name, args)), `module ${name}`);
  }
  const claim = local.call('propose', calls[0][1]).body;
  assert.strictEqual(claim.from, 'TASK_STATE_SUBMITTED');
  assert.strictEqual(claim.path, 'content/concepts/build-the-importer.md');
  assert.match(claim.markdown, /\ndate: "2026-01-01"\nmodified: "2026-01-02"\n/u);
  assert.match(claim.markdown, /\nkind: task\ntask_state: TASK_STATE_WORKING\n/u);
  assert.match(claim.patch, /^--- a\/content\/concepts\/build-the-importer\.md\n\+\+\+ b\/content\/concepts\/build-the-importer\.md\n@@ -1,\d+ \+1,\d+ @@\n/u);
  assert.match(claim.patch, /\n-task_state: TASK_STATE_SUBMITTED\n\+task_state: TASK_STATE_WORKING\n/u);
  assert.match(claim.patch, /\n\+modified: "2026-01-02"\n/u);
  // A task with no task_state yet: the line is inserted after `kind`.
  const done = local.call('propose', calls[1][1]).body;
  assert.strictEqual(done.from, 'TASK_STATE_UNSPECIFIED');
  assert.match(done.patch, / kind: task\n\+task_state: TASK_STATE_COMPLETED\n/u);
  assert.deepStrictEqual(['AGSC-E203', 'AGSC-E207', 'AGSC-E204'].map((code, i) => local.call('propose', calls[i + 2][1]).body.code),
    ['AGSC-E203', 'AGSC-E207', 'AGSC-E204']);
  const task = local.call('remember', calls[6][1]).body;
  assert.deepStrictEqual([task.frontmatter.kind, task.frontmatter.task_state, task.frontmatter.clusters, task.path],
    ['task', 'TASK_STATE_SUBMITTED', ['delivery'], 'content/concepts/map-the-columns.md']);
  assert.deepStrictEqual(local.call('remember', calls[7][1]).body.frontmatter.related, ['build-the-importer']);
  const odd = local.call('remember', calls[8][1]).body.frontmatter;
  assert.ok(!('clusters' in odd) && !('related' in odd), 'a malformed slug is never written into a link');
});

test('the lane gates on a prepared Proposal (local tool server)', () => {
  const dir = workspace();
  const { bundle } = built(dir);
  const config = { ...bundle.config, ...LANES };
  const local = mcpTools.tools(bundle, { config });
  const claim = (agent, slug) => local.call('propose', { agent, slug, task_state: 'TASK_STATE_WORKING' }).body;
  // lane-a already holds `held-task` and max_claims is 1.
  assert.strictEqual(claim('lane-a', 'build-the-importer').code, 'AGSC-E511');
  assert.match(claim('lane-a', 'build-the-importer').message, /max_claims is 1/u);
  // A held task may be "claimed" again by its holder (nothing changes hands).
  assert.strictEqual(claim('lane-a', 'held-task').task_state, 'TASK_STATE_WORKING');
  // The first merged claim wins: another lane cannot claim a task already in WORKING.
  assert.match(claim('lane-b', 'held-task').message, /already TASK_STATE_WORKING under lane-a/u);
  assert.strictEqual(claim('lane-b', 'build-the-importer').task_state, 'TASK_STATE_WORKING');
  // Finishing frees the claim; a disabled lane and a lane without the task are E509.
  assert.strictEqual(local.call('propose', { agent: 'lane-a', slug: 'held-task', task_state: 'TASK_STATE_COMPLETED' }).body.task_state,
    'TASK_STATE_COMPLETED');
  assert.strictEqual(claim('lane-off', 'build-the-importer').code, 'AGSC-E509');
  assert.strictEqual(claim('lane-review', 'build-the-importer').code, 'AGSC-E509');
  // A caller that declares no lane of this node is a contributor, reviewed as one.
  assert.strictEqual(claim('someone', 'build-the-importer').task_state, 'TASK_STATE_WORKING');
  assert.strictEqual(claim(undefined, 'build-the-importer').task_state, 'TASK_STATE_WORKING');
  // max_new_items: lane-b may create none.
  const open = (agent, kind) => local.call('remember', { agent, body: 'x', cluster: 'delivery', kind, title: 'A new task' }).body;
  assert.strictEqual(open('lane-b', 'task').code, 'AGSC-E511');
  assert.strictEqual(open('lane-a', 'task').frontmatter.task_state, 'TASK_STATE_SUBMITTED');
  assert.strictEqual(open('lane-review', 'task').code, 'AGSC-E509');
  assert.strictEqual(open('lane-a', 'lesson').frontmatter.type, 'lesson');
  // The derived claimed_by of the board export is read before prov.agent.
  const items = bundle.items.map((i) => ({ ...i.frontmatter, slug: i.slug, type: i.type }));
  const byHistory = boardLanes.moveRefusal(config, items, {
    agent: 'lane-a', claimed: new Map([['held-task', 'lane-b']]), path: 'content/concepts/held-task.md',
    slug: 'held-task', task_state: 'TASK_STATE_WORKING',
  });
  assert.match(byHistory.message, /under lane-b/u);
  assert.strictEqual(boardLanes.moveRefusal(config, items, { agent: 'lane-b', path: 'x', slug: 'ghost', task_state: 'TASK_STATE_WORKING' }), null);
  assert.strictEqual(boardLanes.holderOf(null, null), null);
  assert.strictEqual(boardLanes.laneOf(config, ''), null);
});

test('the diff helper: insertion before prov, and after the closing fence when nothing matches', () => {
  const before = '---\ntitle: X\nprov:\n  origin: human\n---\n';
  const set = pageTools.PORTABLE.includes('pageSetLine');
  assert.ok(set);
  const moved = pageTools.pageBoardMove(before, 'Body\n', { kind: 'task' }, 'concept', 'x', { at: '2026-02-03', task_state: 'TASK_STATE_FAILED' });
  assert.match(moved.markdown, /^---\ntitle: X\ntask_state: TASK_STATE_FAILED\nmodified: "2026-02-03"\nprov:\n/u);
  const bare = pageTools.pageBoardMove('---\ntitle: X\n---\n', '', { kind: 'task' }, 'concept', 'x', { task_state: 'TASK_STATE_FAILED' });
  assert.strictEqual(bare.markdown, '---\ntitle: X\ntask_state: TASK_STATE_FAILED\n---\n');
  assert.strictEqual(pageTools.pageUnifiedDiff('p', '---\na\n---\n', '---\nb\n---\n'),
    '--- a/p\n+++ b/p\n@@ -1,3 +1,3 @@\n ---\n-a\n+b\n ---\n');
  assert.strictEqual(pageTools.pageTaskStates().length, 9);
});
