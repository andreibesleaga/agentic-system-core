'use strict';
// src/knowledge/link-graph.js — CONTEXT Knowledge: the typed Links between published items.
//
// Two writers draw the Links that items author (AGSC-03-01) among the items a node
// publishes (AGSC-06-30): the `mermaid` export adapter (AGSC-01-26a, Interchange) and the
// graph view of item and cluster pages (AGSC-06-38, Distribution). They read the edges,
// the cluster membership and the display title from this one module, so the two
// pictures cannot disagree, and the page writer never imports the exporter (the
// context map forbids Distribution to import Interchange, `.dependency-cruiser.js`).
//
// What it reads: the fourteen Link keys (`relations.js#LINK_KEYS`, never retyped here),
// `title`, `slug`, `type` and `clusters`. A Link value's `#anchor` is dropped, because
// both pictures draw items, not sections. Which items count as published is the
// caller's decision (`chunks.js#isPublished`); this module filters by the set it is given.
//
// PURE: no fs, no process, no clock, no network.

const { LINK_KEYS } = require('./relations.js');
const { compareCodePoint } = require('./unicode.js');

/** The title an item is drawn and named with; its slug when it has none. */
function titleOf(item) {
  return item.title == null || String(item.title) === '' ? String(item.slug) : String(item.title);
}

/**
 * The Links one item authors, once each, in the declared key order (AGSC-03-01) and,
 * within a key, in the authored order. Nothing is filtered: a Link to a draft, to a
 * held-back item or to the item itself is kept, and the caller decides.
 *
 * @param {object} item a flat item.
 * @returns {Array<{source:string, key:string, target:string}>}
 */
function linksOf(item) {
  const seen = new Set();
  const out = [];
  for (const key of LINK_KEYS) {
    for (const value of Array.isArray(item[key]) ? item[key] : []) {
      const target = String(value).split('#')[0];
      const id = `${key}\u0000${target}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ key, source: String(item.slug), target });
    }
  }
  return out;
}

/**
 * Every written Link between two published items, once each, in code-point order of
 * (source, key, target).
 *
 * @param {Array<object>} items flat published items.
 * @param {Map<string,object>} published by slug.
 * @returns {Array<{source:string, key:string, target:string}>}
 */
function edgesOf(items, published) {
  const seen = new Set();
  const edges = [];
  for (const item of items) {
    for (const edge of linksOf(item)) {
      const id = `${edge.source}\u0000${edge.key}\u0000${edge.target}`;
      if (!published.has(edge.target) || seen.has(id)) continue;
      seen.add(id);
      edges.push(edge);
    }
  }
  return edges.sort((a, b) => compareCodePoint(a.source, b.source)
    || compareCodePoint(a.key, b.key)
    || compareCodePoint(a.target, b.target));
}

/** The edges that start or end at `slug`, in their given order. */
function touching(edges, slug) {
  return edges.filter((e) => e.source === slug || e.target === slug);
}

/**
 * The members of a cluster: the items other than clusters whose `clusters[]` names it,
 * in the order of `items` (membership is authored on the item, AGSC-02-19).
 *
 * @param {object} cluster a flat cluster item.
 * @param {Array<object>} items flat items.
 * @returns {Array<object>}
 */
function membersOf(cluster, items) {
  const slug = String(cluster.slug);
  return items.filter((i) => i.type !== 'cluster' && Array.isArray(i.clusters) && i.clusters.map(String).includes(slug));
}

/** The edges whose two ends are both in `slugs`, in their given order. */
function among(edges, slugs) {
  return edges.filter((e) => slugs.has(e.source) && slugs.has(e.target));
}

module.exports = { among, edgesOf, linksOf, membersOf, titleOf, touching };
