'use strict';
// verifies AGSC-09-07, AGSC-09-09, AGSC-04-19, AGSC-08-04, AGSC-01-14, AGSC-01-37, AGSC-00-17, AGSC-08-25
// What a person reads from the command line, each message pinned: the help text
// (one line of purpose per verb), the hint after an unknown verb, the usage of
// `refresh`, the empty Proposal before the first commit, the Proposal's patch in the
// form `lint --fix` writes, the rule the `--level` refusal cites, the path a refused
// `conform --to` names, the lint lane that cannot see the tracked files, the encoding
// of `PRIVACY.md` and the pages under `site/`, the spec_version message, and the
// spend of an earlier dry run counted by the lane meter.
//
// Over scratch copies of `tests/fixtures/minimal`, in process, with a fixed instant
// and no network. The git history, where one is needed, has fixed names and dates.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { applyPatch } = require('diff');
const { agsc, scratch, writeConfig } = require('./_bundle-run.js');
const { main, VERBS } = require('../../../src/application/cli/main.js');
const { createProcessRunner } = require('../../../src/adapters/node-proc.js');
const { captureStream } = require('../../conformance/areas/_shared.js');

/** The shell with no Bundle at all: what `agsc --help` or a typo prints. */
function bare(argv) {
  const stdout = captureStream();
  const stderr = captureStream();
  const exit = main(argv, { env: {}, root: '.', stderr, stdout, version: '0.0.0' });
  return { exit, stderr: stderr.text(), stdout: stdout.text() };
}

/** The findings of the envelope a `--json` run printed on stdout (each once). */
function envelopeFindings(r) {
  return JSON.parse(r.stdout).findings;
}

/** A ProcessRunner whose answers are fixed. */
function fakeProc(answers) {
  return { run: (cmd, args) => (answers[`${cmd} ${args.join(' ')}`] || { code: 128, stderr: 'fatal: not a git repository', stdout: '' }) };
}

/** A fixed-date git history of one commit in `dir`. */
function commitAll(dir, subject) {
  const env = {
    GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
    GIT_AUTHOR_EMAIL: 'alice@example.org',
    GIT_AUTHOR_NAME: 'Alice',
    GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
    GIT_COMMITTER_EMAIL: 'alice@example.org',
    GIT_COMMITTER_NAME: 'Alice',
    GIT_CONFIG_NOSYSTEM: '1',
    HOME: dir,
    PATH: process.env.PATH,
  };
  const git = (args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', ...args],
    { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
  if (!fs.existsSync(path.join(dir, '.git'))) git(['init', '--quiet']);
  git(['add', '-A']);
  git(['commit', '--quiet', '-m', subject]);
}

// ---------------------------------------------------------------- help

test('AGSC-09-09: agsc --help gives each of the sixteen verbs a line of its own with a sentence of purpose', () => {
  const r = bare(['--help']);
  assert.strictEqual(r.exit, 0);
  assert.strictEqual(r.stderr, '');
  const lines = r.stdout.split('\n').map((l) => l.trim());
  for (const verb of VERBS) {
    const own = lines.filter((l) => l.split(/\s+/u)[0] === verb);
    assert.strictEqual(own.length, 1, `"${verb}" begins ${own.length} lines:\n${r.stdout}`);
    const rest = own[0].split(/\s+/u).slice(1);
    assert.ok(rest.length >= 3 && rest.some((word) => !VERBS.includes(word)), own[0]);
  }
  assert.match(r.stdout, /agsc <verb> --help/u, 'the help names the per-verb form');
});

test('AGSC-09-09: agsc <verb> --help repeats that verb\'s line of purpose', () => {
  const { VERB_PURPOSE } = require('../../../src/application/cli/main.js');
  assert.deepStrictEqual(Object.keys(VERB_PURPOSE).sort(), [...VERBS].sort());
  for (const verb of VERBS) assert.ok(bare([verb, '--help']).stdout.includes(VERB_PURPOSE[verb]), verb);
});

test('AGSC-09-07: agsc help is AGSC-E001, exit 2, with the hint that names agsc --help and agsc <verb> --help', () => {
  for (const argv of [['help'], [], ['nosuch']]) {
    const human = bare(argv);
    assert.strictEqual(human.exit, 2);
    assert.strictEqual(human.stdout, '');
    assert.match(human.stderr, /^agsc: AGSC-E001 .*run agsc --help for the sixteen verbs, or agsc <verb> --help for one verb/u);
    const json = bare([...argv, '--json']);
    assert.strictEqual(json.exit, 2);
    const one = JSON.parse(json.stderr);
    assert.strictEqual(one.code, 'AGSC-E001');
    assert.ok(one.message.includes('agsc --help') && one.message.includes('agsc <verb> --help'), one.message);
  }
});

test('AGSC-09-07: the usage of refresh shows --agent as required', () => {
  const r = bare(['refresh', '--help']);
  assert.match(r.stdout, /agsc refresh --agent <name> \[--task <slug>\] \[--dry-run\]/u);
});

// ---------------------------------------------------------------- propose

test('AGSC-08-04: propose before the first commit says there is no commit to compare with yet', async (t) => {
  const dir = scratch(t, 'agsc-msg-');
  // No repository: a runner that answers "not a git repository".
  const r = await agsc(dir, ['propose', 'supervisor', '--json'], { proc: fakeProc({}) });
  assert.strictEqual(r.exit, 0);
  const warn = envelopeFindings(r).filter((f) => f.code === 'AGSC-E506');
  assert.strictEqual(warn.length, 1, JSON.stringify(r.findings));
  assert.match(warn[0].message, /no commit to compare content\/concepts\/supervisor\.md with yet; commit once, then propose/u);
  assert.ok(!/already in the canonical form/u.test(warn[0].message), warn[0].message);
});

test('AGSC-04-19: the patch propose writes gives the file lint --fix writes', async (t) => {
  const dir = scratch(t, 'agsc-msg-');
  commitAll(dir, 'Initial content');
  const file = path.join(dir, 'content', 'concepts', 'supervisor.md');
  const committed = fs.readFileSync(file, 'utf8');
  // An edit with `prov` in another key order and a date written without quotes.
  const edited = committed
    .replace('date: "2026-01-01"', 'date: 2026-01-02')
    .replace('prov:\n  origin: human\n  operator: human:andreibesleaga', 'prov:\n  operator: human:andreibesleaga\n  origin: human');
  assert.notStrictEqual(edited, committed);
  fs.writeFileSync(file, edited);

  const proposed = await agsc(dir, ['propose', 'supervisor', '--json'], { proc: createProcessRunner({ cwd: dir }) });
  assert.strictEqual(proposed.exit, 0, JSON.stringify(proposed.findings));
  const patch = fs.readFileSync(path.join(dir, 'dist', 'proposal', '1.patch'), 'utf8');
  const fromPatch = applyPatch(committed, patch);
  assert.strictEqual(typeof fromPatch, 'string', 'the patch does not apply to the committed file');

  const fixed = await agsc(dir, ['lint', '--fix']);
  assert.strictEqual(fixed.exit, 0, fixed.stderr);
  assert.strictEqual(fromPatch, fs.readFileSync(file, 'utf8'), 'the patch and lint --fix disagree');
  assert.match(fromPatch, /^date: "2026-01-02"$/mu);
  assert.match(fromPatch, /^prov:\n {2}origin: human\n {2}operator: human:andreibesleaga$/mu);
});

// ---------------------------------------------------------------- --level, --to

test('AGSC-09-09: the --level refusal cites AGSC-09-09, where the sentence is', async (t) => {
  const dir = scratch(t, 'agsc-msg-');
  for (const verb of ['build', 'ci', 'conform']) {
    const r = await agsc(dir, [verb, '--level', '9', '--json']);
    assert.strictEqual(r.exit, 2);
    const refusal = r.findings.find((f) => f.code === 'AGSC-E003');
    assert.ok(refusal, JSON.stringify(r.findings));
    assert.match(refusal.message, /\(AGSC-09-09\)$/u);
  }
});

test('AGSC-09-09: a refused conform --to names the path given, and nothing is written', async (t) => {
  const dir = scratch(t, 'agsc-msg-');
  const outside = path.join(path.dirname(dir), `${path.basename(dir)}-report.json`);
  // The last two are typed as on Windows, so every platform sees a backslash.
  for (const to of [outside, '../report.json', 'dist/../../report.json', '..\\report.json', 'C:\\Users\\agsc\\report.json']) {
    const r = await agsc(dir, ['conform', '--to', to, '--json']);
    assert.strictEqual(r.exit, 1);
    const refusal = envelopeFindings(r).filter((f) => f.code === 'AGSC-E902');
    assert.strictEqual(refusal.length, 1, JSON.stringify(r.findings));
    // The file member is the value as typed; the message names it in the one
    // path form of the file-system port, with `/` (src/adapters/node-fs.js safeJoin).
    assert.strictEqual(refusal[0].file, to);
    const named = to.split('\\').join('/');
    assert.ok(refusal[0].message.includes(named), `the message does not name ${named}: ${refusal[0].message}`);
    assert.match(refusal[0].message, /conform --to/u);
    assert.ok(!fs.existsSync(path.join(dir, 'dist')), 'conform wrote something');
  }
  assert.ok(!fs.existsSync(outside));
});

test('AGSC-09-09: a refused compose --out names the path given', async (t) => {
  const dir = scratch(t, 'agsc-msg-');
  const r = await agsc(dir, ['compose', 'agent-patterns', '--out', '../harness', '--json']);
  assert.strictEqual(r.exit, 1);
  const refusal = r.findings.find((f) => f.code === 'AGSC-E902');
  assert.ok(refusal && refusal.message.includes('../harness'), JSON.stringify(r.findings));
});

// ---------------------------------------------------------------- lint

test('AGSC-01-37: outside a git repository the lint lane says so, not that a port is missing', async (t) => {
  const dir = scratch(t, 'agsc-msg-');
  const outside = await agsc(dir, ['lint'], { proc: fakeProc({}) });
  assert.match(outside.stderr, /lane: governance \(without the tracked-file check of AGSC-01-37: not a git repository\)/u);
  const noPort = await agsc(dir, ['lint']);
  assert.match(noPort.stderr, /lane: governance \(without the tracked-file check of AGSC-01-37: no ProcessRunner port\)/u);
});

test('AGSC-01-14: lint and ci report PRIVACY.md and the pages under site/ when their encoding is wrong', async (t) => {
  const dir = scratch(t, 'agsc-msg-');
  fs.writeFileSync(path.join(dir, 'PRIVACY.md'), '# Privacy\r\n\r\nNo cookies.\r\n');
  fs.mkdirSync(path.join(dir, 'site', 'docs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'site', 'about.md'), '﻿# About\n\nThis node.\n');
  fs.writeFileSync(path.join(dir, 'site', 'docs', 'cafe.md'), '# Cafe\n\nCafé au lait.\n');
  fs.writeFileSync(path.join(dir, 'site', 'docs', 'clean.md'), '# Clean\n\nNothing wrong here.\n');
  fs.writeFileSync(path.join(dir, 'site', 'logo.txt'), 'not a page\r\n');

  const lint = await agsc(dir, ['lint', '--json']);
  assert.strictEqual(lint.exit, 1);
  const e108 = envelopeFindings(lint).filter((f) => f.code === 'AGSC-E108').map((f) => [f.file, f.severity]);
  assert.deepStrictEqual(e108.sort(), [
    ['PRIVACY.md', 'error'],
    ['site/about.md', 'error'],
    ['site/docs/cafe.md', 'error'],
  ]);
  const ci = await agsc(dir, ['ci', '--json']);
  assert.strictEqual(ci.exit, 1);
  assert.ok(ci.findings.some((f) => f.code === 'AGSC-E108' && f.file === 'PRIVACY.md'), JSON.stringify(ci.findings));

  // Put right, nothing is reported.
  fs.writeFileSync(path.join(dir, 'PRIVACY.md'), '# Privacy\n\nNo cookies.\n');
  fs.writeFileSync(path.join(dir, 'site', 'about.md'), '# About\n\nThis node.\n');
  fs.writeFileSync(path.join(dir, 'site', 'docs', 'cafe.md'), '# Café\n\nCafé au lait.\n');
  const clean = await agsc(dir, ['lint', '--json']);
  assert.strictEqual(clean.exit, 0, JSON.stringify(clean.findings));
});

test('AGSC-00-17: an item\'s other MAJOR is compared with the configuration\'s spec_version, and the message says so', async (t) => {
  const dir = scratch(t, 'agsc-msg-');
  const file = path.join(dir, 'content', 'concepts', 'handoff.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('type: concept\n', 'type: concept\nspec_version: 2.0.0\n'));
  const r = await agsc(dir, ['lint', '--json']);
  const e204 = r.findings.find((f) => f.code === 'AGSC-E204' && f.key === 'spec_version');
  assert.ok(e204, JSON.stringify(r.findings));
  assert.match(e204.message, /carries another MAJOR than the configuration's "1\.0\.0"/u);
});

// ---------------------------------------------------------------- refresh

test('AGSC-08-25: the lane run counts the Episode an earlier dry run printed, and stops at the budget', async (t) => {
  const dir = scratch(t, 'agsc-msg-');
  writeConfig(dir, (config) => {
    config.channels = [{ adapter: 'stub', author: 'lane-bot', name: 'lane', owner: 'human:andreibesleaga', publish: 'auto' }];
    config.agents = [{
      author: 'lane-bot', budget_usd_month: 5, channel: 'lane', enabled: true, kind: 'llm', model: 'example-model-1',
      name: 'curator', operator: 'human:andreibesleaga', tasks: ['refresh'], types: ['concept', 'episode', 'lesson'],
    }];
  });
  // A merged Episode of the lane, 3 USD in January 2026.
  fs.mkdirSync(path.join(dir, 'content', 'episodes'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'content', 'episodes', 'curator-run-1.md'), ['---', 'type: episode',
    'title: A run of the curator lane', 'description: One run of an agent lane, recorded with the spend its usage carries.',
    'actor: process:curator', 'started: "2026-01-01T00:00:00Z"', 'outcome: partial',
    'usage:', '  model: example-model-1', '  tokens_in: 0', '  tokens_out: 0', '  cost_usd: 3', '  estimate: true',
    'prov:', '  origin: ai-generated', '  agent: curator', '  model: example-model-1', '  operator: human:andreibesleaga',
    '---', '', '## What happened', '', 'The lane ran once.', ''].join('\n'));

  const first = await agsc(dir, ['refresh', '--agent', 'curator', '--dry-run', '--json']);
  assert.strictEqual(first.exit, 0, JSON.stringify(first.findings));
  assert.deepStrictEqual(envelopeFindings(first), []);
  const patchFile = path.join(dir, 'dist', 'proposal', '1.patch');
  // The dry run printed an Episode of 0 USD. A run that called a model records its
  // spend there: 2 USD, so the month holds 3 merged plus 2 printed, the budget of 5.
  const printed = fs.readFileSync(patchFile, 'utf8');
  assert.match(printed, /^\+ {2}cost_usd: 0$/mu);
  fs.writeFileSync(patchFile, printed.replace(/^\+ {2}cost_usd: 0$/mu, '+  cost_usd: 2'));

  const second = await agsc(dir, ['refresh', '--agent', 'curator', '--dry-run', '--json']);
  assert.strictEqual(second.exit, 0, JSON.stringify(second.findings));
  assert.deepStrictEqual(envelopeFindings(second).map((f) => [f.code, f.severity]), [['AGSC-E510', 'warn']]);
  assert.ok(!fs.existsSync(path.join(dir, 'dist', 'proposal', '2.patch')), 'the second run wrote a Proposal');

  // Once that Episode is merged, it is counted once, not twice: at 1 USD each the
  // month holds 3 + 1 and the run goes on.
  fs.writeFileSync(patchFile, printed.replace(/^\+ {2}cost_usd: 0$/mu, '+  cost_usd: 1'));
  const added = applyPatch('', fs.readFileSync(patchFile, 'utf8'));
  const at = /^\+\+\+ b\/(content\/episodes\/[a-z0-9-]+\.md)$/mu.exec(printed)[1];
  fs.writeFileSync(path.join(dir, at), added);
  const third = await agsc(dir, ['refresh', '--agent', 'curator', '--dry-run', '--json']);
  assert.strictEqual(third.exit, 0, JSON.stringify(third.findings));
  assert.deepStrictEqual(envelopeFindings(third), []);
  assert.ok(fs.existsSync(path.join(dir, 'dist', 'proposal', '2.patch')));

  // What is not a printed Episode adds nothing: a Proposal with no patch, a patch that
  // is not one, a changed (not added) item, and an added file that is no item.
  const proposal = (n) => path.join(dir, 'dist', 'proposal', n);
  fs.writeFileSync(proposal('3.md'), 'no patch beside this one\n');
  fs.writeFileSync(proposal('4.md'), 'a body\n');
  fs.writeFileSync(proposal('4.patch'), '@@ -1 +1 @@\n not a patch at all\n');
  fs.writeFileSync(proposal('5.md'), 'a body\n');
  fs.writeFileSync(proposal('5.patch'), ['--- a/content/episodes/curator-run-1.md', '+++ b/content/episodes/curator-run-1.md',
    '@@ -0,0 +1 @@', '+cost_usd: 9', ''].join('\n'));
  fs.writeFileSync(proposal('6.md'), 'a body\n');
  fs.writeFileSync(proposal('6.patch'), ['--- /dev/null', '+++ b/content/episodes/no-item.md', '@@ -0,0 +1 @@',
    '+just prose, no front matter', ''].join('\n'));
  const fourth = await agsc(dir, ['refresh', '--agent', 'curator', '--dry-run', '--json']);
  assert.strictEqual(fourth.exit, 0, JSON.stringify(fourth.findings));
  assert.deepStrictEqual(envelopeFindings(fourth), []);
  assert.ok(fs.existsSync(proposal('7.patch')));
});
