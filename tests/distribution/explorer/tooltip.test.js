'use strict';
// verifies AGSC-06-38, AGSC-06-20
// The explorer's tooltip (src/distribution/explorer/tooltip.js): the summary it shows,
// cut at a word to a bounded length, and WHERE it opens. An open tooltip used to cover
// the nodes beside the one it describes, so the next node could be reached only after
// the pointer left the tooltip; the placement now tries the four sides of the node and
// takes the one that covers the fewest other nodes and stays inside the picture.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const { explorerExcerpt, explorerPlaceTip } = require('../../../src/distribution/explorer/tooltip.js');

const FRAME = Object.freeze({ height: 300, width: 400 });
const TIP = Object.freeze({ height: 60, width: 120 });

/** Whether a circle meets a rectangle. */
function covers(rect, circle) {
  const x = Math.max(rect.left, Math.min(circle.x, rect.left + TIP.width));
  const y = Math.max(rect.top, Math.min(circle.y, rect.top + TIP.height));
  return Math.hypot(circle.x - x, circle.y - y) < circle.r;
}

test('a short summary is shown whole, on one line', () => {
  assert.strictEqual(explorerExcerpt('A  short\nsummary. ', 300), 'A short summary.');
  assert.strictEqual(explorerExcerpt('', 300), '');
  assert.strictEqual(explorerExcerpt(undefined, 300), '');
});

test('a long summary is cut at a word and ends with an ellipsis, within the bound', () => {
  const text = 'The transfer of control from one agent to another, with the reason written down so that a reader can follow it later.';
  const cut = explorerExcerpt(text, 40);
  assert.strictEqual(cut, 'The transfer of control from one agent…');
  assert.ok(cut.length <= 40);
  // One word longer than the bound is cut inside the word.
  assert.strictEqual(explorerExcerpt('x'.repeat(50), 10), `${'x'.repeat(9)}…`);
});

test('property: an excerpt never exceeds its bound, and excerpting it again changes nothing', () => {
  fc.assert(fc.property(fc.string({ maxLength: 400 }), fc.integer({ max: 320, min: 2 }), (text, max) => {
    const once = explorerExcerpt(text, max);
    assert.ok(once.length <= max, `${once.length} > ${max}`);
    assert.strictEqual(explorerExcerpt(once, max), once);
  }));
});

test('with room on every side the tooltip opens to the right of the node', () => {
  const at = explorerPlaceTip({ r: 6, x: 100, y: 150 }, TIP, FRAME, [], 8);
  assert.deepStrictEqual(at, { left: 114, side: 'right', top: 120 });
});

test('near the right edge it opens on the left, and never outside the picture', () => {
  const at = explorerPlaceTip({ r: 6, x: 380, y: 150 }, TIP, FRAME, [], 8);
  assert.strictEqual(at.side, 'left');
  assert.strictEqual(at.left, 380 - 6 - 8 - TIP.width);
});

test('it avoids the nodes beside the one it describes', () => {
  const anchor = { r: 6, x: 150, y: 150 };
  const right = [{ r: 6, x: 200, y: 150 }, { r: 6, x: 230, y: 140 }];
  const at = explorerPlaceTip(anchor, TIP, FRAME, right, 8);
  assert.strictEqual(at.side, 'left');
  const everywhere = [...right, { r: 6, x: 100, y: 150 }, { r: 6, x: 150, y: 200 }];
  assert.strictEqual(explorerPlaceTip(anchor, TIP, FRAME, everywhere, 8).side, 'above');
});

test('property: the tooltip stays inside the picture and never covers its own node when a side is free', () => {
  const circle = fc.record({ r: fc.constant(6), x: fc.integer({ max: 400, min: 0 }), y: fc.integer({ max: 300, min: 0 }) });
  fc.assert(fc.property(circle, fc.array(circle, { maxLength: 12 }), (anchor, others) => {
    const at = explorerPlaceTip(anchor, TIP, FRAME, others, 8);
    assert.ok(at.left >= 0 && at.left + TIP.width <= FRAME.width, `left ${at.left}`);
    assert.ok(at.top >= 0 && at.top + TIP.height <= FRAME.height, `top ${at.top}`);
    assert.ok(!covers(at, anchor), `covers its node at ${JSON.stringify(at)} for ${JSON.stringify(anchor)}`);
    // Deterministic: the same question gets the same place.
    assert.deepStrictEqual(explorerPlaceTip(anchor, TIP, FRAME, others, 8), at);
  }));
});

test('a picture smaller than the tooltip puts it at the top left corner', () => {
  assert.deepStrictEqual(explorerPlaceTip({ r: 6, x: 20, y: 20 }, TIP, { height: 40, width: 60 }, [], 8),
    { left: 0, side: 'right', top: 0 });
});
