'use strict';
// CONTEXT Distribution (Emission) — the explorer of `/clusters/`: the page's event wiring.
//
// The one part of the explorer that touches a live page. It reads `/graph.jsonld` of this
// origin (AGSC-06-05: nothing else, no cookie, no storage, no other host), lays the graph
// out, and then only turns what the visitor does into events for `explorerReduce`
// (`controller.js`) and draws the state it gets back with the pure writers of `view.js`
// and `explorerBuild`. Everything it decides is decided there and unit-tested; what is
// left here is the browser's part — fetching, focus, timers, pointer coordinates — and it
// is tested where a browser runs, in `tests/distribution/explorer-browser.test.js` (the
// browser lane of `.github/workflows/test.yml`), not by the Node suite.
//
// Without script the `/clusters/` page keeps its list, its overview figure, its relations
// table with the relation filter and its legend; the explorer's section starts `hidden`
// and only this script shows it, because a control that cannot work is not offered.
//
// The page: `#explorer` (the section), `#explorer-status` (a polite live region),
// `#explorer-find` (the find box), `#explorer-picture` (where the picture and the tooltip
// go), `#explorer-items` (where the list goes), `#explorer-detail` (the detail panel), and
// buttons carrying `data-zoom` (`in`, `out`, `fit`). The section's `data-state` reads
// `loading`, then `ready`, `empty` or `error`, so a test can wait for it.
//
// PORTABLE (see `graph-data.js`): emitted into the page as its own source text; its free
// names are the language's own and the other explorer functions, required below so that
// the module reads the same in Node.

const { explorerGraph } = require('./graph-data.js');
const { explorerLayout } = require('./layout.js');
const { explorerPlaceTip } = require('./tooltip.js');
const { explorerReduce, explorerStart, explorerStep } = require('./controller.js');
const { explorerBuild, explorerDetail, explorerList, explorerRadius, explorerScene, explorerTip, explorerVisible } = require('./view.js');

/* node:coverage disable */
/**
 * Start the explorer of the page, if the page has one.
 *
 * @param {object} win the page's `window`.
 * @param {object} api the explorer's constants and functions (`page.js#script`).
 * @returns {Promise<object|null>|null} the running explorer once drawn; null with no page.
 */
function explorerMain(win, api) {
  const doc = win.document;
  const root = doc.getElementById('explorer');
  if (root === null) return null;
  const status = doc.getElementById('explorer-status');
  root.hidden = false;
  root.setAttribute('data-state', 'loading');
  status.textContent = 'Loading the graph…';
  const stop = (state, text) => {
    root.setAttribute('data-state', state);
    status.textContent = text;
    return null;
  };
  return win.fetch(api.GRAPH_ROUTE, { credentials: 'omit' })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null)
    .then((published) => {
      if (published === null) return stop('error', 'The graph could not be read; the lists and the table above hold the same relations.');
      const graph = explorerGraph(published, api.RELATIONS, api.MAX_NODES);
      if (graph.nodes.length === 0) return stop('empty', 'The graph holds no item yet.');
      return explorerWire(win, api, graph, explorerLayout(graph, api.FRAME));
    });
}

/**
 * Draw the explorer and answer the visitor.
 *
 * @param {object} win
 * @param {object} api
 * @param {object} graph from `explorerGraph`.
 * @param {Array<object>} positions from `explorerLayout`.
 * @returns {{state: Function, dispatch: Function}}
 */
function explorerWire(win, api, graph, positions) {
  const doc = win.document;
  const frame = api.FRAME;
  const byId = (id) => doc.getElementById(id);
  const [root, status, find, picture, items, detail] = ['explorer', 'explorer-status', 'explorer-find', 'explorer-picture',
    'explorer-items', 'explorer-detail'].map(byId);
  const build = (tree) => explorerBuild(doc, tree);
  const at = new Map(positions.map((p) => [p.id, p]));
  const nodeOf = new Map(graph.nodes.map((n) => [n.id, n]));
  const svg = build(['svg', { 'aria-labelledby': 'explorer-picture-title', class: 'explorer-svg', role: 'img', viewBox: `0 0 ${frame.width} ${frame.height}` },
    ['title', { id: 'explorer-picture-title' }, `A picture of ${graph.nodes.length} items and ${graph.links.length} links; the list below it holds the same items.`],
    ['g', {}]]);
  const tip = build(['div', { class: 'explorer-tip', hidden: '', id: 'explorer-tip', role: 'tooltip' }]);
  picture.replaceChildren(svg, tip);
  let state = explorerStart(frame);
  let drawing = false;
  const timers = { hide: null, show: null };
  const later = (name, ms, then) => {
    win.clearTimeout(timers[name]);
    timers[name] = ms === null ? null : win.setTimeout(then, ms);
  };

  /** The tooltip, open where it covers the fewest other nodes, or closed. */
  const drawTip = () => {
    const node = state.tip === null ? undefined : nodeOf.get(state.tip.id);
    const where = node === undefined ? undefined : at.get(node.id);
    if (where === undefined) { tip.hidden = true; return; }
    tip.replaceChildren(...build(explorerTip(node)).childNodes);
    tip.hidden = false;
    const scale = svg.clientWidth / state.view.w;
    const place = (p) => ({ r: explorerRadius(nodeOf.get(p.id)) * scale, x: (p.x - state.view.x) * scale, y: (p.y - state.view.y) * scale });
    const others = positions.filter((p) => p.id !== node.id).map(place);
    const spot = explorerPlaceTip(place(where), { height: tip.offsetHeight, width: tip.offsetWidth },
      { height: svg.clientHeight, width: svg.clientWidth }, others, 8);
    tip.style.left = `${spot.left}px`;
    tip.style.top = `${spot.top}px`;
    tip.setAttribute('data-side', spot.side);
  };

  /**
   * The list. It is built anew only when the words of the find box change; otherwise the
   * buttons stay and take the attributes the list's model gives them, so a click or the
   * keyboard focus is never lost to a button replaced under it.
   */
  let listedFor = null;
  const drawList = () => {
    const model = explorerList(graph, state);
    if (listedFor !== state.query) {
      items.replaceChildren(build(model));
      listedFor = state.query;
      return;
    }
    const buttons = items.querySelectorAll('button[data-id]');
    model.slice(2).forEach((li, k) => {
      for (const [name, value] of Object.entries(li[2][1])) {
        if (value === null) buttons[k].removeAttribute(name);
        else buttons[k].setAttribute(name, value);
      }
    });
  };

  /** Everything, from the state; the keyboard focus stays on the list's current entry. */
  const draw = (focusList) => {
    drawing = true;
    const v = state.view;
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    // The scene is built in the SVG namespace, as the picture it goes into.
    svg.replaceChild(explorerBuild(doc, explorerScene(graph, positions, state), svg.namespaceURI), svg.lastChild);
    drawList();
    detail.replaceChildren(build(explorerDetail(graph, state.selected, api.MEANINGS)));
    drawTip();
    if (focusList) {
      const current = items.querySelector('button[tabindex="0"]');
      if (current !== null) current.focus();
    }
    drawing = false;
  };

  const dispatch = (event, focusList) => {
    const next = explorerReduce(state, event, frame);
    if (next === state) return;
    const announce = next.query !== state.query;
    state = next;
    draw(focusList);
    if (announce) {
      const found = explorerVisible(graph, state.query).length;
      status.textContent = state.query.trim() === '' ? '' : `${found} ${found === 1 ? 'item matches' : 'items match'}.`;
    }
  };
  const indexIn = (button) => [...items.querySelectorAll('button[data-id]')].indexOf(button);
  const dataId = (target) => {
    const el = target && target.closest ? target.closest('[data-id]') : null;
    return el === null ? null : el.getAttribute('data-id');
  };

  // The list: arrow keys, Home, End and the page keys move; Enter or a click selects.
  items.addEventListener('keydown', (event) => {
    const count = explorerVisible(graph, state.query).length;
    if (explorerStep(event.key, state.current, count) === null) return;
    event.preventDefault();
    dispatch({ count, key: event.key, type: 'key' }, true);
    // The tooltip follows the keyboard to the entry it reached.
    const reached = explorerVisible(graph, state.query)[state.current];
    dispatch({ by: 'focus', id: reached.id, type: 'tip' }, true);
  });
  items.addEventListener('focusin', (event) => {
    const id = dataId(event.target);
    if (drawing || id === null) return;
    later('show', null);
    const index = indexIn(event.target.closest('button'));
    if (index !== state.current) dispatch({ index, type: 'current' }, true);
    if (state.tip === null || state.tip.id !== id) dispatch({ by: 'focus', id, type: 'tip' }, true);
  });
  items.addEventListener('focusout', (event) => {
    if (drawing || (event.relatedTarget && items.contains(event.relatedTarget))) return;
    if (state.tip !== null && state.tip.by === 'focus') dispatch({ id: state.tip.id, type: 'untip' }, false);
  });
  // A click on any node button (the list or the detail panel) or on a node of the picture selects it.
  root.addEventListener('click', (event) => {
    const zoom = event.target.closest ? event.target.closest('[data-zoom]') : null;
    if (zoom !== null) {
      const how = zoom.getAttribute('data-zoom');
      dispatch(how === 'fit' ? { type: 'fit' } : { factor: how === 'in' ? 0.8 : 1.25, type: 'zoom' }, false);
      return;
    }
    const id = dataId(event.target);
    if (id === null || !nodeOf.has(id)) return;
    const inList = explorerVisible(graph, state.query).findIndex((n) => n.id === id);
    if (inList >= 0) dispatch({ index: inList, type: 'current' }, false);
    dispatch({ id, type: 'select' }, inList >= 0 && event.target.closest('#explorer-picture') === null);
  });
  // Escape anywhere in the explorer: the tooltip, then the selection, then the words.
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    dispatch({ type: 'escape' }, items.contains(doc.activeElement));
    if (doc.activeElement === find) find.value = state.query;
  });
  find.addEventListener('input', () => dispatch({ text: find.value, type: 'query' }, false));

  // The pointer: a node shows its tooltip after resting on it for a second; the tooltip
  // stays while the pointer is over it, so its link can be followed.
  svg.addEventListener('pointerover', (event) => {
    const id = dataId(event.target);
    if (id === null) return;
    later('hide', null);
    later('show', 1000, () => dispatch({ by: 'hover', id, type: 'tip' }, false));
  });
  svg.addEventListener('pointerout', (event) => {
    const id = dataId(event.target);
    if (id === null) return;
    later('show', null);
    later('hide', 400, () => dispatch({ id, type: 'untip' }, false));
  });
  tip.addEventListener('pointerenter', () => later('hide', null));
  tip.addEventListener('pointerleave', () => {
    if (state.tip !== null) later('hide', 400, () => dispatch({ id: state.tip.id, type: 'untip' }, false));
  });
  // Drag the picture to move it; Ctrl or Cmd with the wheel zooms (the wheel alone scrolls the page).
  let drag = null;
  svg.addEventListener('pointerdown', (event) => {
    if (dataId(event.target) !== null) return;
    drag = { x: event.clientX, y: event.clientY };
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener('pointermove', (event) => {
    if (drag === null) return;
    const scale = state.view.w / svg.clientWidth;
    dispatch({ dx: (drag.x - event.clientX) * scale, dy: (drag.y - event.clientY) * scale, type: 'pan' }, false);
    drag = { x: event.clientX, y: event.clientY };
  });
  svg.addEventListener('pointerup', () => { drag = null; });
  svg.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    dispatch({ factor: event.deltaY < 0 ? 0.8 : 1.25, type: 'zoom' }, false);
  }, { passive: false });
  win.addEventListener('resize', () => dispatch({ id: state.tip === null ? null : state.tip.id, type: 'untip' }, false));

  draw(false);
  root.setAttribute('data-state', 'ready');
  status.textContent = graph.total > graph.nodes.length
    ? `The first ${graph.nodes.length} of ${graph.total} items are drawn; every item is on the index pages and in the graph file.`
    : `${graph.nodes.length} items and ${graph.links.length} links are drawn.`;
  return { dispatch, state: () => state };
}
/* node:coverage enable */

/** The functions emitted into the page, in order. */
const PORTABLE = Object.freeze(['explorerMain', 'explorerWire']);

module.exports = { PORTABLE, explorerMain, explorerWire };
