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
  '@persona-0 @PRD-053',
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
    'spec/00-overview.md': '`spec_version: "1.0.0-rc.5"`\n',
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
    fs.writeFileSync(path.join(root, 'features', 'persona-0.feature'), `﻿${GOOD.replace(/\n/gu, '\r\n')}\n`);
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
      'x.feature': ['# a comment', 'Feature: f', '', '  Rule: a rule', '', '  Scenario: s', '    Given a thing', ''].join('\n'),
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
    assert.deepEqual([...parsed.tags].sort(), ['@PRD-053', '@persona-0']);
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
    assert.equal(result.err, '');
    assert.match(result.out, /^validate-features: 12 input file\(s\) read, \d+ scenarios, \d+ requirement ids tagged, 0 error, 0 warn/u);
  });
});
