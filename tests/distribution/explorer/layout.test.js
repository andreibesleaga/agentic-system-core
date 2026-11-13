'use strict';
// verifies AGSC-06-38
// The explorer's layout (src/distribution/explorer/layout.js): a force-directed placement
// with no random number, so the same graph is drawn the same way on every visit and in
// every browser that computes IEEE doubles, and every node lands inside the picture.
// Property tests (fast-check) state the three invariants; a few examples pin the shape.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const { explorerLayout } = require('../../../src/distribution/explorer/layout.js');

const FRAME = Object.freeze({ height: 400, margin: 20, width: 600 });

/** A graph of `count` nodes and the links given as index pairs. */
function graphOf(count, pairs) {
  const nodes = Array.from({ length: count }, (_, k) => ({ id: `n${k}` }));
  const links = pairs.filter(([a, b]) => a < count && b < count && a !== b)
    .map(([a, b]) => ({ key: 'uses', source: `n${a}`, target: `n${b}` }));
  return { links, nodes };
}

const graphs = fc.integer({ max: 40, min: 0 }).chain((count) => fc.tuple(fc.constant(count),
  fc.array(fc.tuple(fc.nat(39), fc.nat(39)), { maxLength: 60 })));

test('property: the same graph is laid out to the same positions, every time', () => {
  fc.assert(fc.property(graphs, ([count, pairs]) => {
    const graph = graphOf(count, pairs);
    assert.deepStrictEqual(explorerLayout(graph, FRAME), explorerLayout(graphOf(count, pairs), FRAME));
  }), { numRuns: 60, seed: 20260918 });
});

test('property: every node lands inside the frame, less its margin, at a finite place', () => {
  fc.assert(fc.property(graphs, ([count, pairs]) => {
    const placed = explorerLayout(graphOf(count, pairs), FRAME);
    assert.strictEqual(placed.length, count);
    for (const p of placed) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), JSON.stringify(p));
      assert.ok(p.x >= FRAME.margin && p.x <= FRAME.width - FRAME.margin, `x ${p.x}`);
      assert.ok(p.y >= FRAME.margin && p.y <= FRAME.height - FRAME.margin, `y ${p.y}`);
    }
  }), { numRuns: 60, seed: 20260918 });
});

test('property: a link to a node that is not drawn changes nothing', () => {
  fc.assert(fc.property(graphs, ([count, pairs]) => {
    const graph = graphOf(count, pairs);
    const stray = { ...graph, links: [...graph.links, { key: 'uses', source: 'n0', target: 'elsewhere' }] };
    assert.deepStrictEqual(explorerLayout(stray, FRAME), explorerLayout(graph, FRAME));
  }), { numRuns: 30, seed: 20260918 });
});

test('positions carry two decimals, so the picture\'s bytes do not depend on the last bits of a double', () => {
  for (const p of explorerLayout(graphOf(12, [[0, 1], [1, 2], [2, 3], [5, 9]]), FRAME)) {
    assert.strictEqual(p.x, Math.round(p.x * 100) / 100);
    assert.strictEqual(p.y, Math.round(p.y * 100) / 100);
  }
});

test('linked nodes end nearer to each other than unlinked ones, on average', () => {
  // Two groups of five, each a chain; no link between the groups.
  const pairs = [[0, 1], [1, 2], [2, 3], [3, 4], [5, 6], [6, 7], [7, 8], [8, 9]];
  const placed = explorerLayout(graphOf(10, pairs), FRAME);
  const distance = (a, b) => Math.hypot(placed[a].x - placed[b].x, placed[a].y - placed[b].y);
  const linked = pairs.reduce((sum, [a, b]) => sum + distance(a, b), 0) / pairs.length;
  let apart = 0;
  for (let a = 0; a < 5; a += 1) for (let b = 5; b < 10; b += 1) apart += distance(a, b);
  assert.ok(linked < apart / 25, `linked ${linked} vs apart ${apart / 25}`);
});

test('one node sits in the middle; no node at all gives no position', () => {
  assert.deepStrictEqual(explorerLayout(graphOf(1, []), FRAME), [{ id: 'n0', x: 300, y: 200 }]);
  assert.deepStrictEqual(explorerLayout(graphOf(0, []), FRAME), []);
});
