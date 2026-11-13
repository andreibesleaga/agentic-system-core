'use strict';
// CONTEXT Distribution (Emission) — Surface: the `/query/` page (AGSC-06-39).
//
// A page on which a visitor writes a SPARQL 1.1 query and runs it against this node's own
// published graph, in the visitor's browser and nowhere else. The build emits it unless
// `site.query_page` is `false` (AGSC-01-18), on a node that serves `/graph.nq`; the switch
// keeps a node's 1.0 file set. The page (`page`) carries, in this order:
//
//   1. the editor's section (AGSC-06-39 (a), (e)): a text area with a coloured copy behind
//      it, Run and Stop, the share link whose fragment holds the query, the status line.
//      It starts hidden and only the script shows it, because a control that cannot work
//      is not offered; a sentence says what the page needs and where the same answers come
//      from without it;
//   2. the result (c), (d): the table, the picture of a CONSTRUCT, DESCRIBE or three-column
//      result, and the page's own two download links, CSV and JSON;
//   3. the examples (b): the ten questions of the graph (AGSC-05-34), each with the query
//      that defines it, read from `docs/ontology-questions.json` and handed in by the
//      application layer, its placeholders filled in from the node with a sentence that says
//      what was put in (`query-examples.js`), and a button that puts the query into the
//      editor without running it; then, on a node that declares competency questions of its
//      own (AGSC-05-41), those, as its file states them (`examplesSection`);
//   4. the vocabulary explorer (f): the classes of the vocabulary and the fourteen relation
//      keys with their property and their plain meaning (the `Meaning` column of AGSC-03-01,
//      `knowledge/relations.js`); then, on a node with a site vocabulary (AGSC-05-38), its
//      classes and relations, each with its label, what it is a kind of and its meaning
//      (`vocabularySection`).
//
// The files under `/query/` other than its page are page assets of it (AGSC-06-01): the
// page script, the worker script, the stylesheet, and the engine — the files of one release
// of an engine whose licence allows their redistribution, with its licence texts
// (`vendor/`, `ENGINE`). They are outside the page budget of AGSC-06-21; the page itself
// keeps it. The engine is compiled to WebAssembly, so the one `_headers` block of `/query/*`
// adds `'wasm-unsafe-eval'` to `script-src` (AGSC-06-39, AGSC-06-17; `headers.js`).
//
// The two scripts are the SOURCE TEXT of the functions under `query/` (and of the
// explorer's layout, scene and element writer, so the picture has no second layout engine),
// emitted the way the explorer of `/clusters/` is, so the page runs what the Node suite
// tests. AGSC-06-05 holds: the scripts read this origin only and store nothing.
//
// Pure: the build (`site.js`) hands in the engine's bytes, the questions, the vocabulary
// terms, the node's items and instant and its domain layer, and puts the files this returns.

const { escapeHtml, shell } = require('./html.js');
const tokens = require('./query/tokens.js');
const view = require('./query/view.js');
const queryExamples = require('./query-examples.js');
const engine = require('./query/engine.js');
const main = require('./query/main.js');
const explorerLayout = require('./explorer/layout.js');
const explorerView = require('./explorer/view.js');
const explorerController = require('./explorer/controller.js');
const { RELATIONS } = require('../knowledge/relations.js');
const { PREFIXES, RDF, itemIri } = require('../knowledge/nquads.js');

/** The page. */
const ROUTE = '/query/';
/** Its script, its worker and its stylesheet: page assets of `/query/`. */
const SCRIPT_ROUTE = '/query/agsc-query.js';
const WORKER_ROUTE = '/query/agsc-query-worker.js';
const STYLESHEET_ROUTE = '/query/agsc-query.css';
/** The one file the worker loads into the engine (AGSC-06-39 (a)). */
const GRAPH_ROUTE = '/graph.nq';

/**
 * The engine the page ships: one release, its files byte for byte, each with the SHA-256
 * and the byte count `tests/arch/query-engine-pin.test.js` checks. `source` is the file in
 * this repository (`src/distribution/vendor/<folder>/`), `served` its name under `route`.
 */
const ENGINE = Object.freeze({
  folder: 'oxigraph-0.5.13',
  licence: 'MIT OR Apache-2.0',
  module: 'web.js',
  name: 'Oxigraph',
  package: 'oxigraph',
  route: '/query/vendor/oxigraph-0.5.13/',
  version: '0.5.13',
  files: Object.freeze([
    Object.freeze({ bytes: 50946, served: 'web.js', sha256: '210c42fbba2915f668386f3285d28218db5865267e95b5403b82150431931f7c', source: 'web.js' }),
    Object.freeze({ bytes: 4324920, served: 'web_bg.wasm', sha256: '75e3f0f4de67921e88e3f6d587b2a8e7aa822abbe3a3b79873f2b97f20d52c24', source: 'web_bg.wasm' }),
    Object.freeze({ bytes: 1063, served: 'LICENSE-MIT.txt', sha256: '1f4f6736adc52ebfda18bb84947e0ef492bd86a408c0e83872efb75ed5e02838', source: 'LICENSE-MIT' }),
    Object.freeze({ bytes: 10847, served: 'LICENSE-APACHE.txt', sha256: 'a60eea817514531668d7e00765731449fe14d059d3249e0bc93b36de45f759f2', source: 'LICENSE-APACHE' }),
    Object.freeze({ bytes: 83361, served: 'THIRD-PARTY.txt', sha256: '52102a351fe22fcfffa96b5aee4246605c99800b754331bea85919f8bab7f2a8', source: 'THIRD-PARTY.txt' }),
  ]),
});

/** The repository path of each engine file, for the application layer that reads them. */
const ENGINE_SOURCES = Object.freeze(ENGINE.files.map((f) => `src/distribution/vendor/${ENGINE.folder}/${f.source}`));

/** How many rows the table shows; the downloads carry every row. */
const ROWS_SHOWN = 200;
/** The most nodes the picture draws. */
const MAX_NODES = 150;
/** The picture, in its own units. */
const FRAME = Object.freeze({ height: 480, margin: 24, width: 800 });
/** The prefixes the page writes names with: the graph writer's own, and `rdf:`. */
const PAGE_PREFIXES = Object.freeze({ ...PREFIXES, rdf: RDF });
/** The query in the editor when the page opens: every item with its name. */
const FIRST_QUERY = 'PREFIX skos: <http://www.w3.org/2004/02/skos/core#>\n'
  + 'SELECT ?item ?name WHERE { ?item skos:prefLabel ?name } ORDER BY ?item LIMIT 100\n';

/** The explorer functions the page script carries for the picture, by module. */
const EXPLORER_PARTS = Object.freeze([
  [explorerLayout, ['explorerLayout']],
  [explorerController, ['explorerMatches']],
  [explorerView, ['explorerRadius', 'explorerScene', 'explorerBuild']],
]);

/** The banner every emitted script starts with. */
function banner(what, specVersion) {
  return ['// SPDX-License-Identifier: Apache-2.0 (the engine\'s code; the text it carries keeps its own terms)',
    `// AgenticSystemCore /query/ ${what} (AGSC-06-39, AGSC-06-01, AGSC-06-05, AGSC-06-17, AGSC-06-20).`,
    '// GENERATED by src/distribution/query-page.js — do not edit. Each function below is the',
    '// SOURCE TEXT of the function the engine tests, so the page runs what was tested.',
    '// It reads this origin only; no key, no cookie, no storage.',
    `// spec_version: ${specVersion === undefined ? 'unset' : specVersion}`];
}

/**
 * The page script: a classic script, the source text of the page's functions, then the
 * constants it needs and a start that stands down where there is no document.
 *
 * @param {{specVersion?: string}} [options]
 * @returns {string} LF line ends, exactly one LF at the end.
 */
function script(options = {}) {
  const functions = [...EXPLORER_PARTS, [tokens, tokens.PORTABLE], [view, view.PORTABLE], [main, main.PORTABLE]]
    .flatMap(([module, names]) => names.map((name) => String(module[name])));
  return `${['\'use strict\';', ...banner('page script', options.specVersion), '(function () {', ...functions,
    `  var API = {
    FRAME: ${JSON.stringify(FRAME)},
    MAX_NODES: ${MAX_NODES},
    PREFIXES: ${JSON.stringify(PAGE_PREFIXES)},
    ROWS_SHOWN: ${ROWS_SHOWN},
    WORKER_ROUTE: ${JSON.stringify(WORKER_ROUTE)}
  };
  if (typeof document === 'undefined' || typeof Worker !== 'function') return;
  queryMain(globalThis, API);
}());`].join('\n')}\n`;
}

/**
 * The worker script: a module that imports the engine's own module from `vendor/`, then the
 * source text of the worker's functions, then its start.
 *
 * @param {{specVersion?: string}} [options]
 * @returns {string} LF line ends, exactly one LF at the end.
 */
function workerScript(options = {}) {
  const functions = [...['queryTokens', 'queryCheck', 'queryRefusal'].map((name) => String(tokens[name])),
    ...engine.PORTABLE.map((name) => String(engine[name]))];
  return `${[...banner('worker', options.specVersion),
    `import * as oxigraph from './vendor/${ENGINE.folder}/${ENGINE.module}';`, ...functions,
    `queryWorkerMain(self, oxigraph, ${JSON.stringify(GRAPH_ROUTE)});`].join('\n')}\n`;
}

/** The token colours, light then dark: each at least 4.5:1 against the editor's ground in its scheme. */
const TOKEN_COLOURS = Object.freeze([
  ['keyword', '#7a3fb0', '#c9a4f2'], ['variable', '#a8326e', '#f48fb1'], ['iri', '#2b6a33', '#81c995'],
  ['prefixed', '#245a9c', '#8ab4f8'], ['blank', '#245a9c', '#8ab4f8'], ['string', '#8a4a00', '#f2b872'],
  ['number', '#8a4a00', '#f2b872'], ['comment', '#5c5c5c', '#a3a3a0'],
]);

/**
 * The page's stylesheet: the editor and its coloured copy, the tools, the result, the
 * picture, in both colour schemes through the theme's tokens (AGSC-06-20). Same origin, no
 * inline style (AGSC-06-17). The theme's stylesheet stays byte-identical to the main site's
 * own copy (`theme.js`), which is why these rules are a file of their own.
 *
 * @returns {string} LF line ends, exactly one LF at the end.
 */
function stylesheet() {
  const tokensOf = (column) => TOKEN_COLOURS.map((row) => `--q-${row[0]}: ${row[column]};`).join(' ');
  return `${[
    '/* AgenticSystemCore /query/: the editor, the result and its picture (AGSC-06-39). Same origin, no inline style (AGSC-06-17). */',
    `:root { ${tokensOf(1)} }`,
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) { ${tokensOf(2)} }\n}`,
    `:root[data-theme="dark"] { ${tokensOf(2)} }`,
    '.query[hidden], #query-result[hidden], .query-picture[hidden], .query-downloads [hidden], button[data-example][hidden] { display: none; }',
    'main > .query, main > #query-result { max-width: none; }',
    '/* The editor: a text area over a coloured copy of its text; the copy shows only once the script colours it. */',
    '.query-editor { position: relative; margin: 0 0 0.75rem; }',
    '.query-editor textarea, .query-mirror { display: block; box-sizing: border-box; width: 100%; min-height: 12rem; margin: 0; padding: 0.6rem 0.75rem;',
    '  font-family: ui-monospace, "SF Mono", Consolas, "Liberation Mono", monospace; font-size: 0.9rem; line-height: 1.5; tab-size: 2;',
    '  white-space: pre-wrap; overflow-wrap: anywhere; border: 1px solid var(--control); border-radius: 4px; }',
    '.query-editor textarea { color: var(--fg); background: var(--bg); resize: vertical; }',
    '.query-mirror { position: absolute; inset: 0; overflow: hidden; color: var(--fg); background: var(--bg); pointer-events: none; }',
    '.query-mirror code { font: inherit; background: none; padding: 0; }',
    '.query-editor:not(.is-coloured) .query-mirror { display: none; }',
    '.query-editor.is-coloured textarea { position: relative; color: transparent; background: transparent; caret-color: var(--fg); }',
    '.query-editor.is-coloured textarea::selection { color: var(--bg); background: var(--accent); }',
    '.query-editor textarea:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }',
    ...TOKEN_COLOURS.map((row) => `.query-mirror .q-${row[0]} { color: var(--q-${row[0]}); }`),
    '.query-mirror .q-keyword { font-weight: 650; }',
    '.query-mirror .q-comment { font-style: italic; }',
    '.query-tools, .query-downloads { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: center; margin: 0 0 1rem; }',
    '.query button { font: inherit; color: var(--fg); background: var(--bg-alt); border: 1px solid var(--control); border-radius: 4px; padding: 0.2rem 0.75rem; min-height: 24px; cursor: pointer; }',
    '.query button:disabled { color: var(--muted); cursor: not-allowed; }',
    '.query-examples button { font: inherit; color: var(--fg); background: var(--bg-alt); border: 1px solid var(--control); border-radius: 4px; padding: 0.15rem 0.6rem; min-height: 24px; cursor: pointer; }',
    'button:focus-visible, .query-downloads a:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }',
    '.query-examples > li { margin: 0 0 1.25rem; }',
    '/* A long line of an example or of the prefixes wraps, so no block scrolls out of reach of the keyboard. */',
    '.query-examples pre, #vocabulary pre { white-space: pre-wrap; overflow-wrap: anywhere; }',
    '.query-examples .question { margin: 0 0 0.35rem; font-weight: 600; }',
    '.query-table caption { text-align: left; caption-side: top; padding: 0 0 0.5rem; color: var(--muted); }',
    '.query-table td { font-family: ui-monospace, "SF Mono", Consolas, "Liberation Mono", monospace; font-size: 0.85rem; overflow-wrap: anywhere; }',
    '#vocabulary .table-wrap:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }',
    '.query-boolean { font-size: 1.1rem; font-weight: 600; }',
    '/* The picture of a graph result: the explorer\'s scene writer, drawn with these rules. */',
    '.query-picture { border: 1px solid var(--rule); border-radius: 4px; background: var(--bg-alt); padding: 0.5rem; }',
    '.query-picture figcaption { color: var(--muted); font-size: 0.9rem; margin: 0.5rem 0 0; }',
    '.query-svg { display: block; width: 100%; height: auto; }',
    '.query-svg .link { stroke: var(--muted); stroke-width: 1.2; }',
    '.query-svg .node { fill: var(--q-prefixed); stroke: var(--bg-alt); stroke-width: 1.5; }',
    '.query-svg .t-literal { fill: var(--q-string); }',
    '.query-svg .t-blank { fill: var(--q-comment); }',
    '.query-svg .label { fill: var(--fg); font-size: 12px; }',
    '@media (pointer: coarse) {\n  .query button, .query-examples button { min-height: 44px; }\n}',
  ].join('\n')}\n`;
}

/**
 * A table of the vocabulary, its rows already escaped. Its wrapper is a labelled region in the
 * tab order: on a phone screen a wide table scrolls there, and a region that scrolls must be
 * reachable by keyboard (WCAG 2.1.1), as a scrolling diagram is (`html.js`).
 */
function table(id, caption, headings, rows) {
  return [`<div class="table-wrap" tabindex="0" role="region" aria-labelledby="${id}-caption"><table id="${id}">`, `<caption id="${id}-caption">${caption}</caption>`,
    `<thead><tr>${headings.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead>`,
    `<tbody>\n${rows.map((cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('\n')}\n</tbody>`,
    '</table></div>'].join('\n');
}

const code = (text) => `<code>${escapeHtml(text)}</code>`;

/** An IRI as the page writes it: by the result table's own rule (`view.js#queryShortName`), else in full. */
const shortName = (iri) => view.queryShortName(iri, PAGE_PREFIXES) || iri;

/**
 * The site vocabulary's part of the explorer (AGSC-06-39 (f), AGSC-05-38): its classes and
 * its relations, each with its label, what it is a kind of and its meaning.
 *
 * @param {{ontology:object|null, classes:object[], relations:object[]}} terms `query-examples.js#siteTerms`
 * @returns {string[]} lines
 */
function siteVocabularyPart(terms) {
  const named = terms.ontology === null ? 'its site vocabulary'
    : `its site vocabulary, ${terms.ontology.label === null ? '' : `“${escapeHtml(terms.ontology.label)}”, `}${code(terms.ontology.iri)}`;
  const kinds = (parents) => parents.map((p) => code(shortName(p))).join(' ');
  const text = (value) => (value === null ? '' : escapeHtml(value));
  const counted = (n, one, many) => `The ${n} ${n === 1 ? one : many} of this node.`;
  return ['<h3 id="vocabulary-site">Vocabulary of this node</h3>',
    `<p>This node adds classes and relations of its own, in ${named}. Each class is a kind of one of the classes above and each relation a kind of one of the fourteen relations; the tables name which.</p>`,
    table('vocabulary-site-class-table', counted(terms.classes.length, 'class', 'classes'), ['Class', 'Label', 'Kind of', 'Meaning'],
      terms.classes.map((t) => [code(t.iri), text(t.label), kinds(t.parents), text(t.meaning)])),
    table('vocabulary-site-relation-table', counted(terms.relations.length, 'relation', 'relations'), ['Property', 'Label', 'Kind of', 'Inverse', 'Meaning'],
      terms.relations.map((t) => [code(t.iri), text(t.label), kinds(t.parents), t.inverse === null ? '' : code(t.inverse), text(t.meaning)]))];
}

/**
 * The vocabulary explorer (AGSC-06-39 (f)): the classes, then the fourteen keys in the
 * order of AGSC-03-01, each with its property and its plain meaning, then the node's own
 * classes and relations where it has a site vocabulary, then the prefixes the examples use.
 *
 * @param {Array<{term:string, kind:string}>} ontologyTerms the vocabulary's terms.
 * @param {object|null} [siteTerms] the site vocabulary's terms (`query-examples.js#siteTerms`), or null.
 * @returns {string}
 */
function vocabularySection(ontologyTerms, siteTerms = null) {
  const classes = (ontologyTerms || []).filter((t) => t.kind === 'class').map((t) => t.term);
  return ['<section id="vocabulary" aria-labelledby="vocabulary-heading">',
    '<h2 id="vocabulary-heading">Vocabulary</h2>',
    '<p>The classes and the relations of the graph, by the names a query uses. Every item of this node is in <code>/graph.nq</code> under one of these classes, and each link between two items is one of these relations.</p>',
    '<h3 id="vocabulary-classes">Classes</h3>',
    table('vocabulary-class-table', `The ${classes.length} classes of the vocabulary.`, ['Class', 'IRI'],
      classes.map((term) => [code(`asc:${term}`), code(`${PREFIXES.asc}${term}`)])),
    '<h3 id="vocabulary-relations">Relations</h3>',
    table('vocabulary-relation-table', `The ${RELATIONS.length} relations an item may name, in the order of the specification.`, ['Key', 'Property', 'Meaning'],
      RELATIONS.map((row) => [code(row.key), code(row.property), escapeHtml(row.meaning)])),
    ...(siteTerms === null ? [] : siteVocabularyPart(siteTerms)),
    '<h3 id="vocabulary-prefixes">Prefixes</h3>',
    `<pre><code>${Object.entries(PAGE_PREFIXES).sort().map(([p, ns]) => escapeHtml(`PREFIX ${p}: <${ns}>`)).join('\n')}</code></pre>`,
    '</section>'].join('\n');
}

/** One example: its question, its query, the sentence under it, and the button that puts the query into the editor. */
function example(id, question, query, note) {
  const described = note === null ? `${id}-question` : `${id}-question ${id}-note`;
  return [`<li id="${id}">`,
    `<p class="question" id="${id}-question">${escapeHtml(question)}</p>`,
    `<pre><code id="${id}-query">${escapeHtml(query)}</code></pre>`,
    ...(note === null ? [] : [`<p class="example-note" id="${id}-note">${escapeHtml(note)}</p>`]),
    `<button type="button" data-example="${id}-query" aria-describedby="${described}" hidden>Put this query in the editor</button>`,
    '</li>'].join('\n');
}

/**
 * The examples (AGSC-06-39 (b)): each of the ten questions with the query that defines it,
 * filled in from the node, then the node's own competency questions (AGSC-05-41).
 *
 * @param {{prefixes:Array<string>, questions:Array<{number:number, question:string, sparql:string}>}} questions
 *   the data file of the ten questions.
 * @param {{values:object[], iriOf:Function, titleOf:Function, siteQuestions:object[]}} node what the
 *   examples read of the node (`files`).
 * @returns {string}
 */
function examplesSection(questions, node) {
  const ten = questions.questions.map((q, k) => example(`example-${q.number}`, `${q.number}. ${q.question}`,
    queryExamples.exampleText(q, questions.prefixes, node.values[k], node.iriOf), queryExamples.exampleNote(node.values[k], node.titleOf)));
  const own = node.siteQuestions.length === 0 ? [] : ['<h3 id="examples-site">Questions of this node</h3>',
    '<p>This node states questions of its own about its field, each with the query that answers it. The node checks their answers over the graph together with what its vocabulary implies; this page runs them over <code>/graph.nq</code> alone, so an answer that rests on an implied statement can be shorter here.</p>',
    '<ol class="query-examples">', ...node.siteQuestions.map((q) => example(`example-site-${q.id}`, q.question, q.query, null)), '</ol>'];
  return ['<section id="examples" aria-labelledby="examples-heading">',
    '<h2 id="examples-heading">Examples: the ten questions of the graph</h2>',
    '<p>The specification names ten questions that the graph of every node must answer. Each comes with the query that defines it, in which <code>?x</code> stands for the item you ask about, <code>&lt;S...&gt;</code> for a selection of items and <code>"T"</code> for an instant. Here they are filled in from this node, and the sentence under each query says with what: put your own in their place to ask about something else.</p>',
    '<ol class="query-examples">', ...ten, '</ol>', ...own, '</section>'].join('\n');
}

/**
 * The page's body: the sentence for a reader without script, the editor, the result, the
 * examples and the vocabulary, then the script.
 *
 * @param {object} input
 * @param {object} input.questions the data file of the ten questions.
 * @param {Array<object>} input.ontologyTerms the vocabulary's terms.
 * @param {object} input.node what the examples read of the node (`examplesSection`).
 * @param {object|null} input.siteTerms the site vocabulary's terms, or null.
 * @returns {string}
 */
function body({ questions, ontologyTerms, node, siteTerms }) {
  return ['<p>Write a query in SPARQL 1.1 and run it against the published graph of this node, <code>/graph.nq</code>. The query runs in this page, in your browser: no server takes part, nothing you write is sent anywhere and nothing is stored, not even the last query.</p>',
    '<p id="query-noscript">This page needs JavaScript to run a query. Without it, the examples and the vocabulary below still read, and every query gives the same answer in a SPARQL 1.1 store loaded with <code>/graph.nq</code> that reads the union of its graphs as the default graph (every statement of <code>/graph.nq</code> is in this node\'s named graph).</p>',
    '<section id="query" class="query" aria-labelledby="query-heading" data-answers="SELECT ASK CONSTRUCT DESCRIBE" data-refuses="update SERVICE" hidden>',
    '<h2 id="query-heading">Ask the graph</h2>',
    '<p>The page answers <code>SELECT</code>, <code>ASK</code>, <code>CONSTRUCT</code> and <code>DESCRIBE</code>. It refuses an update (<code>INSERT</code>, <code>DELETE</code>, <code>LOAD</code> and the others) and a <code>SERVICE</code> clause before anything runs, because it changes nothing and asks no other server. A query runs over every statement of the node, the union of the graphs of <code>/graph.nq</code>, unless it names its own dataset with <code>FROM</code>.</p>',
    '<p id="query-status" role="status" aria-live="polite"></p>',
    '<label for="query-text">Query (SPARQL 1.1)</label>',
    '<div class="query-editor"><pre class="query-mirror" aria-hidden="true"><code id="query-mirror"></code></pre>',
    `<textarea id="query-text" rows="10" spellcheck="false" autocomplete="off" autocapitalize="off" aria-describedby="query-keys">${escapeHtml(FIRST_QUERY)}</textarea></div>`,
    '<p id="query-keys">Ctrl+Enter (Cmd+Enter on a Mac) runs the query; Tab leaves the editor. Stop ends a long query.</p>',
    '<div class="query-tools">',
    '<button type="button" id="query-run" disabled>Run</button>',
    '<button type="button" id="query-stop" disabled>Stop</button>',
    `<a id="query-share" href="${escapeHtml(view.queryShareHref(FIRST_QUERY))}">Link to this query</a>`,
    '</div>',
    '<p>The link holds the query after the <code>#</code> of its address, a part no browser sends to a server. Opening it puts the query into the editor; it runs only when you select Run.</p>',
    '</section>',
    '<section id="query-result" aria-labelledby="query-result-heading" hidden>',
    '<h2 id="query-result-heading">Result</h2>',
    '<p class="query-downloads"><a id="query-csv" data-format="csv" hidden>Download the result as CSV</a>',
    '<a id="query-json" data-format="json" hidden>Download the result as JSON</a>',
    '<span id="query-csv-none" hidden>A yes-or-no answer has no CSV form; the JSON file holds it.</span></p>',
    '<p>The files follow the W3C Recommendations “SPARQL 1.1 Query Results CSV and TSV Formats” and “SPARQL 1.1 Query Results JSON Format”. A <code>CONSTRUCT</code> or <code>DESCRIBE</code> result is given as its triples, one row each, in the columns subject, predicate and object. The CSV file holds each value as the query gave it: a spreadsheet may run a value that starts with <code>=</code>, <code>+</code>, <code>-</code> or <code>@</code> as a formula, so import the file with its columns as text.</p>',
    '<div id="query-table" class="table-wrap"></div>',
    '<figure id="query-picture" class="query-picture" hidden></figure>',
    '</section>',
    examplesSection(questions, node),
    vocabularySection(ontologyTerms, siteTerms),
    engineLine(),
    `<script src="${SCRIPT_ROUTE}" defer></script>`].join('\n');
}

/** The line that names the engine the page runs and links the licence texts it serves beside it. */
function engineLine() {
  const link = (served, words) => `<a href="${ENGINE.route}${served}">${words}</a>`;
  return `<p class="query-engine">The query engine is ${ENGINE.name} ${ENGINE.version}, under ${link('LICENSE-MIT.txt', 'the MIT licence')} or ${link('LICENSE-APACHE.txt', 'the Apache License 2.0')}, at your option; ${link('THIRD-PARTY.txt', 'the crates compiled into it')} are listed with the licence each is taken under and its licence text.</p>`;
}

/**
 * Whether a build writes `/query/` (AGSC-06-39): on a build that writes pages, for a node
 * that serves `/graph.nq`, unless `site.query_page` is `false`, and only with the engine
 * and the questions, which the application layer hands in (`agsc build` always does).
 * Otherwise the line of the build's `skipped` list that says why, or null on a build that
 * writes no page at all, which says so once for every page.
 *
 * @param {{site:object, graphServed:boolean, input:(object|undefined), pages:boolean}} facts
 * @returns {{on:boolean, skipped:(string|null)}}
 */
function decision({ site, graphServed, input, pages }) {
  if (!pages) return { on: false, skipped: null };
  if (site.query_page === false) return { on: false, skipped: '/query/ (site.query_page is false, so the node keeps the route set of 1.0; AGSC-06-39, AGSC-01-18)' };
  if (!graphServed) return { on: false, skipped: '/query/ (the node serves no /graph.nq, the one file the page reads; AGSC-06-39)' };
  if (input === undefined) return { on: false, skipped: '/query/ (the build was given no query engine and no example questions; `agsc build` gives both; AGSC-06-39)' };
  return { on: true, skipped: null };
}

/**
 * What the examples read of the node: the values each of the ten questions is asked with,
 * the IRI and the title of an item by its slug, and the node's own competency questions.
 *
 * @param {object} input see `files`.
 * @returns {{values:object[], iriOf:Function, titleOf:Function, siteQuestions:object[]}}
 */
function nodeFacts({ items = [], base = '', instant = null, domain = null }) {
  const bySlug = new Map(items.map((item) => [item.slug, item]));
  return {
    iriOf: (slug) => itemIri(bySlug.get(slug), { base }),
    siteQuestions: queryExamples.siteQuestions(domain === null ? null : domain.questions),
    titleOf: (slug) => (bySlug.get(slug).title == null ? slug : String(bySlug.get(slug).title)),
    values: queryExamples.exampleValues(items, instant),
  };
}

/**
 * What `/query/` is, as files: the page, its scripts and stylesheet, and the engine's files.
 *
 * @param {object} input
 * @param {Map<string,Buffer>} input.engine each engine file's bytes, by its `source` name.
 * @param {Buffer|string} input.questions the bytes of the data file of the ten questions.
 * @param {Array<object>} input.ontologyTerms the vocabulary's terms.
 * @param {string} [input.specVersion] for the scripts' banner.
 * @param {Array<object>} [input.items] the items of the published projection (AGSC-06-30), as `/graph.nq` holds them.
 * @param {string} [input.base] the node's `site.base`, for the item IRIs (AGSC-05-01).
 * @param {string} [input.instant] the build's instant (AGSC-04-09), for question 9.
 * @param {{questions:(string|null), vocabulary:(object|null)}|null} [input.domain] the node's domain layer:
 *   the text of its competency questions and its site vocabulary as `knowledge/domain.js#load` reads it.
 * @param {object} pageOptions the node's page options, for its shell (`html.js#shell`).
 * @returns {Array<[string,(string|Buffer)]>} route → text or bytes.
 */
function files(input, pageOptions) {
  const { engine, questions, ontologyTerms, specVersion, domain = null } = input;
  const page = shell({
    ...pageOptions,
    body: body({
      node: nodeFacts(input),
      ontologyTerms,
      questions: JSON.parse(String(questions)),
      siteTerms: queryExamples.siteTerms(domain === null ? null : domain.vocabulary),
    }),
    description: 'Ask the published graph of this node a question in SPARQL, in this page: no server takes part, and nothing is sent or stored.',
    route: ROUTE,
    stylesheets: [STYLESHEET_ROUTE],
    title: 'Query',
  });
  return [[`${ROUTE}index.html`, page], [SCRIPT_ROUTE, script({ specVersion })], [WORKER_ROUTE, workerScript({ specVersion })],
    [STYLESHEET_ROUTE, stylesheet()], ...ENGINE.files.map((f) => [`${ENGINE.route}${f.served}`, engine.get(f.source)])];
}

module.exports = {
  ENGINE, ENGINE_SOURCES, FIRST_QUERY, FRAME, GRAPH_ROUTE, MAX_NODES, ROUTE, ROWS_SHOWN, SCRIPT_ROUTE, STYLESHEET_ROUTE, WORKER_ROUTE,
  decision, examplesSection, files, script, stylesheet, vocabularySection, workerScript,
};
