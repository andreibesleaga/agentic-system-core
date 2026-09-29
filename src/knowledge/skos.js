'use strict';
// CONTEXT Knowledge — the SKOS integrity rules of the graph view.
//
// Implements AGSC-05-12/05-13 (the class map, and the absence of an `asc:Item`
// superclass), AGSC-05-17 (in-scheme and the three label properties), AGSC-05-18
// (cluster membership), AGSC-05-19 (cluster NESTING is `skos:member`, never
// `skos:broader`) and AGSC-05-20 (a Collection never appears in a semantic relation).
//
// PURE, and deliberately IRI-free: every function takes slugs and an injected
// resolver, so that `nquads.js` — which owns IRI computation — can require this file
// without a cycle. The rules here are the ones a SKOS validator would check; keeping
// them in one file is what makes "would this entail the S37 contradiction?" a
// question with one place to look.
//
// WHY IT MATTERS. `skos:broader` has domain and range `skos:Concept` (SKOS S19/S20)
// and `skos:Collection` is disjoint with `skos:Concept` (S37). Emitting `skos:broader`
// on a Cluster would therefore entail a contradiction and fail every SKOS validator —
// which is why AGSC-05-19 exports cluster nesting as a nested Collection instead
// (vector `graph-0022`).

const NS = 'https://w3id.org/agentic-system-core/ns#';
const SKOS = 'http://www.w3.org/2004/02/skos/core#';

/** Item type → class IRI (AGSC-05-12). There is no common superclass (AGSC-05-13). */
const CLASSES = Object.freeze({
  concept: `${NS}Concept`,
  lesson: `${NS}Lesson`,
  episode: `${NS}Episode`,
  procedure: `${NS}Procedure`,
  cluster: `${NS}Cluster`,
  gate: `${NS}Gate`,
});

/** The types whose class is a `skos:Concept` — `asc:Concept` and its subclass `asc:Lesson`. */
const CONCEPT_TYPES = Object.freeze(['concept', 'lesson']);

/** The three semantic relations a `skos:Collection` may never enter (AGSC-05-20). */
const SEMANTIC_RELATIONS = Object.freeze([`${SKOS}broader`, `${SKOS}narrower`, `${SKOS}related`]);

/** The class IRI of an item type (AGSC-05-12); null for a type no rule names. */
function classOf(type) {
  return CLASSES[type] || null;
}

/**
 * Is this type a `skos:Concept`, and therefore obliged to carry `skos:inScheme`
 * (AGSC-05-17)? An Episode is a `prov:Activity`, a Procedure and a Gate are
 * `prov:Plan`s and a Cluster is a `skos:Collection`: none of them is in the scheme.
 */
function isConceptType(type) {
  return CONCEPT_TYPES.includes(type);
}

/** May an item of this type stand at either end of a SKOS semantic relation (AGSC-05-20)? */
function allowsSemanticRelation(type) {
  return type !== 'cluster';
}

/** Is this property one of the three semantic relations (AGSC-05-20)? */
function isSemanticRelation(property) {
  return SEMANTIC_RELATIONS.includes(property);
}

/**
 * The label triples of AGSC-05-17/05-27: exactly one `skos:prefLabel` per language
 * tag from `title`, `skos:definition` from `description`, and one `skos:altLabel`
 * per `aliases[]` entry. All three are language-tagged (AGSC-05-31 form a) with the
 * item's `lang`, lower-cased, defaulting to `i18n.default` (AGSC-01-13).
 *
 * @returns {{property: string, value: string, lang: string}[]}
 */
function labels(item, options = {}) {
  const lang = (item.lang ? String(item.lang) : (options.lang || 'en')).toLowerCase();
  const out = [];
  if (item.title !== undefined && item.title !== null) {
    out.push({ property: `${SKOS}prefLabel`, value: String(item.title), lang });
  }
  if (item.description !== undefined && item.description !== null) {
    out.push({ property: `${SKOS}definition`, value: String(item.description), lang });
  }
  for (const alias of [].concat(item.aliases || [])) {
    out.push({ property: `${SKOS}altLabel`, value: String(alias), lang });
  }
  return out;
}

/**
 * Every `skos:member` edge of a Bundle, as `{subject, object}` IRI pairs:
 *
 *   * AGSC-05-18 — an item's `clusters[]` gives `<cluster> skos:member <item>`;
 *   * AGSC-05-19 — a `broader` on a `type: cluster` file is NESTING and gives
 *     `<parent> skos:member <child>`, a nested Collection, never `skos:broader`.
 *
 * An unresolved slug yields no edge: a dangling target is the lint error AGSC-E301,
 * raised where links are resolved, not in an exporter.
 *
 * @param {object[]} items
 * @param {(slug: string) => (string|null)} resolve  slug → IRI
 */
function membership(items, resolve) {
  const out = [];
  for (const item of [].concat(items || [])) {
    const own = resolve(item.slug);
    if (!own) continue;
    for (const cluster of [].concat(item.clusters || [])) {
      const parent = resolve(String(cluster));
      if (parent) out.push({ subject: parent, object: own });
    }
    if (item.type === 'cluster') {
      for (const parentSlug of [].concat(item.broader || [])) {
        const parent = resolve(String(parentSlug));
        if (parent) out.push({ subject: parent, object: own });
      }
    }
  }
  return out;
}

module.exports = {
  CLASSES,
  SEMANTIC_RELATIONS,
  classOf,
  isConceptType,
  allowsSemanticRelation,
  isSemanticRelation,
  labels,
  membership,
};
