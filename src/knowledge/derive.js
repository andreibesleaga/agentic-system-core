'use strict';
// src/knowledge/derive.js — CONTEXT Knowledge, the readings of the Link graph.
// Implements AGSC-05-33 (with AGSC-03-01's Transitive reading column).
//
// PURE: no fs, no process, no clock, no network. It takes the edges `links.resolve`
// returns and gives back the relations the graph holds without anyone having authored
// them, each with its reasons. Nothing here is written to a graph file, and no reading
// changes a composition (AGSC-03-18, AGSC-07-10): the result is computed, on demand.
//
// A reading is `{source, key, target, because}`; `because` is a non-empty list of steps
// `{rule, from}`, `from` being the edges `[source, key, target]` the step used, the same
// shape as the explanation path of AGSC-07-04.
//   inverse     the computed inverse of an authored edge             (a)
//   symmetric   the other direction of related / excludes / contradicts   (b)
//   transitive  a chain of two or more edges of one transitive key   (c)
//   closure     the same chain for `requires` and `required-by`      (d)

const { compareCodePoint } = require('./unicode.js');
const { RELATIONS, SYMMETRIC } = require('./relations.js');

/** Every name an edge can carry -> the name of the edge it was computed from. */
const PARTNER = Object.freeze(Object.fromEntries(
  RELATIONS.flatMap((r) => [[r.key, r.inverse], [r.inverse, r.key]])));

/** AGSC-05-33 (c): a transitive key and its computed inverse. `requires` and its inverse are (d). */
const CHAIN_KEYS = Object.freeze([...new Set(RELATIONS.filter((r) => r.transitive)
  .flatMap((r) => [r.key, r.inverse]))].sort(compareCodePoint));
const CLOSURE_KEYS = Object.freeze(new Set(['requires', 'required-by']));

/** AGSC-05-33 (a) and (b): each computed edge that is the inverse or the swap of an authored one. */
function directReadings(edges) {
  return edges.filter((e) => e.computed && PARTNER[e.key] !== undefined).map((e) => ({
    source: e.source,
    key: e.key,
    target: e.target,
    because: [{
      rule: SYMMETRIC.has(e.key) ? 'symmetric' : 'inverse',
      from: [[e.target, PARTNER[e.key], e.source]],
    }],
  }));
}

/** The outgoing neighbours of each item over the edges of one key, in code-point order. */
function adjacencyOf(edges, key) {
  const adjacency = new Map();
  for (const e of edges.filter((x) => x.key === key)) {
    if (!adjacency.has(e.source)) adjacency.set(e.source, new Set());
    adjacency.get(e.source).add(e.target);
  }
  return adjacency;
}

/**
 * Breadth-first walk from `start`, each frontier expanded in code-point order, keeping for
 * each item the predecessor it was first reached from: shortest chains, the same everywhere.
 *
 * @returns {Map<string, {from: string, depth: number}>} every item reached, with its predecessor.
 */
function walkFrom(adjacency, start) {
  const reached = new Map([[start, { from: null, depth: 0 }]]);
  let frontier = [start];
  for (let depth = 1; frontier.length > 0; depth += 1) {
    const next = [];
    for (const node of frontier) {
      for (const target of [...(adjacency.get(node) || [])].sort(compareCodePoint)) {
        if (reached.has(target)) continue;
        reached.set(target, { from: node, depth });
        next.push(target);
      }
    }
    frontier = next.sort(compareCodePoint);
  }
  return reached;
}

/** The chain of edges from the start of `reached` to `target`, in order. */
function chainTo(reached, key, target) {
  const chain = [];
  for (let node = target; reached.get(node).from !== null; node = reached.get(node).from) {
    chain.unshift([reached.get(node).from, key, node]);
  }
  return chain;
}

/** AGSC-05-33 (c) and (d): one reading for each pair joined by a chain of two or more edges. */
function chainReadings(edges) {
  const readings = [];
  for (const key of CHAIN_KEYS) {
    const adjacency = adjacencyOf(edges, key);
    for (const source of adjacency.keys()) {
      const reached = walkFrom(adjacency, source);
      for (const [target, step] of reached) {
        if (step.depth < 2) continue;
        readings.push({
          source,
          key,
          target,
          because: [{ rule: CLOSURE_KEYS.has(key) ? 'closure' : 'transitive', from: chainTo(reached, key, target) }],
        });
      }
    }
  }
  return readings;
}

/**
 * AGSC-05-33: the readings of a Link graph, ordered by source, key, target.
 *
 * @param {Array<{source:string, key:string, target:string, computed:boolean}>} edges the edges
 *   of `links.resolve`, authored and computed, in any order.
 * @returns {Array<{source:string, key:string, target:string, because:Array<{rule:string, from:string[][]}>}>}
 */
function readings(edges) {
  return [...directReadings(edges), ...chainReadings(edges)].sort((a, b) =>
    compareCodePoint(a.source, b.source) || compareCodePoint(a.key, b.key) || compareCodePoint(a.target, b.target));
}

module.exports = { readings };
