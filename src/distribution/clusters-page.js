'use strict';
// CONTEXT Distribution (Emission) — Surface: what `/clusters/` carries beyond its list.
//
// AGSC-06-38: "`/clusters/` carries the overview of all clusters and a legend of the
// fourteen keys with their meanings", and "a relation filter needs no script, and no
// route is added". Below the list of clusters (the index page of AGSC-06-01) the page
// gets, in this order:
//
//   1. the overview (`graph-view.js#overviewSection`): a figure of how the clusters
//      connect and its table, filtered by relation through radio buttons and the rules of
//      the page's stylesheet, with no script;
//   2. the legend (`graph-view.js#legendSection`): the fourteen keys with the key each
//      reads by backwards and the plain meaning of AGSC-03-01;
//   3. the explorer (`explorer/page.js#section`), when the build emits `/graph.jsonld`,
//      which is the one file it reads: a picture of the whole published graph with a list,
//      a find box, a detail panel and a tooltip. Its section starts hidden and only its
//      script shows it, so a reader without script meets nothing that cannot work.
//
// The page loads two same-origin files of its own (AGSC-06-01: the files a page loads are
// part of that page, not routes): `/clusters/agsc-explorer.css`, which the relation filter
// needs whether or not the explorer is there, and `/clusters/agsc-explorer.js`. Only the
// first page of a paginated list (AGSC-06-21) carries the additions.
//
// Pure: the build (`site.js`) hands in the published items, the graph view's index and the
// node's context, and puts the files this returns.

const graphView = require('./graph-view.js');
const html = require('./html.js');
const explorer = require('./explorer/page.js');

/** The route of the page that carries the additions. */
const ROUTE = '/clusters/';

/**
 * What `/clusters/` adds, and the files it loads.
 *
 * @param {object} input
 * @param {Array<object>} input.items the published items, in the published order.
 * @param {ReturnType<typeof graphView.index>} input.views the graph view's index of them.
 * @param {object|null} input.contextObject the node's context (`/ns/context.jsonld`).
 * @param {boolean} input.graphEmitted whether the build emits `/graph.jsonld`.
 * @param {string} [input.specVersion] for the script's banner.
 * @returns {{render:Function, assets:Array<[string,string]>, findings:Array<object>}}
 *   `render` writes an index page of the cluster list as `html.indexPage` does.
 */
function view({ items, views, contextObject, graphEmitted, specVersion }) {
  const overview = graphView.overviewSection(items.filter((i) => i.type === 'cluster'), views);
  const after = [overview.html, graphView.legendSection(), graphEmitted ? explorer.section() : '']
    .filter((part) => part !== '').join('\n');
  const assets = [[explorer.STYLESHEET_ROUTE, explorer.stylesheet()]];
  if (graphEmitted) assets.push([explorer.SCRIPT_ROUTE, explorer.script({ relations: explorer.relationTerms(contextObject), specVersion })]);
  const render = (page, options) => (options.route === ROUTE
    ? html.indexPage({ ...page, after }, { ...options, stylesheets: [explorer.STYLESHEET_ROUTE] })
    : html.indexPage(page, options));
  return { assets, findings: overview.findings, render };
}

module.exports = { ROUTE, view };
