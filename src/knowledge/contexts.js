'use strict';
// CONTEXT Knowledge — bounded contexts, and the address of a peer of the context map.
//
// Implements the reading half of AGSC-08-32 (which clusters `domain.contexts` declares as
// contexts, each with its own namespace, and the context of an item: the context named by its
// `domain_context`, else the context of its primary cluster when that cluster is declared, else
// none) and the address of a `peers[]` entry of AGSC-11-24 (a plain `https:` string, or from 1.1
// an object `{url, relationship, crosswalk}` whose `url` is that string).
//
// WHY. Several readers need the same answers and none may disagree: the label check of the lint
// (titles unique inside one context, `AGSC-E419`), the site vocabulary (a `domain_type` names a
// class under the namespace of the item's context, `domain.js`), and the context-map file of a
// composition (`composition/context-map.js`, AGSC-07-30). Every writer that named a peer by its
// string in 1.0 (the discovery document, the page footer, the peer citations of the graph, the
// import identity) names it by `peerUrl`, so a typed peer reaches no byte except its address and
// a 1.0 reader sees the same `rel#peer` link (AGSC-11-24).
//
// The faults of the `domain` object are `domain.js#configFindings`'s; the faults of a typed peer
// and its crosswalk are `boundary/federation.js`'s, because the crosswalk is what a client
// applies to results that cross the node's edge.
//
// PURE: plain objects in, frozen values and functions out; no fs, no clock, no network.

/** A `domain.contexts` entry this module reads: a cluster slug and a namespace, both strings. */
function isEntry(entry) {
  return entry !== null && typeof entry === 'object' && typeof entry.cluster === 'string' && typeof entry.namespace === 'string';
}

/**
 * AGSC-01-41: the contexts the configuration declares, in the order of `domain.contexts`. An entry
 * the schema refuses is left out; the schema and `domain.js#configFindings` report it.
 *
 * @param {object} [config] the configuration
 * @returns {ReadonlyArray<{cluster: string, namespace: string}>}
 */
function declared(config) {
  const object = config && config.domain;
  const list = object && Array.isArray(object.contexts) ? object.contexts : [];
  return Object.freeze(list.filter(isEntry).map((entry) => Object.freeze({ cluster: entry.cluster, namespace: entry.namespace })));
}

/** AGSC-01-41: a node *declares contexts* when `domain.contexts` is not empty. */
function declaresContexts(config) {
  return declared(config).length > 0;
}

/**
 * AGSC-08-32: the context of an item, for the contexts `entries` declares. The item is a flat
 * record or a frontmatter object; `clusters[0]` is its primary cluster.
 *
 * @param {ReadonlyArray<{cluster: string}>} entries the declared contexts (`declared`)
 * @returns {(item: object) => (string|null)} the cluster slug of the item's context, or `null`
 */
function contextOf(entries) {
  const names = new Set((entries || []).filter(isEntry).map((entry) => entry.cluster));
  return (item) => {
    if (item === null || typeof item !== 'object') return null;
    if (typeof item.domain_context === 'string' && names.has(item.domain_context)) return item.domain_context;
    const primary = Array.isArray(item.clusters) ? item.clusters[0] : undefined;
    return names.has(primary) ? primary : null;
  };
}

/**
 * AGSC-08-32: the namespace of a declared context.
 *
 * @param {ReadonlyArray<{cluster: string, namespace: string}>} entries the declared contexts
 * @returns {(context: (string|null)) => (string|null)}
 */
function namespaceOf(entries) {
  const namespaces = new Map((entries || []).filter(isEntry).map((entry) => [entry.cluster, entry.namespace]));
  return (context) => (namespaces.has(context) ? namespaces.get(context) : null);
}

/**
 * AGSC-10-12 / AGSC-11-24: the address of a `peers[]` entry — the string itself, or the `url` of
 * the typed form. Anything else is returned as its string, as 1.0 did, for the schema to refuse.
 */
function peerUrl(entry) {
  if (entry !== null && typeof entry === 'object' && typeof entry.url === 'string') return entry.url;
  return String(entry);
}

/** The addresses of `peers[]`, in its order; `[]` when there is no array. */
function peerUrls(peers) {
  return Array.isArray(peers) ? peers.map(peerUrl) : [];
}

/** AGSC-11-24: whether a `peers[]` entry is in the typed form (an object, not the plain string). */
function isTypedPeer(entry) {
  return entry !== null && typeof entry === 'object' && !Array.isArray(entry);
}

/** AGSC-11-24: the entries of `peers[]` in the typed form, in their order. */
function typedPeers(config) {
  const peers = config && Array.isArray(config.peers) ? config.peers : [];
  return Object.freeze(peers.filter(isTypedPeer));
}

module.exports = { contextOf, declared, declaresContexts, isTypedPeer, namespaceOf, peerUrl, peerUrls, typedPeers };
