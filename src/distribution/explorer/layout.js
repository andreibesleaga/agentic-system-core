'use strict';
// CONTEXT Distribution (Emission) — the explorer of `/clusters/`: where each node is drawn.
//
// A force-directed placement (Fruchterman and Reingold, 1991): every pair of nodes pushes
// apart, every link pulls its two ends together, a weak pull keeps the whole near the
// middle, and each step may move a node less than the one before, so the picture settles.
// It is written here, in a few lines, rather than taken from a graph library: the explorer
// ships with every node and depends on nothing.
//
// No random number. The nodes start on a sunflower spiral in the order of the graph and
// the number of steps is fixed by the size of the graph, so the same graph is drawn the
// same way on every visit, and the positions are rounded to two decimals, so the picture
// does not depend on the last bits of a double. Every node stays inside the frame, less
// its margin. The cost is one pass over every pair per step; the explorer draws at most
// `MAX_NODES` nodes (`page.js`), and the number of steps falls as the graph grows.
//
// PORTABLE and pure (see `graph-data.js`): emitted into the page as its own source text.

/**
 * The position of every node.
 *
 * @param {{nodes:Array<{id:string}>, links:Array<{source:string, target:string}>}} graph
 * @param {{width:number, height:number, margin:number}} frame the picture, in its own units.
 * @returns {Array<{id:string, x:number, y:number}>} one entry per node, in the graph's order.
 */
function explorerLayout(graph, frame) {
  const count = graph.nodes.length;
  const at = new Map(graph.nodes.map((node, k) => [node.id, k]));
  const ends = graph.links.filter((link) => at.has(link.source) && at.has(link.target))
    .map((link) => [at.get(link.source), at.get(link.target)]);
  const middle = { x: frame.width / 2, y: frame.height / 2 };
  const room = (frame.width - 2 * frame.margin) * (frame.height - 2 * frame.margin);
  // The distance two linked nodes settle at: half the side of an even share of the room,
  // so a graph fills the middle of the picture rather than its edges.
  const spacing = 0.5 * Math.sqrt(room / Math.max(count, 1));
  // The sunflower spiral: node k at radius proportional to the square root of k, turned
  // by the golden angle, so the start is even and the first node sits in the middle.
  const x = graph.nodes.map((_, k) => middle.x + spacing * Math.sqrt(k) * Math.cos(k * 2.399963229728653));
  const y = graph.nodes.map((_, k) => middle.y + spacing * Math.sqrt(k) * Math.sin(k * 2.399963229728653));
  const steps = Math.max(40, Math.min(300, Math.floor(4000000 / (count * count + 1))));
  // The pull to the middle that balances the push of every other node near the frame
  // (n·spacing² / radius², radius the half of the picture's smaller side less its margin),
  // so the graph fills the picture without pressing against its edges, whatever its size.
  const radius = Math.min(frame.width, frame.height) / 2 - frame.margin;
  const gravity = (count * spacing * spacing) / (radius * radius);
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  let reach = Math.min(frame.width, frame.height) / 10;
  const cooling = reach / (steps + 1);
  for (let step = 0; step < steps; step += 1) {
    const dx = new Array(count).fill(0);
    const dy = new Array(count).fill(0);
    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        const ddx = x[i] - x[j];
        const ddy = y[i] - y[j];
        const push = (spacing * spacing) / Math.max(ddx * ddx + ddy * ddy, 0.01);
        dx[i] += ddx * push; dy[i] += ddy * push;
        dx[j] -= ddx * push; dy[j] -= ddy * push;
      }
    }
    for (const [a, b] of ends) {
      const ddx = x[a] - x[b];
      const ddy = y[a] - y[b];
      const pull = Math.sqrt(ddx * ddx + ddy * ddy) / spacing;
      dx[a] -= ddx * pull; dy[a] -= ddy * pull;
      dx[b] += ddx * pull; dy[b] += ddy * pull;
    }
    for (let i = 0; i < count; i += 1) {
      dx[i] -= (x[i] - middle.x) * gravity;
      dy[i] -= (y[i] - middle.y) * gravity;
      const length = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]);
      const move = length === 0 ? 0 : Math.min(length, reach) / length;
      x[i] = clamp(x[i] + dx[i] * move, frame.margin, frame.width - frame.margin);
      y[i] = clamp(y[i] + dy[i] * move, frame.margin, frame.height - frame.margin);
    }
    reach -= cooling;
  }
  const round = (value) => Math.round(value * 100) / 100;
  return graph.nodes.map((node, k) => ({ id: node.id, x: round(x[k]), y: round(y[k]) }));
}

/** The functions emitted into the page, in order. */
const PORTABLE = Object.freeze(['explorerLayout']);

module.exports = { PORTABLE, explorerLayout };
