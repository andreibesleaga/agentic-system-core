'use strict';
// tests/knowledge/questions-sparql.test.js — the SPARQL text of the ten questions
// (docs/ontology-questions.json) against the specification and, in the development
// lane, against the functions of src/knowledge/questions.js.
//
// The text check always runs. The lane runs only when AGSC_SPARQL_PYTHON names a Python
// that can import Oxigraph (a scratch environment, never a dependency of this package):
// it loads the graph.nq of the shared fixture into Oxigraph, runs each query, and compares
// the rows, mapped to the answer shape, with the function and with the vector.
//   python3 -m venv /tmp/sparql-env && /tmp/sparql-env/bin/pip install pyoxigraph==0.5.13
//   AGSC_SPARQL_PYTHON=/tmp/sparql-env/bin/python node --test tests/knowledge/questions-sparql.test.js
//
// Deterministic: fixed fixture and instant; no network (the pip install is outside the test).

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const crypto = require('node:crypto');
const nquads = require('../../src/knowledge/nquads.js');
const questions = require('../../src/knowledge/questions.js');
const { toAnswer } = require('./_question-answers.js');

const REPO = path.resolve(__dirname, '..', '..');
const DOC = JSON.parse(fs.readFileSync(path.join(REPO, 'docs', 'ontology-questions.json'), 'utf8'));
const VECTORS = path.join(REPO, 'tests', 'vectors', 'graph');
const vectors = fs.readdirSync(VECTORS).filter((f) => /^graph-003\d-/u.test(f))
  .sort().map((f) => JSON.parse(fs.readFileSync(path.join(VECTORS, f), 'utf8')));
const BASE = 'https://a.example/';
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const PYTHON = process.env.AGSC_SPARQL_PYTHON;

/** The SPARQL block of AGSC-05-34, one text for each number. */
function specText() {
  const spec = fs.readFileSync(path.join(REPO, 'spec', '05-graph.md'), 'utf8');
  const rule = spec.slice(spec.indexOf('- **AGSC-05-34**'), spec.indexOf('- **AGSC-05-35**'));
  const block = rule.match(/```sparql\n([\s\S]*?)```/u)[1].replace(/^ {2}/gmu, '');
  const parts = block.split(/^# (\d+)\n/mu);
  const byNumber = {};
  for (let i = 1; i < parts.length; i += 2) byNumber[Number(parts[i])] = parts[i + 1].trimEnd();
  return byNumber;
}

describe('AGSC-05-34 — the SPARQL text', () => {
  it('docs/ontology-questions.json holds the ten texts of the specification, byte for byte', () => {
    const want = specText();
    assert.deepEqual(DOC.questions.map((q) => q.number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const q of DOC.questions) assert.equal(q.sparql, want[q.number], `question ${q.number}`);
  });

  it('the prefixes are the ones the texts use', () => {
    const declared = DOC.prefixes.map((p) => p.split(':')[0]);
    const used = new Set(DOC.questions.flatMap((q) => [...q.sparql.matchAll(/\b([a-z]+):[A-Za-z]/gu)].map((m) => m[1])));
    for (const prefix of used) assert.ok(declared.includes(prefix), `prefix ${prefix} is declared`);
  });
});

/** The text of one question with the subject, selection and instant put in. */
function instantiate(sparql, iriOf, { subject, selection, at }) {
  return sparql.replace(/\?x\b/gu, subject === undefined ? '?x' : `<${iriOf(subject)}>`)
    .replace('<S...>', (selection || []).map((s) => `<${iriOf(s)}>`).join(' '))
    .replace('"T"', `"${at}"`);
}

describe('AGSC-05-34 — the development lane', { skip: PYTHON ? false : 'AGSC_SPARQL_PYTHON is not set' }, () => {
  it('each query, run by Oxigraph over graph.nq, gives the answer of the function and of the vector', () => {
    const { items } = vectors[0].input;
    const options = { base: BASE, sha256 };
    const iriOf = (slug) => nquads.itemIri(items.find((i) => i.slug === slug), options);
    const header = DOC.prefixes.map((p) => `PREFIX ${p}\n`).join('');
    const runs = vectors.map((v) => ({
      sparql: header + instantiate(DOC.questions[v.input.question - 1].sparql, iriOf, v.input) }));
    const child = spawnSync(PYTHON, ['-I', path.join(__dirname, 'questions-sparql-lane.py')], {
      encoding: 'utf8', input: JSON.stringify({ nquads: nquads.toNQuads(items, options), runs }) });
    assert.equal(child.status, 0, child.stderr);
    const results = JSON.parse(child.stdout);
    vectors.forEach((v, k) => {
      const { question, subject, selection, at } = v.input;
      const fromQuery = toAnswer(question, results[k], items);
      assert.deepEqual(fromQuery, questions.answer(question, items, { subject, selection, at }), `${v.id} query = function`);
      assert.deepEqual(fromQuery, v.expected.answer, `${v.id} query = vector`);
    });
  });
});
