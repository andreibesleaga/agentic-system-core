'use strict';
// CONTEXT Knowledge — the RDF/XML view of the dataset.
//
// Implements AGSC-05-06 (`graph.rdf` is RESERVED and is NOT emitted at 1.x; the
// `build.rdfxml` switch is reserved with it, D82 Q21), AGSC-05-08 (blank-node-free,
// so every subject is an `rdf:Description rdf:about=…` and no `rdf:nodeID` is ever
// written), AGSC-05-10's ordering and AGSC-05-31's literal forms.
//
// PURE: no fs, no process, no clock, no network.
//
// WHY THIS ONE IS HAND-WRITTEN. The library survey of 2026-09-18 found no maintained
// npm package that serializes RDF/JS quads to RDF/XML: `rdfxml-streaming-parser` is a
// reader, and `rdf-serialize`'s actor set covers JSON-LD, N3 and SHACLC only. This is
// therefore a small deterministic writer over the blank-node-free triple list, and it
// is checked the only honest way — `tests/knowledge/rdfxml-iso.test.js` re-parses its
// own output with `fast-xml-parser` and asserts the triple set is the one that went
// in (isomorphism, since the dataset has no blank node to match).
//
// The module exists because one is needed the day `build.rdfxml` leaves RESERVED;
// until then nothing in `distribution/` may call it (AGSC-05-06).

const nq = require('./nquads.js');
const { compareCodePoint } = require('./unicode.js');

/** The prefix table of the document element: the profile's prefixes plus `rdf`. */
const NAMESPACES = Object.freeze({ rdf: nq.RDF, ...nq.PREFIXES });

/** A local name that may be written as an XML QName local part. */
const NCNAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/u;

/**
 * XML text escaping. RDF/XML is XML 1.0, which cannot carry a C0 control other than
 * tab, LF and CR at all (XML 1.0 §2.2); such a character is written as a numeric
 * reference so that nothing is silently dropped, and the fact is stated here rather
 * than hidden — it is one more reason AGSC-05-06 keeps `graph.rdf` out of 1.x.
 */
function escapeXml(value) {
  let out = '';
  for (const ch of String(value)) {
    const cp = ch.codePointAt(0);
    if (ch === '&') out += '&amp;';
    else if (ch === '<') out += '&lt;';
    else if (ch === '>') out += '&gt;';
    else if (ch === '"') out += '&quot;';
    else if (cp < 0x20 && ch !== '\t' && ch !== '\n' && ch !== '\r') out += `&#x${cp.toString(16)};`;
    else out += ch;
  }
  return out;
}

/** An IRI as a QName against the document's prefix table, or null when none fits. */
function qname(value) {
  for (const [prefix, namespace] of Object.entries(NAMESPACES)) {
    if (value.startsWith(namespace)) {
      const local = value.slice(namespace.length);
      if (NCNAME.test(local)) return `${prefix}:${local}`;
    }
  }
  return null;
}

/** One predicate–object pair as an RDF/XML property element. */
function propertyElement(predicate, object) {
  const name = qname(predicate);
  if (!name) return null; // a predicate with no QName cannot be written; §05 emits none
  if (object.termType === 'iri') return `    <${name} rdf:resource="${escapeXml(object.value)}"/>`;
  if (object.lang) return `    <${name} xml:lang="${escapeXml(object.lang)}">${escapeXml(object.value)}</${name}>`;
  const datatype = object.datatype && object.datatype !== nq.XSD_STRING
    ? ` rdf:datatype="${escapeXml(object.datatype)}"`
    : '';
  return `    <${name}${datatype}>${escapeXml(object.value)}</${name}>`;
}

/**
 * Serialize quads to RDF/XML, isomorphic to the canonical N-Quads of the same quads.
 * Subjects, then predicates, then objects in code-point order (AGSC-05-10); one
 * `rdf:Description` per subject; one trailing LF (AGSC-04-07).
 */
function serialize(quads) {
  const bySubject = new Map();
  for (const q of quads) {
    if (!bySubject.has(q.subject.value)) bySubject.set(q.subject.value, []);
    bySubject.get(q.subject.value).push(q);
  }
  const header = Object.entries(NAMESPACES)
    .map(([prefix, namespace]) => `  xmlns:${prefix}="${escapeXml(namespace)}"`)
    .join('\n');
  let out = `<?xml version="1.0" encoding="utf-8"?>\n<rdf:RDF\n${header}>\n`;
  for (const subject of [...bySubject.keys()].sort(compareCodePoint)) {
    out += `  <rdf:Description rdf:about="${escapeXml(subject)}">\n`;
    const lines = bySubject.get(subject)
      .map((q) => propertyElement(q.predicate.value, q.object))
      .filter((line) => line !== null);
    for (const line of [...new Set(lines)].sort(compareCodePoint)) out += `${line}\n`;
    out += '  </rdf:Description>\n';
  }
  return `${out}</rdf:RDF>\n`;
}

/** The RDF/XML view of a set of items. RESERVED at 1.x (AGSC-05-06). */
function toRdfXml(items, options = {}) {
  return serialize(nq.dataset(items, options));
}

module.exports = { NAMESPACES, escapeXml, qname, propertyElement, serialize, toRdfXml };
