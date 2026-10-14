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
  assert.strictEqual(envelope.totals.mapped + envelope.totals.partly + envelope.totals.allowed, envelope.totals.defined);
  assert.ok(envelope.totals.defined >= 70);
  assert.ok(envelope.totals.by_rule > envelope.totals.by_test, 'most requirements are carried by rules, not by test mentions');
});

test('this repository: the requirements met in part read PARTLY with a reason, and none rests on rules that carry no check', () => {
  const envelope = JSON.parse(capture(['--json', ROOT]).out);
  const byId = Object.fromEntries(envelope.requirements.map((x) => [x.id, x]));
  for (const n of ['009', '056', '063']) {
    assert.strictEqual(byId[req(n)].class, 'PARTLY', `${req(n)}: its note says part of it waits for a later version`);
    assert.strictEqual(byId[req(n)].reason, 'deferred');
  }
  assert.strictEqual(byId[req('043')].class, 'PARTLY', 'its one rule carries no check');
  assert.strictEqual(byId[req('043')].reason, 'host');
  for (const r of envelope.requirements) {
    if (r.class !== 'PARTLY') continue;
    assert.ok(Object.prototype.hasOwnProperty.call(tool.REASONS, r.reason), r.id);
    assert.ok(r.why.length >= 20, r.id);
  }
  assert.strictEqual(envelope.totals.partly, envelope.requirements.filter((r) => r.class === 'PARTLY').length);
});

test('this repository: the coverage requirement names its command, and that command is asserted by the workflow test', () => {
  const envelope = JSON.parse(capture(['--json', ROOT]).out);
  const coverage = envelope.requirements.find((x) => x.id === nfr('03'));
  assert.deepStrictEqual(coverage.measured_by, {
    asserted_by: 'tests/standard/workflow.test.js',
    command: 'npm run test:coverage',
    script: 'test:coverage',
  });
  const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts;
  assert.match(scripts['test:coverage'], /--test-coverage-lines=99\.9 /u);
  const md = fs.readFileSync(path.join(ROOT, 'docs', 'REQUIREMENTS-MATRIX.md'), 'utf8');
  assert.match(md, new RegExp(`\\| ${nfr('03')} \\| \`npm run test:coverage\` \\| \`tests/standard/workflow\\.test\\.js\` \\|`, 'u'));
});

test('this repository: a requirement cited in bold rests on the checks of the rules the citing sentence names', () => {
  const envelope = JSON.parse(capture(['--json', ROOT]).out);
  const byId = Object.fromEntries(envelope.requirements.map((x) => [x.id, x]));
  assert.deepStrictEqual(byId[nfr('01')].served_by, ['AGSC-05-23', 'AGSC-06-16']);
  assert.deepStrictEqual(byId[nfr('13')].served_by, ['AGSC-04-01', 'AGSC-04-24', 'AGSC-10-12']);
  assert.deepStrictEqual(byId[req('009')].served_by, ['AGSC-02-94'], 'the clause after the dash names a scope rule, not a serving one');
  for (const id of [req('012'), req('016'), nfr('01'), nfr('09'), nfr('13')]) {
    const c = byId[id].rule_checks;
    const checks = c.vectors.length + c.tests.length + c.acceptance.length + c.checkers.length;
    assert.ok(checks > 1, `${id} rests on more than the one check of the citing rule`);
  }
});

/** A three-requirement distribution in a scratch directory. */
function scratch(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-reqmatrix-'));
  const all = {
    'docs/PRD.md': `| ID | Requirement |\n|---|---|\n| ${req('901')} | one |\n| ${req('902')} | two |\n| ${nfr('91')} | three |\n| ${req('901')} (restated) | one again |\n\nA note to ${req('903')}, which no row defines.\n`,
    'spec/00-overview.md': `Version 1.0.0-rc.9.\n\n- **AGSC-01-01** One, traced. [${req('901')}]\n- **AGSC-01-02** Two, cited in bold: **${req('902')}** is served here. [design]\n- **AGSC-01-03** *(reserved: gone; the id is never reused, AGSC-00-16.)* [${nfr('91')}]\n- **AGSC-01-04** *(retired at rc, 2026-01-01: gone.)* [${nfr('91')}]\n`,
    'tests/vectors/a/a-0001.json': JSON.stringify({ id: 'a-0001', level: 'required', rule: 'AGSC-01-01' }),
    'tests/two.test.js': `${TEST}('AGSC-01-02 holds', () => {});\n`,
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

test('met in part: a listed requirement reads PARTLY, and one carried only by rules with no check needs a listed reason', () => {
  const allow = (extra) => JSON.stringify({ partly: {
    [req('901')]: { reason: 'deferred', why: 'the note in the requirements says half of it waits for a later version' },
    ...extra,
  } });
  // Without its test, AGSC-01-02 has no check: no vector, test, scenario or checker names it.
  const dir = scratch({ 'tests/requirements-matrix.allow.json': allow({}), 'tests/two.test.js': null });
  const listed = scratch({ 'tests/two.test.js': null, 'tests/x.test.js': `${TEST}('${nfr('91')} holds', () => {});\n`, 'tests/requirements-matrix.allow.json': allow({
    [req('902')]: { reason: 'host', why: 'the forge enforces it, and the one rule that states it binds an adapter that does not ship' },
  }) });
  try {
    const r = capture(['--json', dir]);
    const envelope = JSON.parse(r.out);
    const byId = Object.fromEntries(envelope.requirements.map((x) => [x.id, x]));
    assert.strictEqual(byId[req('901')].class, 'PARTLY');
    assert.strictEqual(byId[req('901')].reason, 'deferred');
    assert.strictEqual(r.code, 1, 'the requirement whose only rule carries no check has no reason');
    const messages = envelope.findings.map((f) => `${f.code} ${f.message}`).join('\n');
    assert.match(messages, new RegExp(`AGSC-E202 ${req('902')} is mapped only by rules that carry no check`, 'u'));
    assert.strictEqual(byId[req('902')].class, 'MAPPED');

    const ok = capture(['--json', listed]);
    const env2 = JSON.parse(ok.out);
    assert.strictEqual(ok.code, 0, ok.out);
    const byId2 = Object.fromEntries(env2.requirements.map((x) => [x.id, x]));
    assert.strictEqual(byId2[req('902')].class, 'PARTLY');
    assert.strictEqual(env2.totals.partly, 2);
    assert.strictEqual(env2.totals.mapped + env2.totals.partly + env2.totals.allowed + env2.totals.unmapped, env2.totals.defined);
    assert.match(ok.out, /"partly":2/u);
    const text = capture([listed]);
    assert.match(text.out, /: 1 mapped, 2 partly with a reason, 0 allowed with a reason, 0 unmapped;/u);
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
    fs.rmSync(listed, { force: true, recursive: true });
  }
});

test('met in part: an entry for an unmapped requirement, an entry in both lists and a bad reason each fail', () => {
  const dir = scratch({
    'tests/x.test.js': `${TEST}('${nfr('91')} holds', () => {});\n`,
    'tests/requirements-matrix.allow.json': JSON.stringify({
      partly: {
        [req('901')]: { reason: 'later', why: 'x' },
        [req('902')]: { reason: 'host', why: 'the forge enforces it and nothing in this repository does' },
        [nfr('91')]: { reason: 'practice', why: 'a working practice measured by a command of the maintainers' },
      },
      requirements: {
        [req('902')]: { reason: 'host', why: 'the forge enforces it and nothing in this repository does' },
      },
    }),
    'spec/00-overview.md': `Version 1.0.0-rc.9.\n\n- **AGSC-01-01** One, traced. [${req('901')}]\n`,
  });
  try {
    const r = capture(['--json', dir]);
    const envelope = JSON.parse(r.out);
    assert.strictEqual(r.code, 1);
    const messages = envelope.findings.map((f) => `${f.code} ${f.message}`).join('\n');
    assert.match(messages, new RegExp(`AGSC-E203 ${req('901')}: reason must be one of`, 'u'));
    assert.match(messages, new RegExp(`AGSC-E203 ${req('901')}: "why" must say`, 'u'));
    assert.match(messages, new RegExp(`AGSC-E201 ${req('902')} is listed both as met in part and as unmapped for a reason`, 'u'));
    assert.match(messages, new RegExp(`AGSC-E201 ${req('902')} is listed as met in part but no rule, test or vector maps it`, 'u'));
    const byId = Object.fromEntries(envelope.requirements.map((x) => [x.id, x]));
    assert.strictEqual(byId[nfr('91')].class, 'PARTLY', 'a test mention maps it, and the entry says what is missing');
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test('measured by a command: the script must exist in package.json and the asserting test must name the requirement', () => {
  const measured = (entry) => JSON.stringify({ measured: { [nfr('91')]: entry } });
  const good = scratch({
    'package.json': JSON.stringify({ scripts: { 'test:cover': 'node --test' } }),
    'tests/w.test.js': `${TEST}('${nfr('91')}: the command runs in a required check', () => {});\n`,
    'tests/requirements-matrix.allow.json': measured({ asserted_by: 'tests/w.test.js', script: 'test:cover' }),
  });
  const bad = scratch({
    'package.json': JSON.stringify({ scripts: {} }),
    'tests/w.test.js': `${TEST}('the command runs', () => {});\n`,
    'tests/x.test.js': `${TEST}('${nfr('91')} holds', () => {});\n`,
    'tests/requirements-matrix.allow.json': JSON.stringify({ measured: {
      [nfr('91')]: { asserted_by: 'tests/w.test.js', script: 'test:cover' },
      [req('903')]: { asserted_by: 'tests/none.test.js', script: '' },
    } }),
  });
  try {
    const r = capture(['--json', good]);
    assert.strictEqual(r.code, 0, r.out);
    const byId = Object.fromEntries(JSON.parse(r.out).requirements.map((x) => [x.id, x]));
    assert.deepStrictEqual(byId[nfr('91')].measured_by, { asserted_by: 'tests/w.test.js', command: 'npm run test:cover', script: 'test:cover' });
    assert.strictEqual(byId[req('901')].measured_by, undefined);
    assert.strictEqual(capture(['--write', '--quiet', good]).code, 0);
    const md = fs.readFileSync(path.join(good, 'docs', 'REQUIREMENTS-MATRIX.md'), 'utf8');
    assert.match(md, /## Requirements measured by a command/u);
    assert.match(md, new RegExp(`\\| ${nfr('91')} \\| \`npm run test:cover\` \\| \`tests/w\\.test\\.js\` \\|`, 'u'));

    const b = capture(['--json', bad]);
    assert.strictEqual(b.code, 1);
    const messages = JSON.parse(b.out).findings.map((f) => `${f.code} ${f.message}`).join('\n');
    assert.match(messages, new RegExp(`AGSC-E301 ${nfr('91')}: package.json has no script "test:cover"`, 'u'));
    assert.match(messages, new RegExp(`AGSC-E201 ${nfr('91')}: tests/w.test.js does not name the requirement`, 'u'));
    assert.match(messages, new RegExp(`AGSC-E301 ${req('903')} is not a requirement`, 'u'));
    assert.match(messages, new RegExp(`AGSC-E203 ${req('903')}: "measured" needs a script of package.json and the test that asserts it`, 'u'));
  } finally {
    fs.rmSync(good, { force: true, recursive: true });
    fs.rmSync(bad, { force: true, recursive: true });
  }
});

test('served by: the rules a bold citation names bring their checks, and the page shows them', () => {
  const dir = scratch({
    'spec/00-overview.md': `Version 1.0.0-rc.9.\n\n- **AGSC-01-01** One, traced. [${req('901')}]\n- **AGSC-01-02** Shape: **${req('902')}** is served by AGSC-01-01, which pins it — in part only (AGSC-01-09). **${nfr('91')}** is served by AGSC-01-05. *(Amended 2026-10-10 for 1.0.0: AGSC-01-01 was named.)* [design]\n- **AGSC-01-05** Five. [design]\n`,
    'tests/five.test.js': `${TEST}('AGSC-01-05 holds', () => {});\n`,
  });
  try {
    const r = capture(['--json', dir]);
    assert.strictEqual(r.code, 0, r.out);
    const byId = Object.fromEntries(JSON.parse(r.out).requirements.map((x) => [x.id, x]));
    assert.deepStrictEqual(byId[req('902')].rules, ['AGSC-01-02']);
    assert.deepStrictEqual(byId[req('902')].served_by, ['AGSC-01-01']);
    assert.deepStrictEqual(byId[req('902')].rule_checks.vectors, ['a-0001'], 'the serving rule brings its vector');
    assert.deepStrictEqual(byId[nfr('91')].served_by, ['AGSC-01-05']);
    assert.deepStrictEqual(byId[nfr('91')].rule_checks.tests, ['tests/five.test.js', 'tests/two.test.js'], 'the citing rule and the serving rule');
    assert.deepStrictEqual(byId[req('901')].served_by, []);
    assert.strictEqual(capture(['--write', '--quiet', dir]).code, 0);
    const md = fs.readFileSync(path.join(dir, 'docs', 'REQUIREMENTS-MATRIX.md'), 'utf8');
    assert.match(md, new RegExp(`\\| ${req('902')} \\| MAPPED \\| \`AGSC-01-02\`; served by \`AGSC-01-01\` \\| 1 vectors, 1 tests, 0 scenarios, 0 checkers \\|`, 'u'));
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test('the page: the met-in-part section, the PARTLY class and the summary sentence', () => {
  const dir = scratch({
    'tests/requirements-matrix.allow.json': JSON.stringify({
      partly: { [req('902')]: { reason: 'deferred', why: 'the note in the requirements says half of it waits for a later version' } },
      requirements: { [nfr('91')]: { reason: 'practice', why: 'measured by a command of the maintainers, not by a rule' } },
    }),
  });
  try {
    assert.strictEqual(capture(['--write', '--quiet', dir]).code, 0);
    const md = fs.readFileSync(path.join(dir, 'docs', 'REQUIREMENTS-MATRIX.md'), 'utf8');
    assert.match(md, /1 are mapped in full .* 1 are mapped in part for a stated reason, 1 stay unmapped for a stated reason, and 0 are unmapped\./u);
    assert.match(md, /## Requirements met in part\n/u);
    assert.match(md, new RegExp(`\\| ${req('902')} \\| deferred \\| the note in the requirements`, 'u'));
    assert.match(md, new RegExp(`\\| ${req('902')} \\| PARTLY \\| \`AGSC-01-02\` \\| 0 vectors, 1 tests, 0 scenarios, 0 checkers \\|`, 'u'));
    assert.ok(md.indexOf('## Requirements met in part') < md.indexOf('## Requirements unmapped for a reason'));
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
  const served = tool.ruleTraces(`- **AGSC-00-18** Cited here (AGSC-09-91). **${nfr('01')}** is served by AGSC-06-16, and by AGSC-05-23, which forbids it. **${req('009')}** is served by AGSC-02-94 — in part only (AGSC-00-20); and AGSC-02-94 again. **${req('016')}** is served by AGSC-00-05 and AGSC-02-21; no rule emits it. *(Amended 2026-10-10 for 1.0.0: AGSC-00-17 named.)* [design]\n`);
  assert.deepStrictEqual(served[0].served, { [nfr('01')]: ['AGSC-05-23', 'AGSC-06-16'], [req('009')]: ['AGSC-02-94'], [req('016')]: ['AGSC-00-05', 'AGSC-02-21'] });
  assert.deepStrictEqual(traced[0].served, {});
});
