'use strict';
// The requirements matrix (tools/requirements-matrix): the gate that keeps every
// requirement of docs/PRD.md MAPPED — traced by a rule, or named by a test or a
// live vector — or ALLOWED with a reason, and keeps docs/REQUIREMENTS-MATRIX.md
// current — run over this repository — and the tool's own behaviour on a small
// scratch distribution. Deterministic, offline.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const tool = require(path.join(ROOT, 'tools', 'requirements-matrix'));
// The requirement ids below are written in pieces so that the tool, reading THIS
// file, does not list it under a real requirement of docs/PRD.md.
const req = (n) => ['PRD', `-${n}`].join('');
const nfr = (n) => ['NFR', `-${n}`].join('');
const TEST = ['te', 'st'].join('');

function capture(argv) {
  let out = '';
  let err = '';
  const code = tool.run(argv, { err: (s) => { err += s; }, out: (s) => { out += s; } });
  return { code, err, out };
}

test('this repository: no requirement is unmapped and docs/REQUIREMENTS-MATRIX.md is the generated text', () => {
  const r = capture(['--check', '--json', ROOT]);
  const envelope = JSON.parse(r.out);
  assert.strictEqual(r.code, 0, JSON.stringify(envelope.findings.slice(0, 10), null, 1));
  assert.strictEqual(envelope.totals.unmapped, 0);
  assert.strictEqual(envelope.totals.mapped + envelope.totals.allowed, envelope.totals.defined);
  assert.ok(envelope.totals.defined >= 70);
  assert.ok(envelope.totals.by_rule > envelope.totals.by_test, 'most requirements are carried by rules, not by test mentions');
});

/** A three-requirement distribution in a scratch directory. */
function scratch(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-reqmatrix-'));
  const all = {
    'docs/PRD.md': `| ID | Requirement |\n|---|---|\n| ${req('901')} | one |\n| ${req('902')} | two |\n| ${nfr('91')} | three |\n| ${req('901')} (restated) | one again |\n\nA note to ${req('903')}, which no row defines.\n`,
    'spec/00-overview.md': `Version 1.0.0-rc.9.\n\n- **AGSC-01-01** One, traced. [${req('901')}]\n- **AGSC-01-02** Two, cited in bold: **${req('902')}** is served here. [design]\n- **AGSC-01-03** *(reserved: gone; the id is never reused, AGSC-00-16.)* [${nfr('91')}]\n- **AGSC-01-04** *(retired at rc, 2026-01-01: gone.)* [${nfr('91')}]\n`,
    'tests/vectors/a/a-0001.json': JSON.stringify({ id: 'a-0001', level: 'required', rule: 'AGSC-01-01' }),
    ...files,
  };
  for (const [rel, text] of Object.entries(all)) {
    if (text === null) continue;
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

test('the classes: a trace bracket, a bold citation, a test mention and an allow entry each place a requirement', () => {
  const dir = scratch({
    'tests/x.test.js': `${TEST}('${nfr('91')} holds', () => {});\n`,
    'features/one.feature': `Feature: F\n  @${req('902')}\n  Scenario: S\n    Given x\n`,
    'docs/GUIDE.md': `See ${req('901')}.\n`,
  });
  try {
    const r = capture(['--json', dir]);
    const envelope = JSON.parse(r.out);
    assert.strictEqual(r.code, 0, r.out);
    const byId = Object.fromEntries(envelope.requirements.map((x) => [x.id, x]));
    assert.deepStrictEqual(Object.keys(byId), [req('901'), req('902'), nfr('91')], 'a restated row and a note define nothing');
    assert.deepStrictEqual(byId[req('901')].rules, ['AGSC-01-01']);
    assert.deepStrictEqual(byId[req('901')].rule_checks.vectors, ['a-0001'], 'the rule brings its vector');
    assert.deepStrictEqual(byId[req('901')].documents, ['docs/GUIDE.md']);
    assert.deepStrictEqual(byId[req('902')].rules, ['AGSC-01-02'], 'a bold citation in the rule text traces');
    assert.deepStrictEqual(byId[req('902')].scenarios, ['features/one.feature']);
    assert.deepStrictEqual(byId[nfr('91')].rules, [], 'a retired rule traces nothing');
    assert.deepStrictEqual(byId[nfr('91')].tests, ['tests/x.test.js']);
    assert.strictEqual(envelope.totals.mapped, 3);
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test('an unmapped requirement, a stale allow entry, a bad reason and an unknown id each fail the run', () => {
  const dir = scratch({
    'spec/01-x.md': `- **AGSC-01-04** Four, traced to a phantom. [${req('903')}]\n`,
    'tests/requirements-matrix.allow.json': JSON.stringify({ requirements: {
      [req('901')]: { reason: 'site', why: 'a rule traces to this one, so the entry is stale' },
      [req('903')]: { reason: 'because', why: 'short' },
    } }),
  });
  try {
    const r = capture(['--json', dir]);
    const envelope = JSON.parse(r.out);
    assert.strictEqual(r.code, 1);
    const messages = envelope.findings.map((f) => `${f.code} ${f.message}`).join('\n');
    assert.match(messages, new RegExp(`AGSC-E202 ${nfr('91')} is traced by no rule`, 'u'));
    assert.match(messages, new RegExp(`AGSC-E201 ${req('901')} is listed as allowed but`, 'u'));
    assert.match(messages, new RegExp(`AGSC-E203 ${req('903')}: reason must be one of`, 'u'));
    assert.match(messages, new RegExp(`AGSC-E203 ${req('903')}: "why" must say`, 'u'));
    assert.match(messages, new RegExp(`AGSC-E301 ${req('903')} is not a requirement`, 'u'));
    assert.match(messages, new RegExp(`AGSC-E301 rule AGSC-01-04 traces to ${req('903')}, which docs/PRD.md does not define`, 'u'));
    assert.strictEqual(Object.fromEntries(envelope.requirements.map((x) => [x.id, x.class]))[nfr('91')], 'UNMAPPED');
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test('--write then --check agree, the text is deterministic, and a hand edit is caught', () => {
  const dir = scratch({
    'tests/requirements-matrix.allow.json': JSON.stringify({ requirements: {
      [nfr('91')]: { reason: 'practice', why: 'measured by a command of the maintainers, not by a rule' },
    } }),
  });
  try {
    assert.strictEqual(capture(['--write', '--quiet', dir]).code, 0);
    const first = fs.readFileSync(path.join(dir, 'docs', 'REQUIREMENTS-MATRIX.md'), 'utf8');
    assert.strictEqual(capture(['--check', dir]).code, 0);
    assert.strictEqual(capture(['--write', '--quiet', dir]).code, 0);
    assert.strictEqual(fs.readFileSync(path.join(dir, 'docs', 'REQUIREMENTS-MATRIX.md'), 'utf8'), first);
    assert.match(first, /^# Requirements matrix\n/u);
    assert.match(first, new RegExp(`\\| ${req('901')} \\| MAPPED \\| \`AGSC-01-01\` \\| 1 vectors, 0 tests, 0 scenarios, 0 checkers \\|`, 'u'));
    assert.match(first, new RegExp(`\\| ${nfr('91')} \\| practice \\|`, 'u'));
    fs.appendFileSync(path.join(dir, 'docs', 'REQUIREMENTS-MATRIX.md'), 'edited\n');
    const r = capture(['--check', dir]);
    assert.strictEqual(r.code, 1);
    assert.match(r.err, /is not the generated text/u);
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test('usage: --help, an unknown flag, two roots, a root with no spec/ and a PRD that defines nothing', () => {
  const help = capture(['--help']);
  assert.strictEqual(help.code, 0);
  assert.match(help.out, /^requirements-matrix /u);
  assert.strictEqual(capture(['--nope']).code, 2);
  assert.strictEqual(capture(['a', 'b']).code, 2);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-reqmatrix-empty-'));
  try {
    const r = capture([empty]);
    assert.strictEqual(r.code, 2);
    assert.match(r.err, /no spec\/ directory/u);
  } finally {
    fs.rmSync(empty, { force: true, recursive: true });
  }
  const blank = scratch({ 'docs/PRD.md': '' });
  try {
    const r = capture(['--json', blank]);
    assert.strictEqual(r.code, 1);
    assert.ok(JSON.parse(r.out).findings.some((f) => f.code === 'AGSC-E901' && /defines no requirement/u.test(f.message)));
  } finally {
    fs.rmSync(blank, { force: true, recursive: true });
  }
});

test('the parsers: defined ids, trace brackets with a trailing note, bold citations', () => {
  assert.deepStrictEqual(tool.definedIds(`| ${req('001')} | x |\n| ${req('001')} (restated) | y |\n| ${nfr('01')} | z |\n${req('002')} in prose\n`), [req('001'), nfr('01')]);
  assert.strictEqual(tool.traceBracket(`- **AGSC-01-01** Text. [${req('018')}] *(code named 2026-09-24)*`), req('018'));
  assert.strictEqual(tool.traceBracket('- **AGSC-01-01** Text with [a link](x) and no bracket.'), null);
  const traced = tool.ruleTraces(`- **AGSC-01-01** A. [${req('001')}, ${req('002')}]\n- **AGSC-01-02** B cites **${nfr('01')}**. [design]\n\n  | a | b |\n  |---|---|\n\n  [${req('003')}]\n`);
  assert.deepStrictEqual(traced.map((r) => [r.id, r.trace]), [['AGSC-01-01', [req('001'), req('002')]], ['AGSC-01-02', [nfr('01'), req('003')]]]);
});
