'use strict';
// CONTEXT Knowledge — the JSON-LD view of the dataset and the context file.
//
// Implements AGSC-05-09 (`graph.jsonld`: the versioned context URL, nodes sorted by
// `@id`), AGSC-06-32 (`/ns/context.jsonld`, generated from the vocabulary, and the
// expand/re-compact round trip), AGSC-05-04/05-04a/05-04b (the `memory://` alias:
// resolved locally, refused for a foreign Bundle, never an RDF subject) and
// AGSC-05-26/05-27/05-31 (which frontmatter key becomes which member, and in which
// literal form).
//
// PURE: no fs, no process, no clock, no network.
//
// NO JSON-LD PROCESSOR RUNS HERE, BY DESIGN. Emitting JSON-LD is writing JSON; it is
// `jcs.js` that fixes the bytes (AGSC-04-04) and AGSC-05-11 explicitly forbids
// claiming to be a JSON-LD processor on the strength of these outputs. The document
// is built from the SAME quad list as `graph.nq`, so the four views cannot drift
// (AGSC-05-06). `jsonld@9.0.0` — the reference processor — is a devDependency and is
// used where it belongs: in the tests, to expand and re-compact the emitted document
// and prove the AGSC-06-32 round trip, and to convert it to N-Quads and prove it
// isomorphic to `graph.nq`. Requiring it at runtime would also make every emitter
// asynchronous, which a deterministic single-pass build has no use for.

const nq = require('./nquads.js');
const { compareCodePoint } = require('./unicode.js');

/** The vocabulary namespace, re-exported so a caller needs one import for the graph. */
const { NS, PREFIXES } = nq;

/**
 * Every external property a rule of §03, §05, §06 or §11 emits, with the `@type` of
 * its term definition (AGSC-06-32). `'@id'` means the value is an IRI; a datatype
 * IRI means the value is a typed literal; `null` means a plain or language-tagged
 * literal (AGSC-05-31 forms a and c), which takes no `@type`.
 *
 * The list is closed on purpose: AGSC-05-28 forbids shipping a property no rule
 * emits, and the context file is the published surface of that list.
 */
const EXTERNAL_PROPERTIES = Object.freeze([
  ['dcterms:created', `${nq.XSD}dateTime`], // AGSC-05-27 (date), AGSC-05-31
  ['dcterms:creator', null], // AGSC-05-14
  ['dcterms:date', null], // AGSC-05-14
  ['dcterms:format', null], // AGSC-05-29
  ['dcterms:isReplacedBy', '@id'], // AGSC-05-16
  ['dcterms:isRequiredBy', '@id'], // AGSC-05-16
  ['dcterms:license', null], // AGSC-05-29
  ['dcterms:modified', `${nq.XSD}dateTime`], // AGSC-05-27 (modified)
  ['dcterms:replaces', '@id'], // AGSC-05-16
  ['dcterms:requires', '@id'], // AGSC-05-16
  ['dcterms:source', null], // AGSC-05-14, AGSC-05-29
  ['dcterms:title', null], // AGSC-05-14, AGSC-05-29
  ['prov:wasDerivedFrom', '@id'], // AGSC-05-16
  ['rdfs:seeAlso', '@id'], // AGSC-11-12
  ['schema:license', null], // AGSC-06-18
  // AGSC-05-31 form (c): `schema:license` and
  // `schema:usageInfo` are `xsd:string` literals, never IRIs: a row reading
  // `'@id'` would compact the Content Use Terms identifier as a relative IRI.
  ['schema:usageInfo', null], // AGSC-06-18, AGSC-05-26
  ['skos:altLabel', null], // AGSC-05-17
  ['skos:broader', '@id'], // AGSC-05-20
  ['skos:definition', null], // AGSC-05-27
  ['skos:inScheme', '@id'], // AGSC-05-17
  ['skos:member', '@id'], // AGSC-05-18, AGSC-05-19
  ['skos:narrower', '@id'], // AGSC-05-20
  ['skos:prefLabel', null], // AGSC-05-17
  ['skos:related', '@id'], // AGSC-05-16
]);

/** `xsd:string` → the full IRI; an already-absolute IRI is returned unchanged. */
function expandCompact(value) {
  const colon = String(value).indexOf(':');
  if (colon === -1) return value;
  const prefix = String(value).slice(0, colon);
  const local = String(value).slice(colon + 1);
  return PREFIXES[prefix] && !local.startsWith('/') ? `${PREFIXES[prefix]}${local}` : value;
}

/**
 * The term NAME of a property in the context. The local name, unless it would
 * collide with an `asc:` term or with another external local name — then the compact
 * IRI itself is the key, which JSON-LD 1.1 allows and which keeps every IRI mapped
 * by exactly one term, so that compaction has no choice to make (AGSC-06-32's round
 * trip). The specification does not pin term names; it pins the mapping.
 */
function termName(compact, ascNames, externalLocals) {
  const local = compact.slice(compact.indexOf(':') + 1);
  const ambiguous = ascNames.has(local) || externalLocals.get(local) > 1;
  return ambiguous ? compact : local;
}

/**
 * `/ns/context.jsonld` (AGSC-06-32), generated from the vocabulary by a deterministic
 * mapping: every `asc:` term becomes a term definition whose `@id` is its IRI; an
 * object property carries `@type: "@id"`; a datatype property carries the `@type` of
 * its declared range; the prefixes and a typed definition for every external property
 * the rules emit are added; `@version` is 1.1 and `@protected` is true. No term is
 * ever mapped to `null` — a null term definition is a BLOCKED term in JSON-LD 1.1 and
 * could never be used.
 *
 * Member order is not set here: AGSC-04-04 canonicalises the file, and JCS sorts.
 *
 * @param {{term: string, kind: 'class'|'object'|'datatype', range?: string}[]} ontologyTerms
 * @param {string[]} externalProperties  compact names, e.g. `['rdfs:seeAlso']`
 */
function context(ontologyTerms, externalProperties = []) {
  const wanted = new Set(externalProperties || []);
  return contextFrom(ontologyTerms, EXTERNAL_PROPERTIES.filter(([compact]) => wanted.has(compact)));
}

/**
 * The same derivation over EXPLICIT external rows `[compact, type]`, rather than
 * over the names of the closed table above.
 *
 * AGSC-06-32 pins the term NAMES, not the types: which
 * `@type` an external property takes is fixed by the rule that emits it, and the
 * table above is this engine's record of those rules. Vector `graph-0019` therefore
 * states the rows itself and tests the naming alone, which is what this entry point
 * is for — the naming code it exercises is the same code `context` runs.
 *
 * @param {{term: string, kind: 'class'|'object'|'datatype', range?: string}[]} ontologyTerms
 * @param {Array<Array<*>>} rows `[compact, type]` pairs, `'@id'` | datatype IRI | null
 */
function contextFrom(ontologyTerms, rows) {
  const definitions = { '@protected': true, '@version': 1.1, ...PREFIXES };
  const ascNames = new Set((ontologyTerms || []).map((entry) => entry.term));
  for (const entry of ontologyTerms || []) {
    const definition = { '@id': `asc:${entry.term}` };
    if (entry.kind === 'object') definition['@type'] = '@id';
    if (entry.kind === 'datatype' && entry.range) definition['@type'] = expandCompact(entry.range);
    definitions[entry.term] = definition;
  }
  const locals = new Map();
  for (const [compact] of rows || []) {
    const local = compact.slice(compact.indexOf(':') + 1);
    locals.set(local, (locals.get(local) || 0) + 1);
  }
  for (const [compact, type] of rows || []) {
    const definition = { '@id': compact };
    if (type) definition['@type'] = type === '@id' ? '@id' : expandCompact(type);
    definitions[termName(compact, ascNames, locals)] = definition;
  }
  return { '@context': definitions };
}

/** Every external property this engine can emit, for the build that generates the real context file. */
function allExternalProperties() {
  return EXTERNAL_PROPERTIES.map(([compact]) => compact);
}

/**
 * AGSC-05-09: the specification's **persistent versioned context
 * URL**, `https://w3id.org/agentic-system-core/ns/<ontology-version>/context.jsonld`.
 * It is a constant of the specification, resolvable by every reader at every Level,
 * so a Level-0 `graph.jsonld` — which AGSC-06-32 forbids to serve a context of its
 * own — still names one and loses no triple when a processor expands it.
 *
 * Both halves are derived, never typed: the namespace is `nquads.js`'s `NS` without
 * its `#`, and the version is the `owl:versionIRI` version of AGSC-05-25, which
 * `turtle.js#ontologyVersion` reads out of `ontology/agsc.ttl`.
 *
 * @param {string} ontologyVersion e.g. `1.0.0-draft.1`
 */
function persistentContextUrl(ontologyVersion) {
  return `${NS.slice(0, -1)}/${ontologyVersion}/context.jsonld`;
}

// ---------------------------------------------------------------- memory:// (AGSC-05-04b)

const MEMORY = /^memory:\/\/(?<bundle>[^/]+)\/(?<slug>.+)$/u;

/**
 * Resolve a slug argument that may be written as the `memory://` alias (AGSC-05-04b).
 *
 * The alias is accepted wherever a slug is accepted and is normalized to the slug
 * **before any other rule runs**; it is never dereferenced over the network and never
 * emitted as an RDF subject (AGSC-05-04 — `nquads.js` builds every subject from
 * `itemIri`, so the alias has no path into the dataset at all). A `memory://` naming
 * another Bundle is refused with `AGSC-E309`: a node keeps no registry of other
 * nodes' ids, so the `https://` IRI is the only way to name them (AGSC-05-04a).
 *
 * @returns {{slug: string}|{finding: object}}
 */
function resolveMemory(value, options = {}) {
  const text = String(value);
  const match = MEMORY.exec(text);
  if (!match) return { slug: text };
  if (match.groups.bundle === options.bundleId) return { slug: match.groups.slug };
  return {
    finding: {
      code: 'AGSC-E309',
      col: 1,
      line: 1,
      message: `memory:// names the foreign bundle "${match.groups.bundle}": use the https:// IRI (AGSC-05-04b)`,
      severity: 'error',
    },
  };
}

// ---------------------------------------------------------------- graph.jsonld (AGSC-05-09)

/** The `@id` → term-name index of a context object, for the emitter to compact with. */
function termIndex(contextObject) {
  const definitions = (contextObject && contextObject['@context']) || {};
  const index = new Map();
  for (const [name, definition] of Object.entries(definitions)) {
    if (!definition || typeof definition !== 'object' || !definition['@id']) continue;
    index.set(expandCompact(definition['@id']), { name, type: definition['@type'] });
  }
  return index;
}

/** A sort key that orders JSON-LD values deterministically (AGSC-04-12). */
function valueKey(value) {
  if (typeof value === 'string') return value;
  return String(value['@id'] || value['@value'] || '');
}

/** One object term, in the most compact form the term definition allows (AGSC-05-31). */
function jsonValue(object, definition) {
  if (object.termType === 'iri') {
    return definition && definition.type === '@id' ? object.value : { '@id': object.value };
  }
  if (object.lang) return { '@language': object.lang, '@value': object.value };
  if (definition && definition.type === object.datatype) return object.value;
  if (object.datatype === nq.XSD_STRING) return object.value;
  return { '@type': object.datatype, '@value': object.value };
}

/**
 * `graph.jsonld` (AGSC-05-06/05-09) — the JSON-LD view of exactly the quads of
 * `graph.nq`, so the two cannot disagree (AGSC-05-06). Nodes are sorted by `@id`;
 * a property with one value carries that value, not a one-element array; member
 * order is left to JCS (AGSC-04-04/04-05).
 *
 * @param {object[]} items
 * @param {object} options  everything `nquads.dataset` takes, plus
 *   `context`     the context object (from `context()`), which fixes the term names
 *   `contextUrl`  the versioned context URL `graph.jsonld` references (AGSC-05-09)
 */
function toJsonLd(items, options = {}) {
  const quads = nq.dataset(items, options);
  const index = termIndex(options.context || context([], allExternalProperties()));
  const bySubject = new Map();
  for (const q of quads) {
    if (!bySubject.has(q.subject.value)) bySubject.set(q.subject.value, new Map());
    const properties = bySubject.get(q.subject.value);
    if (!properties.has(q.predicate.value)) properties.set(q.predicate.value, []);
    properties.get(q.predicate.value).push(q.object);
  }
  const nodes = [...bySubject.keys()].sort(compareCodePoint).map((subject) => {
    const node = { '@id': subject };
    const properties = bySubject.get(subject);
    const types = (properties.get(nq.RDF_TYPE) || [])
      .map((object) => {
        const term = index.get(object.value);
        return term ? term.name : object.value;
      })
      .sort(compareCodePoint);
    // AGSC-05-12/05-13: every node this specification instantiates carries exactly
    // one class and there is no union type, so `@type` is a name, not a list; the
    // list form is kept only so that a second class could never be dropped silently.
    if (types.length > 0) node['@type'] = types.length === 1 ? types[0] : types;
    for (const [predicate, objects] of properties) {
      if (predicate === nq.RDF_TYPE) continue;
      const definition = index.get(predicate);
      const name = definition ? definition.name : predicate;
      const values = objects.map((object) => jsonValue(object, definition))
        .sort((a, b) => compareCodePoint(valueKey(a), valueKey(b)));
      const unique = values.filter((value, n) => values
        .findIndex((other) => valueKey(other) === valueKey(value)) === n);
      node[name] = unique.length === 1 ? unique[0] : unique;
    }
    return node;
  });
  const document = {};
  if (options.contextUrl) document['@context'] = options.contextUrl;
  document['@graph'] = nodes;
  return document;
}

/**
 * AGSC-06-02 with AGSC-05-06: the per-item JSON-LD view is the whole graph's JSON-LD
 * restricted to one item, so it carries the SAME triples the graph states about that
 * item — its typed Links and their computed inverses, its `asc:mentions` edges and
 * its cluster membership included. A view built from the item alone cannot state
 * them, because a Link's target is resolved against the items in the view. The node
 * set is the one-item view's (the Bundle node, the item node and the item's own
 * `#source-n`, `#review-n` and `#attachment-n` nodes); each node's members are taken
 * from the whole graph, whose Link targets are published items only.
 *
 * @param {{'@context'?: string, '@graph': object[]}} whole   the whole graph's document
 * @param {{'@context'?: string, '@graph': object[]}} single  the one-item document
 */
function restrictTo(whole, single) {
  const byId = new Map((whole['@graph'] || []).map((node) => [node['@id'], node]));
  return {
    ...single,
    '@graph': (single['@graph'] || []).map((node) => byId.get(node['@id']) || node),
  };
}

module.exports = {
  NS,
  EXTERNAL_PROPERTIES,
  expandCompact,
  termName,
  context,
  contextFrom,
  allExternalProperties,
  persistentContextUrl,
  resolveMemory,
  restrictTo,
  toJsonLd,
};
