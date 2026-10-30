'use strict';
// tests/knowledge/questions.test.js — the ten questions of AGSC-05-34 as pure functions.
//
// Deterministic: fixed instants, the shared fixture of the ten vectors graph-0030 to
// graph-0039; no clock, no network. The SPARQL text is checked against the specification
// and (in the development lane, when a Python with rdflib is named) run over graph.nq.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const questions = require('../../src/knowledge/questions.js');

const REPO = path.resolve(__dirname, '..', '..');
const VECTORS = path.join(REPO, 'tests', 'vectors', 'graph');
const vectors = fs.readdirSync(VECTORS).filter((f) => /^graph-003\d-/u.test(f))
  .sort().map((f) => JSON.parse(fs.readFileSync(path.join(VECTORS, f), 'utf8')));

const item = (slug, rest = {}) => ({ slug, title: slug, type: 'concept', kind: 'principle', ...rest });

describe('AGSC-05-34 — the ten questions', () => {
  it('there are ten vectors, graph-0030 to graph-0039, and each gives its expected answer', () => {
    assert.equal(vectors.length, 10);
    for (const v of vectors) {
      const { items, question, subject, selection, at } = v.input;
      assert.deepEqual(questions.answer(question, items, { subject, selection, at }), v.expected.answer, v.id);
    }
  });

  it('answers are the same for items in another order, and the input is not changed', () => {
    const { items, subject } = vectors[0].input;
    const before = JSON.stringify(items);
    assert.deepEqual(questions.mustTake([...items].reverse(), subject), ['y', 'z']);
    assert.equal(JSON.stringify(items), before);
  });

  it('a chain that comes back to the subject never lists the subject, and repeats nothing', () => {
    const items = [item('a', { 'blocked-by': ['b'], kind: 'task' }),
      item('b', { 'blocked-by': ['a', 'c'], kind: 'task' }), item('c', { kind: 'task' })];
    assert.deepEqual(questions.blockers(items, 'a'), ['b', 'c']);
  });

  it('a subject nobody knows has an empty answer of the right shape', () => {
    assert.deepEqual(questions.mustTake([], 'nope'), []);
    assert.deepEqual(questions.verification([], 'nope'), { verified_by: [], verifies: [] });
    assert.deepEqual(questions.lineage([], 'nope'), { episodes: [], lineage: [] });
    assert.deepEqual(questions.underCluster([], 'nope'), { clusters: [], items: [] });
    assert.deepEqual(questions.sourcesAndSharers([], 'nope'), { shared: [], sources: [] });
    assert.deepEqual(questions.missingPorts([], 'nope', []), []);
  });

  it('question 4: a port the subject itself produces is provided; a selection member that is unknown adds nothing', () => {
    const items = [item('x', { consumes: ['a', 'b'], produces: ['a'] }), item('p', { produces: ['b'] })];
    assert.deepEqual(questions.missingPorts(items, 'x', []), ['b']);
    assert.deepEqual(questions.missingPorts(items, 'x', ['p', 'ghost']), []);
  });

  it('question 9: reasons keep their fixed order and an item with none is left out; the instant is a comparison only', () => {
    const items = [item('a', { status: 'draft', stale_after: '2026-01-01T00:00:00Z' }), item('b'),
      item('c', { stale_after: '2026-12-01T00:00:00Z' })];
    const got = questions.unhealthy(items, ['c', 'b', 'a', 'a'], '2026-06-01T00:00:00Z');
    assert.deepEqual(got, [{ reasons: ['draft', 'stale'], slug: 'a' }]);
    assert.deepEqual(questions.unhealthy(items, ['c'], '2027-01-01T00:00:00Z'), [{ reasons: ['stale'], slug: 'c' }]);
  });

  it('question 8: a cluster loop does not list the subject, and an item in two clusters is listed once', () => {
    const items = [{ slug: 'a', title: 'a', type: 'cluster', broader: ['b'] },
      { slug: 'b', title: 'b', type: 'cluster', broader: ['a'] },
      item('i', { clusters: ['a', 'b'] })];
    assert.deepEqual(questions.underCluster(items, 'a'), { clusters: ['b'], items: ['i'] });
  });

  it('question 10: sources are listed once and sorted; a source nobody else cites is not shared', () => {
    const items = [item('x', { sources: [{ resource: 'r2' }, { resource: 'r1' }, { resource: 'r1' }, { resource: 'r3' }] }),
      item('y', { sources: [{ resource: 'r1' }] }), item('z', { sources: [{ resource: 'r1' }, { resource: 'r2' }] })];
    assert.deepEqual(questions.sourcesAndSharers(items, 'x'), {
      shared: [{ items: ['y', 'z'], resource: 'r1' }, { items: ['z'], resource: 'r2' }],
      sources: ['r1', 'r2', 'r3'],
    });
  });

  it('answer() refuses a number outside 1 to 10', () => {
    assert.throws(() => questions.answer(11, [], { subject: 'a' }), /AGSC-05-34/u);
    assert.throws(() => questions.answer(0, [], { subject: 'a' }), /AGSC-05-34/u);
  });
});
