'use strict';
// CONTEXT Distribution (Emission) — the explorer of `/clusters/`: what is drawn for a state.
//
// Each part of the explorer is first written as plain data, a tree of
// `[tag, attributes, ...children]` in which a child is a tree or a text:
//   * the picture (`explorerScene`): one line per link, classed by its relation, and one
//     circle per node, classed by its type; a selected node, its neighbours and the links
//     between them stand out and the rest fades; while the find box holds words the nodes
//     that answer them are marked. A small graph names every node; a large one names its
//     clusters and the nodes in focus only, so the labels never pile up;
//   * the list (`explorerList`): one button per node that answers the find box, only the
//     current one in the Tab order (a "roving" tab stop: the arrow keys move through the
//     list, `controller.js`), the selected one pressed;
//   * the detail panel (`explorerDetail`): the node, its type, its summary, a link to its
//     page and every neighbour, each with the plain meaning of the key (AGSC-03-01);
//   * the tooltip (`explorerTip`): the node, its type, its summary cut short, its page.
//
// `explorerBuild` is the explorer's only way into the page. It writes a text as a text
// node, never as markup, so no item title or summary can become an element or a script;
// it leaves out any event-handler attribute and any `style` attribute (AGSC-06-17 admits
// no inline style), and keeps a link only when it is a route of this site (`/a/b/`), so no
// `javascript:` address, no other origin and no protocol-relative `//host` address is
// ever written.
//
// PORTABLE and pure apart from `explorerBuild`, which only creates elements in the
// document it is given (see `graph-data.js`): emitted into the page as its own source text.
// The names it uses from the other explorer modules are portable functions too, so in the
// page they are the emitted functions of the same script.

const { explorerNeighbours } = require('./graph-data.js');
const { explorerMatches } = require('./controller.js');
const { explorerExcerpt } = require('./tooltip.js');

/**
 * The nodes that answer the words of the find box, in the graph's order.
 *
 * @param {{nodes:Array<object>}} graph
 * @param {string} query
 * @returns {Array<object>}
 */
function explorerVisible(graph, query) {
  return graph.nodes.filter((node) => explorerMatches(node, query));
}

/**
 * The radius of a node in the picture, in its own units: a cluster is drawn larger.
 *
 * @param {{type:string}} node
 * @returns {number}
 */
function explorerRadius(node) {
  return node.type === 'Cluster' ? 9 : 6;
}

/**
 * The picture's content: links, then nodes, then labels.
 *
 * @param {{nodes:Array<object>, links:Array<object>}} graph
 * @param {Array<{id:string, x:number, y:number}>} positions from `explorerLayout`.
 * @param {{selected:(string|null), query:string}} state
 * @returns {Array} a `g` tree.
 */
function explorerScene(graph, positions, state) {
  const at = new Map(positions.map((p) => [p.id, p]));
  const selected = state.selected;
  const near = new Set();
  for (const link of graph.links) {
    if (link.source === selected) near.add(link.target);
    if (link.target === selected) near.add(link.source);
  }
  const finding = String(state.query).trim() !== '';
  const focus = (node) => {
    if (selected !== null) return node.id === selected ? ' is-selected' : (near.has(node.id) ? ' is-near' : ' is-faded');
    if (finding) return explorerMatches(node, state.query) ? ' is-match' : ' is-faded';
    return '';
  };
  const typeClass = (node) => `t-${String(node.type).toLowerCase().replace(/[^a-z0-9-]/gu, '-')}`;
  const named = (node) => graph.nodes.length <= 40 || node.type === 'Cluster' || focus(node) === ' is-selected'
    || focus(node) === ' is-near' || focus(node) === ' is-match';
  const lines = graph.links.filter((link) => at.has(link.source) && at.has(link.target)).map((link) => {
    const from = at.get(link.source);
    const to = at.get(link.target);
    const touches = link.source === selected || link.target === selected;
    const emphasis = selected === null ? '' : (touches ? ' is-near' : ' is-faded');
    return ['line', { class: `link rel-${link.key}${emphasis}`, x1: from.x, x2: to.x, y1: from.y, y2: to.y }];
  });
  const drawn = graph.nodes.filter((node) => at.has(node.id));
  const circles = drawn.map((node) => ['circle', {
    class: `node ${typeClass(node)}${focus(node)}`, cx: at.get(node.id).x, cy: at.get(node.id).y, 'data-id': node.id, r: explorerRadius(node),
  }]);
  // A label reads towards the middle: to the left of a node at or right of the middle, to
  // the right of a node left of it, so a node near an edge keeps its label inside.
  const middle = positions.reduce((sum, p) => sum + p.x, 0) / Math.max(positions.length, 1);
  const labels = drawn.filter(named).map((node) => {
    const p = at.get(node.id);
    const leftward = p.x >= middle;
    return ['text', {
      class: `label${focus(node)}`, 'text-anchor': leftward ? 'end' : 'start', x: leftward ? p.x - explorerRadius(node) - 3 : p.x + explorerRadius(node) + 3, y: p.y + 4,
    }, node.label];
  });
  return ['g', {}, ...lines, ...circles, ...labels];
}

/**
 * The list of the nodes that answer the find box.
 *
 * @param {{nodes:Array<object>}} graph
 * @param {{current:number, selected:(string|null), query:string, tip:(object|null)}} state
 * @returns {Array} a `ul` tree.
 */
function explorerList(graph, state) {
  const visible = explorerVisible(graph, state.query);
  const current = Math.min(state.current, visible.length - 1);
  return ['ul', { 'aria-label': 'Items in the picture', class: 'explorer-list', id: 'explorer-list' },
    ...visible.map((node, k) => ['li', {}, ['button', {
      // A tooltip the keyboard focus opened describes the button that has the focus.
      'aria-describedby': state.tip !== null && state.tip.by === 'focus' && state.tip.id === node.id ? 'explorer-tip' : null,
      'aria-pressed': node.id === state.selected ? 'true' : 'false',
      'data-id': node.id,
      tabindex: k === current ? '0' : '-1',
      type: 'button',
    }, node.label, ' ', ['span', { class: 'type' }, node.type]]])];
}

/**
 * The detail panel of the selected node.
 *
 * @param {{nodes:Array<object>, links:Array<object>}} graph
 * @param {string|null} id the selected node.
 * @param {Object<string,string>} meanings the plain meaning of each key, and of `member`.
 * @returns {Array} a `div` tree.
 */
function explorerDetail(graph, id, meanings) {
  const node = graph.nodes.find((n) => n.id === id);
  if (node === undefined) return ['div', {}, ['p', {}, 'Select an item in the list or the picture to see its relations.']];
  const keyText = (row) => {
    if (row.key === 'member') return row.direction === 'outgoing' ? 'has member' : 'member of';
    return row.direction === 'outgoing' ? `${row.key} →` : `← ${row.key}`;
  };
  const rows = explorerNeighbours(graph, id).map((row) => ['li', {},
    ['span', { class: 'key' }, keyText(row)], ' ',
    ['button', { 'data-id': row.node.id, type: 'button' }, row.node.label], ' ',
    ['span', { class: 'meaning' }, meanings[row.key] || '']]);
  return ['div', {},
    ['h3', { id: 'explorer-detail-title' }, node.label],
    ['p', { class: 'type' }, node.type],
    ...(node.summary === '' ? [] : [['p', {}, node.summary]]),
    ...(node.route === null ? [] : [['p', {}, ['a', { href: node.route }, 'Open the page']]]),
    ...(rows.length === 0
      ? [['p', {}, 'No relation joins this item to another item drawn here.']]
      : [['h4', {}, 'Relations'], ['ul', { class: 'explorer-relations' }, ...rows]])];
}

/**
 * The tooltip's content.
 *
 * @param {{label:string, type:string, summary:string, route:(string|null)}} node
 * @returns {Array} a `div` tree.
 */
function explorerTip(node) {
  return ['div', {},
    ['strong', {}, node.label], ' ', ['span', { class: 'type' }, node.type],
    ...(node.summary === '' ? [] : [['p', {}, explorerExcerpt(node.summary, 300)]]),
    ...(node.route === null ? [] : [['p', {}, ['a', { href: node.route }, 'Open the page']]])];
}

/**
 * Elements from a tree, in `doc`: text as text nodes; SVG elements in the SVG namespace;
 * no handler, no style, and a link only to a route of this site.
 *
 * @param {object} doc a `Document`.
 * @param {Array|string} tree
 * @param {string|null} [ns] the namespace of the parent (inner use).
 * @returns {object} the element or text node.
 */
function explorerBuild(doc, tree, ns) {
  if (!Array.isArray(tree)) return doc.createTextNode(String(tree));
  const [tag, attributes, ...children] = tree;
  const space = tag === 'svg' ? 'http://www.w3.org/2000/svg' : (ns === undefined ? null : ns);
  const element = space === null ? doc.createElement(tag) : doc.createElementNS(space, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue;
    if (/^on/iu.test(name) || name === 'style') continue;
    if (name === 'href' && !/^\/(?:[A-Za-z0-9._-]+\/?)*$/u.test(String(value))) continue;
    element.setAttribute(name, String(value));
  }
  for (const child of children) element.appendChild(explorerBuild(doc, child, space));
  return element;
}

/** The functions emitted into the page, in order. */
const PORTABLE = Object.freeze(['explorerVisible', 'explorerRadius', 'explorerScene', 'explorerList', 'explorerDetail', 'explorerTip', 'explorerBuild']);

module.exports = { PORTABLE, explorerBuild, explorerDetail, explorerList, explorerRadius, explorerScene, explorerTip, explorerVisible };
