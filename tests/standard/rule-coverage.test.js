'use strict';
// The rule-coverage matrix (tools/rule-coverage): the gate that keeps every active
// rule VERIFIED, PROSE-ONLY with a reason, or a listed GAP, and keeps
// docs/RULE-COVERAGE.md current — run over this repository — and the tool's own
// behaviour on a small scratch distribution. Deterministic, offline.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const tool = require(path.join(ROOT, 'tools', 'rule-coverage'));
// The snippets below are written in pieces so that the tool, reading THIS file,
// does not take them for titles or markers of its own.
const TEST = ['te', 'st'].join('');
const IT = ['i', 't'].join('');
const MARK = ['// ', 'verifies'].join('');

function capture(argv) {
  let out = '';
  let err = '';
  const code = tool.run(argv, { err: (s) => { err += s; }, out: (s) => { out += s; } });
  return { code, err, out };
}

test('this repository: no rule is unverified and docs/RULE-COVERAGE.md is the generated text', () => {
  const r = capture(['--check', '--json', ROOT]);
  const envelope = JSON.parse(r.out);
  assert.strictEqual(r.code, 0, JSON.stringify(envelope.findings.slice(0, 10), null, 1));
  assert.strictEqual(envelope.totals.unverified, 0);
  assert.strictEqual(envelope.totals.verified + envelope.totals.prose_only + envelope.totals.gap, envelope.totals.active);
  assert.ok(envelope.totals.active >= 300);
});

/** A four-rule distribution in a scratch directory. */
function scratch(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-rulecov-'));
  const all = {
    'spec/01-a.md': '- **AGSC-01-01** One.\n- **AGSC-01-02** Two.\n- **AGSC-01-03** *(retired at rc.3: gone.)*\n- **AGSC-01-04** Four.\n- **AGSC-01-05** Five.\n',
    'spec/00-overview.md': 'Version 1.0.0-rc.9.\n',
    'tests/vectors/a/a-0001.json': JSON.stringify({ id: 'a-0001', level: 'required', rule: 'AGSC-01-01' }),
    'tests/vectors/a/a-0002.json': JSON.stringify({ id: 'a-0002', level: 'withdrawn', rule: 'AGSC-01-02' }),
    'tests/x.test.js': `${TEST}('AGSC-01-02: two holds', () => {});\n`,
    ...files,
  };
  for (const [rel, text] of Object.entries(all)) {
    if (text === null) continue;
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

test('the classes: a vector, a test title, a marker, a prose reason and a gap each place a rule', () => {
  const dir = scratch({
    'tests/helpers/steps.js': `${MARK} AGSC-01-04\n`,
    'tests/rule-coverage.allow.json': JSON.stringify({
      gaps: { 'AGSC-01-05': { why: 'the engine does not do the fifth thing yet' } },
      rules: {},
    }),
  });
  try {
    const r = capture(['--json', dir]);
    const envelope = JSON.parse(r.out);
    assert.strictEqual(r.code, 0, r.out);
    const byId = Object.fromEntries(envelope.rules.map((x) => [x.id, x]));
    assert.deepStrictEqual(Object.keys(byId), ['AGSC-01-01', 'AGSC-01-02', 'AGSC-01-04', 'AGSC-01-05'], 'the retired id is excluded');
    assert.deepStrictEqual(byId['AGSC-01-01'].vectors, ['a-0001']);
    assert.deepStrictEqual(byId['AGSC-01-02'].vectors, [], 'a withdrawn vector verifies nothing');
    assert.deepStrictEqual(byId['AGSC-01-02'].tests, ['tests/x.test.js']);
    assert.deepStrictEqual(byId['AGSC-01-04'].tests, ['tests/helpers/steps.js']);
    assert.strictEqual(byId['AGSC-01-05'].class, 'GAP');
    assert.deepStrictEqual(envelope.totals.verified, 3);
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test('an unverified rule, a stale allow entry, a bad reason and an unknown marker each fail the run', () => {
  const dir = scratch({
    'tests/marker.test.js': `${MARK} AGSC-01-03, AGSC-09-99\n`,
    'tests/rule-coverage.allow.json': JSON.stringify({ rules: {
      'AGSC-01-01': { reason: 'scope', why: 'a vector verifies this one, so the entry is stale' },
      'AGSC-01-05': { reason: 'because', why: 'short' },
    } }),
  });
  try {
    const r = capture(['--json', dir]);
    const envelope = JSON.parse(r.out);
    assert.strictEqual(r.code, 1);
    const messages = envelope.findings.map((f) => `${f.code} ${f.message}`).join('\n');
    assert.match(messages, /AGSC-E202 AGSC-01-04 has no machine check/u);
    assert.match(messages, /AGSC-E201 AGSC-01-01 is listed as prose-only but is verified/u);
    assert.match(messages, /AGSC-E203 AGSC-01-05: reason must be one of/u);
    assert.match(messages, /AGSC-E203 AGSC-01-05: "why" must say/u);
    assert.match(messages, /AGSC-E301 a '\/\/ verifies' marker names AGSC-01-03, which is retired/u);
    assert.match(messages, /AGSC-E301 a '\/\/ verifies' marker names AGSC-09-99, which is not a rule/u);
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test('acceptance: an executed scenario counts, a pending one does not, and a stale pending entry fails', () => {
  const dir = scratch({
    'features/one.feature': '@persona-x\nFeature: One\n\n  Background:\n    Given a thing (AGSC-01-04)\n\n  @AGSC-01-05\n  Scenario: Runs\n    When it runs\n\n  Scenario: Waits\n    When it waits for AGSC-01-02\n',
    'tests/acceptance/pending.json': JSON.stringify({ pending: {
      'one.feature#Waits': { class: 'forge', reason: 'needs a forge' },
      'one.feature#Gone': { class: 'forge', reason: 'names no scenario' },
    } }),
  });
  try {
    const r = capture(['--json', dir]);
    const envelope = JSON.parse(r.out);
    const byId = Object.fromEntries(envelope.rules.map((x) => [x.id, x]));
    assert.deepStrictEqual(byId['AGSC-01-04'].acceptance, ['one.feature#Runs'], 'the Background belongs to every scenario');
    assert.deepStrictEqual(byId['AGSC-01-05'].acceptance, ['one.feature#Runs']);
    assert.deepStrictEqual(byId['AGSC-01-02'].acceptance, [], 'a pending scenario verifies nothing');
    assert.strictEqual(envelope.totals.acceptance_scenarios, 2);
    assert.strictEqual(envelope.totals.acceptance_scenarios_pending, 1);
    assert.ok(envelope.findings.some((f) => /pending entry "one\.feature#Gone" names no scenario/u.test(f.message)));
    assert.strictEqual(r.code, 1);
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test('--write then --check agree, the text is deterministic, and a hand edit is caught', () => {
  const dir = scratch({ 'tests/y.test.js': `${TEST}('AGSC-01-04 and AGSC-01-05', () => {});\n` });
  try {
    fs.mkdirSync(path.join(dir, 'docs'));
    assert.strictEqual(capture(['--write', '--quiet', dir]).code, 0);
    const first = fs.readFileSync(path.join(dir, 'docs', 'RULE-COVERAGE.md'), 'utf8');
    assert.strictEqual(capture(['--check', dir]).code, 0);
    assert.strictEqual(capture(['--write', '--quiet', dir]).code, 0);
    assert.strictEqual(fs.readFileSync(path.join(dir, 'docs', 'RULE-COVERAGE.md'), 'utf8'), first);
    assert.match(first, /^# Rule coverage\n/u);
    assert.match(first, /\| AGSC-01-04 \| VERIFIED \|/u);
    fs.appendFileSync(path.join(dir, 'docs', 'RULE-COVERAGE.md'), 'edited\n');
    const r = capture(['--check', dir]);
    assert.strictEqual(r.code, 1);
    assert.match(r.err, /is not the generated text/u);
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test('usage: --help, an unknown flag, two roots and a root with no spec/', () => {
  const help = capture(['--help']);
  assert.strictEqual(help.code, 0);
  assert.match(help.out, /^rule-coverage /u);
  assert.strictEqual(capture(['--nope']).code, 2);
  assert.strictEqual(capture(['a', 'b']).code, 2);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-rulecov-empty-'));
  try {
    const r = capture([empty]);
    assert.strictEqual(r.code, 2);
    assert.match(r.err, /no spec\/ directory/u);
  } finally {
    fs.rmSync(empty, { force: true, recursive: true });
  }
});

test('the parsers: test titles and markers, feature scenarios, checker headers', () => {
  const cited = tool.testCitations(`${TEST}('AGSC-01-01: x', () => {});\n${IT}("AGSC-02-02 y", f);\n${MARK} AGSC-03-03, AGSC-04-04\nfoo('AGSC-05-05');\n`);
  assert.deepStrictEqual([...cited.titles].sort(), ['AGSC-01-01', 'AGSC-02-02']);
  assert.deepStrictEqual([...cited.markers].sort(), ['AGSC-03-03', 'AGSC-04-04']);
  const scenarios = tool.featureScenarios('# c\n@AGSC-01-01\nFeature: F\n  Scenario: A\n    Given x AGSC-02-02\n  Scenario Outline: B\n    Given <v>\n    Examples:\n      | v |\n      | 1 |\n');
  assert.deepStrictEqual(scenarios.map((s) => [s.name, [...s.ids].sort()]), [['A', ['AGSC-01-01', 'AGSC-02-02']], ['B', ['AGSC-01-01']]]);
  assert.deepStrictEqual([...tool.checkerHeader("#!/usr/bin/env node\n// checks AGSC-06-07\n'use strict';\n// and AGSC-09-09, still the header\nconst x = 1; // AGSC-01-01 is code\n// AGSC-02-02 after code\n")].sort(), ['AGSC-06-07', 'AGSC-09-09']);
});
