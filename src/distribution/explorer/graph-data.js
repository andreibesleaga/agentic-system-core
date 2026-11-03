'use strict';
// CONTEXT Distribution (Emission) — the explorer of `/clusters/`: reading the published graph.
//
// The explorer (AGSC-06-38: the overview of all clusters, as a picture a visitor can move
// through) is one more reader of `/graph.jsonld`, the node's own published graph. It draws
// from that file and nothing else. A draft and an item held back by the `releases`
// switchboard are absent from the file. A retired item is in it (AGSC-11-22 keeps it in
// the graph exports, with `asc:retiredAt`), so the explorer leaves out every entry that
// carries `retiredAt` or the status `retired`: AGSC-06-38 neither draws nor names it.
//
// What is drawn. Every entry of the graph typed by one of the six item types of AGSC-00-05
// (Concept, Procedure, Lesson, Episode, Gate, Cluster) whose IRI is an item route of this
// site — so neither the Bundle, nor a Source or an attachment, nor a class or property of
// the specification or of a site vocabulary (AGSC-05-38), which the file also carries on a
// node that uses the domain layer; every `member` link from a cluster to an item;
// and every Link of the fourteen keys of AGSC-03-01, read through the FORWARD property of
// each key under the term the node's own context gives it (`relations`). The computed
// inverses of AGSC-05-16 restate the same links backwards and are not drawn twice; a
// symmetric key is drawn once per pair; a link to an IRI outside the graph is not drawn.
//
// A node's page is the part of its IRI after the Bundle's IRI, kept only when it has the
// shape of an item route of this site (`/<segment>/…/`), so every link the explorer writes
// is a same-origin route and never an address read out of the document as it stands.
//
// PORTABLE: each function below is emitted into the page as its own source text
// (`page.js`), so the page runs exactly what `tests/distribution/explorer/` tests. A
// portable function names no module-scope binding and requires nothing; the only free
// names are the language's own and the other functions of `PORTABLE`
// (`tests/arch/explorer-portable.test.js`). Pure: no I/O, no clock, no random number.

/**
 * The text of a JSON-LD value: a string, a value object, or the English entry of a list
 * (else its first entry).
 *
 * @param {*} value
 * @returns {string}
 */
function explorerText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const english = value.find((v) => v !== null && typeof v === 'object' && v['@language'] === 'en');
    return value.length === 0 ? '' : explorerText(english === undefined ? value[0] : english);
  }
  return value !== null && typeof value === 'object' && typeof value['@value'] === 'string' ? value['@value'] : '';
}

/**
 * The route of a node's page: its IRI less the Bundle's IRI, when what is left has the
 * shape of an item route (`/clusters/core/`, `/concepts/a/`); otherwise null.
 *
 * @param {*} iri the node's `@id`.
 * @param {*} base the Bundle's `@id`.
 * @returns {string|null}
 */
function explorerRoute(iri, base) {
  if (typeof iri !== 'string' || typeof base !== 'string' || base === '') return null;
  const root = base.endsWith('/') ? base : `${base}/`;
  if (!iri.startsWith(root)) return null;
  const route = `/${iri.slice(root.length)}`;
  return /^\/(?:[a-z0-9][a-z0-9-]*\/)+$/u.test(route) ? route : null;
}

/**
 * The graph the explorer draws, read from a `graph.jsonld` document.
 *
 * @param {*} doc the parsed document.
 * @param {Array<{key:string, term:string, symmetric:boolean}>} relations the fourteen keys,
 *   in the order of AGSC-03-01, each with the term of its forward property.
 * @param {number} max the most nodes drawn: the first ones of the document.
 * @returns {{nodes:Array<{id:string,type:string,label:string,summary:string,route:(string|null)}>,
 *   links:Array<{source:string,key:string,target:string}>, total:number}} `total` counts
 *   every drawable node, drawn or not.
 */
function explorerGraph(doc, relations, max) {
  const entries = doc !== null && typeof doc === 'object' && Array.isArray(doc['@graph']) ? doc['@graph'] : [];
  // A type or a key is read by its local name, so `Concept`, `asc:Concept` and the full
  // IRI agree. An entry's type is the first of its types that is an item type.
  const localName = (name) => String(name).split(/[#:/]/u).pop();
  const ITEM_TYPES = ['Concept', 'Procedure', 'Lesson', 'Episode', 'Gate', 'Cluster'];
  const typeOf = (entry) => {
    const types = (Array.isArray(entry['@type']) ? entry['@type'] : [entry['@type']]).filter((t) => typeof t === 'string');
    const item = types.map(localName).find((t) => ITEM_TYPES.includes(t));
    return item === undefined ? localName(types[0] === undefined ? '' : types[0]) : item;
  };
  // A retired item carries `retiredAt` (AGSC-11-22) or the status `retired`, under any name.
  const retired = (entry) => Object.keys(entry).some((name) => localName(name) === 'retiredAt'
    || (localName(name) === 'status' && explorerText(entry[name]) === 'retired'));
  const objects = entries.filter((entry) => entry !== null && typeof entry === 'object');
  const bundle = objects.find((entry) => typeOf(entry) === 'Bundle');
  const base = bundle === undefined ? '' : bundle['@id'];
  const drawable = objects.filter((entry) => typeof entry['@id'] === 'string' && ITEM_TYPES.includes(typeOf(entry))
    && explorerRoute(entry['@id'], base) !== null && !retired(entry));
  const kept = drawable.slice(0, max);
  const ids = new Set(kept.map((entry) => entry['@id']));
  const nodes = kept.map((entry) => ({
    id: entry['@id'],
    label: explorerText(entry.prefLabel) || explorerText(entry.title) || entry['@id'],
    route: explorerRoute(entry['@id'], base),
    summary: explorerText(entry.definition),
    type: typeOf(entry),
  }));
  const links = [];
  const seen = new Set();
  const add = (source, key, value, symmetric) => {
    // A link is an IRI, or an `{"@id": …}` object where the context gives the key no term.
    const target = value !== null && typeof value === 'object' ? value['@id'] : value;
    if (typeof target !== 'string' || !ids.has(target) || target === source) return;
    if (symmetric && seen.has(`${target}\u0000${key}\u0000${source}`)) return;
    if (seen.has(`${source}\u0000${key}\u0000${target}`)) return;
    seen.add(`${source}\u0000${key}\u0000${target}`);
    links.push({ key, source, target });
  };
  const valuesOf = (value) => (Array.isArray(value) ? value : [value]);
  for (const entry of kept) {
    for (const target of valuesOf(entry.member)) add(entry['@id'], 'member', target, false);
    for (const row of relations) {
      for (const target of valuesOf(entry[row.term])) add(entry['@id'], row.key, target, row.symmetric);
    }
  }
  return { links, nodes, total: drawable.length };
}

/**
 * The neighbours of a node, as the side panel lists them: the links it states (outgoing),
 * then the links stated of it (incoming), each in the order of the graph's links.
 *
 * @param {ReturnType<typeof explorerGraph>} graph
 * @param {string} id
 * @returns {Array<{direction:string, key:string, node:object}>}
 */
function explorerNeighbours(graph, id) {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = graph.links.filter((link) => link.source === id)
    .map((link) => ({ direction: 'outgoing', key: link.key, node: byId.get(link.target) }));
  const incoming = graph.links.filter((link) => link.target === id)
    .map((link) => ({ direction: 'incoming', key: link.key, node: byId.get(link.source) }));
  return [...outgoing, ...incoming];
}

/** The functions emitted into the page, in order. */
const PORTABLE = Object.freeze(['explorerText', 'explorerRoute', 'explorerGraph', 'explorerNeighbours']);

module.exports = { PORTABLE, explorerGraph, explorerNeighbours, explorerRoute, explorerText };
