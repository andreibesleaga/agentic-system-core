'use strict';
// tests/interchange/gabbe.test.js — the GABBE memory adapter both ways (AGSC-01-26a,
// which names "the … GABBE-memory both-ways adapters of D39/D53"; owner decision D117,
// R118; ENG-9). `export --to gabbe` / `import --from gabbe`.
//
// The kit layout asserted here is the one the GABBE kit's own files state
// (`docs/SCHEMA.md` "Every skill is a Markdown file with YAML frontmatter",
// `agents/memory/CONTINUITY.md`'s entry format, `agents/memory/AUDIT_LOG.md`'s row
// format, `agents/memory/episodic/DECISION_LOG_TEMPLATE.md`). The kit used below is
// SYNTHETIC and written into a temporary directory: the engine's own private kit is
// never read by a test (it is not in the repository). Everything runs through the
// real verbs over the real filesystem with a fixed clock; no network.

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
const gabbe = require('../../src/interchange/adapters/gabbe.js');
const frontmatter = require('../../src/knowledge/frontmatter.js');
const yaml = require('../../src/knowledge/yaml.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const EPOCH = '1767225600';
const SPEC = '1.0.0-rc.6';

const PROV = 'prov:\n  origin: human\n  operator: human:andreibesleaga\n';

/** One item of every type, plus a draft, beside the fixture's three. */
const EXTRA = {
  'content/episodes/nightly-refresh.md': `---\ntype: episode\ntitle: Nightly refresh\n${PROV}started: "2026-01-01T00:00:00Z"\nactor: process:refresh\noutcome: partial\n---\n\nIt ran.\n`,
  'content/lessons/name-the-receiver.md': `---\ntype: lesson\ntitle: Name the receiver\ntags:\n  - agents\n  - patterns\n${PROV}derived-from:\n  - nightly-refresh\nseverity: warn\n---\n\n## Context\n\nA handoff went nowhere.\n\n## Lesson\n\nName the receiver before you stop acting.\n`,
  'content/procedures/hand-over.md': `---\ntype: procedure\ntitle: Hand over\n${PROV}when: when control must move to another agent\n---\n\n## Steps\n\nWrite the state, name the receiver, stop.\n`,
  'content/gates/handoff-recorded.md': `---\ntype: gate\ntitle: Handoff recorded\n${PROV}level: L1\n---\n\nEvery handoff leaves a record.\n`,
  'content/concepts/secret-plan.md': `---\ntype: concept\ntitle: Secret plan\ndescription: A draft that must never leave the node through any export at all.\nstatus: draft\ntags:\n  - agents\n  - patterns\n${PROV}related:\n  - handoff\nkind: pattern\n---\n\nNot yet.\n`,
};

/** A small GABBE kit with one record of every shape the adapter reads, and the faults. */
const KIT = {
  'agents/AGENTS.md': '# AGENTS.md\n\nThe kit\'s own configuration; never read by the adapter.\n',
  'agents/skills/core/tdd-cycle.skill.md': [
    '---',
    'name: "TDD Cycle"',
    'description: "Red, green, refactor: write the failing test first, then the least code."',
    'triggers: ["write a test first", "tdd"]',
    'tags: ["testing", "core"]',
    'context_cost: "low"',
    'owner: "kit"',
    '---',
    '# TDD Cycle',
    '',
    '## Steps',
    '',
    '1. Write the failing test.',
    '',
  ].join('\n'),
  'agents/skills/core/broken.skill.md': '---\nname: &anchor "Broken"\n---\nBody.\n',
  'agents/memory/CONTINUITY.md': [
    '# CONTINUITY — Project Failure Memory',
    '',
    '## How to Use This File',
    '',
    '### Not an entry — outside "## Entries"',
    '',
    '## Entries',
    '',
    '### Auth Module — token refresh race',
    '**Failed approach**: Refreshing inline in middleware',
    '**Why it failed**: Two requests refreshed at once',
    '**Resolution**: Refresh through one endpoint behind a lock',
    '**Date**: 2026-01-15',
    '**Status**: ACTIVE',
    '',
    '<!-- Example entry:',
    '### Example — never imported',
    '**Resolution**: nothing',
    '-->',
    '',
    '## Quick Reference',
    '',
  ].join('\n'),
  'agents/memory/AUDIT_LOG.md': [
    '# Audit Log',
    '- an introduction line, before any section: documentation, not a record',
    '',
    '| Timestamp | Session | Actor | Type | Description | Outcome | References |',
    '|---|---|---|---|---|---|---|',
    '| [YYYY-MM-DDTHH:MM:SSZ] | [S001] | loki-mode | `LOKI_INIT` | template row | OK | — |',
    '| 2026-09-02T10:00:00Z | S002 | owner (human:someone) | `TASK_DONE` | Wrote the plan | PASS | docs/PLAN.md |',
    '| 2026-09-02T11:00:00Z | S002 | claude | `TASK_BLOCKED` | Could not reach the registry | PENDING | — |',
    '',
    '- 2026-09-03 | claude (operator: human:someone) | Did a thing without saying how it ended.',
    '- 2026-09-04 | owner | Decided another thing.',
    '',
    '## 2026-09-05 — a session summary',
    '- Prose about the session, in no entry shape.',
    '',
  ].join('\n'),
  'agents/memory/PROJECT_STATE.md': [
    '# PROJECT_STATE.md',
    '',
    'Phase: S01',
    '',
    '2026-09-02: **S00 GATE PASSED** (owner round 9). Phase → S01.',
    '2026-09-03 (later): Owner chose JavaScript with JSDoc over TypeScript.',
    '',
  ].join('\n'),
  'agents/memory/RESUME_POINTER.md': '# RESUME_POINTER\n\n- NEXT ACTION: none\n',
  'agents/memory/episodic/DECISION_LOG_TEMPLATE.md': '# Decision Log — Session [SESSION_ID]\n\n### Entry 001\n\n| Field | Value |\n|---|---|\n| **Subject** | [x] |\n',
  'agents/memory/episodic/2026-09-05_S03.md': [
    '# Decision Log — Session 3',
    '',
    '## Session Header',
    '',
    '| Field | Value |',
    '|---|---|',
    '| **Date** | 2026-09-05 |',
    '| **Started by** | human:someone |',
    '',
    '### Entry 001',
    '',
    '| Field | Value |',
    '|---|---|',
    '| **Timestamp** | 09:30 UTC |',
    '| **Action Type** | ARCHITECTURE |',
    '| **Subject** | Keep the engine free of a database |',
    '| **Rationale** | Files and git are the store. |',
    '| **Outcome** | PASS |',
    '| **References** | ADR-001 |',
    '',
    '### Entry 002',
    '',
    '| Field | Value |',
    '|---|---|',
    '| **Timestamp** | 10:15 UTC |',
    '| **Actor** | claude-opus |',
    '| **Action Type** | TASK_DONE |',
    '| **Subject** | Wrote the loader |',
    '| **Rationale** | Needed by every verb. |',
    '| **Outcome** | PASS |',
    '',
    '### Entry 003',
    '',
    '| Field | Value |',
    '|---|---|',
    '| **Timestamp** | 11:00 UTC |',
    '| **Action Type** | TASK_BLOCKED |',
    '| **Subject** | Waited for the owner |',
    '| **Outcome** | PENDING |',
    '',
    '### Entry 004',
    '',
    '| Field | Value |',
    '|---|---|',
    '| **Subject** | [one sentence] |',
    '',
  ].join('\n'),
  'agents/memory/episodic/SESSION_SNAPSHOT/S03-2026-09-05.md': '# Snapshot\n\nOpen questions: none.\n',
  'agents/memory/episodic/SESSION_SNAPSHOT/S04-2026-09-06.md': [
    '# Snapshot of session 4',
    '',
    '| Field | Value |',
    '|---|---|',
    '| **Date** | 2026-09-06 |',
    '| **Started by** | human:someone |',
    '| **Outcome** | PASS |',
    '',
  ].join('\n'),
};

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
  const dir = temp('agsc-gabbe-');
  nodeFs.cpSync(FIXTURE, dir, { recursive: true });
  return writeTree(dir, extra);
}

function emptyBundle() {
  const dir = temp('agsc-gabbe-in-');
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
const withoutSourceVersion = (text) => text.replace(/^ {2}source_version: .*\n/mu, '');

function exported(dir) {
  const out = exportVerb.run(ctxFor(dir, { verbFlags: { to: 'gabbe' } }));
  assert.deepStrictEqual(errors(out.findings), []);
  return tree(path.join(dir, 'dist/export/gabbe'));
}

function imported(into, source, verbFlags = {}) {
  const ctx = ctxFor(into, { argv: [source], verbFlags: { from: 'gabbe', ...verbFlags } });
  const result = importVerb.run(ctx);
  return { ...result, notes: ctx.notes.join('') };
}

// ------------------------------------------------------------------ export

test('export --to gabbe writes the kit layout, published items only, one file per item', () => {
  const files = exported(workspace());
  assert.deepStrictEqual([...files.keys()], [
    'agents/guides/agsc/handoff-recorded.md',
    'agents/guides/agsc/steering.md',
    'agents/memory/CONTINUITY.md',
    'agents/memory/episodic/agsc/nightly-refresh.md',
    'agents/memory/semantic/agsc/agent-patterns.md',
    'agents/memory/semantic/agsc/handoff.md',
    'agents/memory/semantic/agsc/supervisor.md',
    'agents/skills/agsc/hand-over.skill.md',
  ]);
  // AGSC-06-30: the draft never leaves, in any file.
  for (const text of files.values()) assert.doesNotMatch(text, /Secret plan|secret-plan/u);
  // AGSC-01-29: the provenance header and the terms on every prose-carrying file.
  for (const [at, text] of files) {
    assert.match(text, /<!-- agsc:provenance\n/u, at);
    assert.match(text, /\nterms: LicenseRef-AgenticSystemCore-Content-Use-1\.0\n/u, at);
  }
  // AGSC-07-15: nothing executable, only Markdown.
  assert.ok([...files.keys()].every((at) => at.endsWith('.md')));
});

test('the exported skill is a GABBE skill: YAML frontmatter with name and description', () => {
  const skill = exported(workspace()).get('agents/skills/agsc/hand-over.skill.md');
  const split = frontmatter.split(skill);
  const fm = yaml.parse(split.yamlText);
  assert.strictEqual(fm.name, 'Hand over');
  assert.strictEqual(fm.description, 'when control must move to another agent');
  assert.deepStrictEqual(fm.triggers, ['when control must move to another agent']);
  assert.deepStrictEqual(fm.tags, ['agsc']);
  assert.ok(!('allowed-tools' in fm));
  assert.match(split.body, /## Steps\n\nWrite the state, name the receiver, stop\.\n$/u);
});

test('lessons are CONTINUITY entries whose bodies are quoted, and the file says to append them', () => {
  const text = exported(workspace()).get('agents/memory/CONTINUITY.md');
  assert.match(text, /never copy this file over it/u);
  assert.match(text, /\n### Name the receiver\n<!-- agsc-item [A-Za-z0-9+/=]+ -->\n\*\*Resolution\*\*: Name the receiver before you stop acting\.\n/u);
  assert.match(text, /\*\*Severity\*\*: warn\n/u);
  assert.match(text, /\n> ## Lesson\n/u, 'the body is quoted, so its headings stay inside the entry');
});

test('the steering guide is the --steer text, and the export is byte-identical twice', () => {
  const dir = workspace();
  const first = exported(dir);
  const steerCtx = ctxFor(dir, { verbFlags: { steer: true, target: 'agents' } });
  exportVerb.run(steerCtx);
  assert.strictEqual(first.get('agents/guides/agsc/steering.md'),
    nodeFs.readFileSync(path.join(dir, 'dist/export/steer/AGENTS.md'), 'utf8'));
  assert.deepStrictEqual(exported(dir), first);
});

// ------------------------------------------------------------------ our own export, back

test('round trip: every published item comes back byte for byte, plus prov.source_version', () => {
  const source = workspace();
  exported(source);
  const into = emptyBundle();
  const result = imported(into, path.join(source, 'dist/export/gabbe'));
  assert.deepStrictEqual(errors(result.findings), []);
  const back = tree(path.join(into, 'content'));
  const original = tree(path.join(source, 'content'));
  const published = [...original.keys()].filter((at) => at !== 'index.md' && !at.includes('secret-plan'));
  assert.deepStrictEqual([...back.keys()].sort(), published.sort());
  for (const at of published) {
    assert.match(back.get(at), /^ {2}source_version: 0\.0\.0\+20260101T000000Z$/mu, at);
    assert.strictEqual(withoutSourceVersion(back.get(at)), original.get(at), at);
  }
  // AGSC-01-23: a second import changes nothing.
  const again = imported(into, path.join(source, 'dist/export/gabbe'));
  assert.deepStrictEqual(errors(again.findings), []);
  assert.match(again.notes, /import: 0 written, 0 replaced, 7 unchanged/u);
  assert.deepStrictEqual(tree(path.join(into, 'content')), back);
  // And the imported Bundle is a Bundle: lint finds no error about any item (the
  // missing security contact is the empty target's, and no import writes one).
  assert.deepStrictEqual(errors(lintVerb.run(ctxFor(into)).findings)
    .filter((f) => f.file !== '.well-known/security.txt'), []);
});

test('a lesson of ours appended to a kit\'s CONTINUITY comes back once, beside the kit\'s own entry', () => {
  const source = workspace();
  const files = exported(source);
  const ours = files.get('agents/memory/CONTINUITY.md').split('## Entries\n\n')[1];
  const kit = writeTree(temp('agsc-gabbe-kit-'), {
    'agents/memory/CONTINUITY.md': KIT['agents/memory/CONTINUITY.md'].replace('## Quick Reference', `${ours}\n## Quick Reference`),
  });
  const into = emptyBundle();
  imported(into, kit);
  assert.deepStrictEqual([...tree(path.join(into, 'content')).keys()],
    ['lessons/auth-module-token-refresh-race.md', 'lessons/name-the-receiver.md']);
});

test('collisions: nothing is written, --dry-run reports the same, --replace replaces', () => {
  const source = workspace();
  exported(source);
  const kit = path.join(source, 'dist/export/gabbe');
  const into = emptyBundle();
  imported(into, kit);
  const at = path.join(into, 'content/gates/handoff-recorded.md');
  nodeFs.writeFileSync(at, nodeFs.readFileSync(at, 'utf8').replace('Every handoff', 'Each handoff'));
  const before = tree(path.join(into, 'content'));
  const dry = imported(into, kit, { 'dry-run': true });
  assert.strictEqual(dry.status, 'fail');
  assert.deepStrictEqual(errors(dry.findings).map((f) => [f.code, f.file]), [['AGSC-E206', 'content/gates/handoff-recorded.md']]);
  const refused = imported(into, kit);
  assert.strictEqual(refused.status, 'fail');
  assert.deepStrictEqual(tree(path.join(into, 'content')), before);
  const replaced = imported(into, kit, { replace: true });
  assert.deepStrictEqual(errors(replaced.findings), []);
  assert.match(nodeFs.readFileSync(at, 'utf8'), /Every handoff/u);
});

test('a record of a newer specification is refused unless --allow-newer (AGSC-01-22)', () => {
  const source = workspace();
  exported(source);
  const kit = path.join(source, 'dist/export/gabbe');
  const skill = path.join(kit, 'agents/skills/agsc/hand-over.skill.md');
  const text = nodeFs.readFileSync(skill, 'utf8');
  const b64 = /<!-- agsc-item (\S+) -->/u.exec(text)[1];
  const record = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  record.spec_version = '1.9.0';
  nodeFs.writeFileSync(skill, text.replace(b64, gabbe.encodeRecord(record)));
  const into = emptyBundle();
  const refused = imported(into, kit);
  assert.strictEqual(refused.status, 'fail');
  assert.deepStrictEqual(refused.findings.map((f) => f.code), ['AGSC-E004']);
  assert.deepStrictEqual(tree(path.join(into, 'content')).size, 0);
  const taken = imported(into, kit, { 'allow-newer': true });
  assert.deepStrictEqual(errors(taken.findings), []);
});

// ------------------------------------------------------------------ a foreign kit

test('a foreign kit: skills, lessons, decisions and episodes, mapped without inventing', () => {
  const kit = writeTree(temp('agsc-gabbe-kit-'), KIT);
  const into = emptyBundle();
  const result = imported(into, kit);
  assert.deepStrictEqual(errors(result.findings), []);
  const back = tree(path.join(into, 'content'));
  assert.deepStrictEqual([...back.keys()], [
    'concepts/keep-the-engine-free-of-a-database.md',
    'concepts/owner-chose-javascript-with-jsdoc-over-typescript.md',
    'concepts/s00-gate-passed-owner-round-9.md',
    'episodes/snapshot-of-session-4.md',
    'episodes/wrote-the-loader.md',
    'episodes/wrote-the-plan.md',
    'lessons/auth-module-token-refresh-race.md',
    'procedures/tdd-cycle.md',
  ]);
  const skill = back.get('procedures/tdd-cycle.md');
  assert.match(skill, /^title: TDD Cycle$/mu);
  assert.match(skill, /^description: "Red, green, refactor: write the failing test first, then the least code\."$/mu);
  assert.match(skill, /^when: write a test first; tdd$/mu);
  assert.match(skill, /^x-gabbe-triggers:\n {2}- write a test first\n {2}- tdd$/mu);
  assert.match(skill, /^x-gabbe-tags:\n {2}- testing\n {2}- core$/mu);
  assert.match(skill, /^x-gabbe-context-cost: low$/mu);
  assert.match(skill, /^x-gabbe-rest: '\{"owner":"kit"\}'$/mu);
  assert.match(skill, /^x-gabbe-source: agents\/skills\/core\/tdd-cycle\.skill\.md:1$/mu);
  assert.match(skill, /\n# TDD Cycle\n\n## Steps\n\n1\. Write the failing test\.\n$/u);
  assert.match(skill, /^ {2}origin: imported$/mu);
  assert.doesNotMatch(skill, /source_version/u, 'a kit publishes no content version');

  const lesson = back.get('lessons/auth-module-token-refresh-race.md');
  assert.match(lesson, /^severity: info$/mu);
  assert.match(lesson, /^date: "2026-01-15"$/mu);
  assert.match(lesson, /^x-gabbe-status: ACTIVE$/mu);
  assert.match(lesson, /## Lesson\n\nRefresh through one endpoint behind a lock\n\n## Evidence\n\n\*\*Failed approach\*\*: Refreshing inline in middleware\n\n\*\*Why it failed\*\*: Two requests refreshed at once\n$/u);

  const decision = back.get('concepts/keep-the-engine-free-of-a-database.md');
  assert.match(decision, /^kind: decision$/mu);
  assert.match(decision, /^date: "2026-09-05"$/mu);
  assert.match(decision, /^x-gabbe-type: ARCHITECTURE$/mu);

  const state = back.get('concepts/s00-gate-passed-owner-round-9.md');
  assert.match(state, /^title: S00 GATE PASSED \(owner round 9\)\.$/mu);
  assert.match(state, /\n\*\*S00 GATE PASSED\*\* \(owner round 9\)\. Phase → S01\.\n$/u);

  const row = back.get('episodes/wrote-the-plan.md');
  assert.match(row, /^started: "2026-09-02T10:00:00Z"$/mu);
  assert.match(row, /^actor: human:someone$/mu);
  assert.match(row, /^outcome: success$/mu);
  const snapshot = back.get('episodes/snapshot-of-session-4.md');
  assert.match(snapshot, /^started: "2026-09-06T00:00:00Z"$/mu);
  assert.match(snapshot, /^outcome: success$/mu);
  const entry = back.get('episodes/wrote-the-loader.md');
  assert.match(entry, /^started: "2026-09-05T10:15:00Z"$/mu);
  assert.match(entry, /^actor: process:claude-opus$/mu);

  // Reported, never invented: the pending row and entry, the two bullets, the bad
  // skill, the snapshot with no outcome, the resume pointer.
  const skipped = result.findings.filter((f) => f.code === 'AGSC-E506' && /not imported/u.test(f.message));
  const messages = skipped.map((f) => f.message).join('\n');
  assert.match(messages, /AUDIT_LOG\.md:8: an audit row was not imported: it states no outcome/u);
  assert.match(messages, /2 bullet entries \(lines 10, 11\) were not imported/u);
  assert.match(messages, /2026-09-05_S03\.md:32: an entry was not imported: it states no outcome/u);
  assert.match(messages, /broken\.skill\.md: not imported: the skill's frontmatter is not the failsafe YAML/u);
  assert.match(messages, /S03-2026-09-05\.md: not imported: the file states no outcome/u);
  assert.match(messages, /RESUME_POINTER\.md: not imported: the resume pointer is working state/u);
  assert.match(messages, /AUDIT_LOG\.md: 1 further list line\(s\) \(from line 14\) were not imported/u);
  assert.strictEqual(skipped.length, 7);
  assert.ok(result.findings.some((f) => /severity "info", the AGSC-09-14b default/u.test(f.message)));
  assert.ok(result.findings.some((f) => /pass --source-version/u.test(f.message)));
});

test('--source-version is recorded on every foreign item, and a malformed one is refused', () => {
  const kit = writeTree(temp('agsc-gabbe-kit-'), KIT);
  const into = emptyBundle();
  const result = imported(into, kit, { 'source-version': 'gabbe-1.1.1+3.gabc' });
  assert.deepStrictEqual(errors(result.findings), []);
  for (const [at, text] of tree(path.join(into, 'content'))) {
    assert.match(text, /^ {2}source_version: gabbe-1\.1\.1\+3\.gabc$/mu, at);
  }
  const bad = imported(emptyBundle(), kit, { 'source-version': 'no spaces allowed' });
  assert.strictEqual(bad.status, 'fail');
  assert.deepStrictEqual(bad.findings.map((f) => f.code), ['AGSC-E204']);
});

test('a foreign kit round trip: kit → node → kit → node gives the same items', () => {
  const kit = writeTree(temp('agsc-gabbe-kit-'), KIT);
  const first = emptyBundle();
  imported(first, kit);
  const out = exported(first);
  assert.ok(out.has('agents/skills/agsc/tdd-cycle.skill.md'));
  const skill = yaml.parse(frontmatter.split(out.get('agents/skills/agsc/tdd-cycle.skill.md')).yamlText);
  assert.deepStrictEqual(skill.triggers, ['write a test first', 'tdd'], 'the kit\'s triggers go back verbatim');
  assert.deepStrictEqual(skill.tags, ['agsc', 'testing', 'core']);
  assert.strictEqual(skill.context_cost, 'low');
  const second = emptyBundle();
  const result = imported(second, path.join(first, 'dist/export/gabbe'));
  assert.deepStrictEqual(errors(result.findings), []);
  const a = tree(path.join(first, 'content'));
  const b = tree(path.join(second, 'content'));
  assert.deepStrictEqual([...b.keys()], [...a.keys()]);
  for (const at of a.keys()) assert.strictEqual(withoutSourceVersion(b.get(at)), withoutSourceVersion(a.get(at)), at);
});

test('a directory with no kit file is AGSC-E901, and a refused file stops the import', () => {
  const empty = imported(emptyBundle(), temp('agsc-gabbe-none-'));
  assert.strictEqual(empty.status, 'fail');
  assert.deepStrictEqual(empty.findings.map((f) => f.code), ['AGSC-E901']);
  const big = writeTree(temp('agsc-gabbe-big-'), { 'agents/memory/PROJECT_STATE.md': `2026-01-01: ${'x'.repeat(1024 * 1024)}\n` });
  const refused = imported(emptyBundle(), big);
  assert.strictEqual(refused.status, 'fail');
  assert.deepStrictEqual(refused.findings.map((f) => f.code), ['AGSC-E904']);
});

// ------------------------------------------------------------------ the helpers

test('the helpers: actors, instants, outcomes, table cells, placeholders, records', () => {
  assert.strictEqual(gabbe.actorOf('owner (human:andreibesleaga)'), 'human:andreibesleaga');
  assert.strictEqual(gabbe.actorOf('claude-code/1.0'), 'claude-code/1.0');
  assert.strictEqual(gabbe.actorOf('Loki Mode'), 'process:loki');
  assert.strictEqual(gabbe.actorOf('[agent persona / human]'), null);
  assert.strictEqual(gabbe.actorOf('(x)'), null);
  assert.strictEqual(gabbe.instantOf('2026-09-05', '09:30 UTC'), '2026-09-05T09:30:00Z');
  assert.strictEqual(gabbe.instantOf('2026-09-05T08:07:06Z', 'ignored'), '2026-09-05T08:07:06Z');
  assert.strictEqual(gabbe.instantOf('2026-09-05', ''), '2026-09-05T00:00:00Z');
  assert.strictEqual(gabbe.instantOf('[YYYY-MM-DD]', ''), null);
  assert.strictEqual(gabbe.outcomeOf('PASS'), 'success');
  assert.strictEqual(gabbe.outcomeOf('**FAIL** (flaky)'), 'failure');
  assert.strictEqual(gabbe.outcomeOf('DEFERRED'), null);
  assert.deepStrictEqual(gabbe.cells('| a | b \\| c |'), ['a', 'b | c']);
  assert.strictEqual(gabbe.cells('not a row'), null);
  assert.strictEqual(gabbe.valueOf('*(Empty — add entries)*'), '');
  assert.strictEqual(gabbe.decodeRecord('not base64 json'), null);
  assert.strictEqual(gabbe.decodeRecord(Buffer.from('{"slug":1}').toString('base64')), null);
  assert.strictEqual(gabbe.kindOf('agents/memory/semantic/other.md'), null);
  assert.strictEqual(gabbe.kindOf('agents/skills/x/README.md'), null);
  assert.strictEqual(gabbe.withoutComments('a<!-- b\nc -->d'), 'a\nd');
  // The plan tolerates an own-record line that decodes to nothing.
  const planned = gabbe.plan({ 'agents/guides/agsc/x.md': '<!-- agsc-item AAAA -->\n' }, { operator: 'human:x' });
  assert.deepStrictEqual(planned.writes, []);
  assert.strictEqual(planned.totals.records_rejected, 1);
});
