'use strict';
// Conformance area `boards` (owner: WP-10-E) — AGSC-10-13, AGSC-10-16…18.
// brd-0001 the two exports and the "no task, no board" rule; brd-0002 the derived
// `done` and the absence of `claimed_by` when no history is supplied.

const boardsModule = require('../../../src/governance/boards.js');
const { instantFromEpoch } = require('../../../src/governance/ledger.js');
const { canonicalize } = require('../../../src/knowledge/jcs.js');
const { checks, deepEqual } = require('./_assert.js');

module.exports.run = (vector) => {
  const input = vector.input;
  const base = (input.site || input.bundle || {}).base;
  const generatedAt = input.SOURCE_DATE_EPOCH === undefined
    ? undefined : instantFromEpoch(input.SOURCE_DATE_EPOCH);
  const derived = boardsModule.boards(input.items, { base, generatedAt, gitLog: input.git_log });
  const expected = vector.expected;
  const result = [];

  if (expected.index !== undefined) {
    result.push(['index', canonicalize(derived.index) === canonicalize(expected.index),
      canonicalize(derived.index)]);
  }
  if (expected.board_oct_tasks !== undefined) {
    const board = derived.boards.find((b) => b.slug === 'oct');
    result.push(['board tasks', board !== undefined && deepEqual(board.board.tasks, expected.board_oct_tasks),
      board === undefined ? 'no board "oct"' : canonicalize(board.board.tasks)]);
  }
  if (expected.no_tasks_emits_nothing !== undefined) {
    const empty = boardsModule.boards(input.items.filter((i) => i.kind !== 'task'), { base });
    const nothing = empty.index === null && empty.boards.length === 0;
    result.push(['a Bundle with no task emits nothing under /boards/',
      nothing === expected.no_tasks_emits_nothing, `index ${JSON.stringify(empty.index)}`]);
  }
  for (const [key, slug] of [['board_done_done', 'done'], ['board_open_done', 'open']]) {
    if (expected[key] === undefined) continue;
    const board = derived.boards.find((b) => b.slug === slug);
    result.push([`${slug}.done`, board !== undefined && board.board.done === expected[key],
      board === undefined ? `no board "${slug}"` : String(board.board.done)]);
  }
  if (expected.claimed_by_present !== undefined) {
    const present = derived.boards.some((b) => b.board.tasks.some((t) => t.claimed_by !== undefined));
    result.push(['claimed_by', present === expected.claimed_by_present, String(present)]);
  }

  return checks(result);
};
