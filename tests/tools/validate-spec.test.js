'use strict';
// tools/validate-spec — AGSC-09-90, AGSC-09-91. One passing case built from the
// rule text, then one failing case per fault the rule names, then the real
// distribution. Fixtures are written into a throw-away directory rather than
// committed, so that a deliberately broken spec file can never be mistaken for one.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const { REPO, capture, envelope, specRoot, tmpdir, tool, writeTree } = require('./helpers');

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
    // AGSC-09-90 says a validator MUST FAIL "with
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
    assert.equal(json.spec_version, '1.0.0-rc.9');
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

  it('the severity column of 1.0.0: the rule list is the third cell, not the last', () => {
    // §9.4 gained a fourth column, Severity, for 1.0.0. The rules a row names are in the
    // third cell; reading the last cell would take the severity for the rule list and
    // report every assigning rule as missing from its row.
    const rows = (severity) => specRoot({
      'spec/09-conformance.md': [
        '# Conformance', '', '| Code | Meaning | Rule | Severity |', '|---|---|---|---|',
        `| \`AGSC-E201\` | schema validation failed | AGSC-09-01 | ${severity} |`, '',
        '- **AGSC-09-01** A mismatch is `AGSC-E201`. [PRD-054]', '',
      ].join('\n'),
    });
    for (const severity of ['error', 'warning', 'error; a warning when the context says so']) {
      const { json } = envelope('validate-spec', [rows(severity)]);
      assert.equal(json.findings.filter((f) => f.severity === 'error').length, 0, `${severity}: ${JSON.stringify(json.findings)}`);
    }
    // The three-column form still checks, so an older text can be validated.
    const old = specRoot({
      'spec/09-conformance.md': [
        '# Conformance', '', '| Code | Meaning | Rule |', '|---|---|---|',
        '| `AGSC-E201` | schema validation failed | AGSC-09-01 |', '',
        '- **AGSC-09-01** A mismatch is `AGSC-E201`. [PRD-054]', '',
      ].join('\n'),
    });
    assert.equal(envelope('validate-spec', [old]).json.findings.filter((f) => f.severity === 'error').length, 0);
  });

  it('every row of the registry of this distribution carries a severity', () => {
    const text = fs.readFileSync(path.join(REPO, 'spec', '09-conformance.md'), 'utf8');
    const rows = text.split('\n').filter((l) => /^\| `AGSC-E\d{3}`/u.test(l));
    assert.equal(rows.length, 105);
    for (const row of rows) assert.match(row, /\| (?:error|warning|—)[^|]*\|\s*$/u, row.slice(0, 40));
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

  it('the same sentence in a heading, in a fence or inside a rule\'s own table is not a fault', () => {
    const root = specRoot({
      'spec/02-item.md': [
        '# Item', '', '## A MUST heading', '', '```', 'An engine MUST fence.', '```', '',
        '- **AGSC-02-01** One, with a table. [PRD-002]', '', '| a | b |', '|---|---|', '| x | MUST |', '',
        '  An indented paragraph of the rule: a writer MUST do it.', '',
      ].join('\n'),
    });
    const { json } = envelope('validate-spec', [root]);
    assert.ok(!json.findings.some((f) => /a normative sentence outside/u.test(f.message)), JSON.stringify(json.findings));
  });

  it('a rule with no trace bracket, and a reserved rule in either marker form that needs none', () => {
    const root = specRoot({
      'spec/02-item.md': [
        '# Item', '',
        '- **AGSC-02-01** A rule with no trace at all.', '',
        '- **AGSC-02-02** *(reserved: merged into AGSC-02-01; the id is never reused, AGSC-00-16.)*', '',
        '- **AGSC-02-03** *(retired at rc, 2026-01-01: merged into AGSC-02-01.)*', '',
      ].join('\n'),
    });
    const { json } = envelope('validate-spec', [root]);
    const missing = json.findings.filter((f) => /carries no trace bracket/u.test(f.message));
    assert.equal(missing.length, 1);
    assert.match(missing[0].message, /AGSC-02-01/u);
  });

  it('a trace bracket followed by an italic note still counts', () => {
    assert.equal(traceBracket('text [PRD-002] *(corrected: it cited itself.)*'), 'PRD-002');
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
      'docs/NOTES.md': 'Amended at 1.0.0-rc.7 and still true.\nThe format is 1.0.0-rc.8 today.\n',
      'tests/vectors/jcs/jcs-0001.json': '{"options":{"spec_version":"1.0.0-rc.0"}}\n',
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

describe('validate-spec — the editorial frame: one note form, the key words, every MUST under a rule', () => {
  const lint = (files) => envelope('validate-spec', [specRoot(files)]).json;
  const rule = (body) => ({ 'spec/02-item.md': `# Item\n\n- **AGSC-02-01** ${body} [PRD-002]\n` });
  const hits = (json, re) => json.findings.filter((f) => re.test(f.message));

  it('a dated note in the one form passes', () => {
    const json = lint(rule('A writer MUST do it. *(Amended 2026-10-02 for 1.0.0: the case was not stated)*'));
    assert.equal(json.counts.error, 0, JSON.stringify(json.findings));
  });

  it('each other written form of a dated note fails with AGSC-E204', () => {
    const forms = [
      '*(amended 2026-10-02 for 1.0.0: lower case)*',
      '*(row amended 2026-10-07 for 1.0.0: a row)*',
      '*(row amended 2026-10-06 and 2026-10-07 for 1.0.0: two dates)*',
      '*(Rows amended 2026-10-02 to 2026-10-07 for 1.0.0, a range)*',
      '*(row added 2026-10-02 for 1.0.0)*',
      '*(Note added 2026-10-02 for 1.0.0: a note)*',
      '*(Amended for 1.0.0: no date)*',
      '*(Amended 2026-10-02: no version)*',
      '*(Amended 2026-10-02 for 1.0.0)*',
    ];
    for (const form of forms) {
      const json = lint(rule(`A writer MUST do it. ${form}`));
      const found = hits(json, /dated note is not in the one form/u);
      assert.equal(found.length, 1, `${form}: ${JSON.stringify(json.findings)}`);
      assert.equal(found[0].code, 'AGSC-E204');
      assert.equal(found[0].line, 3);
    }
  });

  it('an italic note that is no amendment is not checked for the form', () => {
    const json = lint(rule('One. *(Rationale: a reason.)* *(reserved: stated by AGSC-02-01.)* *(retired at rc, 2026-01-01: merged.)*'));
    assert.equal(hits(json, /dated note/u).length, 0, JSON.stringify(json.findings));
  });

  it('a MUST in a table row outside every rule fails, rule id or not', () => {
    const json = lint({
      'spec/02-item.md': [
        '# Item', '', '| Key | Rule |', '|---|---|', '| `iri` | if present MUST equal the computed IRI |',
        '| `AGSC-E311` | a Link MUST NOT cross Bundles (AGSC-02-01) |', '', '- **AGSC-02-01** One. [PRD-002]', '',
      ].join('\n'),
    });
    const found = hits(json, /a normative sentence outside every rule/u);
    assert.deepEqual(found.map((f) => `${f.code} ${f.line}`), ['AGSC-E202 5', 'AGSC-E202 6']);
  });

  it('a paragraph outside every rule that only cites a rule id fails', () => {
    const json = lint({
      'spec/02-item.md': [
        '# Item', '', '- **AGSC-02-01** One. [PRD-002]', '', '## Precedence', '',
        '**Precedence.** An engine MUST report one code, as AGSC-02-01 says.', '',
        '*A note: a node MUST NOT expose it, which AGSC-02-01 excludes.*', '',
      ].join('\n'),
    });
    assert.deepEqual(hits(json, /a normative sentence outside every rule/u).map((f) => f.line), [7, 9]);
  });

  it('a key word in a malformed form fails with AGSC-E204', () => {
    for (const bad of ['it MUST not begin with a slash', 'nor MUST a pack', 'a reader MAY ALWAYS read it',
      'a reader MAY NOT read it', 'a writer MUST NEVER write it', 'a writer SHOULD not write it',
      'it is not REQUIRED', 'a writer MUST ONLY write it', 'a writer SHALL never write it']) {
      const json = lint({ ...rule(`${bad}.`), 'spec/00-overview.md': [
        '# Overview', '',
        '`spec_version: "1.0.0-rc.9"` The key words MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, '
        + 'RECOMMENDED, NOT RECOMMENDED, MAY, OPTIONAL are to be interpreted as described in BCP 14.', '',
        '- **AGSC-00-01** A Bundle is a directory tree. [PRD-002]', '',
      ].join('\n') });
      const found = hits(json, /key word in a form BCP 14 does not define/u);
      assert.equal(found.length, 1, `${bad}: ${JSON.stringify(json.findings)}`);
      assert.equal(found[0].code, 'AGSC-E204');
    }
  });

  it('the well-formed key words, NOT alone and an acronym before a key word pass', () => {
    const json = lint({
      'spec/00-overview.md': [
        '# Overview', '',
        '`spec_version: "1.0.0-rc.9"` The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", '
        + '"SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" are to be interpreted as described in BCP 14.', '',
        '- **AGSC-00-01** A Bundle is a directory tree. [PRD-002]', '',
      ].join('\n'),
      ...rule('A writer MUST NOT, SHOULD NOT, SHALL NOT; it is NOT RECOMMENDED; the IRI MUST hold; a MINOR MAY add; '
        + 'a field is OPTIONAL and REQUIRED elsewhere; that is NOT a fault.'),
    });
    assert.equal(json.counts.error, 0, JSON.stringify(json.findings));
  });

  it('a key word the text uses and the key-words sentence does not list fails once, at its first use', () => {
    const json = lint({
      ...rule('A field is OPTIONAL.'),
      'spec/03-links.md': '# Links\n\n- **AGSC-03-01** It is OPTIONAL and RECOMMENDED; a writer MAY do it. [PRD-002]\n',
    });
    const found = hits(json, /is not listed in the key-words sentence/u);
    // The fixture's sentence lists MUST and SHOULD only, so MAY is reported too.
    assert.deepEqual(found.map((f) => `${f.code} ${f.file}:${f.line} ${f.message.split(' ')[5]}`).sort(),
      ['AGSC-E202 spec/02-item.md:3 OPTIONAL', 'AGSC-E202 spec/03-links.md:3 MAY', 'AGSC-E202 spec/03-links.md:3 RECOMMENDED']);
    assert.match(found.find((f) => f.file === 'spec/02-item.md').message, /OPTIONAL .*2 uses/u);
  });

  it('NOT RECOMMENDED is its own key word, not a use of RECOMMENDED', () => {
    const json = lint(rule('It is NOT RECOMMENDED.'));
    const found = hits(json, /is not listed in the key-words sentence/u);
    assert.equal(found.length, 1, JSON.stringify(json.findings));
    assert.match(found[0].message, /^the BCP 14 key word NOT RECOMMENDED /u);
  });

  it('with no key-words sentence every key word used is reported', () => {
    const json = lint({ 'spec/00-overview.md': '# Overview\n\n`spec_version: "1.0.0-rc.9"`\n\n- **AGSC-00-01** A Bundle is a tree. [PRD-002]\n' });
    assert.deepEqual(hits(json, /is not listed in the key-words sentence/u).map((f) => f.message.split(' ')[5]), ['MUST']);
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
    assert.equal(json.spec_version, '1.0.0');
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
