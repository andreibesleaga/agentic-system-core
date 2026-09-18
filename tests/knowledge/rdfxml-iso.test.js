'use strict';
// `src/knowledge/rdfxml.js` is the one writer in this package with no library behind
// it — the 2026-09-18 survey found no maintained RDF/JS-quads → RDF/XML serializer on
// npm. A hand-written serializer that is only compared with itself proves nothing, so
// this test re-parses its output with `fast-xml-parser@5.11.1` (already a pinned
// dependency) and asserts that the triples that come back are the ones that went in.
// The dataset is blank-node-free (AGSC-05-08), so "isomorphic" is set equality and
// needs no matching algorithm.
//
// `graph.rdf` is NOT emitted at 1.x (AGSC-05-06); the module exists for the reserved
// `build.rdfxml` switch, and this test is what keeps it honest until then.

const test = require('node:test');
const assert = require('node:assert');
const { XMLParser } = require('fast-xml-parser');

const nq = require('../../src/knowledge/nquads.js');
const rdfxml = require('../../src/knowledge/rdfxml.js');
const fixture = require('./_graph-fixture.js');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  parseTagValue: false,
  alwaysCreateTextNode: true,
  textNodeName: '#text',
  processEntities: true,
});

const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';
const asArray = (value) => (Array.isArray(value) ? value : [value]);

/** Expand a QName against the writer's own namespace table. */
function expand(name) {
  const [prefix, local] = name.split(':');
  return rdfxml.NAMESPACES[prefix] ? `${rdfxml.NAMESPACES[prefix]}${local}` : name;
}

/** Reconstruct the triple set from the emitted RDF/XML. */
function reparse(xml) {
  const document = parser.parse(xml);
  const out = new Set();
  for (const description of asArray(document['rdf:RDF']['rdf:Description'])) {
    const subject = description['@rdf:about'];
    for (const [name, raw] of Object.entries(description)) {
      if (name.startsWith('@')) continue;
      for (const element of asArray(raw)) {
        const predicate = expand(name);
        if (element['@rdf:resource'] !== undefined) {
          out.add(`${subject}|${predicate}|<${element['@rdf:resource']}>`);
        } else {
          const tail = element['@xml:lang'] || element['@rdf:datatype'] || XSD_STRING;
          out.add(`${subject}|${predicate}|${element['#text']}|${tail}`);
        }
      }
    }
  }
  return out;
}

/** The same triple set, straight from the dataset. */
function own(quads) {
  return new Set(quads.map((q) => (q.object.termType === 'iri'
    ? `${q.subject.value}|${q.predicate.value}|<${q.object.value}>`
    : `${q.subject.value}|${q.predicate.value}|${q.object.value}|${q.object.lang || q.object.datatype}`)));
}

test('the RDF/XML re-parses to exactly the triples of the dataset (AGSC-05-06/05-08)', () => {
  const options = fixture.options();
  const xml = rdfxml.toRdfXml(fixture.ITEMS, options);
  assert.deepStrictEqual(reparse(xml), own(nq.dataset(fixture.ITEMS, options)));
  assert.ok(!xml.includes('rdf:nodeID'));
});

test('a language tag, a datatype and a plain literal each take their own form (AGSC-05-31)', () => {
  const xml = rdfxml.toRdfXml([{
    type: 'concept', slug: 'a', title: 'A', lang: 'en', kind: 'term', stale_after: '2027-01-01',
  }], { base: 'https://e.org' });
  assert.ok(xml.includes('<skos:prefLabel xml:lang="en">A</skos:prefLabel>'));
  assert.ok(xml.includes('<asc:kind>term</asc:kind>'));
  assert.ok(xml.includes('<asc:staleAfter rdf:datatype="http://www.w3.org/2001/XMLSchema#dateTime">2027-01-01T00:00:00Z</asc:staleAfter>'));
});

test('XML text is escaped, and a control character is not dropped', () => {
  assert.strictEqual(rdfxml.escapeXml('a<b>&"c"'), 'a&lt;b&gt;&amp;&quot;c&quot;');
  assert.strictEqual(rdfxml.escapeXml('a\u0001b'), 'a&#x1;b');
  assert.strictEqual(rdfxml.escapeXml('tab\there'), 'tab\there');
});

test('a predicate with no QName is not written rather than written wrongly', () => {
  assert.strictEqual(rdfxml.qname('https://elsewhere.example/p'), null);
  assert.strictEqual(rdfxml.propertyElement('https://elsewhere.example/p', nq.literal('x')), null);
  assert.strictEqual(rdfxml.qname(`${nq.NS}kind`), 'asc:kind');
});

test('the document is deterministic and ends with one LF (AGSC-04-01/04-07)', () => {
  const options = fixture.options();
  const first = rdfxml.toRdfXml(fixture.ITEMS, options);
  assert.strictEqual(first, rdfxml.toRdfXml([...fixture.ITEMS].reverse(), options));
  assert.ok(first.endsWith('</rdf:RDF>\n'));
});
