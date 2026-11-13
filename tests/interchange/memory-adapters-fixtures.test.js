'use strict';
// verifies PRD-070, AGSC-01-22, AGSC-01-26a, AGSC-00-22, AGSC-03-19
// tests/interchange/memory-adapters-fixtures.test.js — each direct memory adapter reads its
// tool's own files: the recorded fixtures under tests/fixtures/memory-<name>/, shaped as the
// official client returns them (mem0ai 3.3.1, @letta-ai/letta-client 1.12.1,
// @getzep/zep-cloud 4.1.0), as the RFC 4180 library reads them (csv-parse), and as the Basic
// Memory and Claude Code documentation describe them. The fixtures are invented for these
// tests; no client is installed and no network is reached (the trap fails any attempt).
//
// For every foreign record: the item type the adapter maps it to, `status: draft` (AGSC-01-22),
// `prov.origin: imported`, what the mapping claims, and what it keeps in `x-<vendor>-*`
// (AGSC-00-22); a record it cannot map is reported and skipped, never invented.

const test = require('node:test');
const assert = require('node:assert');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const fc = require('fast-check');

const { createFileSystem } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const importVerb = require('../../src/application/cli/verbs/import.js');
const { readSchemas } = require('../../src/adapters/node-fs.js');
const csv = require('../../src/interchange/adapters/csv.js');
const mem0 = require('../../src/interchange/adapters/mem0.js');
const basicMemory = require('../../src/interchange/adapters/basic-memory.js');
const claudeCode = require('../../src/interchange/adapters/claude-code.js');
const { DOORS, trapNetwork } = require('./_memory-network-trap.js');
const frontmatter = require('../../src/knowledge/frontmatter.js');
const yaml = require('../../src/knowledge/yaml.js');
const { itemText } = require('../../src/interchange/records.js');

/** An item file's frontmatter (failsafe YAML) and body. */
function splitItem(text) {
  const split = frontmatter.split(text);
  return { body: split.body, frontmatter: yaml.parse(split.yamlText) };
}

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures');
const EPOCH = '1767225600';
const SCHEMA = readSchemas(ROOT).item;

const temporaries = [];
test.after(() => {
  for (const dir of temporaries) nodeFs.rmSync(dir, { force: true, recursive: true });
});

function temp(prefix) {
  const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaries.push(dir);
  return dir;
}

function emptyBundle() {
  const dir = temp('agsc-memfx-');
  nodeFs.copyFileSync(path.join(FIXTURES, 'minimal', 'agsc.config.json'), path.join(dir, 'agsc.config.json'));
  return dir;
}

/** Import `source` with `--from name` into an empty Bundle; the items written, by path. */
function importInto(name, source, verbFlags = {}) {
  const into = emptyBundle();
  const ctx = {
    argv: [source],
    config: JSON.parse(nodeFs.readFileSync(path.join(into, 'agsc.config.json'), 'utf8')),
    env: {},
    flags: { json: false, quiet: false },
    notes: [],
    openRoot: (at) => createFileSystem(path.resolve(into, at)),
    ports: { clock: createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } }), fs: createFileSystem(into) },
    root: into,
    specVersion: '1.0.0',
    stderr: { write: () => {} },
    stdout: { write: () => {} },
    verbFlags: { from: name, ...verbFlags },
    version: '0.0.2',
  };
  const result = trapNetwork(() => importVerb.run(ctx));
  const items = new Map();
  const content = path.join(into, 'content');
  for (const folder of nodeFs.existsSync(content) ? nodeFs.readdirSync(content).sort() : []) {
    for (const file of nodeFs.readdirSync(path.join(content, folder)).sort()) {
      items.set(`${folder}/${file}`, nodeFs.readFileSync(path.join(content, folder, file), 'utf8'));
    }
  }
  return { findings: result.findings, items, status: result.status };
}

const errors = (findings) => findings.filter((f) => f.severity !== 'warn');
const skipped = (findings) => findings.filter((f) => /not imported/u.test(f.message)).map((f) => f.message).sort();

function assertDraft(text, at) {
  assert.match(text, /^status: draft$/mu, at);
  assert.match(text, /^ {2}origin: imported$/mu, at);
  assert.match(text, /^ {2}operator: human:andreibesleaga$/mu, at);
}

test('the network trap records an attempt the code under test swallows, and puts every door back', () => {
  const before = DOORS.map(([object, member]) => object[member]);
  assert.throws(() => trapNetwork(() => {
    try {
      require('node:net').connect(9, '127.0.0.1');
    } catch (e) { /* swallowed on purpose */ }
    return 1;
  }), /attempted the network: connect/u);
  assert.deepStrictEqual(DOORS.map(([object, member]) => object[member]), before);
  assert.strictEqual(trapNetwork(() => 2), 2);
});

test('mem0: a getAll() page, camelCase and snake_case, becomes draft lessons with the rest kept', () => {
  const { findings, items } = importInto('mem0', path.join(FIXTURES, 'memory-mem0'));
  assert.deepStrictEqual(errors(findings), []);
  assert.deepStrictEqual([...items.keys()], ['lessons/prefers-dark-mode-in-every-editor.md', 'lessons/works-on-the-billing-service.md']);
  const first = items.get('lessons/prefers-dark-mode-in-every-editor.md');
  assertDraft(first, 'first');
  assert.match(first, /^severity: info$/mu);
  assert.match(first, /^date: "2026-08-01"$/mu);
  assert.match(first, /^x-mem0-id: 8c1f2a4e-1b7d-4c55-9a43-0f2d7b1e6a01$/mu);
  assert.match(first, /^x-mem0-categories:\n {2}- preferences$/mu);
  assert.match(first, /^x-mem0-rest: '\{"hash":"5b0e7c0f2c1a","metadata":\{"source":"chat"\},"updatedAt":"2026-08-02T09:30:00\.000Z","userId":"alice"\}'$/mu);
  assert.match(first, /\n## Lesson\n\nPrefers dark mode in every editor\n$/u);
  const second = items.get('lessons/works-on-the-billing-service.md');
  assert.match(second, /^date: "2026-08-03"$/mu, 'snake_case created_at is read too');
  assert.match(second, /^x-mem0-rest: '\{"immutable":false,"user_id":"alice"\}'$/mu);
  assert.match(second, /\n## Lesson\n\nWorks on the billing service\nOwns its deploys on Fridays\n$/u);
});

test('mem0: a bare array and a data.memory record are read; a file with no list is reported', () => {
  const dir = temp('agsc-memfx-mem0-');
  nodeFs.writeFileSync(path.join(dir, 'list.json'), JSON.stringify([{ data: { memory: 'Uses a standing desk' }, id: 'm-1' }, 7]));
  nodeFs.writeFileSync(path.join(dir, 'other.json'), JSON.stringify({ hello: 'world' }));
  nodeFs.writeFileSync(path.join(dir, 'broken.json'), '{ not json');
  const { findings, items } = importInto('mem0', dir);
  assert.deepStrictEqual([...items.keys()], ['lessons/uses-a-standing-desk.md']);
  assert.match(items.get('lessons/uses-a-standing-desk.md'), /^x-mem0-rest: '\{"data":\{"memory":"Uses a standing desk"\}\}'$/mu);
  assert.deepStrictEqual(skipped(findings), [
    'broken.json: not imported: the file is not JSON (Expected property name or \'}\' in JSON at position 2 (line 1 column 3))',
    'list.json:2: not imported: the record is not a JSON object',
    'other.json: not imported: the file holds no list of Mem0 memories (a JSON array, or one under "memories" or "results")',
  ].sort());
});

test('letta: a passage list becomes draft lessons; the embedding is carried, an empty passage is skipped', () => {
  const { findings, items } = importInto('letta', path.join(FIXTURES, 'memory-letta'));
  assert.deepStrictEqual(errors(findings), []);
  const at = 'lessons/the-staging-database-is-rebuilt-every-monday-at-06-00-utc.md';
  assert.deepStrictEqual([...items.keys()], [at]);
  const text = items.get(at);
  assertDraft(text, at);
  assert.match(text, /^date: "2026-07-14"$/mu);
  assert.match(text, /^x-letta-id: passage-4f0b6e2a-9d1c-4c7e-8b3a-1a2b3c4d5e6f$/mu);
  assert.match(text, /^x-letta-tags:\n {2}- ops\n {2}- staging$/mu);
  assert.match(text, /"embedding":\[0\.0125,-0\.5,0\.25\]/u);
  assert.deepStrictEqual(skipped(findings), ['passages.json:2: not imported: the record carries no text']);
});

test('zep: an episode page becomes a lesson and a node page a term; a nameless node is skipped', () => {
  const { findings, items } = importInto('zep', path.join(FIXTURES, 'memory-zep'));
  assert.deepStrictEqual(errors(findings), []);
  assert.deepStrictEqual([...items.keys()], ['concepts/billing-service.md',
    'lessons/alice-moved-the-billing-service-to-the-new-queue-on-3-august.md']);
  const node = items.get('concepts/billing-service.md');
  assertDraft(node, 'node');
  assert.match(node, /^kind: term$/mu);
  assert.match(node, /^x-zep-labels:\n {2}- Entity\n {2}- Service$/mu);
  assert.match(node, /^x-zep-uuid: 9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d$/mu);
  assert.match(node, /\n---\nThe service that issues invoices; Alice owns its deploys\.\n$/u);
  const episode = items.get('lessons/alice-moved-the-billing-service-to-the-new-queue-on-3-august.md');
  assert.match(episode, /^x-zep-rest: '\{"processed":true,"source":"text","sourceDescription":"team chat"\}'$/mu);
  assert.deepStrictEqual(skipped(findings), ['nodes.json:2: not imported: the record is neither an episode (content) nor a node (name)']);
});

test('csv: rows become draft explainers; a quoted line break and a comma survive; an empty row is skipped', () => {
  const { findings, items } = importInto('csv', path.join(FIXTURES, 'memory-csv'));
  assert.deepStrictEqual(errors(findings), []);
  assert.deepStrictEqual([...items.keys()], ['concepts/rotate-the-keys.md', 'concepts/short-title.md']);
  const rotate = items.get('concepts/rotate-the-keys.md');
  assertDraft(rotate, 'rotate');
  assert.match(rotate, /^kind: explainer$/mu);
  assert.match(rotate, /^description: How often the signing keys are rotated and how the rotation is recorded\.$/mu);
  assert.match(rotate, /^date: "2026-05-01"$/mu);
  assert.match(rotate, /^x-csv-tags:\n {2}- ops\n {2}- security$/mu);
  assert.match(rotate, /^x-csv-rest: '\{"owner":"platform"\}'$/mu);
  assert.match(rotate, /\n---\nRotate every ninety days\.\nRecord who did it, and when\.\n$/u);
  const short = items.get('concepts/short-title.md');
  assert.match(short, /^x-csv-description: too short$/mu, 'a description outside 40-200 is kept, not used');
  assert.doesNotMatch(short, /^date:/mu, 'a value that is not a date is no date');
  // The first data row spans lines 2 and 3 (a quoted line break), so the empty row is line 4.
  assert.deepStrictEqual(skipped(findings), ['notes.csv:4: not imported: the row has neither a title nor a body']);
});

test('csv: CRLF records and a byte-order mark read the same; a file the library cannot read is reported', () => {
  const dir = temp('agsc-memfx-csv-');
  const text = nodeFs.readFileSync(path.join(FIXTURES, 'memory-csv', 'notes.csv'), 'utf8');
  nodeFs.writeFileSync(path.join(dir, 'notes.csv'), `\uFEFF${text.replace(/\n/gu, '\r\n')}`);
  nodeFs.writeFileSync(path.join(dir, 'open.csv'), 'title,body\n"never closed,x\n');
  const { findings, items } = importInto('csv', dir);
  const lf = importInto('csv', path.join(FIXTURES, 'memory-csv')).items;
  assert.deepStrictEqual([...items.keys()], [...lf.keys()]);
  // A CRLF inside a quoted field is written as LF, as every item file is (AGSC-01-14, AGSC-04-19).
  assert.strictEqual(items.get('concepts/rotate-the-keys.md'), lf.get('concepts/rotate-the-keys.md'));
  assert.ok(findings.some((f) => f.code === 'AGSC-E201' && f.file === 'open.csv'));
});

test('csv: the export is RFC 4180 (CRLF, quoted fields) and the library reads every row back whole', () => {
  const bundle = {
    config: { site: { base: 'https://n.example/' } },
    items: [{ body: 'Line one, "quoted"\nline two\n', frontmatter: { prov: { operator: 'human:a', origin: 'human' },
      title: 'A, B', type: 'concept', kind: 'term' }, path: 'content/concepts/a-b.md', slug: 'a-b', type: 'concept' }],
  };
  const out = csv.run(bundle, { instant: '2026-01-01T00:00:00Z', sha256: () => 'x', specVersion: '1.0.0' });
  const table = out.files.find((f) => f.path === 'items.csv').text;
  assert.ok(table.startsWith(`${csv.COLUMNS.join(',')}\r\n`));
  assert.match(table, /"Line one, ""quoted""\nline two\n"/u);
  const { parse } = require('csv-parse/sync');
  const rows = parse(table, { columns: true });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].title, 'A, B');
  assert.strictEqual(JSON.parse(rows[0].agsc).body, 'Line one, "quoted"\nline two\n');
});

test('csv: a field with a bare line break is quoted, so a reader that ends a record at any line break keeps the row whole', () => {
  // Python's csv module and frictionless split an unquoted LF; only CRLF ends a record of this export.
  const bundle = {
    config: { site: { base: 'https://n.example/' } },
    items: [{ body: 'l1\nl2\n', frontmatter: { prov: { operator: 'human:a', origin: 'human' }, title: 'Plain title', type: 'concept', kind: 'term' },
      path: 'content/concepts/plain.md', slug: 'plain', type: 'concept' }],
  };
  const table = csv.run(bundle, { instant: '2026-01-01T00:00:00Z', sha256: () => 'x', specVersion: '1.0.0' }).files
    .find((f) => f.path === 'items.csv').text;
  assert.match(table, /,"l1\nl2\n",/u);
  let quoted = false;
  const bare = [];
  for (let i = 0; i < table.length; i += 1) {
    if (table[i] === '"') quoted = !quoted;
    else if (table[i] === '\n' && table[i - 1] !== '\r' && !quoted) bare.push(i);
  }
  assert.deepStrictEqual(bare, [], 'an unquoted LF');
  const { parse } = require('csv-parse/sync');
  assert.strictEqual(JSON.parse(parse(table, { columns: true })[0].agsc).body, 'l1\nl2\n', 'the import reads it back');
});

test('basic-memory: notes become draft explainers; a relation of the fourteen (or an AGSC-03-19 synonym) is a Link', () => {
  const dir = temp('agsc-memfx-bm-');
  nodeFs.cpSync(path.join(FIXTURES, 'memory-basic-memory'), dir, { recursive: true });
  nodeFs.appendFileSync(path.join(dir, 'notes', 'session-management.md'), '\n## Relations\n- refines [[Authentication Design]]\n');
  const { findings, items } = importInto('basic-memory', dir);
  assert.deepStrictEqual(errors(findings), []);
  assert.deepStrictEqual([...items.keys()], ['concepts/authentication-design.md', 'concepts/session-management.md']);
  const auth = items.get('concepts/authentication-design.md');
  assertDraft(auth, 'auth');
  assert.match(auth, /^date: "2026-08-01"$/mu);
  assert.match(auth, /^related:\n {2}- session-management$/mu, 'related [[session-management]] resolves by permalink');
  assert.match(auth, /^x-basic-memory-tags:\n {2}- auth\n {2}- security\n {2}- backend$/mu);
  assert.match(auth, /^x-basic-memory-type: note$/mu);
  assert.match(auth, /^x-basic-memory-modified: "2026-08-10T09:15:00Z"$/mu);
  assert.match(auth, /^x-basic-memory-rest: '\{"status":"active"\}'$/mu);
  // Relations that are not a Link stay in the body, as written.
  assert.match(auth, /\n- depends_on \[\[Session Management\]\]\n- related \[\[session-management\]\]\n- implements \[\[API Security Requirements\]\]\n$/u);
  assert.match(auth, /\n- \[decision\] Using JWT tokens for stateless authentication #security\n/u);
  // AGSC-03-19: `refines` is mapped to `narrower`, resolved by title.
  assert.match(items.get('concepts/session-management.md'), /^narrower:\n {2}- authentication-design$/mu);
  assert.deepStrictEqual(skipped(findings), ['notes/broken.md: not imported: the note\'s frontmatter is not the failsafe YAML'
    + ' subset of AGSC-02-02, so its title and keys cannot be read']);
});

test('basic-memory: the relation reader takes one token or a quoted phrase before a wikilink', () => {
  assert.deepStrictEqual(basicMemory.relationsOf('- uses [[A]]\n- "depends on" [[B|the B]]\n- see also [[C]]\n  - nested [[D]]\n'),
    [{ key: 'uses', ref: 'A' }, { key: 'depends on', ref: 'B' }]);
});

test('claude-code: CLAUDE.md and rules are principles, feedback a lesson, other topics explainers; MEMORY.md and other files are not records', () => {
  const dir = temp('agsc-memfx-cc-');
  nodeFs.cpSync(path.join(FIXTURES, 'memory-claude-code'), dir, { recursive: true });
  // `.claude/` is ignored by the repository's .gitignore, so the rule file is written here.
  nodeFs.mkdirSync(path.join(dir, '.claude', 'rules'), { recursive: true });
  nodeFs.writeFileSync(path.join(dir, '.claude', 'rules', 'testing.md'),
    '---\npaths:\n  - "tests/**/*.js"\n---\n\n# Testing rules\n\nTests use a fixed clock and never the network.\n');
  const { findings, items } = importInto('claude-code', dir);
  assert.deepStrictEqual(errors(findings), []);
  assert.deepStrictEqual([...items.keys()], [
    'concepts/project-rules.md',
    'concepts/testing-rules.md',
    'concepts/the-user-is-a-data-engineer-who-works-mostly-on-the-ingestion-pi.md',
    'lessons/integration-tests-must-hit-a-real-database-never-a-mock.md',
  ]);
  const rules = items.get('concepts/project-rules.md');
  assertDraft(rules, 'CLAUDE.md');
  assert.match(rules, /^kind: principle$/mu);
  assert.match(rules, /^x-claude-path: CLAUDE\.md$/mu);
  assert.match(rules, /\n- @docs\/conventions\.md\n$/u, 'an @path import is kept as text and never followed');
  assert.match(items.get('concepts/testing-rules.md'), /^x-claude-rest: '\{"paths":\["tests\/\*\*\/\*\.js"\]\}'$/mu);
  const lesson = items.get('lessons/integration-tests-must-hit-a-real-database-never-a-mock.md');
  assert.match(lesson, /^x-claude-type: feedback$/mu);
  assert.match(lesson, /^x-claude-name: feedback_testing$/mu);
  assert.match(lesson, /\n## Lesson\n\nIntegration tests must hit a real database, never a mock: a mocked migration passed while the real one failed\.\n$/u);
  const user = items.get('concepts/the-user-is-a-data-engineer-who-works-mostly-on-the-ingestion-pi.md');
  assert.match(user, /^description: The user is a data engineer who works mostly on the ingestion pipelines$/mu);
  assert.match(user, /^x-claude-type: user$/mu, 'the type nested under metadata, as some memory files carry it');
  assert.match(user, /^x-claude-rest: '\{"metadata":\{"origin":"chat","type":"user"\}\}'$/mu);
  for (const text of items.values()) assert.doesNotMatch(text, /Not a memory file/u);
});

test('claude-code: what is a record, by path', () => {
  const index = new Set(['memory']);
  assert.strictEqual(claudeCode.kindOf('CLAUDE.md', index), 'instructions');
  assert.strictEqual(claudeCode.kindOf('pkg/a/CLAUDE.local.md', index), 'instructions');
  assert.strictEqual(claudeCode.kindOf('.claude/CLAUDE.md', index), 'instructions');
  assert.strictEqual(claudeCode.kindOf('pkg/.claude/rules/x/y.md', index), 'instructions');
  assert.strictEqual(claudeCode.kindOf('memory/MEMORY.md', index), 'index');
  assert.strictEqual(claudeCode.kindOf('memory/user_role.md', index), 'topic');
  assert.strictEqual(claudeCode.kindOf('docs/conventions.md', index), null);
});

test('claude-code: the export is an auto-memory folder whose index points at every topic file', () => {
  const bundle = {
    config: { site: { base: 'https://n.example/' } },
    items: [
      { body: '\n# Alpha\n\nText.\n', frontmatter: { kind: 'term', prov: { operator: 'human:a', origin: 'human' }, title: 'Alpha', type: 'concept' },
        path: 'content/concepts/alpha.md', slug: 'alpha', type: 'concept' },
      { body: 'Hidden.\n', frontmatter: { kind: 'term', prov: { operator: 'human:a', origin: 'human' }, status: 'draft', title: 'Beta', type: 'concept' },
        path: 'content/concepts/beta.md', slug: 'beta', type: 'concept' },
    ],
  };
  const out = claudeCode.run(bundle, { instant: '2026-01-01T00:00:00Z', sha256: () => 'x', specVersion: '1.0.0' });
  assert.deepStrictEqual(out.files.map((f) => f.path), ['memory/MEMORY.md', 'memory/alpha.md']);
  const index = out.files[0].text;
  assert.match(index, /\n# Memory Index\n- \[Alpha\]\(alpha\.md\) — Alpha\n$/u);
  assert.ok(index.split('\n').length < 200);
  assert.match(out.files[1].text, /^---\nname: "alpha"\ndescription: "Alpha"\ntype: "reference"\n---\n/u);
});

// ------------------------------------------------------------- properties (fast-check)

/** A published concept with an arbitrary title, body and extra frontmatter key. */
const itemArb = fc.record({
  body: fc.string({ maxLength: 200 }).map((s) => `${s.replace(/\r/gu, '')}\n`),
  extra: fc.string({ maxLength: 40 }),
  slug: fc.stringMatching(/^[a-z][a-z0-9]{2,12}$/u),
  title: fc.string({ maxLength: 60 }).map((s) => `T ${s.replace(/[\r\n]/gu, ' ')}`),
});

function bundleOf(entries) {
  const seen = new Set();
  const items = entries.filter((e) => !seen.has(e.slug) && seen.add(e.slug)).map((e) => ({
    body: e.body,
    frontmatter: { kind: 'term', prov: { operator: 'human:a', origin: 'human' }, title: e.title, type: 'concept', 'x-test-extra': e.extra },
    path: `content/concepts/${e.slug}.md`, slug: e.slug, type: 'concept',
  }));
  return { config: { site: { base: 'https://n.example/' } }, items };
}

const OPTIONS = { instant: '2026-01-01T00:00:00Z', sha256: () => 'x', specVersion: '1.0.0' };
const PLAN = { itemSchema: SCHEMA, operator: 'human:a', origin: 'https://n.example/', peers: [], toolSpecVersion: '1.0.0' };

for (const adapter of importVerb.MEMORY_ADAPTERS) {
  test(`${adapter.FORMAT}: for any items, export then import restores every authored key and body, deterministically`, () => {
    fc.assert(fc.property(fc.array(itemArb, { maxLength: 5 }), (entries) => {
      const bundle = bundleOf(entries);
      const out = adapter.run(bundle, OPTIONS);
      assert.deepStrictEqual(adapter.run(bundle, OPTIONS), out, 'AGSC-01-23: the same bytes twice');
      const files = Object.fromEntries(out.files.map((f) => [f.path, f.text]));
      const planned = adapter.plan(files, PLAN);
      assert.strictEqual(planned.refused, false);
      assert.strictEqual(planned.totals.own, bundle.items.length);
      assert.strictEqual(planned.totals.foreign_drafts, 0);
      assert.deepStrictEqual(adapter.plan(files, PLAN), planned, 'AGSC-01-23: the same plan twice');
      for (const item of bundle.items) {
        const write = planned.writes.find((w) => w.path === `content/concepts/${item.slug}.md`);
        assert.ok(write, item.slug);
        // AGSC-00-22: every key and the body, the unknown key included; the one normalisation
        // admitted is AGSC-04-19's, which every import lane writes with (records.js#itemText).
        const expected = itemText({ ...item.frontmatter,
          prov: { ...item.frontmatter.prov, source_version: '0.0.0+20260101T000000Z' } }, item.body, SCHEMA);
        assert.strictEqual(write.text, expected, item.slug);
        assert.strictEqual(splitItem(write.text).frontmatter['x-test-extra'], item.frontmatter['x-test-extra']);
      }
    }), { numRuns: 25, seed: 20261109 });
  });
}

test('csv: a cell a spreadsheet would read as a formula is written behind a quote, and a foreign one comes back without it', () => {
  const bundle = {
    config: { site: { base: 'https://n.example/' } },
    items: [{ body: '- a list item\n', frontmatter: { description: '@SUM(1+1) is what a careless sheet would compute here.',
      kind: 'term', prov: { operator: 'human:a', origin: 'human' }, title: '=HYPERLINK("https://evil.example","click")', type: 'concept' },
    path: 'content/concepts/formula.md', slug: 'formula', type: 'concept' }],
  };
  const out = csv.run(bundle, OPTIONS);
  const { parse } = require('csv-parse/sync');
  const [row] = parse(out.files.find((f) => f.path === 'items.csv').text, { columns: true });
  assert.strictEqual(row.title, '\'=HYPERLINK("https://evil.example","click")');
  assert.strictEqual(row.description, '\'@SUM(1+1) is what a careless sheet would compute here.');
  assert.strictEqual(row.body, '\'- a list item\n');
  for (const [name, value] of Object.entries(row)) assert.doesNotMatch(value, /^[=+\-@\t\r\uFF1D\uFF0B\uFF0D\uFF20]/u, name);
  const own = csv.plan(Object.fromEntries(out.files.map((f) => [f.path, f.text])), PLAN);
  assert.strictEqual(own.totals.own, 1, 'the agsc column starts with { and brings the item back exactly');
  const foreign = csv.plan({ 'sheet.csv': 'title,body\r\n\'=Plan the move,\'+ step one\r\n' }, PLAN);
  const write = foreign.writes.find((w) => /^content\/concepts\//u.test(w.path));
  assert.match(write.text, /^title: =Plan the move$/mu);
  assert.match(write.text, /\n---\n\+ step one\n$/u);
});

test('csv: an agsc cell that is not JSON, or names no item of this format, is not trusted; the row arrives as a draft', () => {
  const forged = JSON.stringify({ body: 'B', frontmatter: {}, slug: 'Not A Slug', type: 'spaceship' }).replace(/"/gu, '""');
  const table = `title,body,agsc\r\nBroken record,Text one,{not json\r\nForged record,Text two,"${forged}"\r\n`;
  const planned = csv.plan({ 'rows.csv': table }, PLAN);
  assert.strictEqual(planned.totals.own, 0);
  assert.strictEqual(planned.totals.foreign_drafts, 2);
  assert.ok(planned.findings.some((f) => /spaceship/u.test(f.message)), 'the forged record is named as not an item');
  for (const write of planned.writes.filter((w) => /^content\//u.test(w.path))) assert.match(write.text, /^status: draft$/mu, write.path);
});

test('zep: every exported episode keeps the client rule for metadata (at most 10 keys, scalar values)', () => {
  const zep = require('../../src/interchange/adapters/zep.js');
  const out = zep.run(bundleOf([{ body: 'B\n', extra: 'x', slug: 'alpha', title: 'T alpha' }]), OPTIONS);
  const { episodes } = JSON.parse(out.files.find((f) => f.path === zep.FILE).text);
  assert.strictEqual(episodes.length, 1);
  for (const episode of episodes) {
    const entries = Object.entries(episode.metadata);
    assert.ok(entries.length <= 10, 'AddEpisodeRequest: Max 10 keys');
    const scalar = (v) => ['string', 'number', 'boolean'].includes(typeof v);
    for (const [key, value] of entries) assert.ok(scalar(value) || (Array.isArray(value) && value.every(scalar)), key);
  }
  const files = Object.fromEntries(out.files.map((f) => [f.path, f.text]));
  assert.strictEqual(zep.plan(files, PLAN).totals.own, 1, 'the encoded record still brings the item back');
});

test('claude-code: an index longer than Claude Code loads (200 lines or 25 KB) is reported, never cut off in silence', () => {
  const many = bundleOf(Array.from({ length: 205 }, (_, i) => ({ body: 'B\n', extra: '', slug: `item${String(i).padStart(3, '0')}`, title: `T ${i}` })));
  const long = claudeCode.run(many, OPTIONS);
  const warned = long.findings.filter((f) => f.code === 'AGSC-E506' && f.severity === 'warn');
  assert.strictEqual(warned.length, 1);
  assert.match(warned[0].message, /memory\/MEMORY\.md/u);
  assert.match(warned[0].message, /200 lines/u);
  const big = bundleOf([{ body: 'B\n', extra: '', slug: 'wide', title: `T ${'w'.repeat(26000)}` }]);
  assert.strictEqual(claudeCode.run(big, OPTIONS).findings.filter((f) => f.code === 'AGSC-E506').length, 1, '25 KB');
  const few = bundleOf([{ body: 'B\n', extra: '', slug: 'one', title: 'T one' }]);
  assert.deepStrictEqual(claudeCode.run(few, OPTIONS).findings, []);
});

test('mem0: any foreign memory text arrives as a draft lesson that holds the text, never as our own', () => {
  fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.trim() !== ''), (text) => {
    const files = { 'm.json': JSON.stringify([{ id: 'x', memory: text, metadata: { agsc: { bundle: 'https://evil.example/' } } }]) };
    const planned = mem0.plan(files, PLAN);
    assert.strictEqual(planned.totals.own, 0);
    assert.strictEqual(planned.writes.length, 1);
    assert.match(planned.writes[0].text, /^status: draft$/mu);
  }), { numRuns: 50, seed: 20261109 });
});

test('a long run of spaces in a body or a foreign field costs linear time, not quadratic (hostile input)', () => {
  // 200,000 spaces before one letter: a trailing-whitespace pattern that backtracks would
  // take minutes here; a linear one takes milliseconds. The bound is generous on purpose.
  const body = `${' '.repeat(200000)}x\n`;
  const bundle = bundleOf([{ body, extra: '', slug: 'aaa', title: 'T long' }]);
  const started = process.hrtime.bigint();
  for (const adapter of importVerb.MEMORY_ADAPTERS) {
    const out = adapter.run(bundle, OPTIONS);
    adapter.plan(Object.fromEntries(out.files.map((f) => [f.path, f.text])), PLAN);
  }
  claudeCode.plan({ 'memory/MEMORY.md': '', 'memory/a.md': `---\nname: a\ntype: user\n---\n${body}` }, PLAN);
  const seconds = Number(process.hrtime.bigint() - started) / 1e9;
  assert.ok(seconds < 5, `${seconds.toFixed(2)} s`);
});

test('a foreign member named __proto__ or constructor is kept as data and pollutes nothing', () => {
  const planned = csv.plan({ 'a.csv': 'title,__proto__,constructor\nHello there,polluted,ctor\n' }, PLAN);
  assert.match(planned.writes[0].text, /^x-csv-rest: '\{"__proto__":"polluted","constructor":"ctor"\}'$/mu);
  const memo = mem0.plan({ 'm.json': '[{"memory":"A fact","__proto__":{"polluted":true}}]' }, PLAN);
  assert.match(memo.writes[0].text, /^x-mem0-rest: '\{"__proto__":\{"polluted":true\}\}'$/mu);
  assert.strictEqual(({}).polluted, undefined);
});
