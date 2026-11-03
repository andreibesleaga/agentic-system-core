'use strict';
// CONTEXT Distribution (Emission) — the explorer of `/clusters/`: what the visitor did.
//
// The explorer keeps one state — the node selected, the words in the find box, the entry
// of the list that holds the keyboard focus, the tooltip open and the part of the picture
// in view — and one pure function computes the next state from the state and an event.
// The page (`main.js`) turns a click, a key or a pointer movement into an event and draws
// the state it gets back, so every path a keyboard user takes is a unit test here, and the
// explorer stays operable from the keyboard alone (AGSC-06-20): the arrow keys, Home, End
// and the page keys move through the list, Enter selects, Escape closes the tooltip first
// and then clears the selection, then the words.
//
// Zoom keeps the picture's shape and stays between eight times nearer and twice as far as
// the whole picture.
//
// PORTABLE and pure (see `graph-data.js`): emitted into the page as its own source text.

/**
 * The entry a key moves to in a list of `count` entries, or null for a key the list does
 * not use (Tab and every other key keep their meaning).
 *
 * @param {string} key the `KeyboardEvent.key`.
 * @param {number} index the current entry.
 * @param {number} count
 * @returns {number|null}
 */
function explorerStep(key, index, count) {
  if (count === 0) return null;
  const moves = { ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, End: count, Home: -count, PageDown: 10, PageUp: -10 };
  if (!Object.prototype.hasOwnProperty.call(moves, key)) return null;
  return Math.max(0, Math.min(count - 1, index + moves[key]));
}

/**
 * Whether a node answers the words of the find box: every word, ignoring case, is in its
 * label, its type or its page.
 *
 * @param {{label:string, type:string, route:(string|null)}} node
 * @param {string} words
 * @returns {boolean}
 */
function explorerMatches(node, words) {
  const haystack = `${node.label} ${node.type} ${node.route === null ? '' : node.route}`.toLowerCase();
  return String(words).toLowerCase().split(/\s+/u).filter((w) => w !== '').every((w) => haystack.includes(w));
}

/**
 * The state the explorer starts in.
 *
 * @param {{width:number, height:number}} frame the whole picture.
 * @returns {object}
 */
function explorerStart(frame) {
  return { current: 0, query: '', selected: null, tip: null, view: { h: frame.height, w: frame.width, x: 0, y: 0 } };
}

/**
 * The next state.
 *
 * @param {object} state from `explorerStart` or an earlier call.
 * @param {{type:string}} event `select {id}`, `escape`, `tip {id, by}`, `untip {id}`,
 *   `query {text}`, `key {key, count}`, `current {index}`, `zoom {factor}`,
 *   `pan {dx, dy}` (picture units) or `fit`.
 * @param {{width:number, height:number}} frame the whole picture.
 * @returns {object} a new state, or `state` itself when the event changes nothing.
 */
function explorerReduce(state, event, frame) {
  const zoomed = (factor) => {
    const w = Math.max(frame.width / 8, Math.min(frame.width * 2, state.view.w * factor));
    const h = (w * frame.height) / frame.width;
    return { h, w, x: state.view.x + (state.view.w - w) / 2, y: state.view.y + (state.view.h - h) / 2 };
  };
  const escaped = () => {
    if (state.tip !== null) return { ...state, tip: null };
    if (state.selected !== null) return { ...state, selected: null };
    return { ...state, query: '' };
  };
  const step = (next) => (next === null ? state : { ...state, current: next });
  switch (event.type) {
    case 'select': return { ...state, selected: event.id, tip: null };
    case 'escape': return escaped();
    case 'tip': return { ...state, tip: { by: event.by, id: event.id } };
    case 'untip': return state.tip !== null && state.tip.id === event.id ? { ...state, tip: null } : state;
    case 'query': return { ...state, current: 0, query: event.text };
    case 'key': return step(explorerStep(event.key, state.current, event.count));
    case 'current': return { ...state, current: event.index };
    case 'zoom': return { ...state, view: zoomed(event.factor) };
    case 'pan': return { ...state, view: { ...state.view, x: state.view.x + event.dx, y: state.view.y + event.dy } };
    case 'fit': return { ...state, view: explorerStart(frame).view };
    default: return state;
  }
}

/** The functions emitted into the page, in order. */
const PORTABLE = Object.freeze(['explorerStep', 'explorerMatches', 'explorerStart', 'explorerReduce']);

module.exports = { PORTABLE, explorerMatches, explorerReduce, explorerStart, explorerStep };
