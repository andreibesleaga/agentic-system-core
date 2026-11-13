'use strict';
// CONTEXT Distribution (Emission) — the views 1.1 adds to a build, kept out of
// `site.js#buildSite` so that it stays inside the size budgets of `eslint.config.js`: the
// site vocabulary (AGSC-05-38), what an item page shows beyond its body (AGSC-06-01,
// AGSC-06-38, AGSC-07-25), the `/tags/<tag>/` index and the sentence of an empty type
// folder (AGSC-06-01, AGSC-06-02), and the facts `/query/` is built from (AGSC-06-39).
// Pure: no port and no I/O; `site.js` writes what these return.

const domainLayer = require('../knowledge/domain.js');
const linkGraph = require('../knowledge/link-graph.js');
const search = require('./search.js');
const pageGraph = require('./graph-view.js');
const domainView = require('./domain-view.js');
const architectureBrief = require('./architecture-brief.js');

/**
 * How many members a cluster page lists. AGSC-06-21 paginates an INDEX route above 500 entries
 * and says an item page "is never paginated"; a cluster page is an item page under the same 100 KB
 * budget (1,000 members in full measured 158 KB), so the list stops at the rule's bound.
 */
const CLUSTER_MEMBERS_SHOWN = search.ITEMS_PER_SHARD;

/**
 * AGSC-05-38/05-39: a node that uses the domain layer publishes its site vocabulary in the graph
 * files and its items' domain triples; with no vocabulary nothing is added (`null`).
 */
function siteVocabularyOf(bundle, config) {
  return bundle.domain && typeof bundle.domain.vocabulary === 'string'
    ? domainLayer.load(bundle.domain.vocabulary, { contexts: (config.domain || {}).contexts })
    : null;
}

/**
 * AGSC-05-39 as amended 2026-11-10: the model the graph writer reads the domain keys with — the
 * site vocabulary, or, on a node whose configuration has a `domain` object and no vocabulary
 * file, an empty one, so that `domain_role` and `domain_context` still add their triples while
 * `domain_type` and `domain_links`, which name terms of the vocabulary, add none. `null` with
 * no `domain` object.
 */
function graphDomainOf(config, siteVocabulary) {
  if (siteVocabulary !== null) return siteVocabulary;
  const object = config.domain;
  return object !== null && typeof object === 'object' ? domainLayer.load('', { contexts: object.contexts }) : null;
}

/**
 * AGSC-06-39: what `/query/` is built from — the engine's files and the ten questions the
 * application layer hands in, the vocabulary terms, and, to fill the examples in from the
 * node, the items `/graph.nq` holds (AGSC-06-30), the build's instant and `site.base`; on a
 * node with a domain layer, the text of its competency questions and its site vocabulary.
 */
function queryPageFacts(options, { base, bundle, instant, pageItems, siteVocabulary, specVersion }) {
  return {
    ...options.queryPage, base, instant, items: pageItems, ontologyTerms: options.ontologyTerms, specVersion,
    domain: bundle.domain ? { questions: bundle.domain.questions, vocabulary: siteVocabulary } : null,
  };
}

/**
 * AGSC-06-01: the `/tags/<tag>/` index of the listed items — each tag with the entries that
 * carry it, in the order first met — and each tag's route, which an item page links so that
 * every tag page is reachable.
 */
function tagIndex(items, entryOf) {
  const tags = new Map();
  for (const item of items) {
    for (const tag of Array.isArray(item.tags) ? item.tags.map(String) : []) {
      if (!tags.has(tag)) tags.set(tag, []);
      tags.get(tag).push(entryOf(item));
    }
  }
  return { tags, routes: new Map([...tags.keys()].map((tag) => [tag, `/tags/${tag}/`])) };
}

/** What an empty type folder says instead of an empty list; the folder still resolves (AGSC-06-02). */
function emptyFolder(plural) {
  return `This node publishes no ${plural}. <a href="/search/">The search page</a> lists every item it publishes.`;
}

/**
 * What the item pages of one build show beyond their body and head, and what the routes that
 * list items read from the same indexes. `itemParts(item)` gives the options of `html.itemPage`:
 * the tag links, the metadata list's Cluster row (each named cluster, linked when published), a
 * cluster's members (in the published order, up to `CLUSTER_MEMBERS_SHOWN`) and map, the
 * relations table with the backlinks and the domain parts (AGSC-06-38), and an architecture's
 * brief (AGSC-07-25), with the findings of the two sections.
 *
 * @param {object} input `{bundle, config, entryOf, instant, items, pageItems, routeOf, siteVocabulary}`:
 *   `items` are the listed items, `pageItems` every item with a page (AGSC-11-22).
 * @returns {{itemParts: function(object): {findings: Array<object>, options: object},
 *   membersOf: function(object): Array<object>, scripts: object, tags: Map<string, Array<object>>, views: object}}
 */
function itemViews({ bundle, config, entryOf, instant, items, pageItems, routeOf, siteVocabulary }) {
  // AGSC-06-01: one `/tags/<tag>/` page per tag a listed item carries; an item page links each of its tags.
  const { tags, routes: tagRoutes } = tagIndex(items, entryOf);
  const publishedBySlug = new Map();
  for (const i of pageItems) if (!publishedBySlug.has(i.slug)) publishedBySlug.set(i.slug, i);
  // AGSC-06-38: the graph view reads the listed items only (AGSC-06-30); `domain-view.js` adds the domain parts.
  const { views, ...domainPages } = domainView.pages({ bundle, config, items, model: siteVocabulary, routeOf });
  const membersOf = (cluster) => linkGraph.membersOf(cluster, items).map(entryOf);
  const clusterRow = (slug) => {
    const cluster = publishedBySlug.get(String(slug));
    return cluster === undefined || cluster.type !== 'cluster' ? { title: String(slug) } : { href: routeOf(cluster), title: cluster.title == null ? cluster.slug : cluster.title };
  };
  const clusterParts = (item, map) => {
    const all = membersOf(item);
    return { members: all.slice(0, CLUSTER_MEMBERS_SHOWN), membersTotal: all.length, clusterMap: map.html };
  };
  const itemParts = (item) => {
    const relations = domainPages.itemSection(item);
    const clusterMap = item.type === 'cluster' ? pageGraph.clusterSection(item, views) : { findings: [], html: '' };
    return {
      findings: [...relations.findings, ...clusterMap.findings],
      options: {
        tagRoutes,
        ...(item.type === 'cluster' ? clusterParts(item, clusterMap) : {}),
        clusters: (Array.isArray(item.clusters) ? item.clusters : []).map(clusterRow),
        relations: relations.html,
        brief: architectureBrief.section(item, { instant, items, route: routeOf }),
      },
    };
  };
  return { itemParts, membersOf, scripts: domainPages.scripts, tags, views };
}

module.exports = { CLUSTER_MEMBERS_SHOWN, emptyFolder, graphDomainOf, itemViews, queryPageFacts, siteVocabularyOf };
