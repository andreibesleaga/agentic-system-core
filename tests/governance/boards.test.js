'use strict';
// AGSC-10-13, AGSC-10-17: a board is derived, never authored — the `done` boolean,
// the optional `claimed_by`, the "no task, no board" rule and the WIP limit.

const test = require('node:test');
const assert = require('node:assert');
const boards = require('../../src/governance/boards.js');

const TASK = (slug, state, extra = {}) => ({
  type: 'concept', kind: 'task', slug, title: slug, task_state: state, clusters: ['b'], ...extra,
});
const BASE = 'https://a.example/';

test('a cluster with no task is never a board (AGSC-10-13)', () => {
  const derived = boards.boards([{ type: 'cluster', slug: 'empty', title: 'Empty' }], { base: BASE });
  assert.strictEqual(derived.index, null);
  assert.deepStrictEqual(derived.boards, []);
});

test('done is true only when EVERY task state is terminal (AGSC-10-13)', () => {
  const terminal = boards.TERMINAL_STATES.map((s, i) => TASK(`t${i}`, s));
  assert.strictEqual(boards.boards(terminal, { base: BASE }).boards[0].board.done, true);
  assert.strictEqual(boards.boards([...terminal, TASK('open', 'TASK_STATE_WORKING')], { base: BASE })
    .boards[0].board.done, false);
});

test('a task with no task_state reads as TASK_STATE_UNSPECIFIED and is not terminal', () => {
  const derived = boards.boards([TASK('t', undefined)], { base: BASE });
  assert.strictEqual(derived.boards[0].board.tasks[0].state, 'TASK_STATE_UNSPECIFIED');
  assert.strictEqual(derived.boards[0].board.done, false);
});

test('an unknown state in a foreign board reads as UNSPECIFIED (AGSC-11-02)', () => {
  assert.strictEqual(boards.stateOf({ task_state: 'TASK_STATE_INVENTED' }, { foreign: true }), 'TASK_STATE_UNSPECIFIED');
  assert.strictEqual(boards.stateOf({ task_state: 'TASK_STATE_INVENTED' }), 'TASK_STATE_INVENTED');
});

test('claimed_by is derived from the git log, absent when none is supplied (AGSC-10-13)', () => {
  const gitLog = [{ changes: [{ slug: 't', key: 'task_state', agent: 'planner' }] }];
  const withLog = boards.boards([TASK('t', 'TASK_STATE_WORKING')], { base: BASE, gitLog });
  assert.strictEqual(withLog.boards[0].board.tasks[0].claimed_by, 'planner');
  const without = boards.boards([TASK('t', 'TASK_STATE_WORKING')], { base: BASE });
  assert.ok(!('claimed_by' in without.boards[0].board.tasks[0]));
});

test('blocked_by and decided_by are LOCAL slugs, anchors stripped (AGSC-10-13)', () => {
  const derived = boards.boards([TASK('t', undefined, { 'blocked-by': ['a#x', 'b'], 'decided-by': ['d'] })], { base: BASE });
  assert.deepStrictEqual(derived.boards[0].board.tasks[0].blocked_by, ['a', 'b']);
  assert.deepStrictEqual(derived.boards[0].board.tasks[0].decided_by, ['d']);
});

test('the index entry is exactly {cluster, iri, tasks} (AGSC-10-13)', () => {
  const derived = boards.boards([TASK('t', undefined), { type: 'cluster', slug: 'b', title: 'B' }], { base: BASE });
  assert.deepStrictEqual(Object.keys(derived.index.boards[0]).sort(), ['cluster', 'iri', 'tasks']);
  assert.strictEqual(derived.index.boards[0].iri, 'https://a.example/clusters/b/');
});

test('a lane over its max_claims is AGSC-E511 (AGSC-10-17)', () => {
  const items = [
    TASK('one', 'TASK_STATE_WORKING', { prov: { agent: 'planner' } }),
    TASK('two', 'TASK_STATE_WORKING', { prov: { agent: 'planner' } }),
  ];
  const config = { agents: [{ name: 'planner', max_claims: 1 }] };
  assert.deepStrictEqual(boards.wipLimit(items, config).map((f) => f.code), ['AGSC-E511']);
  assert.deepStrictEqual(boards.wipLimit(items, { agents: [{ name: 'planner', max_claims: 2 }] }), []);
  assert.deepStrictEqual(boards.wipLimit(items, {}), []);
});
