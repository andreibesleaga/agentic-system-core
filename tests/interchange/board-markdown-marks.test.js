'use strict';
// I-176 (GABBE M6): the Markdown board reader keeps a card whose box is `[/]` (in
// progress) or `[-]` (cancelled). It used to skip such a line without a message, so a
// task list written by GABBE lost its in-progress tasks on this route.
//
// Deterministic: text in, rows out; no file system, no clock.

const test = require('node:test');
const assert = require('node:assert/strict');
const boards = require('../../src/interchange/board-formats.js');
const board = require('../../src/interchange/adapters/board.js');

const TEXT = [
  '# Delivery', '',
  '## Backlog', '',
  '- [ ] open card',
  '- [/] started card',
  '- [-] dropped card',
  '- [x] finished card',
  '',
  '## In Progress', '',
  '- [ ] lane card', '',
].join('\n');

const stateOf = (rows, title) => board.taskStateOf(rows.find((r) => r.title === title)).state;

test('I-176: [/] is in progress and [-] is cancelled, and no card of the list is skipped', () => {
  const { rows } = boards.FORMATS.markdown.parse(TEXT, 'delivery.md');
  assert.deepEqual(rows.map((r) => r.title),
    ['open card', 'started card', 'dropped card', 'finished card', 'lane card']);
  assert.equal(stateOf(rows, 'open card'), 'TASK_STATE_UNSPECIFIED', 'the lane Backlog is read as before');
  assert.equal(stateOf(rows, 'started card'), 'TASK_STATE_WORKING');
  assert.equal(stateOf(rows, 'dropped card'), 'TASK_STATE_CANCELED');
  assert.equal(stateOf(rows, 'finished card'), 'TASK_STATE_COMPLETED');
  assert.equal(stateOf(rows, 'lane card'), 'TASK_STATE_WORKING', 'a box with a space leaves the lane to decide');
});

test('I-176: a `[x]` card is complete whatever the mark of its neighbours', () => {
  const { rows } = boards.FORMATS.markdown.parse('## Todo\n\n- [/] a\n- [x] b\n', 'x.md');
  assert.deepEqual(rows.map((r) => r.done), [false, true]);
});

test('I-176: Obsidian Kanban cards keep their rules (only a space, x or X is a box there)', () => {
  const text = '---\n\nkanban-plugin: board\n\n---\n\n## Todo\n\n- [ ] a\n- [x] b\n';
  const { rows } = boards.FORMATS['obsidian-kanban'].parse(text, 'k.md');
  assert.deepEqual(rows.map((r) => r.title), ['a', 'b']);
});
