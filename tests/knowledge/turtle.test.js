'use strict';
// Unit tests for `src/knowledge/turtle.js` — the stable-Turtle profile (AGSC-05-10),
// the literal forms (AGSC-05-31), the vocabulary reader and the blank-node rule
// (AGSC-05-08).
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

test('a blank node in an export block is AGSC-E605 (AGSC-05-08)', () => {
  const body = '```turtle export\n<https://a/> <https://b/> [ a <https://c/> ] .\n```\n';
  const findings = turtle.checkExportBlocks(body, { file: 'content/concepts/a.md' });
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].code, 'AGSC-E605');
  assert.strictEqual(findings[0].severity, 'error');
  assert.strictEqual(findings[0].file, 'content/concepts/a.md');
  assert.strictEqual(findings[0].line, 1);
});

test('a labelled blank node and a collection are refused too (AGSC-05-08)', () => {
  const labelled = '```turtle export\n_:x <https://b/> <https://c/> .\n```\n';
  assert.strictEqual(turtle.checkExportBlocks(labelled)[0].code, 'AGSC-E605');
  const collection = '```turtle export\n<https://a/> <https://b/> ( <https://c/> ) .\n```\n';
  assert.strictEqual(turtle.checkExportBlocks(collection)[0].code, 'AGSC-E605');
});

test('an export block without a blank node, a block without `export`, and a non-RDF fence pass', () => {
  assert.deepStrictEqual(turtle.checkExportBlocks('```turtle export\n<https://a/> <https://b/> <https://c/> .\n```\n'), []);
  assert.deepStrictEqual(turtle.checkExportBlocks('```turtle\n<https://a/> <https://b/> [ ] .\n```\n'), []);
  assert.deepStrictEqual(turtle.checkExportBlocks('```js export\nconst a = [ ];\n```\n'), []);
  assert.deepStrictEqual(turtle.checkExportBlocks('no fence at all\n'), []);
});

test('a block that does not parse states no triple, so it raises no blank-node finding', () => {
  assert.deepStrictEqual(turtle.checkExportBlocks('```turtle export\nthis is not turtle\n```\n'), []);
});

test('the line of a finding is the fence line, offset when the body is not the file (AGSC-09-11)', () => {
  const body = 'a\nb\n```turtle export\n_:x <https://b/> <https://c/> .\n```\n';
  assert.strictEqual(turtle.checkExportBlocks(body)[0].line, 3);
  assert.strictEqual(turtle.checkExportBlocks(body, { lineOffset: 10 })[0].line, 13);
});

test('n3 is the parser, and it is the pinned version', () => {
  assert.strictEqual(require('n3/package.json').version, '2.7.12');
  assert.ok(new N3.Parser({ format: 'N-Quads' })
    .parse('<https://a/> <https://b/> "c" <https://g/> .\n')[0].graph.value, 'https://g/');
});

test('an unclosed fence states nothing, and a fence inside another fence is content', () => {
  assert.deepStrictEqual(turtle.checkExportBlocks('```turtle export\n_:x <https://b/> <https://c/> .\n'), []);
  const nested = '````text\n```turtle export\n_:x <https://b/> <https://c/> .\n```\n````\n';
  assert.deepStrictEqual(turtle.checkExportBlocks(nested), []);
});

test('a tilde fence and a longer closing run are both accepted (CommonMark 0.31.2)', () => {
  assert.strictEqual(turtle.checkExportBlocks('~~~turtle export\n_:x <https://b/> <https://c/> .\n~~~~\n')[0].code, 'AGSC-E605');
  // a closing run shorter than the opening one does not close the block
  assert.deepStrictEqual(turtle.checkExportBlocks('````turtle export\n_:x <https://b/> <https://c/> .\n```\n'), []);
});

test('a second export block in the same body is reported on its own line', () => {
  const body = '```turtle export\n_:x <https://b/> <https://c/> .\n```\n\n```turtle export\n_:y <https://b/> <https://c/> .\n```\n';
  assert.deepStrictEqual(turtle.checkExportBlocks(body).map((f) => f.line), [1, 5]);
});
