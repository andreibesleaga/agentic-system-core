'use strict';
// CONTEXT Knowledge — the stable-Turtle view of the dataset, and the Turtle this
// engine READS (the vocabulary file).
//
// Implements AGSC-05-10 (the stable-Turtle profile), AGSC-05-30/05-31 (a plain
// literal is written bare in Turtle and never `^^xsd:string`) and AGSC-05-32 (the
// same lexical forms as N-Quads inside Turtle syntax). An authored block marked
// `export` is never extracted at 1.x (AGSC-02-22), so no blank node from authored
// input reaches an export, and nothing here reports the blank-node fault of AGSC-05-08.
//
// PURE: no fs, no process, no clock, no network. The vocabulary text is passed in
// as a string.
//
// LIBRARY SPLIT. Reading Turtle is `n3@2.7.12`'s job and is done by it here —
// `ontologyTerms` and `parse` are thin wrappers over `N3.Parser`.
// WRITING is ours: the profile of AGSC-05-10 (fixed prefix list in fixed order,
// grouping with `;` and `,`, four-space continuation, `a` for `rdf:type`, no
// `^^xsd:string`) is pinned by the specification and matches no library's layout —
// `N3.Writer`, probed on 2026-09-18, writes `"config";` where the profile writes
// `"config" ;` and re-orders nothing. Every written file is checked by re-parsing it
// with `n3` and comparing the quads (`tests/knowledge/turtle.test.js`).

const N3 = require('n3');
const nq = require('./nquads.js');
const { compareCodePoint } = require('./unicode.js');

// ---------------------------------------------------------------- writing

/** A local name that may be written after a prefix (the PN_LOCAL subset this profile uses). */
const PN_LOCAL = /^[A-Za-z_][A-Za-z0-9_-]*$/u;

/**
 * An IRI as a prefixed name when the profile's fixed prefix table covers it, and as
 * an absolute `<IRI>` otherwise (AGSC-05-10).
 */
function turtleIri(value) {
  for (const [prefix, namespace] of Object.entries(nq.PREFIXES)) {
    if (value.startsWith(namespace)) {
      const local = value.slice(namespace.length);
      if (PN_LOCAL.test(local)) return `${prefix}:${local}`;
    }
  }
  return `<${nq.escapeIri(value)}>`;
}

/**
 * One term in Turtle syntax. A plain literal is written BARE — `"retired"`, never
 * `"retired"^^xsd:string` (AGSC-05-31 form c, vectors `graph-0017`/`graph-0018`);
 * every other datatype is explicit; the lexical form is the N-Quads one (AGSC-05-32).
 */
function turtleTerm(term) {
  if (term.termType === 'iri') return turtleIri(term.value);
  if (term.lang) return `"${nq.escapeLiteral(term.value)}"@${term.lang}`;
  if (!term.datatype || term.datatype === nq.XSD_STRING) return `"${nq.escapeLiteral(term.value)}"`;
  return `"${nq.escapeLiteral(term.value)}"^^${turtleIri(term.datatype)}`;
}

/** The predicate as it is written: `a` for `rdf:type` (AGSC-05-10), a prefixed name otherwise. */
function turtlePredicate(value) {
  return value === nq.RDF_TYPE ? 'a' : turtleIri(value);
}

/** The fixed prefix block, in the fixed order of the profile (AGSC-05-10). */
function prefixBlock() {
  return Object.entries(nq.PREFIXES)
    .map(([prefix, namespace]) => `@prefix ${prefix}: <${namespace}> .`)
    .join('\n');
}

/**
 * Serialize quads in the stable-Turtle profile of AGSC-05-10: subjects, then
 * predicates, then objects sorted by IRI code points; one triple per line grouped
 * with `;` and `,`; four-space continuation lines; a blank line between subject
 * blocks; one trailing LF (AGSC-04-07).
 *
 * Turtle carries triples, so a quad's graph name is dropped: `graph.ttl` and
 * `graph.nq` express the same triples (AGSC-05-10, "both MUST be isomorphic").
 */
function serialize(quads) {
  const bySubject = new Map();
  for (const q of quads) {
    if (!bySubject.has(q.subject.value)) bySubject.set(q.subject.value, new Map());
    const predicates = bySubject.get(q.subject.value);
    if (!predicates.has(q.predicate.value)) predicates.set(q.predicate.value, new Set());
    predicates.get(q.predicate.value).add(turtleTerm(q.object));
  }
  const blocks = [...bySubject.keys()].sort(compareCodePoint).map((subject) => {
    const predicates = [...bySubject.get(subject).keys()].sort(compareCodePoint);
    const clauses = predicates.map((predicate) => {
      const objects = [...bySubject.get(subject).get(predicate)].sort(compareCodePoint);
      return `${turtlePredicate(predicate)} ${objects.join(' , ')}`;
    });
    const head = `${turtleIri(subject)} ${clauses[0]}`;
    const rest = clauses.slice(1).map((clause) => `    ${clause}`);
    return `${[head, ...rest].join(' ;\n')} .`;
  });
  return `${[prefixBlock(), ...blocks].join('\n\n')}\n`;
}

/** `graph.ttl` for a set of items (AGSC-05-06/05-10). */
function toTurtle(items, options = {}) {
  return serialize(nq.dataset(items, options));
}

// ---------------------------------------------------------------- reading

/** Parse Turtle (or N-Quads, with `{ format: 'N-Quads' }`) into RDF/JS quads, synchronously. */
function parse(text, options = {}) {
  return new N3.Parser(options).parse(String(text));
}

/**
 * The `asc:` terms of `ontology/agsc.ttl`, as the context generator of AGSC-06-32
 * needs them: `{ term, kind: 'class'|'object'|'datatype', range? }`, sorted by term.
 * Read with `n3`; nothing about the vocabulary is hard-coded here, so a term added
 * to the ontology reaches the context file without a code change.
 */
function ontologyTerms(turtleText) {
  const quads = parse(turtleText);
  const OWL = 'http://www.w3.org/2002/07/owl#';
  const RDFS_RANGE = `${nq.RDFS}range`;
  const byKind = { [`${OWL}Class`]: 'class', [`${OWL}ObjectProperty`]: 'object', [`${OWL}DatatypeProperty`]: 'datatype' };
  const terms = new Map();
  for (const q of quads) {
    if (q.subject.termType !== 'NamedNode' || !q.subject.value.startsWith(nq.NS)) continue;
    const name = q.subject.value.slice(nq.NS.length);
    if (!terms.has(name)) terms.set(name, { term: name, kind: null });
    const entry = terms.get(name);
    if (q.predicate.value === nq.RDF_TYPE && byKind[q.object.value]) entry.kind = byKind[q.object.value];
    if (q.predicate.value === RDFS_RANGE) entry.range = q.object.value;
  }
  return [...terms.values()]
    .filter((entry) => entry.kind !== null)
    .sort((a, b) => compareCodePoint(a.term, b.term));
}

/**
 * The version of `ontology/agsc.ttl`, read from its `owl:versionIRI` (AGSC-05-25) —
 * the last path segment of that IRI, `1.0.0-draft.1` until `spec_version` reaches
 * `1.0.0`. It is the ontology version of AGSC-05-25, which is NOT the context version
 * of the persistent context URL (AGSC-05-09, `jsonld.js#CONTEXT_VERSION`).
 * @returns {string|null} the version, or `null` when the document declares none.
 */
function ontologyVersion(turtleText) {
  const OWL = 'http://www.w3.org/2002/07/owl#';
  for (const q of parse(turtleText)) {
    if (q.predicate.value !== `${OWL}versionIRI` || q.object.termType !== 'NamedNode') continue;
    return q.object.value.slice(q.object.value.lastIndexOf('/') + 1);
  }
  return null;
}

module.exports = {
  turtleIri,
  turtleTerm,
  turtlePredicate,
  prefixBlock,
  serialize,
  toTurtle,
  parse,
  ontologyTerms,
  ontologyVersion,
};
