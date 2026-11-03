'use strict';
// CONTEXT Distribution (Emission) — the explorer of `/clusters/`: the tooltip's text and place.
//
// A tooltip opens over the picture when the pointer rests on a node or when the node's
// entry in the list gets the keyboard focus. It shows the node's summary cut short, and
// it opens on the side of the node where it covers the fewest other nodes: an open
// tooltip that hides the nodes next to the one it describes makes them unreachable by
// pointer until it closes. The four sides are tried in a fixed order (right, left, below,
// above); each place is first moved inside the picture, a place that would cover the node
// itself is the last resort, and among the rest the one covering the fewest nodes wins,
// the earlier side on a tie — so the same question always gets the same answer.
//
// PORTABLE and pure (see `graph-data.js`): emitted into the page as its own source text.

/**
 * A text on one line, cut at a word to at most `max` characters, the cut marked with `…`.
 * Applying it twice gives the same text.
 *
 * @param {*} text
 * @param {number} max at least 2.
 * @returns {string}
 */
function explorerExcerpt(text, max) {
  const line = String(text === undefined || text === null ? '' : text).split(/\s+/u).filter((w) => w !== '').join(' ');
  if (line.length <= max) return line;
  // A cut never splits a character written as two UTF-16 units.
  const room = line.slice(0, max - 1).replace(/[\uD800-\uDBFF]$/u, '');
  const space = room.lastIndexOf(' ');
  return `${(space > 0 ? room.slice(0, space) : room).trimEnd()}…`;
}

/**
 * Where a tooltip opens.
 *
 * @param {{x:number, y:number, r:number}} anchor the node described, in picture pixels.
 * @param {{width:number, height:number}} tip the tooltip's size.
 * @param {{width:number, height:number}} frame the picture's size.
 * @param {Array<{x:number, y:number, r:number}>} others the other nodes drawn.
 * @param {number} gap the space between the node and the tooltip.
 * @returns {{left:number, top:number, side:string}}
 */
function explorerPlaceTip(anchor, tip, frame, others, gap) {
  const reach = anchor.r + gap;
  const sides = [
    ['right', anchor.x + reach, anchor.y - tip.height / 2],
    ['left', anchor.x - reach - tip.width, anchor.y - tip.height / 2],
    ['below', anchor.x - tip.width / 2, anchor.y + reach],
    ['above', anchor.x - tip.width / 2, anchor.y - reach - tip.height],
  ];
  const inside = (value, room) => Math.max(0, Math.min(value, room));
  const meets = (left, top, circle) => {
    const x = Math.max(left, Math.min(circle.x, left + tip.width));
    const y = Math.max(top, Math.min(circle.y, top + tip.height));
    return (circle.x - x) ** 2 + (circle.y - y) ** 2 < circle.r ** 2;
  };
  let best = null;
  for (const [side, x, y] of sides) {
    const left = inside(x, frame.width - tip.width);
    const top = inside(y, frame.height - tip.height);
    const cost = (meets(left, top, anchor) ? others.length + 1 : 0) + others.filter((c) => meets(left, top, c)).length;
    if (best === null || cost < best.cost) best = { cost, left, side, top };
  }
  return { left: best.left, side: best.side, top: best.top };
}

/** The functions emitted into the page, in order. */
const PORTABLE = Object.freeze(['explorerExcerpt', 'explorerPlaceTip']);

module.exports = { PORTABLE, explorerExcerpt, explorerPlaceTip };
