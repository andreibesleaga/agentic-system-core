'use strict';
// tools/validate-spec — AGSC-09-90, AGSC-09-91. One passing case built from the
// rule text, then one failing case per fault the rule names, then the real
// distribution. Fixtures are written into a throw-away directory rather than
// committed, so that a deliberately broken spec file can never be mistaken for one.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const { REPO, capture, codes, envelope, specRoot, tmpdir, tool, writeTree } = require('./helpers');

const { fencedLines, ruleBlocks, traceBracket } = tool('validate-spec');

describe('validate-spec — usage and the envelope', () => {
  it('--help exits 0 and prints the synopsis', () => {
    const result = capture('validate-spec', ['--help']);
    assert.equal(result.code, 0);
    assert.match(result.out, /^validate-spec \[--json\]/u);
  });

  it('an unknown flag exits 2 with AGSC-E002', () => {
    const result = capture('validate-spec', ['--strict']);
    assert.equal(result.code, 2);
    assert.match(result.err, /unknown flag --strict \(AGSC-E002\)/u);
  });

  it('a second positional argument exits 2', () => {
    const result = capture('validate-spec', [specRoot(), specRoot()]);
    assert.equal(result.code, 2);
    assert.match(result.err, /unexpected argument/u);
  });

  it('a root with no spec/ FAILS with AGSC-E901, exit 1', () => {
    // CHANGED at rc.6: AGSC-09-90 now says a validator MUST FAIL "with
    // `AGSC-E901`" over an absent input, and AGSC-09-08 reserves exit 2 for a usage
    // error. An absent input is exit 1, the envelope and the code.
    const result = capture('validate-spec', [tmpdir()]);
    assert.equal(result.code, 1);
    assert.match(result.err, /AGSC-E901 no spec\/ directory/u);
    assert.match(result.out, /0 input file\(s\) read/u);
  });

  it('--json writes the AGSC-09-11 envelope and nothing else', () => {
    const { code, err, json } = envelope('validate-spec', [specRoot()]);
    assert.equal(code, 0);
    assert.equal(err, '');
    assert.deepEqual(Object.keys(json).sort(),
      ['counts', 'findings', 'schema', 'spec_version', 'status', 'verb', 'version']);
    assert.equal(json.schema, 'agsc.diagnostics.v1');
    assert.equal(json.verb, 'validate-spec');
    assert.equal(json.status, 'pass');
    assert.equal(json.spec_version, '1.0.0-rc.5');
    assert.deepEqual(json.counts, { error: 0, warn: 0 });
  });

  it('--quiet says nothing and answers with the exit code alone', () => {
    const result = capture('validate-spec', ['--quiet', specRoot()]);
    assert.equal(result.code, 0);
    assert.equal(result.out, '');
    assert.equal(result.err, '');
  });

  it('the human output is one line per finding, sorted by file then line', () => {
    const root = specRoot({ 'spec/02-item.md': '# Item\n\n- **AGSC-02-01** A rule with no trace.\n' });
    const result = capture('validate-spec', [root]);
    assert.equal(result.code, 1);
    assert.match(result.err, /^error: spec\/02-item\.md:3:1 AGSC-E202 /mu);
    // the line now opens with how many inputs the run actually read.
    assert.match(result.out, /^validate-spec: 4 input file\(s\) read, 4 spec files, 4 rules, 1 registered codes/u);
  });

  it('a root with no package.json still reports a version', () => {
    const { json } = envelope('validate-spec', [specRoot()]);
    assert.equal(json.version, '0.0.0');
  });
});

describe('validate-spec — the faults AGSC-09-91 names', () => {
  it('a duplicate rule id', () => {
    const root = specRoot({ 'spec/02-item.md': '# Item\n\n- **AGSC-01-01** Again. [PRD-002]\n' });
    const { code, json } = envelope('validate-spec', [root]);
    assert.equal(code, 1);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E201' && /duplicate rule id AGSC-01-01/u.test(f.message)));
  });

  it('a rule id referenced and defined nowhere', () => {
    const root = specRoot({ 'spec/02-item.md': '# Item\n\n- **AGSC-02-01** See AGSC-07-77. [PRD-002]\n' });
    const { json } = envelope('validate-spec', [root]);
    assert.ok(json.findings.some((f) => /AGSC-07-77 is referenced here and defined nowhere/u.test(f.message)));
  });

  it('a rule id <n>a that does not immediately follow <n>', () => {
    const root = specRoot({
      'spec/02-item.md': '# Item\n\n- **AGSC-02-01** One. [PRD-002]\n\n- **AGSC-02-03** Three. [PRD-002]\n\n- **AGSC-02-02a** Late. [PRD-002]\n',
    });
    const { json } = envelope('validate-spec', [root]);
    assert.ok(json.findings.some((f) => /AGSC-02-02a does not immediately follow AGSC-02-02/u.test(f.message)));
  });

  it('a rule id <n>b that does follow <n>a is accepted', () => {
    const root = specRoot({
      'spec/02-item.md': '# Item\n\n- **AGSC-02-01** One. [PRD-002]\n\n- **AGSC-02-01a** A. [PRD-002]\n\n- **AGSC-02-01b** B. [PRD-002]\n',
    });
    const { json } = envelope('validate-spec', [root]);
    assert.ok(!json.findings.some((f) => /does not immediately follow/u.test(f.message)));
  });

  it('an error code used in spec/01-11 and absent from the registry', () => {
    const root = specRoot({ 'spec/02-item.md': '# Item\n\n- **AGSC-02-01** A fault is `AGSC-E999`. [PRD-002]\n' });
    const { json } = envelope('validate-spec', [root]);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E203' && /AGSC-E999/u.test(f.message)));
  });

  it('a code in more than one registry row', () => {
    const root = specRoot({
      'spec/09-conformance.md': [
        '# Conformance', '', '| Code | Fault | Raised by |', '|---|---|---|',
        '| `AGSC-E201` | one | AGSC-01-01 |', '| `AGSC-E201` | again | AGSC-01-01 |', '',
        '- **AGSC-09-01** An engine MUST report `AGSC-E201`. [PRD-054]', '',
      ].join('\n'),
    });
    const { json } = envelope('validate-spec', [root]);
    assert.ok(json.findings.some((f) => /appears in more than one registry row/u.test(f.message)));
  });

  it('a registry row naming a rule id that does not exist', () => {
    const root = specRoot({
      'spec/09-conformance.md': [
        '# Conformance', '', '| Code | Fault | Raised by |', '|---|---|---|',
        '| `AGSC-E201` | one | AGSC-04-44 |', '',
        '- **AGSC-09-01** An engine MUST report `AGSC-E201`. [PRD-054]', '',
      ].join('\n'),
    });
    const { json } = envelope('validate-spec', [root]);
    assert.ok(json.findings.some((f) => /names rule AGSC-04-44, which is defined nowhere/u.test(f.message)));
  });

  it('a rule that assigns a code the registry row does not name', () => {
    const root = specRoot({ 'spec/02-item.md': '# Item\n\n- **AGSC-02-01** A mismatch is `AGSC-E201`. [PRD-002]\n' });
    const { json } = envelope('validate-spec', [root]);
    assert.ok(json.findings.some((f) => /AGSC-02-01 assigns AGSC-E201 and the section 9.4 row/u.test(f.message)));
  });

  it('a registered code no rule names is a warning, and a reserved row is silent', () => {
    const root = specRoot({
      'spec/09-conformance.md': [
        '# Conformance', '', '| Code | Fault | Raised by |', '|---|---|---|',
        '| `AGSC-E201` | schema validation failed | AGSC-01-01 |',
        '| `AGSC-E301` | link target unresolved | AGSC-01-01 |',
        '| `AGSC-E704` | *(unassigned — reserved; never emitted)* | — |', '',
        '- **AGSC-09-01** An engine MUST report `AGSC-E201`. [PRD-054]', '',
      ].join('\n'),
    });
    const { json } = envelope('validate-spec', [root]);
    const orphans = json.findings.filter((f) => /is named by no rule of spec\/00-11/u.test(f.message));
    assert.equal(orphans.length, 1);
    assert.equal(orphans[0].severity, 'warn');
    assert.match(orphans[0].message, /AGSC-E301/u);
  });

  it('a MUST sentence outside every rule and naming no rule id', () => {
    const root = specRoot({ 'spec/02-item.md': '# Item\n\nAn engine MUST do the right thing.\n\n- **AGSC-02-01** One. [PRD-002]\n' });
    const { json } = envelope('validate-spec', [root]);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E202'
      && /a normative sentence outside every rule carries no rule id/u.test(f.message)));
  });

  it('the same sentence naming a rule id, in a table, in a heading or in a fence is not a fault', () => {
    const root = specRoot({
      'spec/02-item.md': [
        '# Item', '', '## A MUST heading', '', '| a | b |', '|---|---|', '| x | MUST |', '',
        'An engine MUST do what AGSC-02-01 says.', '', '```', 'An engine MUST fence.', '```', '',
        '- **AGSC-02-01** One. [PRD-002]', '',
      ].join('\n'),
    });
    const { json } = envelope('validate-spec', [root]);
    assert.ok(!json.findings.some((f) => /a normative sentence outside/u.test(f.message)), JSON.stringify(json.findings));
  });

  it('a rule with no trace bracket, and a retired rule that needs none', () => {
    const root = specRoot({
      'spec/02-item.md': [
        '# Item', '',
        '- **AGSC-02-01** A rule with no trace at all.', '',
        '- **AGSC-02-02** *(retired at rc.3: merged into AGSC-02-01.)*', '',
      ].join('\n'),
    });
    const { json } = envelope('validate-spec', [root]);
    const missing = json.findings.filter((f) => /carries no trace bracket/u.test(f.message));
    assert.equal(missing.length, 1);
    assert.match(missing[0].message, /AGSC-02-01/u);
  });

  it('a trace bracket followed by an italic note still counts', () => {
    assert.equal(traceBracket('text [PRD-002] *(corrected at rc.5,: it cited itself.)*'), 'PRD-002');
    assert.equal(traceBracket('text [PRD-002]'), 'PRD-002');
    assert.equal(traceBracket('no bracket here'), null);
  });

  it('a trace tag naming a requirement docs/PRD.md does not define', () => {
    const root = specRoot({
      'docs/PRD.md': '| PRD-002 | a requirement |\n',
      'spec/02-item.md': '# Item\n\n- **AGSC-02-01** One. [PRD-999]\n',
    });
    const { json } = envelope('validate-spec', [root]);
    assert.ok(json.findings.some((f) => /traces to PRD-999, which docs\/PRD.md does not define/u.test(f.message)));
  });

  it('a version literal that differs, and the historical-note carve-out that saves one', () => {
    const root = specRoot({
      'docs/NOTES.md': 'Amended at 1.0.0-rc.3 and still true.\nThe format is 1.0.0-rc.4 today.\n',
      'tests/vectors/jcs/jcs-0001.json': '{"options":{"spec_version":"1.0.0-rc.2"}}\n',
    });
    const { json } = envelope('validate-spec', [root]);
    const drift = json.findings.filter((f) => /version literal/u.test(f.message));
    assert.deepEqual(drift.map((f) => `${f.file}:${f.line}`), ['docs/NOTES.md:2', 'tests/vectors/jcs/jcs-0001.json:1']);
  });

  it('a spec/ with neither overview nor conformance reports AGSC-E901 twice', () => {
    const root = writeTree(tmpdir(), { 'spec/02-item.md': '# Item\n\n- **AGSC-02-01** One. [PRD-002]\n' });
    const { json } = envelope('validate-spec', [root]);
    assert.deepEqual(json.findings.filter((f) => f.code === 'AGSC-E901').map((f) => f.file),
      ['spec/00-overview.md', 'spec/09-conformance.md']);
    assert.equal(json.spec_version, 'unknown');
  });
});

describe('validate-spec — the helpers it exports', () => {
  it('ruleBlocks ends a block at the next rule or the next heading', () => {
    const blocks = ruleBlocks('- **AGSC-01-01** one\n  more\n\n- **AGSC-01-02** two\n\n## H\n\ntail\n', 'spec/x.md');
    assert.deepEqual(blocks.map((b) => b.id), ['AGSC-01-01', 'AGSC-01-02']);
    assert.match(blocks[0].text, /more/u);
    assert.ok(!blocks[1].text.includes('tail'));
  });

  it('fencedLines marks the fences and everything between them', () => {
    assert.deepEqual([...fencedLines('a\n```\nb\n```\nc\n')].sort((x, y) => x - y), [2, 3, 4]);
  });
});

describe('validate-spec — the real distribution', () => {
  it('runs on the shipped spec/ and reports only known, recorded items', () => {
    const { code, json } = envelope('validate-spec', [REPO]);
    assert.equal(json.spec_version, '1.0.0-rc.6');
    assert.equal(json.version, JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version);
    assert.equal(code, json.counts.error === 0 ? 0 : 1);
    // Every finding is a registered code and carries a real file:line.
    for (const f of json.findings) {
      assert.match(f.code, /^AGSC-E\d{3}$/u);
      assert.ok(fs.existsSync(path.join(REPO, f.file)), f.file);
      assert.ok(f.line >= 1);
      assert.ok(['error', 'warn'].includes(f.severity));
    }
    // Sorted by (file, line, col, code) — AGSC-09-10.
    const keys = json.findings.map((f) => `${f.file}\u0000${String(f.line).padStart(6, '0')}\u0000${f.code}`);
    assert.deepEqual(keys, [...keys].sort());
  });
});
