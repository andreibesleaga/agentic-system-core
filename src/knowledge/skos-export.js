'use strict';
// CONTEXT Knowledge — the SKOS view of the graph, written by `export --skos`.
//
// Implements AGSC-05-36. The graph already types every concept as `asc:Concept` (a
// `skos:Concept` by the subclass axiom of AGSC-05-12) and gives it its labels and
// relations as SKOS properties, but it leaves the SKOS structure implicit: the scheme
// itself, the type a taxonomy tool looks for, the top concepts. This module writes one
// Turtle file that states those parts, so a tool that reads SKOS needs no inference
// step. The file holds only concepts, lessons and clusters: an episode, a procedure and
// a gate are not SKOS concepts, so they and every triple that names one are left out.
//
// WHY it reads `graph.nq` and not the items. The view is "the triples of `graph.nq`
// whose predicate is ...", so the input is the text of that file, as the build wrote it.
// The view then agrees with the graph by construction: the published projection
// (AGSC-06-30), the labels, the language tags and the escaping are the graph's own, and
// no second rule can drift from the first.
//
// LIBRARY SPLIT. Reading N-Quads is `n3`'s job (`turtle.parse`); writing is
// `turtle.serialize` with the two-line block of this file, so the stable-Turtle profile
// of AGSC-05-10 (c) to (e) is applied by the one writer the graph uses.
//
// PURE: a string and a plain record in, a string out; no fs, no clock, no network.

const nq = require('./nquads.js');
const turtle = require('./turtle.js');

const { DCTERMS, NS, RDF_TYPE, SCHEMA, SKOS } = nq;

/** The prefix block of the file: exactly these two lines, in this order (AGSC-05-36). */
const PREFIXES = Object.freeze({ dcterms: DCTERMS, skos: SKOS });

/** The predicates of `graph.nq` that the view copies (AGSC-05-36). */
const COPIED = new Set(['prefLabel', 'altLabel', 'definition', 'inScheme', 'broader', 'narrower', 'related', 'member']
  .map((name) => `${SKOS}${name}`));

/** The SKOS class of each item class the view keeps, read from the axioms of AGSC-05-12. */
const SKOS_CLASS_OF = Object.freeze({
  [`${NS}Concept`]: 'Concept',
  [`${NS}Lesson`]: 'Concept',
  [`${NS}Cluster`]: 'Collection',
});

/** The scheme record: the dcterms property each configuration value is written as. */
const RECORD_PROPERTIES = Object.freeze({
  creator: `${DCTERMS}creator`,
  description: `${DCTERMS}description`,
  title: `${DCTERMS}title`,
});

/**
 * The scheme record of a configuration: `site.title`, `site.tagline` and `site.author`
 * where present (AGSC-05-36). No new key exists for the view. The licence is not here:
 * it is the Bundle node's own `schema:license`, which is `bundle.license_prose` as the
 * build resolved it.
 *
 * @param {{site?: {title?: string, tagline?: string, author?: string}}} config
 * @returns {{title?: string, description?: string, creator?: string}}
 */
function schemeRecord(config) {
  const site = (config && config.site) || {};
  const record = { creator: site.author, description: site.tagline, title: site.title };
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value != null));
}

/** An n3 term as a term of this engine's writer (named node, or language-tagged or plain literal). */
function ownTerm(term) {
  if (term.termType === 'NamedNode') return nq.iri(term.value);
  return nq.literal(term.value, { lang: term.language || undefined });
}

const triple = (subject, predicate, object) => nq.quad(nq.iri(subject), nq.iri(predicate), object, null);

/** `{ subject IRI -> 'Concept' | 'Collection' }` for the items the view keeps. */
function kindsOf(quads) {
  const kinds = new Map();
  for (const q of quads) {
    if (q.predicate.value === RDF_TYPE && SKOS_CLASS_OF[q.object.value] !== undefined) {
      kinds.set(q.subject.value, SKOS_CLASS_OF[q.object.value]);
    }
  }
  return kinds;
}

/** The Bundle node and its licence, as the graph states them; `null` when it has none. */
function schemeOf(quads) {
  const node = quads.find((q) => q.predicate.value === RDF_TYPE && q.object.value === `${NS}Bundle`);
  if (node === undefined) return null;
  const licence = quads.find((q) => q.subject.value === node.subject.value && q.predicate.value === `${SCHEMA}license`);
  return { iri: node.subject.value, license: licence === undefined ? undefined : licence.object.value };
}

/** The triples the graph holds and the view copies: both ends belong to the view. */
function copiedTriples(quads, kinds, scheme) {
  const belongs = (term) => term.termType !== 'NamedNode' || kinds.has(term.value) || (scheme !== null && term.value === scheme.iri);
  return quads
    .filter((q) => COPIED.has(q.predicate.value) && kinds.has(q.subject.value) && belongs(q.object))
    .map((q) => triple(q.subject.value, q.predicate.value, ownTerm(q.object)));
}

/** The concepts that have no `skos:broader` object in the view (clusters are collections, never top concepts). */
function topConcepts(kinds, copied) {
  const hasBroader = new Set(copied.filter((q) => q.predicate.value === `${SKOS}broader`).map((q) => q.subject.value));
  return [...kinds].filter(([iri, kind]) => kind === 'Concept' && !hasBroader.has(iri)).map(([iri]) => iri);
}

/** The scheme's own triples: its type, its record and the link to each top concept, in both directions. */
function schemeTriples(scheme, record, tops) {
  const out = [triple(scheme.iri, RDF_TYPE, nq.iri(`${SKOS}ConceptScheme`))];
  const values = { ...record, license: scheme.license };
  const properties = { ...RECORD_PROPERTIES, license: `${DCTERMS}license` };
  for (const [name, property] of Object.entries(properties)) {
    if (values[name] != null) out.push(triple(scheme.iri, property, nq.literal(String(values[name]))));
  }
  for (const top of tops) {
    out.push(triple(scheme.iri, `${SKOS}hasTopConcept`, nq.iri(top)));
    out.push(triple(top, `${SKOS}topConceptOf`, nq.iri(scheme.iri)));
  }
  return out;
}

/**
 * The SKOS view of a graph (AGSC-05-36).
 *
 * @param {string} nquadsText the text of `graph.nq`
 * @param {{title?: string, description?: string, creator?: string}} [record] see `schemeRecord`
 * @returns {string} the Turtle text of `skos.ttl`
 */
function skosView(nquadsText, record = {}) {
  const quads = turtle.parse(nquadsText, { format: 'N-Quads' });
  const kinds = kindsOf(quads);
  const scheme = schemeOf(quads);
  const copied = copiedTriples(quads, kinds, scheme);
  const types = [...kinds].map(([iri, kind]) => triple(iri, RDF_TYPE, nq.iri(`${SKOS}${kind}`)));
  const own = scheme === null ? [] : schemeTriples(scheme, record, topConcepts(kinds, copied));
  return turtle.serialize([...copied, ...types, ...own], PREFIXES);
}

module.exports = { PREFIXES, schemeRecord, skosView };
