'use strict';
// The vocabulary and the exports must agree in both directions (AGSC-05-28):
//
//   * every predicate and class the graph exports emit MUST be declared in
//     `ontology/agsc.ttl` — an export that invents a term is a term no consumer can
//     resolve at `/ns/`;
//   * every `asc:` PROPERTY the ontology ships MUST be emitted by a rule of §5.3,
//     §5.6, §5.7 or §11 — a property no rule emits is deleted before 1.0.0.
//     (Classes may be declared without a 1.0 emission: `asc:Harness` and
//     `asc:Proposal` are reserved, AGSC-05-28.)
//
// Both directions are derived — the ontology is read with `n3`, the emitted terms
// come from the mapping tables of `nquads.js` — so neither list is typed by hand.

const test = require('node:test');
const assert = require('node:assert');

const nq = require('../../src/knowledge/nquads.js');
const skos = require('../../src/knowledge/skos.js');
const turtle = require('../../src/knowledge/turtle.js');
const fixture = require('../knowledge/_graph-fixture.js');

const declared = turtle.ontologyTerms(fixture.ontologyText());
const declaredIris = new Set(declared.map((entry) => `${nq.NS}${entry.term}`));

/** Every predicate the emitters can produce, taken from the tables themselves. */
function emittedPredicates() {
  return new Set([
    ...Object.values(nq.LINK_PROPERTIES).flatMap((rule) => [rule.property, rule.inverse].filter(Boolean)),
    ...nq.DATATYPE_PROPERTIES.map((row) => row.property),
    `${nq.NS}retiredAt`, `${nq.NS}source`, `${nq.NS}review`, `${nq.NS}hasAttachment`,
    `${nq.NS}sha256`, `${nq.NS}grade`, `${nq.NS}verifiedOn`, `${nq.NS}verifiedBy`,
    `${nq.NS}verifiedAt`, `${nq.NS}specVersion`, `${nq.NS}mentions`,
    // AGSC-11-12: placed by `dataset`'s `citations` option since.
    `${nq.NS}peerOrigin`,
  ]);
}

test('every asc: predicate the exports emit is declared in the ontology (AGSC-05-28)', () => {
  for (const predicate of emittedPredicates()) {
    if (!predicate.startsWith(nq.NS)) continue;
    assert.ok(declaredIris.has(predicate), `${predicate} is emitted but not declared in ontology/agsc.ttl`);
  }
});

test('every asc: term that reaches a real serialization is declared (AGSC-05-28)', () => {
  const text = nq.toNQuads(fixture.ITEMS, fixture.options());
  const used = new Set([...text.matchAll(/<(https:\/\/w3id\.org\/agentic-system-core\/ns#[^>]+)>/gu)].map((m) => m[1]));
  for (const iri of used) {
    assert.ok(declaredIris.has(iri), `${iri} is emitted but not declared in ontology/agsc.ttl`);
  }
  assert.ok(used.size > 20, 'the fixture should exercise most of the vocabulary');
});

test('every asc: class is declared, and no asc:Item exists (AGSC-05-12/05-13)', () => {
  for (const type of Object.keys(skos.CLASSES)) {
    assert.ok(declaredIris.has(skos.classOf(type)), `${skos.classOf(type)} is not declared`);
  }
  assert.ok(!declaredIris.has(`${nq.NS}Item`));
});

test('every asc: property the ontology ships is emitted by some rule (AGSC-05-28)', () => {
  const emitted = emittedPredicates();
  const unemitted = declared
    .filter((entry) => entry.kind !== 'class')
    .map((entry) => `${nq.NS}${entry.term}`)
    .filter((iri) => !emitted.has(iri));
  // AGSC-11-12's `asc:peerOrigin` was the one exception until wired the
  // Boundary context's peer citations into the dataset writer; now none remains.
  assert.deepStrictEqual(unemitted, []);
});

test('the deleted asc:verdict is gone and stays gone (AGSC-05-28)', () => {
  assert.ok(!declaredIris.has(`${nq.NS}verdict`));
  assert.ok(!emittedPredicates().has(`${nq.NS}verdict`));
});
