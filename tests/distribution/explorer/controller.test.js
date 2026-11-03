'use strict';
// verifies AGSC-06-38, AGSC-06-20
// The explorer's state (src/distribution/explorer/controller.js): one pure function takes
// the state and what the visitor did and returns the next state, so every keyboard path
// is tested here without a browser — moving through the list, selecting, finding,
// Escape, zooming — and the page only draws the state it is given.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const { explorerMatches, explorerReduce, explorerStart, explorerStep } = require('../../../src/distribution/explorer/controller.js');

const FRAME = Object.freeze({ height: 400, margin: 20, width: 600 });

test('the arrow keys, Home, End and the page keys move through a list without leaving it', () => {
  assert.strictEqual(explorerStep('ArrowDown', 0, 5), 1);
  assert.strictEqual(explorerStep('ArrowRight', 4, 5), 4);
  assert.strictEqual(explorerStep('ArrowUp', 0, 5), 0);
  assert.strictEqual(explorerStep('ArrowLeft', 3, 5), 2);
  assert.strictEqual(explorerStep('Home', 3, 5), 0);
  assert.strictEqual(explorerStep('End', 0, 5), 4);
  assert.strictEqual(explorerStep('PageDown', 0, 25), 10);
  assert.strictEqual(explorerStep('PageDown', 20, 25), 24);
  assert.strictEqual(explorerStep('PageUp', 15, 25), 5);
  assert.strictEqual(explorerStep('PageUp', 3, 25), 0);
  assert.strictEqual(explorerStep('Tab', 0, 5), null, 'Tab leaves the list');
  assert.strictEqual(explorerStep('ArrowDown', 0, 0), null, 'an empty list has nowhere to go');
});

test('property: a step always lands on an entry of the list', () => {
  const keys = fc.constantFrom('ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown');
  fc.assert(fc.property(keys, fc.integer({ max: 50, min: 1 }), fc.nat(60), (key, count, at) => {
    const next = explorerStep(key, Math.min(at, count - 1), count);
    assert.ok(Number.isInteger(next) && next >= 0 && next < count);
  }));
});

test('finding matches the label, the type and the page of a node, ignoring case', () => {
  const node = { label: 'Model Context Protocol', route: '/concepts/mcp/', type: 'Concept' };
  for (const words of ['', '  ', 'context', 'MODEL', 'concept', '/mcp/', 'model protocol']) assert.ok(explorerMatches(node, words), words);
  for (const words of ['agent', 'model agent']) assert.ok(!explorerMatches(node, words), words);
  assert.ok(explorerMatches({ label: 'x', route: null, type: 'Concept' }, 'x'));
});

test('the explorer starts with nothing selected, the first entry current and the whole picture in view', () => {
  assert.deepStrictEqual(explorerStart(FRAME), {
    current: 0, query: '', selected: null, tip: null, view: { h: 400, w: 600, x: 0, y: 0 },
  });
});

test('select, then Escape closes the tooltip first and clears the selection next', () => {
  let state = explorerStart(FRAME);
  state = explorerReduce(state, { id: 'a', type: 'select' }, FRAME);
  assert.strictEqual(state.selected, 'a');
  state = explorerReduce(state, { by: 'focus', id: 'b', type: 'tip' }, FRAME);
  assert.deepStrictEqual(state.tip, { by: 'focus', id: 'b' });
  state = explorerReduce(state, { type: 'escape' }, FRAME);
  assert.deepStrictEqual([state.tip, state.selected], [null, 'a']);
  state = explorerReduce(state, { type: 'escape' }, FRAME);
  assert.strictEqual(state.selected, null);
  // A second selection of the same node keeps it selected; selecting closes a tooltip.
  state = explorerReduce(explorerReduce(state, { by: 'hover', id: 'c', type: 'tip' }, FRAME), { id: 'c', type: 'select' }, FRAME);
  assert.deepStrictEqual([state.selected, state.tip], ['c', null]);
});

test('a tooltip closes only for the node it was opened for', () => {
  const open = explorerReduce(explorerStart(FRAME), { by: 'hover', id: 'a', type: 'tip' }, FRAME);
  assert.deepStrictEqual(explorerReduce(open, { id: 'b', type: 'untip' }, FRAME).tip, { by: 'hover', id: 'a' });
  assert.strictEqual(explorerReduce(open, { id: 'a', type: 'untip' }, FRAME).tip, null);
});

test('typing in the find box filters and puts the first match first; Escape there clears the words', () => {
  let state = explorerReduce(explorerStart(FRAME), { count: 9, key: 'ArrowDown', type: 'key' }, FRAME);
  assert.strictEqual(state.current, 1);
  state = explorerReduce(state, { index: 5, type: 'current' }, FRAME);
  assert.strictEqual(state.current, 5);
  state = explorerReduce(state, { text: 'proto', type: 'query' }, FRAME);
  assert.deepStrictEqual([state.query, state.current], ['proto', 0]);
  state = explorerReduce(state, { type: 'escape' }, FRAME);
  assert.strictEqual(state.query, '');
  // A key the list does not use changes nothing.
  assert.strictEqual(explorerReduce(state, { count: 9, key: 'x', type: 'key' }, FRAME), state);
});

test('zoom in and out about the middle, within bounds; pan moves the view; fit shows everything', () => {
  let state = explorerStart(FRAME);
  state = explorerReduce(state, { factor: 0.5, type: 'zoom' }, FRAME);
  assert.deepStrictEqual(state.view, { h: 200, w: 300, x: 150, y: 100 });
  for (let i = 0; i < 10; i += 1) state = explorerReduce(state, { factor: 0.5, type: 'zoom' }, FRAME);
  assert.strictEqual(state.view.w, 600 / 8, 'zoomed in no further than eight times');
  for (let i = 0; i < 10; i += 1) state = explorerReduce(state, { factor: 2, type: 'zoom' }, FRAME);
  assert.strictEqual(state.view.w, 600 * 2, 'zoomed out no further than twice the picture');
  state = explorerReduce(state, { dx: 10, dy: -5, type: 'pan' }, FRAME);
  assert.deepStrictEqual([state.view.x, state.view.y], [-300 + 10, -200 - 5]);
  assert.deepStrictEqual(explorerReduce(state, { type: 'fit' }, FRAME).view, { h: 400, w: 600, x: 0, y: 0 });
});

test('an event the explorer does not know returns the same state', () => {
  const state = explorerStart(FRAME);
  assert.strictEqual(explorerReduce(state, { type: 'unknown' }, FRAME), state);
});

test('property: the state never holds a view outside the zoom bounds, whatever the visitor does', () => {
  const event = fc.oneof(
    fc.record({ factor: fc.constantFrom(0.5, 0.8, 1.25, 2), type: fc.constant('zoom') }),
    fc.record({ dx: fc.integer({ max: 500, min: -500 }), dy: fc.integer({ max: 500, min: -500 }), type: fc.constant('pan') }),
    fc.record({ type: fc.constantFrom('fit', 'escape') }));
  fc.assert(fc.property(fc.array(event, { maxLength: 30 }), (events) => {
    const state = events.reduce((s, e) => explorerReduce(s, e, FRAME), explorerStart(FRAME));
    assert.ok(state.view.w >= FRAME.width / 8 - 1e-9 && state.view.w <= FRAME.width * 2 + 1e-9, String(state.view.w));
    assert.ok(Math.abs(state.view.w / state.view.h - FRAME.width / FRAME.height) < 1e-9, 'the aspect ratio changed');
  }));
});
