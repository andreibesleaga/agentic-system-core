'use strict';
// CONTEXT Distribution (Emission) — the query page of `/query/`: the page's event wiring.
//
// The one part of the page that touches a live document. It starts the worker
// (`engine.js#queryWorkerMain`, which loads `/graph.nq` of this origin into the engine),
// colours the editor, keeps the share link in step with the text, puts an example or the
// query of a share link into the editor without running it, refuses an update or a SERVICE
// clause before the worker is asked, and shows each answer through the pure writers of
// `view.js` and the explorer's layout and scene writer, built into elements by
// `explorerBuild` (text as text, no handler, no style). Every decision is made there and
// unit-tested; what is left here is the browser's part — the worker, timers, object URLs
// for the two downloads, focus — tested in a browser by
// `tests/distribution/query-browser.test.js`.
//
// AGSC-06-05: nothing is stored (no storage API, no cookie, not even the last query) and
// nothing is sent: the worker reads `/graph.nq` and the engine's own files, and the
// downloads are files made in the page (`URL.createObjectURL`), offered through the page's
// own two links. Without script the page keeps its examples and its vocabulary; the
// editor's section starts hidden and only this script shows it.
//
// The page: `#query` (the editor's section; `data-state` reads `loading`, `ready`,
// `running` or `error`, and `data-result` `answered` or `refused` after a run, so a test
// can wait for them), `#query-status`, `#query-text`, `#query-mirror`, `#query-run`,
// `#query-stop`, `#query-share`, `#query-noscript`, `#query-result`, `#query-table`,
// `#query-picture`, `#query-csv`, `#query-json`, `#query-csv-none`, and buttons carrying
// `data-example` (the id of the example's code).
//
// PORTABLE (see `tokens.js`): emitted into the page as its own source text.

const { queryCheck, queryHighlight, queryRefusal } = require('./tokens.js');
const { queryFromHash, queryGraph, queryPictureText, queryShareHref, querySummary, queryTable } = require('./view.js');
const { explorerLayout } = require('../explorer/layout.js');
const { explorerBuild, explorerScene } = require('../explorer/view.js');

/* node:coverage disable */
/**
 * Start the query page, if the page has one.
 *
 * @param {object} win the page's `window`.
 * @param {object} api the page's constants (`query-page.js#script`).
 * @returns {object|null} the running page's controls; null with no page.
 */
function queryMain(win, api) {
  const doc = win.document;
  const byId = (id) => doc.getElementById(id);
  const root = byId('query');
  if (root === null) return null;
  const [status, editor, mirror, run, stop, share, result, table, picture, csv, json, csvNone] = ['query-status', 'query-text',
    'query-mirror', 'query-run', 'query-stop', 'query-share', 'query-result', 'query-table', 'query-picture', 'query-csv',
    'query-json', 'query-csv-none'].map(byId);
  const build = (tree) => explorerBuild(doc, tree);
  const files = { csv: null, json: null };
  const state = { note: 'Write a query, or take an example below, and run it.', pending: null, ready: false, sequence: 0, worker: null };
  const say = (text) => { status.textContent = text; };
  const mark = (name) => root.setAttribute('data-state', name);

  /** The coloured copy and the share link follow the text. */
  const paint = () => {
    mirror.replaceChildren(...queryHighlight(editor.value).map(build));
    mirror.parentNode.scrollTop = editor.scrollTop;
    mirror.parentNode.scrollLeft = editor.scrollLeft;
    share.setAttribute('href', queryShareHref(editor.value));
  };
  const release = () => {
    for (const [key, link] of [['csv', csv], ['json', json]]) {
      if (files[key] !== null) win.URL.revokeObjectURL(files[key]);
      files[key] = null;
      link.removeAttribute('href');
      link.hidden = true;
    }
    csvNone.hidden = true;
  };
  const offer = (key, link, text, type) => {
    files[key] = win.URL.createObjectURL(new win.Blob([text], { type }));
    link.setAttribute('href', files[key]);
    link.hidden = false;
  };
  const draw = (parsed) => {
    const graph = queryGraph(parsed, api.PREFIXES, api.MAX_NODES);
    if (graph === null) { picture.hidden = true; return; }
    const frame = api.FRAME;
    const words = queryPictureText(graph);
    picture.replaceChildren(
      build(['svg', { 'aria-labelledby': 'query-picture-caption', class: 'query-svg', role: 'img', viewBox: `0 0 ${frame.width} ${frame.height}` },
        explorerScene(graph, explorerLayout(graph, frame), { query: '', selected: null })]),
      build(['figcaption', { id: 'query-picture-caption' }, words]));
    picture.hidden = false;
  };
  const show = (answer) => {
    release();
    say(querySummary(answer));
    root.setAttribute('data-result', answer.error === undefined ? 'answered' : 'refused');
    if (answer.error !== undefined) { result.hidden = true; return; }
    const parsed = JSON.parse(answer.json);
    table.replaceChildren(build(queryTable(parsed, api.ROWS_SHOWN, api.PREFIXES)));
    offer('json', json, answer.json, 'application/sparql-results+json');
    if (answer.csv === null) csvNone.hidden = false;
    else offer('csv', csv, answer.csv, 'text/csv;charset=utf-8');
    draw(parsed);
    result.hidden = false;
  };
  const receive = (message) => {
    if (message.type === 'ready') {
      state.ready = true;
      run.disabled = false;
      mark('ready');
      say(`The graph is loaded: ${message.size} statements. ${state.note}`);
    } else if (message.type === 'error') {
      mark('error');
      say(`The graph could not be loaded (${message.message}). The examples below give the same answers in a SPARQL 1.1 store loaded with /graph.nq that reads the union of its graphs as the default graph.`);
    } else if (message.type === 'answer' && message.id === state.pending) {
      state.pending = null;
      stop.disabled = true;
      run.disabled = false;
      mark('ready');
      show(message.answer);
    }
  };
  const start = () => {
    state.ready = false;
    run.disabled = true;
    mark('loading');
    state.worker = new win.Worker(api.WORKER_ROUTE, { type: 'module' });
    state.worker.onmessage = (event) => receive(event.data || {});
    state.worker.onerror = () => {
      mark('error');
      say('The query engine could not start in this browser. The examples below give the same answers in a SPARQL 1.1 store loaded with /graph.nq that reads the union of its graphs as the default graph.');
    };
  };
  const submit = () => {
    const check = queryCheck(editor.value);
    const refused = queryRefusal(check);
    if (refused !== null) { show({ error: refused, form: check.form }); return; }
    if (!state.ready || state.pending !== null) return;
    state.sequence += 1;
    state.pending = state.sequence;
    run.disabled = true;
    stop.disabled = false;
    mark('running');
    say(`Running the ${check.form} query…`);
    state.worker.postMessage({ id: state.pending, text: editor.value, type: 'run' });
  };
  const fill = (text, why) => {
    editor.value = text;
    paint();
    state.note = `${why} Select Run to run it.`;
    say(state.note);
  };
  const fromLink = () => {
    const text = queryFromHash(win.location.hash);
    if (text !== null) fill(text, 'The query of the link is in the editor.');
  };

  root.hidden = false;
  byId('query-noscript').hidden = true;
  editor.parentNode.classList.add('is-coloured');
  editor.addEventListener('input', paint);
  editor.addEventListener('scroll', () => {
    mirror.parentNode.scrollTop = editor.scrollTop;
    mirror.parentNode.scrollLeft = editor.scrollLeft;
  });
  editor.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); submit(); }
  });
  run.addEventListener('click', submit);
  stop.addEventListener('click', () => {
    state.worker.terminate();
    state.pending = null;
    stop.disabled = true;
    say('The query was stopped. The graph is loaded again…');
    start();
  });
  for (const button of doc.querySelectorAll('button[data-example]')) {
    button.hidden = false;
    button.addEventListener('click', () => {
      fill(byId(button.getAttribute('data-example')).textContent, 'The example is in the editor.');
      editor.focus();
    });
  }
  win.addEventListener('hashchange', fromLink);
  paint();
  say('Loading the graph…');
  start();
  fromLink();
  return { submit };
}
/* node:coverage enable */

/** The functions emitted into the page, in order. */
const PORTABLE = Object.freeze(['queryMain']);

module.exports = { PORTABLE, queryMain };
