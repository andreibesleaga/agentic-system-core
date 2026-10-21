'use strict';
// tools/lint-claims — the claims lint of the benchmark kit. Ranking words fail a
// claims region (and only a claims region, when a file marks one); a results row
// fails when it does not name its model, date, n, metric, value and interval, or
// compares with another system without both configurations.

const assert = require('node:assert/strict');
const path = require('node:path');
const { describe, it } = require('node:test');

const { capture, codes, envelope, tmpdir, writeTree } = require('./helpers');

const ROW = Object.freeze({
  ci: [0.42, 0.61], date: '2026-11-14', metric: 'citation_precision',
  model: 'qwen3:8b-q4_K_M', n: 60, value: 0.52,
});

const HUNDRED = ['100', '%'].join(' ');

function results(rows) {
  return JSON.stringify({ rows });
}

describe('tools/lint-claims — wording', () => {
  it('passes a measured sentence and fails every ranking word, with its position', () => {
    const dir = writeTree(tmpdir(), {
      'bad.md': [
        // The percentage is assembled at run time, so this file never carries one.
        `The first system of its kind, unique, and right ${HUNDRED} of the time.`,
        'It is #1, SOTA, beats the rest and wins.',
      ].join('\n'),
      'good.md': 'With qwen3 (2026-11-14, n = 60) precision moved from 0.31 to 0.52 (95 % CI [0.42, 0.61]).\n',
    });
    const good = envelope('lint-claims', [path.join(dir, 'good.md')]);
    assert.equal(good.code, 0);
    assert.equal(good.json.status, 'pass');
    assert.equal(good.json.inputs_read, 1);

    const bad = envelope('lint-claims', [path.join(dir, 'bad.md')]);
    assert.equal(bad.code, 1);
    assert.deepEqual(codes(bad.json), ['AGSC-E405']);
    assert.equal(bad.json.findings.length, 7);
    assert.deepEqual(bad.json.findings.map((f) => [f.line, f.col]).slice(0, 2), [[1, 5], [1, 31]]);
  });

  it('reads only the claims regions of a file that marks any', () => {
    const dir = writeTree(tmpdir(), {
      'README.md': [
        'Run it first, then read the unique id.',
        '<!-- claims:start -->',
        'C2 beats C0.',
        '<!-- claims:end -->',
        'The first step again.',
      ].join('\n'),
    });
    const { json } = envelope('lint-claims', [path.join(dir, 'README.md')]);
    assert.deepEqual(json.findings.map((f) => f.line), [3]);
  });

  it('reads the text beside a marker, and a region that opens and closes on one line', () => {
    const dir = writeTree(tmpdir(), {
      'inline.md': [
        'Run it first. <!-- claims:start -->C2 beats C0.<!-- claims:end --> The first step.',
        '<!-- claims:start -->',
        'C2 wins. <!-- claims:end --> unique ids, first of all.',
      ].join('\n'),
    });
    const { code, json } = envelope('lint-claims', [path.join(dir, 'inline.md')]);
    assert.equal(code, 1);
    // "beats" at its column on line 1, "wins" on line 3; nothing outside a region.
    assert.deepEqual(json.findings.map((f) => [f.line, f.col, f.message.slice(0, 9)]),
      [[1, 39, '"beat(s)"'], [3, 4, '"win(s)" ']]);
  });

  it('catches a hundred per cent written with zero decimals', () => {
    const forms = ['100.0', '%', '100.00%'];
    const dir = writeTree(tmpdir(), { 'p.md': `${forms[0]} ${forms[1]} and ${forms[2]}, but not 100.5 %\n` });
    const { json } = envelope('lint-claims', [path.join(dir, 'p.md')]);
    assert.deepEqual(json.findings.map((f) => f.col), [1, 13]);
  });

  it('catches the other spellings of a hundred per cent and leaves larger numbers alone', () => {
    // Assembled at run time, so this file never carries one.
    const hundred = '100';
    const caught = [`${hundred},0 %`, `${hundred}&nbsp;%`, `${hundred}\\%`, `${hundred} &#37;`, `${hundred}  &percnt;`];
    const passed = [`1,${hundred} %`, `2${hundred} %`, `0.${hundred} %`];
    const dir = writeTree(tmpdir(), { 'a.md': `${caught.join('\n')}\n`, 'b.md': `${passed.join('\n')}\n` });
    assert.deepEqual(envelope('lint-claims', [path.join(dir, 'a.md')]).json.findings.map((f) => f.line), [1, 2, 3, 4, 5]);
    assert.equal(envelope('lint-claims', [path.join(dir, 'b.md')]).code, 0);
  });

  it('reads two regions on one line, and treats a marker in a code span as text', () => {
    const dir = writeTree(tmpdir(), {
      'two.md': 'a <!-- claims:start -->it beats<!-- claims:end --> b <!-- claims:start -->it wins<!-- claims:end --> first\n',
      'explains.md': 'Mark a region with `<!-- claims:start -->` and `<!-- claims:end -->`; C2 beats C0.\n',
    });
    assert.deepEqual(envelope('lint-claims', [path.join(dir, 'two.md')]).json.findings.map((f) => f.col), [27, 78]);
    // No real marker, so the whole page is read and the claim is caught.
    assert.deepEqual(envelope('lint-claims', [path.join(dir, 'explains.md')]).json.findings.map((f) => f.col), [74]);
  });

  it('reads a file that starts with a byte-order mark at its real columns', () => {
    const dir = writeTree(tmpdir(), { 'bom.md': '\uFEFFIt beats C0.\n', 'r.json': `\uFEFF${results([ROW])}` });
    assert.deepEqual(envelope('lint-claims', [path.join(dir, 'bom.md')]).json.findings.map((f) => f.col), [4]);
    assert.equal(envelope('lint-claims', ['--results', path.join(dir, 'r.json')]).code, 0);
  });

  it('reports a claims region that is never closed', () => {
    const dir = writeTree(tmpdir(), { 'open.md': 'intro\nsee <!-- claims:start -->\nmeasured 0.5\n' });
    const { code, json } = envelope('lint-claims', [path.join(dir, 'open.md')]);
    assert.equal(code, 1);
    assert.deepEqual(json.findings.map((f) => [f.code, f.line, f.col]), [['AGSC-E202', 2, 5]]);
  });

  it('leaves words that merely contain a ranking word alone', () => {
    const dir = writeTree(tmpdir(), { 'ok.md': 'firstly, uniqueness, beaten paths, winsome, window, #10, 1100 %\n' });
    assert.equal(envelope('lint-claims', [path.join(dir, 'ok.md')]).code, 0);
  });
});

describe('tools/lint-claims — results rows', () => {
  it('passes a traceable row and a cross-system row with both configurations', () => {
    const dir = writeTree(tmpdir(), {
      'r.json': results([ROW, {
        ...ROW, configs: { 'agentic-system-core': { tag: 'v1.0.1' }, mem0: { commit: 'abc1234' } }, system: 'mem0',
      }, { ...ROW, system: 'agentic-system-core' }]),
    });
    const { code, json } = envelope('lint-claims', ['--results', path.join(dir, 'r.json')]);
    assert.equal(code, 0, JSON.stringify(json.findings));
  });

  it('names every member a row is missing', () => {
    const dir = writeTree(tmpdir(), {
      'r.json': results([
        {},
        { ...ROW, ci: [0.7, 0.2] },
        { ...ROW, date: '14 Nov 2026', n: 0 },
        { ...ROW, system: 'mem0' },
        null,
        { ...ROW, date: '2026-02-30', value: Number.NaN },
        { ...ROW, configs: { 'agentic-system-core': { tag: 'v1.0.1' } }, system: 'constructor' },
        { ...ROW, configs: { 'agentic-system-core': true, mem0: {} }, date: '2026-99-99', system: 'mem0' },
      ]),
    });
    const { code, json } = envelope('lint-claims', ['--results', path.join(dir, 'r.json')]);
    assert.equal(code, 1);
    assert.deepEqual(codes(json), ['AGSC-E202']);
    const messages = json.findings.map((f) => f.message);
    assert.equal(messages.filter((m) => m.startsWith('row 0 ')).length, 6);
    assert.ok(messages.includes('row 1 carries no confidence interval [low, high]'));
    assert.ok(messages.includes('row 2 carries no date (YYYY-MM-DD)'));
    assert.ok(messages.includes('row 2 carries no sample size n'));
    assert.ok(messages.includes('row 3 compares with mem0 but publishes no configuration for agentic-system-core'));
    assert.ok(messages.includes('row 3 compares with mem0 but publishes no configuration for mem0'));
    assert.equal(messages.filter((m) => m.startsWith('row 4 ')).length, 6);
    // A day the calendar does not have, and a value JSON wrote as null.
    assert.ok(messages.includes('row 5 carries no date (YYYY-MM-DD)'));
    assert.ok(messages.includes('row 5 carries no numeric value'));
    // An inherited member name is no published configuration.
    assert.ok(messages.includes('row 6 compares with constructor but publishes no configuration for constructor'));
    // Placeholders publish nothing, and month 99 is no month.
    assert.ok(messages.includes('row 7 compares with mem0 but publishes no configuration for agentic-system-core'));
    assert.ok(messages.includes('row 7 compares with mem0 but publishes no configuration for mem0'));
    assert.ok(messages.includes('row 7 carries no date (YYYY-MM-DD)'));
  });

  it('refuses a measurement that overflows to infinity', () => {
    // JSON.parse reads 1e400 as Infinity; written as raw text, as a results file would carry it.
    const row = JSON.stringify(ROW).replace('"value":0.52', '"value":1e400').replace('[0.42,0.61]', '[1e400,1e400]');
    const dir = writeTree(tmpdir(), { 'r.json': `{"rows":[${row}]}` });
    const messages = envelope('lint-claims', ['--results', path.join(dir, 'r.json')]).json.findings.map((f) => f.message);
    assert.deepEqual(messages, ['row 0 carries no numeric value', 'row 0 carries no confidence interval [low, high]']);
  });

  it('fails a results file that is not JSON or holds no rows', () => {
    const dir = writeTree(tmpdir(), { 'a.json': '{ not json', 'b.json': '{"table": []}' });
    const { json } = envelope('lint-claims', ['--results', path.join(dir, 'a.json'), '--results', path.join(dir, 'b.json')]);
    assert.equal(json.findings.length, 2);
    assert.match(json.findings[0].message, /^not JSON/u);
    assert.equal(json.findings[1].message, 'holds no rows[] array');
  });
});

describe('tools/lint-claims — the command', () => {
  it('reports an unreadable input as a finding and prints a summary line without --json', () => {
    const missing = path.join(tmpdir(), 'absent.md');
    const { code, err, out } = capture('lint-claims', [missing]);
    assert.equal(code, 1);
    assert.match(err, /AGSC-E901 cannot be read/u);
    assert.equal(out, 'lint-claims fail: 0 input file(s) read, 1 error(s)\n');
  });

  it('answers --help and refuses bad usage with exit 2', () => {
    const help = capture('lint-claims', ['--help']);
    assert.equal(help.code, 0);
    assert.match(help.out, /^lint-claims \[--json\]/u);
    assert.equal(capture('lint-claims', []).code, 2);
    assert.equal(capture('lint-claims', ['--results']).code, 2);
    // A flag is never taken as the results file.
    assert.equal(capture('lint-claims', ['--results', '--json']).code, 2);
    const unknown = capture('lint-claims', ['--strict', 'x.md']);
    assert.equal(unknown.code, 2);
    assert.match(unknown.err, /AGSC-E002/u);
  });

  it('prints the summary line of a clean run', () => {
    const dir = writeTree(tmpdir(), { 'ok.md': 'measured\n' });
    assert.equal(capture('lint-claims', [path.join(dir, 'ok.md')]).out,
      'lint-claims pass: 1 input file(s) read, 0 error(s)\n');
  });
});
