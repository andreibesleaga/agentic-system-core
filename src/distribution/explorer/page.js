'use strict';
// CONTEXT Distribution (Emission) — the explorer of `/clusters/`: its two page assets.
//
// AGSC-06-38 gives `/clusters/` the overview of all clusters and a legend of the fourteen
// keys. Beside the overview's figure and table (`graph-view.js`), the page offers the
// explorer: the whole published graph as a picture to move through, with a list of every
// node, a find box, a detail panel with the meaning of each relation, and a tooltip. It is
// an addition to a page that already says everything without it, so it needs no route
// of its own (AGSC-06-01: a route is not added; the files a page loads are part of that
// page). The page loads two same-origin files, written here:
//
//   `/clusters/agsc-explorer.js`  one classic script: the SOURCE TEXT of the explorer's
//       portable functions (`graph-data.js`, `layout.js`, `tooltip.js`, `controller.js`,
//       `view.js`, `main.js`), so the page runs exactly the functions the Node tests
//       test, then the constants it needs — the term of each key's forward property in
//       this node's own context, the meaning of each key (AGSC-03-01), the drawing bound
//       — and a start that stands down where there is no document;
//   `/clusters/agsc-explorer.css` the explorer's look in both colour schemes (the
//       theme's tokens, AGSC-06-20) and the relation filter of the overview table, which
//       needs no script: a radio button per key, and one rule per key that hides the
//       table's other rows while it is checked.
//
// AGSC-06-17 holds (`script-src 'self'`, `style-src 'self'`, `connect-src 'self'`): no
// inline script or style, no other host; the script reads `/graph.jsonld` of the same
// origin and nothing else, and stores nothing (AGSC-06-05). The theme's stylesheet stays
// byte-identical to the main site's own copy (`theme.js`), which is why these rules are a
// file of their own.
//
// Pure: strings in, strings out.

const graphData = require('./graph-data.js');
const layout = require('./layout.js');
const tooltip = require('./tooltip.js');
const controller = require('./controller.js');
const view = require('./view.js');
const main = require('./main.js');
const { RELATIONS } = require('../../knowledge/relations.js');
const { expandCompact } = require('../../knowledge/jsonld.js');

/** The explorer's script, a page asset of `/clusters/`. */
const SCRIPT_ROUTE = '/clusters/agsc-explorer.js';
/** The explorer's stylesheet and the relation filter, a page asset of `/clusters/`. */
const STYLESHEET_ROUTE = '/clusters/agsc-explorer.css';
/** The one file the script reads. */
const GRAPH_ROUTE = '/graph.jsonld';
/** The most nodes the picture draws: the first ones of the graph, the rest named by the status line. */
const MAX_NODES = 400;
/** The picture, in its own units. */
const FRAME = Object.freeze({ height: 560, margin: 24, width: 800 });
/** What a `member` link means, beside the fourteen keys. */
const MEMBER_MEANING = 'The cluster gathers the item as one of its members.';

/** The modules whose portable functions the script carries, in order. */
const MODULES = Object.freeze([graphData, layout, tooltip, controller, view, main]);

/**
 * The fourteen keys of AGSC-03-01, in their order, each with the member name under which
 * this node's `graph.jsonld` writes the key's forward property, found as the writer finds
 * it (`knowledge/jsonld.js`): the term of the node's own context whose IRI is the
 * property's; else the compact IRI under the first prefix of the context that covers it;
 * else the full IRI.
 *
 * @param {object|null} contextObject the node's `/ns/context.jsonld`, or null.
 * @returns {Array<{key:string, term:string, meaning:string, symmetric:boolean}>}
 */
function relationTerms(contextObject) {
  const definitions = (contextObject && contextObject['@context']) || {};
  const prefixes = Object.entries(definitions).filter(([, value]) => typeof value === 'string');
  const expand = (compact) => {
    const colon = compact.indexOf(':');
    const prefix = prefixes.find(([name]) => name === compact.slice(0, colon));
    return prefix === undefined ? compact : `${prefix[1]}${compact.slice(colon + 1)}`;
  };
  const termOf = new Map();
  for (const [name, value] of Object.entries(definitions)) {
    if (value !== null && typeof value === 'object' && typeof value['@id'] === 'string') termOf.set(expand(value['@id']), name);
  }
  const compact = (iri) => {
    const prefix = prefixes.find(([, namespace]) => iri.length > namespace.length && iri.startsWith(namespace));
    return prefix === undefined ? iri : `${prefix[0]}:${iri.slice(prefix[1].length)}`;
  };
  return RELATIONS.map((row) => ({
    key: row.key,
    meaning: row.meaning,
    symmetric: row.symmetric,
    term: termOf.get(expandCompact(row.property)) || compact(expandCompact(row.property)),
  }));
}

/**
 * The script text.
 *
 * @param {{relations: ReturnType<typeof relationTerms>, specVersion?: string}} options
 * @returns {string} a classic script, LF line ends, exactly one LF at the end.
 */
function script(options) {
  const relations = options.relations.map((r) => ({ key: r.key, symmetric: r.symmetric, term: r.term }));
  const meanings = { member: MEMBER_MEANING, ...Object.fromEntries(options.relations.map((r) => [r.key, r.meaning])) };
  const names = MODULES.flatMap((m) => m.PORTABLE);
  const parts = ['\'use strict\';',
    '// SPDX-License-Identifier: Apache-2.0 (the engine\'s code; the text it carries keeps its own terms)',
    '// AgenticSystemCore /clusters/ explorer (AGSC-06-38, AGSC-06-01, AGSC-06-05, AGSC-06-17, AGSC-06-20).',
    '// GENERATED by src/distribution/explorer/page.js — do not edit. Each function below is the',
    '// SOURCE TEXT of the function the engine tests, so the page runs what was tested.',
    '// It reads /graph.jsonld of this origin and nothing else; no key, no cookie, no storage.',
    `// spec_version: ${options.specVersion === undefined ? 'unset' : options.specVersion}`,
    '(function () {'];
  for (const module of MODULES) for (const name of module.PORTABLE) parts.push(String(module[name]));
  parts.push(`  var API = {
    FRAME: ${JSON.stringify(FRAME)},
    GRAPH_ROUTE: ${JSON.stringify(GRAPH_ROUTE)},
    MAX_NODES: ${MAX_NODES},
    MEANINGS: ${JSON.stringify(meanings)},
    RELATIONS: ${JSON.stringify(relations)},
${names.map((name) => `    ${name}: ${name}`).join(',\n')},
    ready: null
  };
  globalThis.AGSC_EXPLORER = API;
  if (typeof document === 'undefined' || typeof fetch !== 'function') return;
  API.ready = explorerMain(globalThis, API);
}());`);
  return `${parts.join('\n')}\n`;
}

/** The type colours, light then dark: each at least 3:1 against the picture's ground. */
const TYPE_COLOURS = Object.freeze([
  ['cluster', '#7a3fb0', '#c9a4f2'], ['concept', '#245a9c', '#8ab4f8'], ['procedure', '#2b7a33', '#81c995'],
  ['lesson', '#00707a', '#4fd1c5'], ['episode', '#a8326e', '#f48fb1'], ['gate', '#b3261e', '#f28b82'],
  ['other', '#5c5c5c', '#a3a3a0'],
]);

/**
 * The explorer's section of `/clusters/`: its heading, how to use it, the status line, the
 * find box and the zoom buttons, the places of the picture, the list and the detail panel,
 * then the script. The section starts `hidden`; only the script shows it (`main.js`).
 *
 * @returns {string}
 */
function section() {
  return ['<section id="explorer" class="explorer" aria-labelledby="explorer-heading" hidden>',
    '<h2 id="explorer-heading">Explore the graph</h2>',
    '<p>Every published item and the links among them, as a picture. Select an item in the list or in the picture to see its relations and what each means. In the list the arrow keys, Home and End move, Enter selects, and Escape closes the tooltip, then clears the selection.</p>',
    '<p id="explorer-status" role="status"></p>',
    '<div class="explorer-tools">',
    '<label for="explorer-find">Find an item</label>',
    '<input id="explorer-find" type="search" autocomplete="off" spellcheck="false">',
    '<button type="button" data-zoom="in">Zoom in</button>',
    '<button type="button" data-zoom="out">Zoom out</button>',
    '<button type="button" data-zoom="fit">Whole picture</button>',
    '</div>',
    '<div class="explorer-body">',
    '<div class="explorer-picture" id="explorer-picture"></div>',
    '<div class="explorer-side">',
    '<div id="explorer-items"></div>',
    '<div class="explorer-detail" id="explorer-detail"></div>',
    '</div>',
    '</div>',
    '</section>',
    `<script src="${SCRIPT_ROUTE}" defer></script>`].join('\n');
}

/**
 * The stylesheet text.
 *
 * @returns {string} LF line ends, exactly one LF at the end.
 */
function stylesheet() {
  const tokens = (column) => TYPE_COLOURS.map((row) => `--type-${row[0]}: ${row[column]};`).join(' ');
  const filters = RELATIONS.map((r) => `.relation-filter:has(#relation-filter-${r.key}:checked) ~ .table-wrap tr[data-relation]:not([data-relation="${r.key}"]) { display: none; }`);
  const fills = TYPE_COLOURS.filter((row) => row[0] !== 'other').map((row) => `.explorer-svg .t-${row[0]} { fill: var(--type-${row[0]}); }`);
  return `${[
    '/* AgenticSystemCore /clusters/: the relation filter and the explorer (AGSC-06-38). Same origin, no inline style (AGSC-06-17). */',
    `:root { ${tokens(1)} }`,
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) { ${tokens(2)} }\n}`,
    `:root[data-theme="dark"] { ${tokens(2)} }`,
    '/* The relation filter: no script; while a key is checked, the overview table shows only its rows. */',
    '.relation-filter { border: 1px solid var(--rule); border-radius: 4px; padding: 0.5rem 0.75rem; margin: 0 0 1rem; }',
    '.relation-filter legend { padding: 0 0.25rem; }',
    '.relation-filter label { display: inline-flex; align-items: center; gap: 0.35rem; min-height: 24px; margin: 0 1rem 0 0; }',
    ...filters,
    '/* The explorer: shown by its script only; the picture, then the list and the detail side by side, stacked when narrow. */',
    'main > .explorer { max-width: none; }',
    '.explorer[hidden], .explorer-tip[hidden] { display: none; }',
    '.explorer-tools { display: flex; flex-wrap: wrap; gap: 0.5rem 0.75rem; align-items: center; margin: 0 0 0.75rem; }',
    '.explorer-tools input { font: inherit; color: var(--fg); background: var(--bg); border: 1px solid var(--control); border-radius: 4px; padding: 0.25rem 0.5rem; min-height: 24px; }',
    '.explorer button { font: inherit; color: var(--fg); background: var(--bg-alt); border: 1px solid var(--control); border-radius: 4px; padding: 0.15rem 0.5rem; min-height: 24px; cursor: pointer; }',
    '.explorer-body { display: grid; gap: 1rem; }',
    '.explorer-side { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1rem; align-items: start; }',
    '@media (max-width: 40rem) {\n  .explorer-side { grid-template-columns: minmax(0, 1fr); }\n}',
    '.explorer-picture { position: relative; border: 1px solid var(--rule); border-radius: 4px; background: var(--bg-alt); overflow: hidden; }',
    '.explorer-svg { display: block; width: 100%; height: auto; touch-action: pan-y; cursor: grab; }',
    '.explorer-svg .link { stroke: var(--muted); stroke-width: 1.2; }',
    '.explorer-svg .rel-member { stroke: var(--control); stroke-dasharray: 3 3; }',
    '.explorer-svg .node { fill: var(--type-other); stroke: var(--bg-alt); stroke-width: 1.5; cursor: pointer; }',
    ...fills,
    '.explorer-svg .label { fill: var(--fg); font-size: 13px; pointer-events: none; }',
    '.explorer-svg .is-faded { opacity: 0.25; }',
    '.explorer-svg .label.is-faded { opacity: 0.6; }',
    '.explorer-svg .link.is-near { stroke: var(--accent); stroke-width: 2; }',
    '.explorer-svg .node.is-selected { stroke: var(--focus); stroke-width: 3; }',
    '.explorer-svg .node.is-match { stroke: var(--accent); stroke-width: 2.5; }',
    '.explorer-tip { position: absolute; z-index: 1; max-width: 18rem; padding: 0.5rem 0.75rem; background: var(--bg); color: var(--fg); border: 1px solid var(--control); border-radius: 4px; font-size: 0.9rem; }',
    '.explorer-tip p { margin: 0.35rem 0 0; }',
    '.explorer-list { list-style: none; margin: 0 0 1rem; padding: 0; max-height: 20rem; overflow: auto; border: 1px solid var(--rule); border-radius: 4px; }',
    '.explorer-list li { margin: 0; }',
    '.explorer-list button { display: block; width: 100%; text-align: left; border: 0; border-radius: 0; background: none; }',
    '.explorer-list button[aria-pressed="true"] { background: var(--code-bg); font-weight: 650; }',
    '.explorer .type { color: var(--muted); font-size: 0.85rem; }',
    '.explorer-relations { padding-left: 1rem; }',
    '.explorer-relations .meaning { display: block; color: var(--muted); font-size: 0.85rem; }',
    '@media (pointer: coarse) {\n  .explorer button, .explorer input { min-height: 44px; }\n}',
  ].join('\n')}\n`;
}

module.exports = { FRAME, GRAPH_ROUTE, MAX_NODES, SCRIPT_ROUTE, STYLESHEET_ROUTE, relationTerms, script, section, stylesheet };
