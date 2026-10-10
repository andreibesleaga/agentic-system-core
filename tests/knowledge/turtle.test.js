'use strict';
// Unit tests for `src/knowledge/turtle.js` — the stable-Turtle profile (AGSC-05-10),
// the literal forms (AGSC-05-31) and the vocabulary reader.
//
// The profile is checked the honest way: what this module writes is handed straight
// back to `n3`'s parser and the triple set is compared with the one that went in. A
// writer that is only compared with itself proves nothing.

const test = require('node:test');
const assert = require('node:assert');
const N3 = require('n3');

const nq = require('../../src/knowledge/nquads.js');
const turtle = require('../../src/knowledge/turtle.js');
const fixture = require('./_graph-fixture.js');

/** A quad as a comparable string, graph name dropped (Turtle carries triples). */
function tripleKey(subject, predicate, object) {
  return `${subject}|${predicate}|${object}`;
}

function ownTriples(quads) {
  return new Set(quads.map((q) => tripleKey(
    q.subject.value,
    q.predicate.value,
    q.object.termType === 'iri' ? `<${q.object.value}>` : `${q.object.value}|${q.object.lang || q.object.datatype}`,
  )));
}

function parsedTriples(text) {
  return new Set(turtle.parse(text).map((q) => tripleKey(
    q.subject.value,
    q.predicate.value,
    q.object.termType === 'NamedNode'
      ? `<${q.object.value}>`
      // n3 reports a plain literal's datatype as xsd:string, and a language-tagged
      // one's as rdf:langString; both are normalised to the AGSC form here.
      : `${q.object.value}|${q.object.language || q.object.datatype.value}`,
  )));
}

test('what the profile writes, n3 reads back as the same triples (AGSC-05-10)', () => {
  const options = fixture.options();
  const quads = nq.dataset(fixture.ITEMS, options);
  const text = turtle.toTurtle(fixture.ITEMS, options);
  assert.deepStrictEqual(parsedTriples(text), ownTriples(quads));
});

test('a plain literal is bare in Turtle and explicit in N-Quads (AGSC-05-31 form c)', () => {
  assert.strictEqual(turtle.turtleTerm(nq.literal('retired')), '"retired"');
  assert.strictEqual(turtle.turtleTerm(nq.literal('x', { datatype: nq.XSD_DATETIME })), '"x"^^xsd:dateTime');
  assert.strictEqual(turtle.turtleTerm(nq.literal('x', { lang: 'en' })), '"x"@en');
  assert.ok(!turtle.toTurtle(fixture.ITEMS, fixture.options()).includes('^^xsd:string'));
});

test('an IRI is a prefixed name only when the fixed prefix table covers it (AGSC-05-10)', () => {
  assert.strictEqual(turtle.turtleIri(`${nq.NS}Concept`), 'asc:Concept');
  assert.strictEqual(turtle.turtleIri('https://example.org/concepts/a/'), '<https://example.org/concepts/a/>');
  // a local part outside the profile's subset falls back to the absolute form
  assert.strictEqual(turtle.turtleIri(`${nq.NS}not a name`), `<${nq.NS}not a name>`);
  assert.strictEqual(turtle.turtlePredicate(nq.RDF_TYPE), 'a');
});

test('the prefix block is the fixed list in the fixed order (AGSC-05-10)', () => {
  const block = turtle.prefixBlock().split('\n');
  assert.deepStrictEqual(block.map((line) => line.split(' ')[1]),
    ['asc:', 'dcterms:', 'prov:', 'rdfs:', 'schema:', 'skos:', 'xsd:']);
});

test('several objects of one predicate are grouped with a comma (AGSC-05-10)', () => {
  const text = turtle.toTurtle([{ type: 'concept', slug: 'r', produces: ['events', 'metrics'] }], { base: 'https://a.example' });
  assert.ok(text.includes('asc:produces "events" , "metrics"'));
});

test('an empty dataset still writes the prefix block and one trailing LF (AGSC-04-07)', () => {
  const text = turtle.toTurtle([], { base: 'https://a.example' });
  assert.ok(text.endsWith('\n'));
  assert.ok(!text.endsWith('\n\n'));
  assert.strictEqual(turtle.parse(text).length, 0);
});

test('the vocabulary reader finds every asc: term and its range (AGSC-06-32)', () => {
  const terms = turtle.ontologyTerms(fixture.ontologyText());
  const byName = new Map(terms.map((t) => [t.term, t]));
  assert.strictEqual(byName.get('hasAttachment').kind, 'object');
  assert.strictEqual(byName.get('produces').kind, 'datatype');
  assert.strictEqual(byName.get('produces').range, 'http://www.w3.org/2001/XMLSchema#string');
  assert.strictEqual(byName.get('retiredAt').range, 'http://www.w3.org/2001/XMLSchema#dateTime');
  assert.strictEqual(byName.get('Concept').kind, 'class');
  // the ontology IRI itself is an owl:Ontology, not a term, and is not reported
  assert.ok(!byName.has(''));
  assert.deepStrictEqual(terms.map((t) => t.term), [...terms.map((t) => t.term)].sort());
});

test('the reader counts the 12 classes and 40 properties the ontology declares (AGSC-05-28)', () => {
  const terms = turtle.ontologyTerms(fixture.ontologyText());
  assert.strictEqual(terms.filter((t) => t.kind === 'class').length, 12);
  assert.strictEqual(terms.filter((t) => t.kind !== 'class').length, 40);
});

test('n3 is the parser, and it is the pinned version', () => {
  assert.strictEqual(require('n3/package.json').version, '2.7.12');
  assert.ok(new N3.Parser({ format: 'N-Quads' })
    .parse('<https://a/> <https://b/> "c" <https://g/> .\n')[0].graph.value, 'https://g/');
});
