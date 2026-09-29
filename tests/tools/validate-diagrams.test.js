'use strict';
// tools/validate-diagrams — AGSC-09-90, PRD-054 ("Mermaid parse + trace-id presence
// + staleness vs source docs"). The passing case is the shipped docs/diagrams/ pack.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const { REPO, capture, envelope, tmpdir, tool, writeTree } = require('./helpers');

const { checkMermaid, fencedBlocks, indexRows } = tool('validate-diagrams');

const GOOD = [
  '# A pipeline',
  '',
  'Traces: PRD-004, AGSC-01-01.',
  '',
  '```mermaid',
  'flowchart TD',
  '  A["read"] --> B["write"]',
  '```',
  '',
].join('\n');

const README = [
  '# docs/diagrams/',
  '',
  '| File | Diagram(s) | Notation | Traces | Source |',
  '|---|---|---|---|---|',
  '| `algo.md` | 1 flowchart | flowchart TD | PRD-004 | `docs/PLAN.md` |',
  '',
].join('\n');

function diagramRoot(files = {}, extra = {}) {
  return writeTree(tmpdir(), {
    'docs/PRD.md': '| PRD-004 | a requirement |\n',
    'docs/diagrams/README.md': README,
    'docs/diagrams/algo.md': GOOD,
    'spec/00-overview.md': '`spec_version: "1.0.0-rc.9"`\n\n- **AGSC-01-01** A rule. [PRD-004]\n',
    ...Object.fromEntries(Object.entries(files).map(([k, v]) => [`docs/diagrams/${k}`, v])),
    ...extra,
  });
}

describe('validate-diagrams — usage and the envelope', () => {
  it('--help exits 0; an unknown flag and a second argument exit 2', () => {
    assert.equal(capture('validate-diagrams', ['--help']).code, 0);
    assert.equal(capture('validate-diagrams', ['--nope']).code, 2);
    assert.equal(capture('validate-diagrams', [diagramRoot(), diagramRoot()]).code, 2);
  });

  // a directory that does not exist is nothing to validate, which
  // every other checker reports as AGSC-E901 with exit 1 — not a usage
  // error, since the invocation itself was well formed.
  it('a directory that does not exist is AGSC-E901 with exit 1, as in every other checker', () => {
    const result = capture('validate-diagrams', [path.join(tmpdir(), 'absent')]);
    assert.equal(result.code, 1);
    assert.match(result.err, /no diagrams directory/u);
    const { code, json } = envelope('validate-diagrams', [path.join(tmpdir(), 'absent')]);
    assert.equal(code, 1);
    assert.deepEqual(json.findings.map((f) => f.code), ['AGSC-E901']);
    assert.equal(json.status, 'fail');
  });

  it('the envelope has the AGSC-09-11 shape, and the pack may be named directly', () => {
    const root = diagramRoot();
    const { code, json } = envelope('validate-diagrams', [path.join(root, 'docs', 'diagrams')]);
    assert.equal(code, 0);
    assert.equal(json.verb, 'validate-diagrams');
    assert.deepEqual(json.findings, []);
  });

  it('--quiet says nothing; the human output carries a summary line', () => {
    assert.equal(capture('validate-diagrams', ['--quiet', diagramRoot()]).out, '');
    assert.match(capture('validate-diagrams', [diagramRoot()]).out,
      /^validate-diagrams: 1 input file\(s\) read, 1 mermaid blocks, 0 error, 0 warn\n$/u);
  });
});

describe('validate-diagrams — the faults', () => {
  const only = (files, extra) => envelope('validate-diagrams', [diagramRoot(files, extra)]).json;

  it('encoding faults are AGSC-E108', () => {
    const root = diagramRoot();
    fs.writeFileSync(path.join(root, 'docs', 'diagrams', 'algo.md'), `\uFEFF${GOOD.replace(/\n/gu, '\r\n')}\n`);
    const { json } = envelope('validate-diagrams', [root]);
    assert.ok(json.findings.filter((f) => f.code === 'AGSC-E108').length >= 3);
  });

  it('non-NFC text is AGSC-E108', () => {
    const root = diagramRoot();
    fs.writeFileSync(path.join(root, 'docs', 'diagrams', 'algo.md'), GOOD.replace('read', 'readé'));
    const { json } = envelope('validate-diagrams', [root]);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E108' && /not NFC/u.test(f.message)));
  });

  it('a file with no mermaid block is AGSC-E109', () => {
    const root = diagramRoot();
    fs.writeFileSync(path.join(root, 'docs', 'diagrams', 'algo.md'), '# A page\n\nPRD-004\n');
    const { json } = envelope('validate-diagrams', [root]);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E109' && /carries no mermaid block/u.test(f.message)));
  });

  it('a fence that never closes is AGSC-E109', () => {
    const root = diagramRoot();
    fs.writeFileSync(path.join(root, 'docs', 'diagrams', 'algo.md'), '# A page\n\nPRD-004\n\n```mermaid\nflowchart TD\n  A --> B\n');
    const { json } = envelope('validate-diagrams', [root]);
    assert.ok(json.findings.some((f) => /never closes/u.test(f.message)));
  });

  it('an unknown diagram type and an empty block are AGSC-E109', () => {
    const root = diagramRoot();
    fs.writeFileSync(path.join(root, 'docs', 'diagrams', 'algo.md'),
      '# A page\n\nPRD-004\n\n```mermaid\nquantumDiagram\n  A --> B\n```\n\n```mermaid\n```\n');
    const { json } = envelope('validate-diagrams', [root]);
    assert.ok(json.findings.some((f) => /"quantumDiagram"/u.test(f.message)));
    assert.ok(json.findings.some((f) => /an empty mermaid block/u.test(f.message)));
  });

  it('an odd quote and an unmatched bracket are AGSC-E201', () => {
    const root = diagramRoot();
    fs.writeFileSync(path.join(root, 'docs', 'diagrams', 'algo.md'),
      '# A page\n\nPRD-004\n\n```mermaid\nflowchart TD\n  A["read] --> B\n  C[[write] --> D\n```\n');
    const { json } = envelope('validate-diagrams', [root]);
    assert.ok(json.findings.some((f) => /odd number of double quotes/u.test(f.message)));
    assert.ok(json.findings.some((f) => /unmatched/u.test(f.message)));
  });

  it('a reserved word as a bare node id is AGSC-E201, and subgraph/end is not', () => {
    const root = diagramRoot();
    fs.writeFileSync(path.join(root, 'docs', 'diagrams', 'algo.md'),
      '# A page\n\nPRD-004\n\n```mermaid\nflowchart TD\n  subgraph one\n  A --> end\n  end\n```\n');
    const { json } = envelope('validate-diagrams', [root]);
    const reserved = json.findings.filter((f) => /reserved word/u.test(f.message));
    assert.equal(reserved.length, 1);
  });

  it('a class diagram and a state diagram may use their own keywords', () => {
    const root = diagramRoot();
    fs.writeFileSync(path.join(root, 'docs', 'diagrams', 'algo.md'), [
      '# A page', '', 'PRD-004', '',
      '```mermaid', 'classDiagram', '  class Item {', '    +slug', '  }', '```', '',
      '```mermaid', 'stateDiagram-v2', '  state Draft {', '    [*] --> a', '  }', '```', '',
    ].join('\n'));
    const { json } = envelope('validate-diagrams', [root]);
    assert.ok(!json.findings.some((f) => /reserved word|unmatched/u.test(f.message)), JSON.stringify(json.findings));
  });

  it('a file citing no trace id is AGSC-E202, and the human output names it', () => {
    const root = diagramRoot();
    fs.writeFileSync(path.join(root, 'docs', 'diagrams', 'algo.md'),
      '# A page\n\n```mermaid\nflowchart TD\n  A --> B\n```\n');
    const { json } = envelope('validate-diagrams', [root]);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E202' && /cites no trace id/u.test(f.message)));
    const human = capture('validate-diagrams', [root]);
    assert.equal(human.code, 1);
    assert.match(human.err, /^error: docs\/diagrams\/algo\.md:1:1 AGSC-E202 the file cites no trace id$/mu);
  });

  it('a stale rule id or requirement id is AGSC-E201', () => {
    const root = diagramRoot();
    fs.writeFileSync(path.join(root, 'docs', 'diagrams', 'algo.md'),
      GOOD.replace('PRD-004, AGSC-01-01', 'PRD-999, AGSC-07-77'));
    const { json } = envelope('validate-diagrams', [root]);
    assert.ok(json.findings.some((f) => /cites rule AGSC-07-77, which spec\/ does not define/u.test(f.message)));
    assert.ok(json.findings.some((f) => /cites PRD-999, which docs\/PRD.md does not define/u.test(f.message)));
  });

  it('with no spec/ and no docs/PRD.md the staleness check is skipped', () => {
    const root = diagramRoot();
    fs.rmSync(path.join(root, 'spec'), { force: true, recursive: true });
    fs.rmSync(path.join(root, 'docs', 'PRD.md'));
    const { json } = envelope('validate-diagrams', [root]);
    assert.ok(!json.findings.some((f) => /does not define/u.test(f.message)));
  });

  it('the index and the directory must agree', () => {
    const json = only({ 'extra.md': GOOD }, {
      'docs/diagrams/README.md': `${README}| \`absent.md\` | 1 flowchart | flowchart TD | PRD-004 | x |\n`,
    });
    assert.ok(json.findings.some((f) => /names absent.md, which is not in this directory/u.test(f.message)));
    assert.ok(json.findings.some((f) => /extra.md is in this directory and the index does not name it/u.test(f.message)));
  });

  it('a declared diagram count that disagrees with the file is AGSC-E201', () => {
    const json = only({}, {
      'docs/diagrams/README.md': README.replace('1 flowchart', '2 flowcharts'),
    });
    assert.ok(json.findings.some((f) => /declares 2 diagram\(s\) for algo.md and the file carries 1/u.test(f.message)));
  });

  it('with no README the index checks are skipped', () => {
    const root = diagramRoot();
    fs.rmSync(path.join(root, 'docs', 'diagrams', 'README.md'));
    const { code, json } = envelope('validate-diagrams', [root]);
    assert.equal(code, 0);
    assert.deepEqual(json.findings, []);
  });
});

describe('validate-diagrams — the helpers it exports', () => {
  it('fencedBlocks reports the info string and an unterminated fence', () => {
    const closed = fencedBlocks('a\n```mermaid\nflowchart TD\n```\nb\n');
    assert.equal(closed.unterminated, null);
    assert.deepEqual(closed.blocks.map((b) => b.info), ['mermaid']);
    assert.equal(fencedBlocks('```mermaid\nflowchart TD\n').unterminated, 1);
  });

  it('indexRows reads the diagram count out of the notation cell', () => {
    const rows = indexRows(README);
    assert.equal(rows.get('algo.md').diagrams, 1);
    assert.equal(rows.size, 1);
  });

  it('checkMermaid reports on a block handed to it directly', () => {
    const findings = [];
    checkMermaid({ line: 1, lines: ['flowchart TD', '  A[['] }, 'x.md', findings);
    assert.ok(findings.some((f) => /unmatched/u.test(f.message)));
  });
});

describe('validate-diagrams — the real distribution', () => {
  it('the shipped pack parses and every trace id resolves', () => {
    const result = capture('validate-diagrams', [REPO]);
    assert.equal(result.code, 0);
    assert.equal(result.err, '');
    // The counts are DERIVED from the pack on disk, never pinned: the pack grows as
    // diagrams are added, and the tool must read every one of them.
    const pack = path.join(REPO, 'docs', 'diagrams');
    const files = fs.readdirSync(pack).filter((f) => f.endsWith('.md') && f !== 'README.md');
    const blocks = files.reduce((n, f) => n + (fs.readFileSync(path.join(pack, f), 'utf8')
      .match(/^```mermaid\s*$/gmu) || []).length, 0);
    assert.ok(files.length > 0 && blocks > 0);
    assert.strictEqual(result.out,
      `validate-diagrams: ${files.length} input file(s) read, ${blocks} mermaid blocks, 0 error, 0 warn\n`);
  });
});
