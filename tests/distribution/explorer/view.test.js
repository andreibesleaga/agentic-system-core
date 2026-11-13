'use strict';
// verifies AGSC-06-38, AGSC-06-20, AGSC-06-05
// What the explorer draws (src/distribution/explorer/view.js), as plain data first —
// the picture, the list, the detail panel and the tooltip are each a tree of
// `[tag, attributes, ...children]` built from the state — and then the one function that
// turns such a tree into elements. That function is the explorer's only way into the
// page: it writes text as text nodes, never as markup, refuses an event-handler or style
// attribute and any link that is not a route of this site (no script through item text).

const test = require('node:test');
const assert = require('node:assert');

const view = require('../../../src/distribution/explorer/view.js');
const { explorerStart } = require('../../../src/distribution/explorer/controller.js');

const FRAME = Object.freeze({ height: 400, margin: 20, width: 600 });
const MEANING = { member: 'The cluster gathers the item.', related: 'Connected in meaning.', requires: 'Cannot be used without the target.' };

function graph() {
  const nodes = [
    { id: 'c', label: 'Core', route: '/clusters/core/', summary: 'The core cluster.', type: 'Cluster' },
    { id: 'a', label: 'Item A', route: '/concepts/a/', summary: 'The first item.', type: 'Concept' },
    { id: 'b', label: 'Item <b>', route: null, summary: '', type: 'Concept' },
  ];
  const links = [{ key: 'member', source: 'c', target: 'a' }, { key: 'requires', source: 'a', target: 'b' }];
  return { links, nodes, total: 3 };
}
const POSITIONS = [{ id: 'c', x: 100, y: 100 }, { id: 'a', x: 200, y: 150 }, { id: 'b', x: 300, y: 200 }];

/** Every element of a tree, depth first, as `[tag, attributes]`. */
function walk(tree, out = []) {
  if (!Array.isArray(tree)) return out;
  out.push([tree[0], tree[1]]);
  for (const child of tree.slice(2)) walk(child, out);
  return out;
}
const textOf = (tree) => (Array.isArray(tree) ? tree.slice(2).map(textOf).join('') : String(tree));

// ------------------------------------------------------------------ the picture

test('the picture draws every link and every node, each in the classes of its type and relation', () => {
  const scene = view.explorerScene(graph(), POSITIONS, explorerStart(FRAME));
  const elements = walk(scene);
  assert.strictEqual(scene[0], 'g');
  const lines = elements.filter(([tag]) => tag === 'line');
  assert.deepStrictEqual(lines.map(([, a]) => a.class), ['link rel-member', 'link rel-requires']);
  assert.deepStrictEqual(lines.map(([, a]) => [a.x1, a.y1, a.x2, a.y2]), [[100, 100, 200, 150], [200, 150, 300, 200]]);
  const circles = elements.filter(([tag]) => tag === 'circle');
  assert.deepStrictEqual(circles.map(([, a]) => [a.class, a.r, a['data-id']]),
    [['node t-cluster', 9, 'c'], ['node t-concept', 6, 'a'], ['node t-concept', 6, 'b']]);
  // Labels: a small graph names every node; text is text, never markup.
  assert.deepStrictEqual(elements.filter(([tag]) => tag === 'text').length, 3);
  assert.ok(textOf(scene).includes('Item <b>'));
});

test('a selected node, its neighbours and the links between them stand out; the rest fades', () => {
  const state = { ...explorerStart(FRAME), selected: 'a' };
  const elements = walk(view.explorerScene(graph(), POSITIONS, state));
  const circleClass = (id) => elements.find(([tag, a]) => tag === 'circle' && a['data-id'] === id)[1].class;
  assert.strictEqual(circleClass('a'), 'node t-concept is-selected');
  assert.strictEqual(circleClass('b'), 'node t-concept is-near');
  assert.strictEqual(circleClass('c'), 'node t-cluster is-near');
  const third = { ...graph(), links: [], nodes: [...graph().nodes, { id: 'd', label: 'D', route: null, summary: '', type: 'Gate' }] };
  const far = walk(view.explorerScene(third, [...POSITIONS, { id: 'd', x: 50, y: 50 }], state))
    .find(([tag, a]) => tag === 'circle' && a['data-id'] === 'd')[1].class;
  assert.strictEqual(far, 'node t-gate is-faded');
});

test('found nodes are marked and the others fade while the find box holds words', () => {
  const state = { ...explorerStart(FRAME), query: 'item a' };
  const elements = walk(view.explorerScene(graph(), POSITIONS, state));
  const classes = elements.filter(([tag]) => tag === 'circle').map(([, a]) => a.class);
  assert.deepStrictEqual(classes, ['node t-cluster is-faded', 'node t-concept is-match', 'node t-concept is-faded']);
});

test('a large graph names only its clusters and the nodes in focus, so labels never pile up', () => {
  const nodes = Array.from({ length: 80 }, (_, k) => ({ id: `n${k}`, label: `N${k}`, route: null, summary: '', type: k === 0 ? 'Cluster' : 'Concept' }));
  const positions = nodes.map((n, k) => ({ id: n.id, x: k, y: k }));
  const big = { links: [], nodes, total: 80 };
  const named = (state) => walk(view.explorerScene(big, positions, state)).filter(([tag]) => tag === 'text').length;
  assert.strictEqual(named(explorerStart(FRAME)), 1);
  assert.strictEqual(named({ ...explorerStart(FRAME), selected: 'n5' }), 2);
});

// ------------------------------------------------------------------ the list and the panel

test('the list holds one button per found node, only the current one in the Tab order', () => {
  const list = view.explorerList(graph(), { ...explorerStart(FRAME), current: 1, selected: 'c' });
  const buttons = walk(list).filter(([tag]) => tag === 'button');
  assert.deepStrictEqual(buttons.map(([, a]) => [a['data-id'], a.tabindex, a['aria-pressed']]),
    [['c', '-1', 'true'], ['a', '0', 'false'], ['b', '-1', 'false']]);
  assert.deepStrictEqual(list.slice(2).map(textOf), ['Core Cluster', 'Item A Concept', 'Item <b> Concept']);
  const tipped = view.explorerList(graph(), { ...explorerStart(FRAME), tip: { by: 'focus', id: 'a' } });
  assert.deepStrictEqual(walk(tipped).filter(([tag]) => tag === 'button').map(([, a]) => a['aria-describedby']), [null, 'explorer-tip', null]);
  const hovered = view.explorerList(graph(), { ...explorerStart(FRAME), tip: { by: 'hover', id: 'a' } });
  assert.ok(walk(hovered).every(([, a]) => !a['aria-describedby']), 'a tooltip the pointer opened describes no button');
  const found = view.explorerList(graph(), { ...explorerStart(FRAME), query: 'core' });
  assert.deepStrictEqual(walk(found).filter(([tag]) => tag === 'button').map(([, a]) => a['data-id']), ['c']);
  assert.deepStrictEqual(walk(view.explorerList(graph(), { ...explorerStart(FRAME), query: 'nothing' })).map(([tag]) => tag), ['ul']);
});

test('the visible list in order, for the keyboard', () => {
  assert.deepStrictEqual(view.explorerVisible(graph(), 'item').map((n) => n.id), ['a', 'b']);
});

test('the detail panel names the node, its type, its summary, its page and every neighbour with the meaning of the key', () => {
  const panel = view.explorerDetail(graph(), 'a', MEANING);
  const elements = walk(panel);
  assert.strictEqual(textOf(panel.slice(2)[0]), 'Item A');
  assert.ok(textOf(panel).includes('Concept'));
  assert.ok(textOf(panel).includes('The first item.'));
  const link = elements.find(([tag]) => tag === 'a');
  assert.deepStrictEqual(link[1], { href: '/concepts/a/' });
  const neighbours = elements.filter(([tag, a]) => tag === 'button' && a['data-id']);
  assert.deepStrictEqual(neighbours.map(([, a]) => a['data-id']), ['b', 'c']);
  assert.ok(textOf(panel).includes('requires'));
  assert.ok(textOf(panel).includes('Cannot be used without the target.'));
  assert.ok(textOf(panel).includes('member of'), 'an incoming member link reads as membership');
  // A node with no page and no neighbour still has a panel; nothing selected gives a hint.
  const lone = view.explorerDetail({ links: [], nodes: graph().nodes, total: 3 }, 'b', MEANING);
  assert.ok(!walk(lone).some(([tag]) => tag === 'a'));
  assert.ok(textOf(lone).includes('No relation'));
  assert.match(textOf(view.explorerDetail(graph(), null, MEANING)), /Select an item/u);
  assert.match(textOf(view.explorerDetail(graph(), 'gone', MEANING)), /Select an item/u);
});

test('the tooltip names the node and its type, shows its summary cut short and links its page', () => {
  const long = { ...graph().nodes[1], summary: 'word '.repeat(100) };
  const tip = view.explorerTip(long);
  assert.strictEqual(tip[0], 'div');
  assert.ok(textOf(tip).length < 380);
  assert.ok(textOf(tip).includes('…'));
  assert.deepStrictEqual(walk(tip).find(([tag]) => tag === 'a')[1], { href: '/concepts/a/' });
  assert.ok(!walk(view.explorerTip(graph().nodes[2])).some(([tag]) => tag === 'a'), 'a node with no page has no link');
});

// ------------------------------------------------------------------ the builder

/** The smallest document the builder needs. */
function fakeDocument() {
  const make = (ns, tag) => ({
    attributes: {}, children: [], ns, tag,
    appendChild(child) { this.children.push(child); return child; },
    setAttribute(name, value) { this.attributes[name] = value; },
  });
  return {
    createElement: (tag) => make(null, tag),
    createElementNS: (ns, tag) => make(ns, tag),
    createTextNode: (text) => ({ text }),
  };
}

test('the builder makes HTML elements, SVG elements in their namespace and text as text nodes', () => {
  const doc = fakeDocument();
  const built = view.explorerBuild(doc, ['div', { class: 'x' }, 'a <b>c</b>', ['svg', { viewBox: '0 0 1 1' }, ['circle', { r: 1 }]]]);
  assert.deepStrictEqual([built.tag, built.ns, built.attributes], ['div', null, { class: 'x' }]);
  assert.deepStrictEqual(built.children[0], { text: 'a <b>c</b>' });
  assert.strictEqual(built.children[1].ns, 'http://www.w3.org/2000/svg');
  assert.strictEqual(built.children[1].children[0].ns, 'http://www.w3.org/2000/svg');
  assert.deepStrictEqual(built.children[1].children[0].attributes, { r: '1' });
});

test('the builder refuses handlers, styles and any link that is not a route of this site', () => {
  const doc = fakeDocument();
  const built = view.explorerBuild(doc, ['a', {
    href: 'javascript:alert(1)', onclick: 'x', onmouseover: 'x', style: 'color:red', title: 't', xlink: undefined,
  }, 'x']);
  assert.deepStrictEqual(built.attributes, { title: 't' });
  for (const href of ['//evil.example/', 'https://evil.example/', '/ok/', 'data:text/html,x', '/a b/']) {
    const a = view.explorerBuild(doc, ['a', { href }]);
    assert.strictEqual(a.attributes.href, href === '/ok/' ? '/ok/' : undefined, href);
  }
  // A null or false attribute is left out; a number is written as text.
  assert.deepStrictEqual(view.explorerBuild(doc, ['button', { disabled: false, hidden: null, tabindex: 0 }]).attributes, { tabindex: '0' });
});

test('a label reads towards the middle of the picture, so a node at an edge keeps its label inside', () => {
  const texts = walk(view.explorerScene(graph(), POSITIONS, explorerStart(FRAME))).filter(([tag]) => tag === 'text').map(([, a]) => a);
  // The middle of the three nodes is x = 200: c at 100 is left of it, b at 300 right of it.
  assert.deepStrictEqual(texts.map((a) => [a['text-anchor'], a.x]), [['start', 100 + 9 + 3], ['end', 200 - 6 - 3], ['end', 300 - 6 - 3]]);
});
