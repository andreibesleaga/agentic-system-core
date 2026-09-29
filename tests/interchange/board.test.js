'use strict';
// tests/interchange/board.test.js — the `board` adapter both ways: a live board to and
// from the files of project and product management tools (AGSC-01-26a, AGSC-10-13,
// AGSC-10-16). `export --to board --format <f>` / `import --from board --format <f>`.
//
// The fixtures under tests/fixtures/pm-*/ are SMALL and SYNTHETIC, each in the real
// file shape of its tool (the column names and members the tools' own export files
// use). Everything runs through the real verbs over the real filesystem with a fixed
// clock; no network.

const test = require('node:test');
const assert = require('node:assert');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFileSystem } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const exportVerb = require('../../src/application/cli/verbs/export.js');
const importVerb = require('../../src/application/cli/verbs/import.js');
const lintVerb = require('../../src/application/cli/verbs/lint.js');
const board = require('../../src/interchange/adapters/board.js');
const formats = require('../../src/interchange/board-formats.js');
const frontmatter = require('../../src/knowledge/frontmatter.js');
const yaml = require('../../src/knowledge/yaml.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const EPOCH = '1767225600';
const SPEC = '1.0.0-rc.6';
const PROV = 'prov:\n  origin: human\n  operator: human:andreibesleaga\n';
const DESC = 'A task of the delivery board, written for the board adapter tests.';

/** One board (a cluster holding tasks in several states, a decision and a link), plus the edges. */
const EXTRA = {
  'content/clusters/delivery.md': `---\ntype: cluster\ntitle: Delivery\ndescription: The delivery board, which holds the tasks of the next release and one decision.\ndate: "2026-01-01"\n${PROV}---\n\n# Delivery\n\nThe tasks of the next release.\n`,
  'content/concepts/build-the-importer.md': `---\ntype: concept\ntitle: Build the importer\ndescription: ${DESC}\ntags:\n  - agents\n  - patterns\nclusters:\n  - delivery\ndate: "2026-01-02"\nmodified: "2026-01-03"\n${PROV}blocked-by:\n  - pick-the-format\nkind: task\ntask_state: TASK_STATE_WORKING\nx-board-assignee: alice\nx-board-due: "2026-02-01"\nx-board-labels:\n  - backend\n---\n\n## Goal\n\nRead every tool's export, with a comma, a "quote" and\nmore than one line.\n`,
  'content/concepts/pick-the-format.md': `---\ntype: concept\ntitle: Pick the format\ndescription: ${DESC}\nclusters:\n  - delivery\ndate: "2026-01-01"\n${PROV}kind: decision\n---\n\nOne intermediate table.\n`,
  'content/concepts/write-the-docs.md': `---\ntype: concept\ntitle: Write the docs\ndescription: ${DESC}\nclusters:\n  - delivery\ndate: "2026-01-02"\n${PROV}kind: task\ntask_state: TASK_STATE_SUBMITTED\n---\n\nPer tool.\n`,
  'content/concepts/ship-it.md': `---\ntype: concept\ntitle: Ship it\ndescription: ${DESC}\nclusters:\n  - delivery\n${PROV}kind: task\ntask_state: TASK_STATE_COMPLETED\n---\n\nDone.\n`,
  'content/concepts/drop-the-api.md': `---\ntype: concept\ntitle: Drop the API\ndescription: ${DESC}\nclusters:\n  - delivery\n${PROV}kind: task\ntask_state: TASK_STATE_CANCELED\n---\n\nNo server.\n`,
  'content/concepts/wait-for-keys.md': `---\ntype: concept\ntitle: Wait for keys\ndescription: ${DESC}\nclusters:\n  - delivery\n${PROV}kind: task\ntask_state: TASK_STATE_AUTH_REQUIRED\nx-board-state: Needs approval\n---\n\nA person signs.\n`,
  'content/concepts/secret-task.md': `---\ntype: concept\ntitle: Secret task\ndescription: ${DESC}\nstatus: draft\nclusters:\n  - delivery\n${PROV}kind: task\n---\n\nNever leaves.\n`,
  'content/concepts/loose-task.md': `---\ntype: concept\ntitle: Loose task\ndescription: ${DESC}\n${PROV}kind: task\n---\n\nOn no board.\n`,
};

const EXPORTED = ['build-the-importer', 'drop-the-api', 'pick-the-format', 'ship-it', 'wait-for-keys', 'write-the-docs'];

const temporaries = [];
test.after(() => {
  for (const dir of temporaries) nodeFs.rmSync(dir, { force: true, recursive: true });
});

function temp(prefix) {
  const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaries.push(dir);
  return dir;
}

function writeTree(dir, files) {
  for (const [at, text] of Object.entries(files)) {
    nodeFs.mkdirSync(path.dirname(path.join(dir, at)), { recursive: true });
    nodeFs.writeFileSync(path.join(dir, at), text);
  }
  return dir;
}

function workspace(extra = EXTRA) {
  const dir = temp('agsc-board-');
  nodeFs.cpSync(FIXTURE, dir, { recursive: true });
  return writeTree(dir, extra);
}

function emptyBundle() {
  const dir = temp('agsc-board-in-');
  nodeFs.copyFileSync(path.join(FIXTURE, 'agsc.config.json'), path.join(dir, 'agsc.config.json'));
  return dir;
}

function ctxFor(dir, options = {}) {
  const lines = [];
  return {
    argv: options.argv || [],
    config: JSON.parse(nodeFs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8')),
    env: {},
    flags: { json: false, quiet: false },
    notes: lines,
    openRoot: (at) => createFileSystem(path.resolve(dir, at)),
    ports: { clock: createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } }), fs: createFileSystem(dir) },
    root: dir,
    specVersion: SPEC,
    stderr: { write: (text) => lines.push(String(text)) },
    stdout: { write: () => {} },
    verbFlags: options.verbFlags || {},
    version: '0.0.2',
  };
}

function tree(dir) {
  const out = new Map();
  if (!nodeFs.existsSync(dir)) return out;
  const walk = (at, prefix) => {
    for (const entry of nodeFs.readdirSync(at, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(at, entry.name);
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(full, rel);
      else out.set(rel, nodeFs.readFileSync(full, 'utf8'));
    }
  };
  walk(dir, '');
  return out;
}

const errors = (findings) => findings.filter((f) => f.severity !== 'warn');

function exported(dir, format) {
  const out = exportVerb.run(ctxFor(dir, { verbFlags: { format, to: 'board' } }));
  assert.deepStrictEqual(errors(out.findings), [], format);
  return { findings: out.findings, files: tree(path.join(dir, 'dist/export/board', format)) };
}

function imported(into, source, format, verbFlags = {}) {
  const ctx = ctxFor(into, { argv: [source], verbFlags: { format, from: 'board', ...verbFlags } });
  const result = importVerb.run(ctx);
  return { ...result, notes: ctx.notes.join('') };
}

/** An item file as {fm, body}, prov.source_version removed (the import adds it). */
function parsed(text) {
  const split = frontmatter.split(text);
  const fm = yaml.parse(split.yamlText);
  if (fm.prov) delete fm.prov.source_version;
  return { body: split.body.replace(/^\n+/u, ''), fm };
}

const EXT = { 'agsc-board': 'json', asana: 'csv', github: 'json', gitlab: 'json', jira: 'csv', linear: 'csv', markdown: 'md', notion: 'csv',
  'obsidian-kanban': 'md', todotxt: 'txt', trello: 'json' };

// --------------------------------------------------------------------- export

test('export --to board writes one file per board, published tasks only, for every format', () => {
  const dir = workspace();
  for (const format of board.FORMAT_NAMES) {
    const { files, findings } = exported(dir, format);
    assert.deepStrictEqual([...files.keys()], [`delivery.${EXT[format]}`], format);
    const text = files.get(`delivery.${EXT[format]}`);
    assert.doesNotMatch(text, /Secret task|Loose task/u, `${format}: a draft or an unfiled task never leaves`);
    for (const title of ['Build the importer', 'Write the docs', 'Ship it', 'Drop the API']) {
      assert.ok(text.includes(title), `${format}: ${title}`);
    }
    assert.ok(findings.some((f) => /1 published task\(s\) belong to no published cluster/u.test(f.message)), format);
    // Deterministic: the same bytes twice.
    assert.deepStrictEqual(exported(dir, format).files, files, format);
  }
});

test('the exported states are the table\'s words, per tool', () => {
  const dir = workspace();
  const jira = formats.csvObjects(exported(dir, 'jira').files.get('delivery.csv'));
  const status = Object.fromEntries(jira.map((r) => [r.values.Summary, r.values.Status]));
  assert.deepStrictEqual(status, {
    'Build the importer': 'In Progress', 'Drop the API': 'Canceled', 'Pick the format': 'Done', 'Ship it': 'Done',
    'Wait for keys': 'Needs approval', 'Write the docs': 'To Do',
  });
  const build = jira.find((r) => r.values.Summary === 'Build the importer').values;
  assert.deepStrictEqual(build.Labels, ['backend', 'agents', 'patterns']);
  assert.strictEqual(build['Inward issue link (Blocks)'], 'pick-the-format');
  assert.strictEqual(jira.find((r) => r.values.Summary === 'Pick the format').values['Issue Type'], 'Decision');
  const github = JSON.parse(exported(dir, 'github').files.get('delivery.json'));
  assert.deepStrictEqual(github.map((i) => [i.title, i.state, i.state_reason]), [
    ['Build the importer', 'open', undefined], ['Drop the API', 'closed', 'not_planned'],
    ['Pick the format', 'closed', 'completed'], ['Ship it', 'closed', 'completed'],
    ['Wait for keys', 'open', undefined], ['Write the docs', 'open', undefined]]);
  assert.deepStrictEqual(github[0].assignees, ['alice']);
  assert.strictEqual(github[0].milestone.title, 'Delivery');
  const gitlab = JSON.parse(exported(dir, 'gitlab').files.get('delivery.json'));
  assert.deepStrictEqual(gitlab[0].labels, ['backend', 'agents', 'patterns', 'status::In Progress']);
  assert.strictEqual(gitlab[0].due_date, '2026-02-01');
  assert.strictEqual(gitlab[5].state, 'opened');
  const linear = formats.csvObjects(exported(dir, 'linear').files.get('delivery.csv'));
  assert.strictEqual(linear.find((r) => r.values.Title === 'Write the docs').values.Status, 'Todo');
  const md = exported(dir, 'markdown').files.get('delivery.md');
  assert.match(md, /^# Delivery\n\n<!-- agsc:provenance\n/u);
  assert.match(md, /\n- \[ \] Build the importer @alice #backend #agents #patterns due:2026-02-01\n/u);
  assert.match(md, /\n- \[x\] Ship it\n/u);
  const kanban = exported(dir, 'obsidian-kanban').files.get('delivery.md');
  assert.match(kanban, /^---\n\nkanban-plugin: board\n\n---\n/u);
  assert.match(kanban, /## Done\n\n\*\*Complete\*\*\n- \[x\] Pick the format #decision/u);
  assert.match(kanban, /@\{2026-02-01\}/u);
  const todo = exported(dir, 'todotxt').files.get('delivery.txt');
  assert.match(todo, /^2026-01-02 Build the importer \+delivery @backend @agents @patterns due:2026-02-01 state:In-Progress agsc:/mu);
  assert.match(todo, /^x Ship it \+delivery state:Done agsc:/mu);
  const trello = JSON.parse(exported(dir, 'trello').files.get('delivery.json'));
  assert.deepStrictEqual(trello.lists.map((l) => l.name), ['In Progress', 'Canceled', 'Done', 'Needs approval', 'To Do']);
  assert.deepStrictEqual(trello.members, [{ id: 'member-1', username: 'alice' }]);
  const asana = formats.csvObjects(exported(dir, 'asana').files.get('delivery.csv'));
  assert.strictEqual(asana.find((r) => r.values.Name === 'Ship it').values['Completed At'], '');
  assert.strictEqual(asana.find((r) => r.values.Name === 'Pick the format').values['Completed At'], '2026-01-01');
  const notion = formats.csvObjects(exported(dir, 'notion').files.get('delivery.csv'));
  assert.strictEqual(notion.find((r) => r.values.Name === 'Pick the format').values.Type, 'Decision');
});

test('export --to board without a known --format is refused, and a Bundle with no board exports nothing', () => {
  const dir = workspace();
  for (const flags of [{ to: 'board' }, { format: 'excel', to: 'board' }]) {
    const out = exportVerb.run(ctxFor(dir, { verbFlags: flags }));
    assert.ok(out.findings.some((f) => f.code === 'AGSC-E003' && /--format <name>, one of agsc-board, asana, github/u.test(f.message)));
  }
  const bare = workspace({});
  const out = exportVerb.run(ctxFor(bare, { verbFlags: { format: 'jira', to: 'board' } }));
  assert.ok(out.findings.some((f) => /no board to export/u.test(f.message)));
});

// ------------------------------------------------------------ our own, back

test('round trip: every exported item and its board come back as authored, for every format', () => {
  const source = workspace();
  const original = tree(path.join(source, 'content'));
  for (const format of board.FORMAT_NAMES) {
    exported(source, format);
    const into = emptyBundle();
    const result = imported(into, path.join(source, 'dist/export/board', format), format);
    assert.deepStrictEqual(errors(result.findings), [], format);
    const back = tree(path.join(into, 'content'));
    const expected = EXPORTED;
    assert.deepStrictEqual([...back.keys()].sort(),
      ['clusters/delivery.md', ...expected.map((s) => `concepts/${s}.md`)].sort(), format);
    for (const [at, text] of back) {
      assert.match(text, /^ {2}source_version: 0\.0\.0\+20260101T000000Z$/mu, `${format} ${at}`);
      assert.deepStrictEqual(parsed(text), parsed(original.get(at)), `${format} ${at}`);
    }
    // A second import changes nothing (AGSC-01-23).
    const again = imported(into, path.join(source, 'dist/export/board', format), format);
    assert.match(again.notes, new RegExp(`import: 0 written, 0 replaced, ${expected.length + 1} unchanged`, 'u'), format);
    assert.deepStrictEqual(errors(lintVerb.run(ctxFor(into)).findings)
      .filter((f) => f.file !== '.well-known/security.txt'), [], format);
  }
});

test('a forged record is not trusted: the row is read as a foreign draft', () => {
  const source = workspace();
  exported(source, 'github');
  const at = path.join(source, 'dist/export/board/github/delivery.json');
  const issues = JSON.parse(nodeFs.readFileSync(at, 'utf8'));
  const b64 = /<!-- agsc-item ([A-Za-z0-9+/=]+) -->/u.exec(issues[0].body)[1];
  const record = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  record.bundle = 'https://stranger.example/';
  issues[0].body = issues[0].body.replace(b64, board.encodeRecord(record));
  issues[1].body = `${issues[1].body.replace(/<!-- agsc-item [^>]+ -->/u, '')}<!-- agsc-item bm90IGpzb24= -->`;
  nodeFs.writeFileSync(at, JSON.stringify(issues));
  const into = emptyBundle();
  const result = imported(into, path.dirname(at), 'github');
  assert.ok(result.findings.some((f) => /not trusted: it names the origin https:\/\/stranger\.example\//u.test(f.message)));
  assert.ok(result.findings.some((f) => f.code === 'AGSC-E201'));
  const forged = parsed(nodeFs.readFileSync(path.join(into, 'content/concepts/build-the-importer.md'), 'utf8'));
  assert.strictEqual(forged.fm.status, 'draft');
  assert.strictEqual(forged.fm.prov.origin, 'imported');
  assert.strictEqual(forged.fm['x-board-state'], 'open');
  assert.doesNotMatch(forged.body, /agsc-item/u);
});

test('AGSC-01-22: a record of another MAJOR is refused unless --allow-newer; a newer MINOR imports with a warning', () => {
  const source = workspace();
  exported(source, 'linear');
  const at = path.join(source, 'dist/export/board/linear/delivery.csv');
  const text = nodeFs.readFileSync(at, 'utf8');
  const b64 = /agsc-item:([A-Za-z0-9+/=]+)/u.exec(text)[1];
  const record = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  nodeFs.writeFileSync(at, text.replace(b64, board.encodeRecord({ ...record, spec_version: '2.0.0' })));
  const into = emptyBundle();
  const refused = imported(into, path.dirname(at), 'linear');
  assert.strictEqual(refused.status, 'fail');
  assert.ok(refused.findings.some((f) => f.code === 'AGSC-E004'));
  assert.ok(!nodeFs.existsSync(path.join(into, 'content')));
  const taken = imported(into, path.dirname(at), 'linear', { 'allow-newer': true });
  assert.deepStrictEqual(errors(taken.findings), []);
  nodeFs.writeFileSync(at, text.replace(b64, board.encodeRecord({ ...record, spec_version: '1.9.0' })));
  const minor = imported(emptyBundle(), path.dirname(at), 'linear');
  assert.deepStrictEqual(errors(minor.findings), []);
  const said = minor.findings.filter((f) => f.code === 'AGSC-E506' && f.message.includes('1.9.0'));
  assert.deepStrictEqual(said.map((f) => f.severity), ['warn']);
});

// ------------------------------------------------------------------ foreign

/** Import one fixture directory into an empty Bundle; the written items by slug. */
function fromFixture(format, verbFlags = {}, into = emptyBundle()) {
  const result = imported(into, path.join(ROOT, 'tests', 'fixtures', `pm-${format}`), format, verbFlags);
  const items = new Map();
  for (const [at, text] of tree(path.join(into, 'content'))) items.set(at, parsed(text));
  return { into, items, result };
}

const STATES = {
  'agsc-board': { 'cut-the-tag': 'TASK_STATE_WORKING', 'odd-one': 'TASK_STATE_UNSPECIFIED', 'write-notes': 'TASK_STATE_SUBMITTED' },
  asana: { 'collect-quotes': 'TASK_STATE_COMPLETED', 'draft-the-brief': 'TASK_STATE_WORKING' },
  github: { 'draft-note': 'TASK_STATE_UNSPECIFIED', 'review-the-mapping': 'TASK_STATE_WORKING',
    'ship-the-draft': 'TASK_STATE_COMPLETED', 'write-the-importer': 'TASK_STATE_SUBMITTED' },
  gitlab: { 'close-the-loop': 'TASK_STATE_COMPLETED', 'export-as-csv': 'TASK_STATE_INPUT_REQUIRED',
    'map-gitlab-lists': 'TASK_STATE_WORKING' },
  jira: { 'set-up-the-board': 'TASK_STATE_SUBMITTED', 'sum-a1': 'TASK_STATE_UNSPECIFIED' },
  linear: { 'retire-the-old-index': 'TASK_STATE_CANCELED' },
  markdown: { 'register-the-domain': 'TASK_STATE_COMPLETED', 'wait-for-the-logo': 'TASK_STATE_INPUT_REQUIRED',
    'write-the-about-page': 'TASK_STATE_SUBMITTED' },
  notion: { 'pick-fonts': 'TASK_STATE_COMPLETED', 'sketch-the-page': 'TASK_STATE_SUBMITTED' },
  'obsidian-kanban': { 'book-the-room': 'TASK_STATE_SUBMITTED', 'old-card': 'TASK_STATE_COMPLETED',
    'outline-the-talk': 'TASK_STATE_SUBMITTED', 'pick-the-date': 'TASK_STATE_COMPLETED', rehearse: 'TASK_STATE_WORKING' },
  todotxt: { 'call-the-printer': 'TASK_STATE_SUBMITTED', 'order-paper': 'TASK_STATE_COMPLETED',
    'tidy-the-desk': 'TASK_STATE_COMPLETED', 'water-the-plants': 'TASK_STATE_INPUT_REQUIRED' },
  trello: { 'plan-the-launch': 'TASK_STATE_WORKING', 'try-a-podcast': 'TASK_STATE_COMPLETED',
    'write-the-post': 'TASK_STATE_COMPLETED' },
};

test('every tool\'s export becomes draft tasks on draft boards, states through the table, nothing dropped', () => {
  for (const format of board.FORMAT_NAMES) {
    const { into, items, result } = fromFixture(format);
    assert.deepStrictEqual(errors(result.findings), [], format);
    const tasks = Object.fromEntries([...items].filter(([, v]) => v.fm.kind === 'task')
      .map(([at, v]) => [at.replace(/^concepts\/|\.md$/gu, ''), v.fm.task_state]));
    assert.deepStrictEqual(tasks, STATES[format], format);
    for (const [at, item] of items) {
      assert.strictEqual(item.fm.status, 'draft', `${format} ${at}`);
      assert.strictEqual(item.fm.prov.origin, 'imported', `${format} ${at}`);
      if (item.fm.type === 'concept') {
        assert.match(item.fm['x-board-source'], new RegExp(`^${format}:`, 'u'), `${format} ${at}`);
        assert.ok(items.has(`clusters/${item.fm.clusters[0]}.md`), `${format} ${at}: its board is written`);
      }
    }
    // The imported Bundle lints clean of errors (the target's security contact aside).
    assert.deepStrictEqual(errors(lintVerb.run(ctxFor(into)).findings)
      .filter((f) => f.file !== '.well-known/security.txt'), [], format);
    // And a published copy of it exports again (drafts never do: nothing is written).
    const again = exportVerb.run(ctxFor(into, { verbFlags: { format, to: 'board' } }));
    assert.ok(again.findings.some((f) => /no board to export/u.test(f.message)), format);
  }
});

test('the kept members: assignee, due date, labels, ids, links, unknown columns and the tool\'s own word', () => {
  const jira = fromFixture('jira').items;
  const setUp = jira.get('concepts/set-up-the-board.md').fm;
  assert.deepStrictEqual(setUp['blocked-by'], ['choose-the-storage']);
  assert.strictEqual(setUp['x-board-assignee'], 'erin');
  assert.strictEqual(setUp['x-board-due'], '2026-01-15');
  assert.strictEqual(setUp.date, '2026-01-02');
  assert.deepStrictEqual(JSON.parse(setUp['x-board-fields']), { Priority: 'High', Sprint: 'Sprint 4' });
  assert.strictEqual(jira.get('concepts/set-up-the-board.md').body, 'First line\nsecond line\n');
  assert.strictEqual(jira.get('concepts/choose-the-storage.md').fm.kind, 'decision');
  assert.ok(!('task_state' in jira.get('concepts/choose-the-storage.md').fm));
  const formula = jira.get('concepts/sum-a1.md').fm;
  assert.strictEqual(formula.title, '=SUM(A1)');
  assert.deepStrictEqual(formula['x-board-links'], ['APP-9']);
  assert.strictEqual(JSON.parse(formula['x-board-fields'])['Issue Type'], 'Bug');
  assert.strictEqual(formula['x-board-state'], 'QA Hold');

  const github = fromFixture('github');
  assert.ok(github.result.findings.some((f) => /1 pull request\(s\)/u.test(f.message)));
  assert.ok(github.result.findings.some((f) => /"Parked" names no task state/u.test(f.message)));
  assert.match(github.result.notes, /import: states_unknown: 1/u);
  const decision = github.items.get('concepts/use-one-intermediate-table.md').fm;
  assert.strictEqual(decision.kind, 'decision');
  assert.deepStrictEqual(decision.clusters, ['issues']);
  const writing = github.items.get('concepts/write-the-importer.md').fm;
  assert.deepStrictEqual([writing.clusters, writing['x-board-assignee'], writing['x-board-id']], [['sprint-1'], 'alice', '#1']);
  assert.deepStrictEqual(JSON.parse(writing['x-board-fields']), { comments: 2, html_url: 'https://github.example/acme/app/issues/1' });
  assert.strictEqual(github.items.get('concepts/review-the-mapping.md').fm['x-board-assignee'], 'bob');

  const trello = fromFixture('trello');
  assert.ok(trello.result.findings.some((f) => /the board's actions \(1\) were not imported/u.test(f.message)));
  const launch = trello.items.get('concepts/plan-the-launch.md').fm;
  assert.deepStrictEqual([launch['x-board-assignee'], launch['x-board-due'], launch['x-board-labels'], launch['x-board-id']],
    ['gina', '2026-04-01', ['launch', 'red'], 'AbC1']);
  assert.strictEqual(JSON.parse(trello.items.get('concepts/try-a-podcast.md').fm['x-board-fields']).closed, true);

  const asanaRun = fromFixture('asana');
  const asana = asanaRun.items;
  assert.strictEqual(asana.get('concepts/collect-quotes.md').body, 'Call [telephone number] first.\n');
  assert.ok(asanaRun.result.findings.some((f) => /2 e-mail address\(es\) or telephone number\(s\)/u.test(f.message)));
  assert.deepStrictEqual(asana.get('concepts/draft-the-brief.md').fm['blocked-by'], ['collect-quotes']);
  assert.strictEqual(asana.get('concepts/draft-the-brief.md').fm['x-board-assignee'], 'ivy', 'no e-mail address is kept (AGSC-08-16)');

  const gitlab = fromFixture('gitlab').items;
  assert.strictEqual(gitlab.get('concepts/export-as-csv.md').body, 'Line one\nline two\n');
  assert.strictEqual(gitlab.get('concepts/map-gitlab-lists.md').fm['x-board-due'], '2026-02-10');

  const linear = fromFixture('linear').items;
  assert.strictEqual(linear.get('concepts/index-the-tasks.md').fm.kind, 'spec');
  assert.strictEqual(JSON.parse(linear.get('concepts/retire-the-old-index.md').fm['x-board-fields'])['Parent issue'], 'LIN-1');

  const notion = fromFixture('notion').items;
  assert.ok(notion.has('clusters/tasks.md'), 'the 32-hex suffix of a Notion export is not part of the board name');
  assert.strictEqual(notion.get('concepts/sketch-the-page.md').fm['x-board-due'], '2026-09-30');
  assert.strictEqual(notion.get('concepts/sketch-the-page.md').fm.date, '2026-09-23');

  const kanban = fromFixture('obsidian-kanban').items;
  assert.strictEqual(kanban.get('concepts/book-the-room.md').body, 'Ask the front desk.\n');
  assert.strictEqual(kanban.get('concepts/rehearse.md').body, 'Twice, with a timer.\n');
  assert.strictEqual(kanban.get('concepts/rehearse.md').fm['x-board-assignee'], 'kim');
  assert.strictEqual(JSON.parse(kanban.get('concepts/old-card.md').fm['x-board-fields']).archived, true);

  const peer = fromFixture('agsc-board');
  assert.ok(peer.result.findings.some((f) => /a board index \(1 board\(s\)\) holds no task/u.test(f.message)));
  const tag = peer.items.get('concepts/cut-the-tag.md').fm;
  assert.deepStrictEqual([tag['x-board-id'], tag['blocked-by'], tag['x-board-assignee'], tag.status, tag.clusters],
    ['https://peer.example/concepts/cut-the-tag/', ['write-notes'], 'process:lane-a', 'draft', ['release']]);
  assert.deepStrictEqual(peer.items.get('concepts/odd-one.md').fm['x-board-links'], ['https://peer.example/concepts/elsewhere/']);

  const md = fromFixture('markdown').items;
  assert.ok(md.has('clusters/website.md'));
  assert.deepStrictEqual(md.get('concepts/write-the-about-page.md').fm['x-board-labels'], ['content']);

  const todo = fromFixture('todotxt').items;
  const call = todo.get('concepts/call-the-printer.md').fm;
  assert.deepStrictEqual([call.clusters, call['x-board-labels'], call['x-board-due']], [['office'], ['phone'], '2026-09-05']);
  assert.deepStrictEqual(JSON.parse(call['x-board-fields']), { priority: 'A' });
  const paper = todo.get('concepts/order-paper.md').fm;
  assert.deepStrictEqual([paper.date, JSON.parse(paper['x-board-fields']).completed], ['2026-09-01', '2026-09-03']);
  assert.deepStrictEqual(JSON.parse(todo.get('concepts/water-the-plants.md').fm['x-board-fields']), { projects: ['Home'], rec: '1w' });
  assert.ok(todo.has('clusters/todo.md'), 'a task with no +project is on the file\'s board');
});

test('a board the Bundle already holds is joined, never rewritten; collisions, --dry-run and --replace', () => {
  const into = emptyBundle();
  writeTree(into, { 'content/clusters/apollo.md': EXTRA['content/clusters/delivery.md'].replace(/Delivery/gu, 'Apollo') });
  const first = fromFixture('jira', {}, into);
  assert.match(first.result.notes, /import: boards_joined: 1/u);
  assert.match(nodeFs.readFileSync(path.join(into, 'content/clusters/apollo.md'), 'utf8'), /origin: human/u);
  const at = path.join(into, 'content/concepts/sum-a1.md');
  nodeFs.writeFileSync(at, nodeFs.readFileSync(at, 'utf8').replace('A title', 'The title'));
  const refused = fromFixture('jira', {}, into).result;
  assert.strictEqual(refused.status, 'fail');
  assert.match(refused.notes, /1 collision\(s\); NOTHING was written/u);
  const dry = fromFixture('jira', { 'dry-run': true }, into).result;
  assert.strictEqual(dry.status, 'fail');
  assert.match(dry.notes, /--dry-run: 1 collision\(s\)/u);
  const replaced = fromFixture('jira', { replace: true }, into).result;
  assert.match(replaced.notes, /1 replaced/u);
  assert.match(nodeFs.readFileSync(at, 'utf8'), /A title that looks/u);
});

test('the refusals: no --format, an unknown one, a bad --source-version, no export file, an unreadable one', () => {
  const into = emptyBundle();
  const fixture = path.join(ROOT, 'tests', 'fixtures', 'pm-jira');
  for (const flags of [{}, { format: 'excel' }]) {
    const out = importVerb.run(ctxFor(into, { argv: [fixture], verbFlags: { from: 'board', ...flags } }));
    assert.strictEqual(out.status, 'fail');
    assert.match(out.findings[0].message, /--format <name>, one of agsc-board, asana, github, gitlab, jira/u);
  }
  const version = imported(into, fixture, 'jira', { 'source-version': 'bad version' });
  assert.strictEqual(version.findings[0].code, 'AGSC-E204');
  const stated = fromFixture('todotxt', { 'source-version': 'v1' }).into;
  assert.match(nodeFs.readFileSync(path.join(stated, 'content/concepts/order-paper.md'), 'utf8'), /^ {2}source_version: v1$/mu);
  const none = imported(into, path.join(ROOT, 'tests', 'fixtures', 'pm-trello'), 'jira');
  assert.strictEqual(none.findings[0].code, 'AGSC-E901');
  const missing = imported(into, path.join(into, 'no-such-dir'), 'jira');
  assert.strictEqual(missing.findings[0].code, 'AGSC-E901');
  const broken = writeTree(temp('agsc-board-bad-'), { 'a.json': '{ not json', 'b.json': '{"cards": 1}', 'c.json': '[]' });
  for (const format of ['github', 'gitlab', 'trello']) {
    const out = imported(into, broken, format);
    assert.strictEqual(out.status, 'fail', format);
    assert.ok(out.findings.some((f) => /is not a .* export this adapter reads/u.test(f.message)), format);
    assert.ok(out.findings.some((f) => /holds no row this adapter could read/u.test(f.message)), format);
  }
  const renamed = writeTree(temp('agsc-board-jira-'), { 'x.csv': 'Summary,Work item key,Work type,Status\nNew words,W-1,Decision,Done\n' });
  const words = imported(into, renamed, 'jira');
  assert.deepStrictEqual(errors(words.findings), []);
  assert.match(nodeFs.readFileSync(path.join(into, 'content/concepts/new-words.md'), 'utf8'), /kind: decision\n[\s\S]*x-board-id: W-1\n/u);
  const plainMd = writeTree(temp('agsc-board-md-'), { 'notes.md': '# Notes\n\n- [ ] One\n' });
  const kanban = imported(into, plainMd, 'obsidian-kanban');
  assert.ok(kanban.findings.some((f) => /kanban-plugin/u.test(f.message)));
  const planned = board.plan({}, { format: 'excel' });
  assert.strictEqual(planned.refused, true);
});

test('an unreadable file is refused by the verb before anything is planned', () => {
  const into = emptyBundle();
  const source = writeTree(temp('agsc-board-link-'), { 'a.csv': 'Summary\nOne\n' });
  // A link to a real file OUTSIDE the source root (/etc/hostname does not exist on
  // macOS or Windows): the refusal is about leaving the root, not about the target.
  const outside = writeTree(temp('agsc-board-outside-'), { 'secret.csv': 'Summary\nLeak\n' });
  nodeFs.symlinkSync(path.join(outside, 'secret.csv'), path.join(source, 'b.csv'));
  const out = imported(into, source, 'jira');
  assert.strictEqual(out.status, 'fail');
  assert.ok(out.findings.some((f) => f.severity === 'error'));
});

// ------------------------------------------------------------------- helpers

test('CSV: quotes, doubled quotes, CRLF, a BOM, repeated headers and formula cells', () => {
  assert.deepStrictEqual(formats.parseCsv('\uFEFFa,b\r\n"x, y","he said ""hi"""\r\n"multi\nline",\n'),
    [['a', 'b'], ['x, y', 'he said "hi"'], ['multi\nline', '']]);
  assert.deepStrictEqual(formats.parseCsv('a\n\nb'), [['a'], ['b']]);
  assert.deepStrictEqual(formats.parseCsv('a,b'), [['a', 'b']]);
  assert.strictEqual(formats.csvCell('=1+1'), "'=1+1");
  assert.strictEqual(formats.csvCell('-x, y'), "\"'-x, y\"");
  assert.strictEqual(formats.csvCell(' pad'), '" pad"');
  assert.strictEqual(formats.csvCell(null), '');
  assert.strictEqual(formats.uncell("'=1+1"), '=1+1');
  assert.strictEqual(formats.uncell("'plain"), "'plain");
  assert.strictEqual(formats.uncell(undefined), '');
  const rows = formats.csvObjects('Labels,Name,Labels\na,One,\n');
  assert.deepStrictEqual(rows[0].values.Labels, ['a']);
  assert.deepStrictEqual(formats.csvObjects('A,B\nonly\n')[0].values, Object.assign(Object.create(null), { A: 'only', B: '' }));
  assert.deepStrictEqual(formats.csvObjects(''), []);
  assert.strictEqual(formats.writeCsv(['a'], [['x']]), 'a\nx\n');
  assert.strictEqual(formats.recordFromCell('nope'), null);
  assert.strictEqual(formats.recordFromCell(undefined), null);
});

test('dates, lists, tokens, stems and the record line', () => {
  assert.strictEqual(formats.dateOf('2026-09-23T10:00:00Z'), '2026-09-23');
  assert.strictEqual(formats.dateOf('2026-09-23'), '2026-09-23');
  assert.strictEqual(formats.dateOf('3/Sep/26 9:00 AM'), '2026-09-03');
  assert.strictEqual(formats.dateOf('03/Sep/2026'), '2026-09-03');
  assert.strictEqual(formats.dateOf('3/Xyz/26'), null);
  assert.strictEqual(formats.dateOf('September 3, 2026'), '2026-09-03');
  assert.strictEqual(formats.dateOf('Wed Sep 23 2026 10:00:00 GMT+0000'), '2026-09-23');
  assert.strictEqual(formats.dateOf('Foo 3, 2026'), null);
  assert.strictEqual(formats.dateOf(null), null);
  assert.strictEqual(formats.dateOf('soon'), null);
  assert.deepStrictEqual(formats.listOf(' a, ,b '), ['a', 'b']);
  assert.deepStrictEqual(formats.listOf(null), []);
  assert.deepStrictEqual(formats.listOf(['x', ' ']), ['x']);
  assert.deepStrictEqual(formats.cardTokens('Do it @ann @bob #x \u{1F4C5} 2026-01-02'),
    { assignee: 'ann', due: '2026-01-02', labels: ['x'], title: 'Do it @bob' });
  assert.strictEqual(formats.kindOfLabels(['Type: Decision']), 'decision');
  assert.strictEqual(formats.kindOfLabels(['specification']), 'spec');
  assert.strictEqual(formats.kindOfLabels(['bug']), null);
  assert.strictEqual(formats.stemOf('a/b/Tasks 0123456789abcdef0123456789abcdef.csv'), 'Tasks');
  assert.strictEqual(formats.stemOf('todo.todo.txt'), 'todo');
  assert.deepStrictEqual(formats.takeRecord(null), { record: null, text: '' });
  assert.deepStrictEqual(formats.takeRecord('Body\n\n<!-- agsc-item QQ== -->\n'), { record: 'QQ==', text: 'Body' });
  assert.strictEqual(formats.withRecord('', 'QQ=='), '<!-- agsc-item QQ== -->');
  assert.strictEqual(formats.withRecord(null, null), '');
});

test('the state table both ways', () => {
  assert.strictEqual(board.stateOfWord('In Progress'), 'TASK_STATE_WORKING');
  assert.strictEqual(board.stateOfWord('IN_PROGRESS'), 'TASK_STATE_WORKING');
  assert.strictEqual(board.stateOfWord('TASK_STATE_REJECTED'), 'TASK_STATE_REJECTED');
  assert.strictEqual(board.stateOfWord('input-required'), 'TASK_STATE_INPUT_REQUIRED');
  assert.strictEqual(board.stateOfWord("Won't Do"), 'TASK_STATE_CANCELED');
  assert.strictEqual(board.stateOfWord('closed:not_planned'), 'TASK_STATE_CANCELED');
  assert.strictEqual(board.stateOfWord(''), null);
  assert.strictEqual(board.stateOfWord(null), null);
  assert.strictEqual(board.stateOfWord('Parked'), null);
  assert.deepStrictEqual(board.taskStateOf({ done: true, state: 'Canceled' }), { known: true, state: 'TASK_STATE_CANCELED' });
  assert.deepStrictEqual(board.taskStateOf({ done: true, state: 'Doing' }), { known: true, state: 'TASK_STATE_COMPLETED' });
  assert.deepStrictEqual(board.taskStateOf({ done: false, state: null }), { known: true, state: 'TASK_STATE_SUBMITTED' });
  assert.deepStrictEqual(board.taskStateOf({ done: null, state: ' ' }), { known: true, state: 'TASK_STATE_UNSPECIFIED' });
  assert.deepStrictEqual(board.taskStateOf({ done: null, state: 'Parked' }), { known: false, state: 'TASK_STATE_UNSPECIFIED' });
  assert.strictEqual(board.wordFor('github', 'TASK_STATE_FAILED', null), 'closed:not_planned');
  assert.strictEqual(board.wordFor('github', 'TASK_STATE_WORKING', 'Doing'), 'Doing');
  assert.strictEqual(board.wordFor('gitlab', 'TASK_STATE_REJECTED', null), 'closed');
  assert.strictEqual(board.wordFor('gitlab', 'TASK_STATE_UNSPECIFIED', null), 'Backlog');
  assert.strictEqual(board.wordFor('jira', 'TASK_STATE_WORKING', 'Done'), 'In Progress');
  assert.strictEqual(board.wordFor('jira', 'NOT_A_STATE', null), 'Backlog');
  assert.strictEqual(board.decodeRecord('%%%'), null);
  assert.strictEqual(board.decodeRecord(Buffer.from('{"type":"cluster"}').toString('base64')), null);
  assert.deepStrictEqual(board.extensionsOf('gitlab'), ['.json', '.csv']);
  assert.deepStrictEqual(board.extensionsOf('excel'), []);
  // Every state has a word, and every word reads back as its state — except where the
  // tool has only open and closed (the loss the documentation states).
  const TERMINAL = ['TASK_STATE_CANCELED', 'TASK_STATE_FAILED', 'TASK_STATE_REJECTED'];
  const expected = (format, state) => {
    if (format === 'github') {
      if (state === 'TASK_STATE_COMPLETED') return state;
      return TERMINAL.includes(state) ? 'TASK_STATE_CANCELED' : 'TASK_STATE_SUBMITTED';
    }
    if (format === 'gitlab' && TERMINAL.includes(state)) return 'TASK_STATE_COMPLETED';
    return state;
  };
  for (const state of Object.keys(board.EXPORT_NAMES)) {
    for (const format of board.FORMAT_NAMES) {
      assert.strictEqual(board.stateOfWord(board.wordFor(format, state, null)), expected(format, state), `${format} ${state}`);
    }
  }
});
