'use strict';
// tools/validate-features — AGSC-09-90, PRD-054 ("Gherkin parse + @PRD tag ↔ PRD-id
// closure"). The passing case is the shipped features/ pack; each failing case is a
// one-fault .feature file in a throw-away directory.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const { REPO, capture, codes, envelope, tmpdir, tool, writeTree } = require('./helpers');

const { parseFeature, readmeCoverage } = tool('validate-features');

const GOOD = [
  '@persona-0 @human @PRD-053',
  'Feature: A drop-in user',
  '  As a user',
  '  I want a wiki',
  '',
  '  Background:',
  '    Given a directory of notes',
  '',
  '  Scenario: Three commands',
  '    When I run "init"',
  '    Then every file gains frontmatter',
  '',
  '  Scenario Outline: Each verb',
  '    When I run "<verb>"',
  '    Then the exit code is <code>',
  '',
  '    Examples:',
  '      | verb  | code |',
  '      | lint  | 0    |',
  '      | build | 0    |',
  '',
].join('\n');

function featureRoot(files = {}, extra = {}) {
  return writeTree(tmpdir(), {
    'docs/PRD.md': '| PRD-053 | a requirement | | NFR-01 | another |\n',
    'features/persona-0.feature': GOOD,
    'spec/00-overview.md': '`spec_version: "1.0.0-rc.9"`\n',
    ...Object.fromEntries(Object.entries(files).map(([k, v]) => [`features/${k}`, v])),
    ...extra,
  });
}

describe('validate-features — usage and the envelope', () => {
  it('--help exits 0; an unknown flag and a second argument exit 2', () => {
    assert.equal(capture('validate-features', ['--help']).code, 0);
    assert.equal(capture('validate-features', ['--nope']).code, 2);
    assert.equal(capture('validate-features', [featureRoot(), featureRoot()]).code, 2);
  });

  it('a directory that is not a features pack exits 2', () => {
    const result = capture('validate-features', [path.join(tmpdir(), 'absent')]);
    assert.equal(result.code, 2);
    assert.match(result.err, /no features directory/u);
  });

  it('the envelope has the AGSC-09-11 shape, and the pack may be named directly', () => {
    const root = featureRoot();
    const { code, json } = envelope('validate-features', [path.join(root, 'features')]);
    assert.equal(code, 0);
    assert.equal(json.verb, 'validate-features');
    assert.deepEqual(json.findings, []);
  });

  it('--quiet says nothing; the human output carries a summary line', () => {
    assert.equal(capture('validate-features', ['--quiet', featureRoot()]).out, '');
    const result = capture('validate-features', [featureRoot()]);
    assert.match(result.out, /^validate-features: 1 input file\(s\) read, 2 scenarios, 1 requirement ids tagged, 0 error, 0 warn; requirement ids no scenario tags \(informational\): 1\n$/u);
  });
});

describe('validate-features — the faults', () => {
  const only = (files) => envelope('validate-features', [featureRoot(files)]).json;

  it('encoding faults are AGSC-E108', () => {
    const root = featureRoot();
    fs.writeFileSync(path.join(root, 'features', 'persona-0.feature'), `\uFEFF${GOOD.replace(/\n/gu, '\r\n')}\n`);
    const { json } = envelope('validate-features', [root]);
    assert.ok(json.findings.filter((f) => f.code === 'AGSC-E108').length >= 3);
  });

  it('non-NFC text is AGSC-E108', () => {
    const json = only({ 'x.feature': GOOD.replace('A drop-in user', 'A drop-iné user') });
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E108' && /not NFC/u.test(f.message)));
  });

  it('a file with no Feature: is AGSC-E201', () => {
    const json = only({ 'x.feature': 'Scenario: orphan\n  Given a thing\n' });
    assert.ok(json.findings.some((f) => /declares no Feature:/u.test(f.message)));
    assert.ok(json.findings.some((f) => /before any Feature:/u.test(f.message)));
  });

  it('a second Feature: is AGSC-E201', () => {
    const json = only({ 'x.feature': `${GOOD}Feature: again\n` });
    assert.ok(json.findings.some((f) => /a second Feature:/u.test(f.message)));
  });

  it('a Feature with no Scenario is AGSC-E202, and the human output names it', () => {
    const files = { 'x.feature': 'Feature: empty\n  A description.\n' };
    const json = only(files);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E202' && /carries no Scenario/u.test(f.message)));
    const human = capture('validate-features', [featureRoot(files)]);
    assert.equal(human.code, 1);
    assert.match(human.err, /^error: features\/x\.feature:1:1 AGSC-E202 the Feature carries no Scenario$/mu);
  });

  it('a Scenario with no step is AGSC-E202', () => {
    const json = only({ 'x.feature': 'Feature: f\n\n  Scenario: nothing\n\n  Scenario: something\n    Given a thing\n' });
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E202' && /"nothing" carries no step/u.test(f.message)));
  });

  it('a Scenario Outline with no Examples is AGSC-E202', () => {
    const json = only({ 'x.feature': 'Feature: f\n\n  Scenario Outline: o\n    Given a <thing>\n' });
    assert.ok(json.findings.some((f) => /carries no Examples:/u.test(f.message)));
  });

  it('an Examples: outside a Scenario Outline is AGSC-E201', () => {
    const json = only({ 'x.feature': 'Feature: f\n\n  Scenario: s\n    Given a thing\n\n    Examples:\n      | a |\n' });
    assert.ok(json.findings.some((f) => /Examples: outside a Scenario Outline/u.test(f.message)));
  });

  it('a step outside every Scenario is AGSC-E201', () => {
    const json = only({ 'x.feature': 'Feature: f\n  Given a stray step\n\n  Scenario: s\n    Given a thing\n' });
    assert.ok(json.findings.some((f) => /a step outside every Scenario/u.test(f.message)));
  });

  it('a ragged table row and an unclosed row are AGSC-E201', () => {
    const json = only({
      'x.feature': ['Feature: f', '', '  Scenario Outline: o', '    When I run "<verb>"', '',
        '    Examples:', '      | verb | code |', '      | lint', '      | build | 0 | 1 |', ''].join('\n'),
    });
    assert.ok(json.findings.some((f) => /does not close with "\|"/u.test(f.message)));
    assert.ok(json.findings.some((f) => /has 3 columns and its header has 2/u.test(f.message)));
  });

  it('a placeholder the Examples header does not declare is AGSC-E201', () => {
    const json = only({
      'x.feature': ['Feature: f', '', '  Scenario Outline: o', '    When I run "<verb>"', '',
        '    Examples:', '      | other |', '      | lint  |', ''].join('\n'),
    });
    assert.ok(json.findings.some((f) => /declares no column <verb>/u.test(f.message)));
  });

  it('an unterminated doc string is AGSC-E201, and a closed one is silent', () => {
    const closed = only({
      'x.feature': ['Feature: f', '', '  Scenario: s', '    Given a document', '      """', '      Feature: not a feature', '      """', ''].join('\n'),
    });
    assert.ok(!closed.findings.some((f) => /doc string/u.test(f.message)), JSON.stringify(closed.findings));
    const open = only({ 'x.feature': 'Feature: f\n\n  Scenario: s\n    Given a document\n      """\n      text\n' });
    assert.ok(open.findings.some((f) => /unterminated doc string/u.test(f.message)));
  });

  it('a comment line and a Rule: keyword are accepted', () => {
    const json = only({
      'x.feature': ['# a comment', '@agent', 'Feature: f', '', '  Rule: a rule', '', '  Scenario: s', '    Given a thing', ''].join('\n'),
    });
    assert.deepEqual(codes(json), []);
  });

  it('a tag naming a requirement docs/PRD.md does not define is AGSC-E201', () => {
    const json = only({ 'x.feature': `@PRD-999\n${GOOD}` });
    assert.ok(json.findings.some((f) => /@PRD-999 names a requirement/u.test(f.message)));
  });

  it('with no docs/PRD.md the closure is skipped', () => {
    const root = featureRoot({ 'x.feature': `@PRD-999\n${GOOD}` });
    fs.rmSync(path.join(root, 'docs'), { force: true, recursive: true });
    const { json } = envelope('validate-features', [root]);
    assert.ok(!json.findings.some((f) => /names a requirement/u.test(f.message)));
  });

  it('the coverage table of features/README.md is checked both ways (warning)', () => {
    const root = featureRoot({}, {
      'features/README.md': [
        '| File | Persona | Mode | Scenarios | PRD ids covered |',
        '|---|---|---|---|---|',
        '| `persona-0.feature` | P0 | 0 | 2 | PRD-053, 054 |',
        '',
      ].join('\n'),
    });
    const { code, json } = envelope('validate-features', [root]);
    assert.equal(code, 0);
    const warnings = json.findings.filter((f) => f.code === 'AGSC-E207');
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].severity, 'warn');
    assert.match(warnings[0].message, /lists PRD-054 for this file/u);
  });

  it('a file that tags an id the table omits is also a warning', () => {
    const root = featureRoot({}, {
      'features/README.md': [
        '| File | Persona | Mode | Scenarios | PRD ids covered |',
        '|---|---|---|---|---|',
        '| `persona-0.feature` | P0 | 0 | 2 | NFR-01 |',
        '',
      ].join('\n'),
    });
    const { json } = envelope('validate-features', [root]);
    assert.ok(json.findings.some((f) => /tags PRD-053 and the coverage table/u.test(f.message)));
  });
});

describe('validate-features — the helpers it exports', () => {
  it('parseFeature counts scenarios and ignores the Background', () => {
    const parsed = parseFeature(GOOD, 'x.feature');
    assert.equal(parsed.features, 1);
    assert.equal(parsed.scenarios.length, 2);
    assert.deepEqual([...parsed.tags].sort(), ['@PRD-053', '@human', '@persona-0']);
    assert.deepEqual(parsed.findings, []);
  });

  it('readmeCoverage expands an abbreviated run and drops a parenthetical', () => {
    const table = readmeCoverage([
      '| File | x | PRD ids covered |',
      '| `a.feature` | y | PRD-002, 011, **013** (reads via b: PRD-099) |',
      '| not a row |',
      '| `b.feature` | y | — |',
      '',
    ].join('\n'));
    assert.deepEqual([...table.get('a.feature')].sort(), ['PRD-002', 'PRD-011', 'PRD-013']);
    assert.equal(table.has('b.feature'), false);
  });
});

describe('validate-features — the real distribution', () => {
  it('the shipped pack parses, closes against docs/PRD.md and agrees with its README', () => {
    const result = capture('validate-features', [REPO]);
    assert.equal(result.code, 0);
    assert.match(result.out, /^validate-features: \d+ input file\(s\) read, \d+ scenarios, \d+ requirement ids tagged, 0 error, \d+ warn/u);
    assert.ok(fs.existsSync(path.join(REPO, 'features', 'MATRIX.md')), 'the shipped pack carries features/MATRIX.md');
    // Every scenario names its actor. The only warnings normal mode may still print
    // are the matrix's own coverage findings (a row or surface no running scenario
    // covers yet, a G cell whose gap file is not written yet): `--strict-matrix`
    // turns those into errors. Every other finding is a defect of the pack.
    for (const line of result.err.split('\n').filter(Boolean)) {
      assert.match(line, /^warn: (?:features\/MATRIX\.md|docs\/PRD\.md|tests\/acceptance\/pending\/[^:]+):\d+:1 AGSC-E20[123] /u);
    }
  });

  it('every shipped scenario names one actor and one mode, and every persona row and surface is in the matrix', () => {
    const { parseFeature, readMatrix } = tool('validate-features');
    const dir = path.join(REPO, 'features');
    let scenarios = 0;
    for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.feature')).sort()) {
      const parsed = parseFeature(fs.readFileSync(path.join(dir, name), 'utf8'), `features/${name}`);
      for (const s of parsed.scenarios) {
        scenarios += 1;
        const tags = new Set([...s.inherited, ...s.tags]);
        const actors = ['@human', '@agent'].filter((t) => tags.has(t));
        assert.equal(actors.length, 1, `${name} "${s.name}" names ${actors.length} actors`);
        assert.equal([...tags].filter((t) => /^@mode-[0-5]$/u.test(t)).length, 1, `${name} "${s.name}" names no single @mode-n`);
        assert.ok(tags.has(`@${name.split('-').slice(0, 2).join('-')}`), `${name} "${s.name}" carries no @persona tag of its file`);
      }
    }
    assert.ok(scenarios > 0);
    const matrix = readMatrix(fs.readFileSync(path.join(dir, 'MATRIX.md'), 'utf8'));
    assert.deepEqual(matrix.problems, []);
    const ids = (letter, n) => Array.from({ length: n }, (_, i) => `${letter}${i + 1}`);
    assert.deepEqual(matrix.rows.map((r) => r.id), [...ids('H', 21), ...ids('A', 18)]);
    assert.deepEqual(matrix.surfaces.map((s) => s.label), [
      'CLI verbs (16)', 'Global flags', 'MCP tools (7)', 'MCP resources and the prompt', 'Page tools (7)',
      'Discovery Levels 0–3', 'Exports and adapters', 'Imports', 'Live boards, claims, lanes, budget, .env',
      'Six modes', 'Restricted visibility', 'Federation, peers, contribute', 'security.txt', 'Legal texts, TDM',
      'Hosting profiles', 'Ledger and anchor',
    ]);
    for (const entry of [...matrix.rows, ...matrix.surfaces]) {
      assert.ok(entry.status.size > 0, `${entry.id || entry.label}: no status`);
      for (const s of ['U', 'rec']) if (entry.status.has(s)) assert.ok(entry.reason, `${entry.id || entry.label}: ${s} without a reason`);
    }
    const modes = matrix.surfaces.find((s) => s.label === 'Six modes');
    assert.equal(modes.stems.length, 6, 'the six-modes surface names one feature per mode');
  });
});

describe('validate-features — the actor tag of every scenario', () => {
  const UNTAGGED = 'Feature: f\n  As P0 (someone)\n\n  Scenario: s\n    Given a thing\n';
  const MATRIX = '| Row | Who | Feature file | Target | Reason |\n|---|---|---|---|---|\n| H1 | someone | persona-0 | B | |\n';

  it('a scenario without @human or @agent is a warning while the pack has no features/MATRIX.md', () => {
    const { code, json } = envelope('validate-features', [featureRoot({ 'x.feature': UNTAGGED })]);
    assert.equal(code, 0);
    const actor = json.findings.filter((f) => /carries no actor tag/u.test(f.message));
    assert.equal(actor.length, 1);
    assert.equal(actor[0].code, 'AGSC-E202');
    assert.equal(actor[0].severity, 'warn');
    assert.equal(actor[0].line, 4);
  });

  it('the same scenario is an error once the pack carries features/MATRIX.md', () => {
    const { code, json } = envelope('validate-features', [featureRoot({ 'MATRIX.md': MATRIX, 'x.feature': UNTAGGED })]);
    assert.equal(code, 1);
    assert.ok(json.findings.some((f) => f.severity === 'error' && /"s" carries no actor tag/u.test(f.message)));
  });

  it('a Feature tag, a Rule tag or the tags of every Examples block carry the actor too', () => {
    const json = envelope('validate-features', [featureRoot({
      'MATRIX.md': MATRIX,
      'x.feature': ['@agent', 'Feature: f', '', '  Scenario: s', '    Given a thing', ''].join('\n'),
      'y.feature': ['Feature: g', '', '  @human', '  Rule: r', '', '  Scenario: s', '    Given a thing', ''].join('\n'),
      'z.feature': ['Feature: h', '', '  Scenario Outline: o', '    Given a <thing>', '',
        '    @human', '    Examples:', '      | thing |', '      | a     |', '',
        '    @agent', '    Examples:', '      | thing |', '      | b     |', ''].join('\n'),
      'w.feature': ['Feature: i', '', '  Scenario Outline: half', '    Given a <thing>', '',
        '    @human', '    Examples:', '      | thing |', '      | a     |', '',
        '    Examples:', '      | thing |', '      | b     |', ''].join('\n'),
    })]).json;
    const actor = json.findings.filter((f) => /actor tag/u.test(f.message));
    assert.deepEqual(actor.map((f) => f.file), ['features/w.feature'], JSON.stringify(actor));
  });

  it('a @matrix- tag naming a row features/MATRIX.md does not define is AGSC-E201, with or without the matrix', () => {
    const tagged = `@persona-0 @human @matrix-H9\n${GOOD.split('\n').slice(1).join('\n')}`;
    const withMatrix = envelope('validate-features', [featureRoot({ 'MATRIX.md': MATRIX, 'persona-0.feature': tagged })]);
    assert.equal(withMatrix.code, 1);
    assert.ok(withMatrix.json.findings.some((f) => f.code === 'AGSC-E201' && /@matrix-H9 names a row/u.test(f.message)));
    const without = envelope('validate-features', [featureRoot({ 'persona-0.feature': tagged })]);
    assert.equal(without.code, 1);
    assert.ok(without.json.findings.some((f) => f.code === 'AGSC-E201' && /@matrix-H9/u.test(f.message)));
  });
});

describe('validate-features — the persona × mode × surface matrix', () => {
  const MATRIX = [
    '# Matrix',
    '',
    '| Row | Who | Feature file | Target | Reason |',
    '|---|---|---|---|---|',
    '| H1 | Solo author | persona-0 | B | |',
    '| H2 | Publisher | persona-0 | B | |',
    '| H3 | Reader | — | U | — |',
    '| H4 | Manager | — | rec | prose is the right evidence for this reader |',
    '| H5 | Maintainer | persona-0 | B + G→E9, E11 | |',
    '| H6 | Old reader | persona-0 | U — reason: a unit test covers this whole row | |',
    '| A1 | Agent | — | 1.1 | |',
    '',
    '| Surface | Target | Scenario | Reason |',
    '|---|---|---|---|',
    '| CLI verbs | B | persona-0 | |',
    '| MCP tools | B | persona-z | |',
    '| Global flags | U | — | a unit test covers every flag |',
    '| Live boards | B + G→E4 | persona-0 | |',
    '',
  ].join('\n');
  const FEATURE = [
    '@persona-0 @human',
    'Feature: Drop-in',
    '  As P0 (drop-in user)',
    '',
    '  @matrix-H1 @matrix-H5',
    '  Scenario: Runs now',
    '    Given a thing',
    '',
    '  @matrix-H5',
    '  Scenario: Waits for nine',
    '    Given a thing',
    '',
    '  @matrix-H1',
    '  Scenario: Waits for seven',
    '    Given a thing',
    '',
    '  Scenario: Waits untagged',
    '    Given a thing',
    '',
  ].join('\n');
  const gap = (scenario, closes) => JSON.stringify({ class: 'gap', closes_in: closes, reason: 'a sentence of reason long enough', scenario });

  function matrixRoot() {
    return featureRoot({ 'MATRIX.md': MATRIX, 'persona-0.feature': FEATURE }, {
      'docs/PRD.md': '| P0 | Drop-in user | x |\n| P1 | Human reader | y |\n\n| PRD-053 | a requirement |\n',
      'tests/acceptance/pending/persona-0--waits-for-nine.json': gap('Waits for nine', 'E9'),
      'tests/acceptance/pending/persona-0--waits-for-seven.json': gap('Waits for seven', 'E7'),
      'tests/acceptance/pending/persona-0--waits-untagged.json': gap('Waits untagged', 'E8'),
    });
  }

  const EXPECTED = [
    /H2 is covered by no scenario that runs/u,
    /H3 is marked U and records no reason/u,
    /H5 waits for E11 and no gap file names it/u,
    /persona-0--waits-for-seven\.json closes in E7 and no row it tags \(H1\) waits for E7/u,
    /persona-0--waits-untagged\.json closes in E8 and its scenario carries no @matrix- tag, and no surface of persona-0 waits for E8/u,
    /surface "MCP tools" names persona-z, which has no feature file/u,
    /surface "Live boards" waits for E4 and no gap file of persona-0 names it/u,
    /persona P1 of docs\/PRD\.md has no feature file/u,
  ];

  it('--strict-matrix reports each uncovered row, reasonless U, unmatched G cell, unmatched gap file and persona as an error', () => {
    const { code, json } = envelope('validate-features', ['--strict-matrix', matrixRoot()]);
    assert.equal(code, 1);
    const matrix = json.findings.filter((f) => f.file === 'features/MATRIX.md' || f.file.startsWith('tests/acceptance/pending/') || f.file === 'docs/PRD.md');
    for (const pattern of EXPECTED) {
      const hit = matrix.filter((f) => pattern.test(f.message));
      assert.equal(hit.length, 1, `${pattern}: ${JSON.stringify(matrix, null, 1)}`);
      assert.equal(hit[0].severity, 'error');
    }
    assert.equal(matrix.length, EXPECTED.length, JSON.stringify(matrix, null, 1));
  });

  it('without the flag the same findings are warnings and the pack passes', () => {
    const { code, json } = envelope('validate-features', [matrixRoot()]);
    assert.equal(code, 0);
    for (const pattern of EXPECTED) {
      assert.ok(json.findings.some((f) => pattern.test(f.message) && f.severity === 'warn'), String(pattern));
    }
    const human = capture('validate-features', [matrixRoot()]);
    assert.match(human.out, /; matrix: 7 rows, 4 surfaces, 3 gap files\n$/u);
  });

  it('a complete matrix passes in strict mode', () => {
    const root = featureRoot({
      'MATRIX.md': [
        '| Row | Who | Feature file | Target | Reason |', '|---|---|---|---|---|',
        '| H1 | Solo author | persona-0 | B + G→E9 | |', '| H4 | Manager | — | rec | prose is the right evidence for this reader |',
        '', '| Surface | Target | Scenario |', '|---|---|---|', '| CLI verbs | B + G→E9 | persona-0 |', '',
      ].join('\n'),
      'persona-0.feature': ['@persona-0 @human', 'Feature: Drop-in', '  As P0 (drop-in user)', '',
        '  @matrix-H1', '  Scenario: Runs now', '    Given a thing', '',
        '  @matrix-H1', '  Scenario: Waits for nine', '    Given a thing', ''].join('\n'),
    }, {
      'docs/PRD.md': '| P0 | Drop-in user | x |\n\n| PRD-053 | a requirement |\n',
      'tests/acceptance/pending/persona-0--waits-for-nine.json': gap('Waits for nine', 'E9'),
    });
    const { code, json } = envelope('validate-features', ['--strict-matrix', root]);
    assert.deepEqual(json.findings, []);
    assert.equal(code, 0);
  });

  it('a conditional scenario covers a C row; a forge-pending one covers nothing', () => {
    const root = featureRoot({
      'MATRIX.md': '| Row | Who | Feature file | Target |\n|---|---|---|---|\n| H1 | a | persona-0 | C |\n| H2 | b | persona-0 | B |\n',
      'persona-0.feature': ['@persona-0 @human', 'Feature: f', '  As P0 (x)', '',
        '  @matrix-H1', '  Scenario: In a browser', '    Given a thing', '',
        '  @matrix-H2', '  Scenario: On a forge', '    Given a thing', ''].join('\n'),
    }, {
      'docs/PRD.md': '| P0 | Drop-in user | x |\n\n| PRD-053 | a requirement |\n',
      'tests/acceptance/pending/persona-0--in-a-browser.json': JSON.stringify({ class: 'conditional', needs: 'browser', reason: 'a sentence of reason long enough', scenario: 'In a browser' }),
      'tests/acceptance/pending/persona-0--on-a-forge.json': JSON.stringify({ class: 'forge', reason: 'a sentence of reason long enough', scenario: 'On a forge' }),
    });
    const { json } = envelope('validate-features', ['--strict-matrix', root]);
    assert.deepEqual(json.findings.map((f) => f.message.replace(/ \(.*$/u, '')), ['row H2 is covered by no scenario that runs']);
  });

  // The verb set of AGSC-09-07, read from spec/09-conformance.md, against the step
  // text of the scenarios that run: a CLI surface marked B claims every verb.
  const VERB_SPEC = '- **AGSC-09-07** The verb set is exactly **three**: `init`, `lint`, `review`. `run` and `trace` are not verbs of this pack.\n';
  function verbRoot(reviewRuns) {
    return featureRoot({
      'MATRIX.md': '| Surface | Target | Scenario |\n|---|---|---|\n| CLI verbs (3) | B for all 3 | persona-0 |\n',
      'persona-0.feature': ['@persona-0 @human @mode-0', 'Feature: f', '  As P0 (x)', '',
        '  Scenario: Starts', '    When the author runs "agsc init"', '    Then "npx agentic-system-core lint" exits 0', '',
        '  Scenario: Reviews on a forge', '    When the forge runs "agsc review"', '    Then a label is added', ''].join('\n'),
    }, {
      'docs/PRD.md': '| P0 | Drop-in user | x |\n\n| PRD-053 | a requirement |\n',
      'spec/09-conformance.md': VERB_SPEC,
      ...(reviewRuns ? {} : { 'tests/acceptance/pending/persona-0--reviews-on-a-forge.json':
        JSON.stringify({ class: 'forge', reason: 'a sentence of reason long enough', scenario: 'Reviews on a forge' }) }),
    });
  }

  it('--strict-matrix reports a verb of AGSC-09-07 that no running scenario runs, on the CLI surface', () => {
    const { code, json } = envelope('validate-features', ['--strict-matrix', verbRoot(false)]);
    assert.equal(code, 1);
    assert.deepEqual(json.findings.map((f) => [f.code, f.file, f.line, f.severity]),
      [['AGSC-E202', 'features/MATRIX.md', 3, 'error']]);
    assert.match(json.findings[0].message,
      /surface "CLI verbs \(3\)" claims every verb, and no scenario that runs has "agsc review" or "agentic-system-core review" in a step \(AGSC-09-07\)/u);
    const warned = envelope('validate-features', [verbRoot(false)]);
    assert.equal(warned.code, 0);
    assert.deepEqual(warned.json.findings.map((f) => f.severity), ['warn']);
    // Once the scenario runs, every verb is covered.
    assert.deepEqual(envelope('validate-features', ['--strict-matrix', verbRoot(true)]).json.findings, []);
  });

  it('cliVerbs reads the verb set of AGSC-09-07; the shipped list is the command line\'s', () => {
    const { cliVerbs } = tool('validate-features');
    assert.deepEqual(cliVerbs(VERB_SPEC), ['init', 'lint', 'review']);
    assert.deepEqual(cliVerbs('- **AGSC-09-06** no verb list here\n'), []);
    const shipped = cliVerbs(fs.readFileSync(path.join(REPO, 'spec', '09-conformance.md'), 'utf8'));
    assert.deepEqual(shipped, require(path.join(REPO, 'src', 'application', 'cli', 'main.js')).VERBS);
  });

  it('a status outside the closed list, and a matrix with no Target column, are reported', () => {
    const root = featureRoot({
      'MATRIX.md': '| Row | Who | Feature file | Target |\n|---|---|---|---|\n| H1 | a | persona-0 | maybe |\n\n| Row | Who |\n|---|---|\n| H2 | b |\n',
    });
    const { json } = envelope('validate-features', ['--strict-matrix', root]);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E203' && /row H1: the target "maybe" names no status/u.test(f.message)));
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E202' && /a table of features\/MATRIX\.md has no Target column/u.test(f.message)));
  });

  it('--strict-matrix on a pack with no features/MATRIX.md is AGSC-E901', () => {
    const { code, json } = envelope('validate-features', ['--strict-matrix', featureRoot()]);
    assert.equal(code, 1);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E901' && /features\/MATRIX\.md/u.test(f.message)));
  });

  it('readMatrix reads both tables, the G cells with their continued lists, and the reasons', () => {
    const { readMatrix } = tool('validate-features');
    const matrix = readMatrix(MATRIX);
    assert.deepEqual(matrix.rows.map((r) => r.id), ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'A1']);
    assert.deepEqual(matrix.rows.find((r) => r.id === 'H5').gaps, ['E9', 'E11']);
    assert.deepEqual([...matrix.rows.find((r) => r.id === 'H5').status].sort(), ['B', 'G']);
    assert.equal(matrix.rows.find((r) => r.id === 'H6').reason, 'a unit test covers this whole row');
    assert.equal(matrix.rows.find((r) => r.id === 'H3').reason, '');
    assert.deepEqual(matrix.surfaces.map((s) => s.label), ['CLI verbs', 'MCP tools', 'Global flags', 'Live boards']);
    assert.deepEqual(matrix.surfaces.find((s) => s.label === 'Live boards').stems, ['persona-0']);
    assert.deepEqual(matrix.surfaces.find((s) => s.label === 'Live boards').gaps, ['E4']);
    assert.deepEqual(readMatrix('| Row | Target |\n|---|---|\n| H1 | B + G→RS-a, RS-b; w3id live P |\n').rows[0].gaps, ['RS-a', 'RS-b']);
  });
});
