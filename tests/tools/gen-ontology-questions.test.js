'use strict';
// tests/tools/gen-ontology-questions.test.js — docs/ONTOLOGY-QUESTIONS.md is generated
// from docs/ontology-questions.json, and the suite fails when the committed page is not.
//
// Deterministic: reads the repository and temporary copies; no clock, no network.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const { REPO, capture, tmpdir, tool } = require('./helpers');

const generator = tool('gen-ontology-questions');

describe('tools/gen-ontology-questions', () => {
  it('the committed page is exactly what the data file generates (--check)', () => {
    const r = capture('gen-ontology-questions', ['--check']);
    assert.equal(r.code, 0, r.err);
    assert.equal(r.out, 'docs/ONTOLOGY-QUESTIONS.md: current (10 questions)\n');
  });

  it('--help prints the usage; an unknown argument is usage, exit 2', () => {
    const help = capture('gen-ontology-questions', ['--help']);
    assert.equal(help.code, 0);
    assert.match(help.out, /^gen-ontology-questions \[--check\] \[--help\]/u);
    assert.equal(capture('gen-ontology-questions', ['--json']).code, 2);
  });

  it('a stale page fails --check, a write makes it current, and a missing data file is exit 1', () => {
    const dir = tmpdir();
    fs.mkdirSync(path.join(dir, 'docs'));
    fs.copyFileSync(path.join(REPO, 'docs', 'ontology-questions.json'), path.join(dir, 'docs', 'ontology-questions.json'));
    fs.writeFileSync(path.join(dir, 'docs', 'ONTOLOGY-QUESTIONS.md'), '# edited by hand\n');
    const quiet = { err: () => {}, out: () => {} };
    assert.equal(generator.run(['--check'], { ...quiet, root: dir }), 1);
    assert.equal(generator.run([], { ...quiet, root: dir }), 0);
    assert.equal(generator.run(['--check'], { ...quiet, root: dir }), 0);
    fs.rmSync(path.join(dir, 'docs', 'ontology-questions.json'));
    assert.equal(generator.run(['--check'], { ...quiet, root: dir }), 1);
    fs.rmSync(path.join(dir, 'docs', 'ONTOLOGY-QUESTIONS.md'));
    assert.equal(generator.run(['--check'], { ...quiet, root: dir }), 1);
  });

  it('every query of the data file is on the page', () => {
    const data = JSON.parse(fs.readFileSync(path.join(REPO, 'docs', 'ontology-questions.json'), 'utf8'));
    const page = generator.generate(REPO).text;
    for (const q of data.questions) assert.ok(page.includes(q.sparql), `question ${q.number}`);
  });
});
