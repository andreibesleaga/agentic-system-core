'use strict';
// Requirement: PRD-075 (docs/PRD.md).
// AGSC-05-36: the SKOS view written by `export --skos`. The whole-file bytes are pinned
// by vector graph-0040; these tests add what a byte comparison cannot say — the view is
// read back with the pinned `n3` and checked as RDF, it is a function of the graph and
// of nothing else, and each edge of the rule (an episode left out, a concept with a
// broader that is not in the view, a cycle, an absent record) has a case.
//
// Deterministic: fixed items, no clock, no network. Property tests use fast-check.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const nq = require('../../src/knowledge/nquads.js');
const turtle = require('../../src/knowledge/turtle.js');
const skosExport = require('../../src/knowledge/skos-export.js');
const fixture = require('./_graph-fixture.js');

const BASE = 'https://a.example/';
const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const DCTERMS = 'http://purl.org/dc/terms/';
const PROV = { operator: 'human:tester', origin: 'human' };
const RECORD = { creator: 'A. Person', description: 'A tagline for the node.', title: 'A node' };

const item = (type, slug, extra = {}) => ({ prov: PROV, slug, title: slug.toUpperCase(), type, ...extra });
const concept = (slug, extra = {}) => item('concept', slug, { kind: 'term', ...extra });

/** The view of a set of items, as text and as parsed quads. */
function viewOf(items, record = RECORD, extra = {}) {
  const nquads = nq.toNQuads(items, { base: BASE, bundle: { license_prose: 'CC0-1.0', spec_version: '1.0.0' }, ...extra });
  const text = skosExport.skosView(nquads, record);
  return { nquads, quads: turtle.parse(text), text };
}

const objectsOf = (quads, subject, predicate) => quads
  .filter((q) => q.subject.value === subject && q.predicate.value === predicate)
  .map((q) => q.object.value);

test('the view is Turtle that n3 reads, with its own two-line prefix block and no blank node (AGSC-05-36, AGSC-05-08)', () => {
  const { quads, text } = viewOf(fixture.ITEMS, RECORD, fixture.options());
  assert.ok(quads.length > 0);
  assert.ok(text.startsWith(`@prefix dcterms: <${DCTERMS}> .\n@prefix skos: <${SKOS}> .\n\n`), text.slice(0, 160));
  assert.ok(text.endsWith('.\n') && !text.endsWith('\n\n'));
  assert.strictEqual(quads.filter((q) => q.subject.termType === 'BlankNode' || q.object.termType === 'BlankNode').length, 0);
});

test('every triple is SKOS, a record of the scheme, or copied from graph.nq (AGSC-05-36)', () => {
  const { nquads, quads } = viewOf(fixture.ITEMS, RECORD, fixture.options());
  const graph = new Set(turtle.parse(nquads, { format: 'N-Quads' })
    .map((q) => `${q.subject.value} ${q.predicate.value} ${q.object.value}`));
  const added = new Set([`${nq.RDF_TYPE}`, `${SKOS}hasTopConcept`, `${SKOS}topConceptOf`]);
  const schemes = new Set(quads.filter((q) => q.predicate.value === nq.RDF_TYPE && q.object.value === `${SKOS}ConceptScheme`).map((q) => q.subject.value));
  for (const q of quads) {
    const key = `${q.subject.value} ${q.predicate.value} ${q.object.value}`;
    const schemeLabel = q.predicate.value === `${SKOS}prefLabel` && schemes.has(q.subject.value);
    const known = graph.has(key) || added.has(q.predicate.value) || q.predicate.value.startsWith(DCTERMS) || schemeLabel;
    assert.ok(known, `a triple that is neither copied nor implied: ${key}`);
  }
});

test('only concepts, lessons and clusters are in the view: an episode, a procedure and a gate are not (AGSC-05-36)', () => {
  const { quads } = viewOf(fixture.ITEMS, RECORD, fixture.options());
  const left = ['e1', 'g1', 'planning'].map((slug) => fixture.ITEMS.find((i) => i.slug === slug)).filter(Boolean);
  assert.ok(left.length >= 2, 'the fixture must hold items to leave out');
  for (const gone of left) {
    const iri = nq.itemIri(gone, { base: 'https://example.org/' });
    assert.ok(!quads.some((q) => q.subject.value === iri || q.object.value === iri), `${gone.slug} leaked`);
  }
});

test('types are added, and read from the class of the item: concept and lesson are skos:Concept, cluster is skos:Collection', () => {
  const { quads } = viewOf([concept('a'), item('lesson', 'les', { severity: 'info' }), item('cluster', 'grp')]);
  const typeOf = (slug, plural) => objectsOf(quads, `${BASE}${plural}/${slug}/`, nq.RDF_TYPE);
  assert.deepStrictEqual(typeOf('a', 'concepts'), [`${SKOS}Concept`]);
  assert.deepStrictEqual(typeOf('les', 'lessons'), [`${SKOS}Concept`]);
  assert.deepStrictEqual(typeOf('grp', 'clusters'), [`${SKOS}Collection`]);
  assert.deepStrictEqual(objectsOf(quads, BASE, nq.RDF_TYPE), [`${SKOS}ConceptScheme`]);
});

test('a concept whose broader is in the view is not a top concept; one whose broader is not published is (AGSC-05-36)', () => {
  // `held` is not in the graph (the build leaves a draft out, AGSC-06-30), so the broader of `orphan` is not in the view.
  const { quads } = viewOf([concept('root'), concept('leaf', { broader: ['root'] }), concept('orphan', { broader: ['held'] })]);
  const tops = objectsOf(quads, BASE, `${SKOS}hasTopConcept`);
  assert.deepStrictEqual(tops, [`${BASE}concepts/orphan/`, `${BASE}concepts/root/`]);
  for (const top of tops) assert.deepStrictEqual(objectsOf(quads, top, `${SKOS}topConceptOf`), [BASE]);
  assert.deepStrictEqual(objectsOf(quads, `${BASE}concepts/leaf/`, `${SKOS}topConceptOf`), []);
});

test('a cycle of broader has no top concept, and nothing is invented to break it', () => {
  const { quads } = viewOf([concept('a', { broader: ['b'] }), concept('b', { broader: ['a'] })]);
  assert.deepStrictEqual(objectsOf(quads, BASE, `${SKOS}hasTopConcept`), []);
});

test('the scheme record states only what the configuration gives, each a plain literal (AGSC-05-31)', () => {
  const full = viewOf([concept('a')]).quads.filter((q) => q.subject.value === BASE);
  const byName = Object.fromEntries(full.filter((q) => q.predicate.value.startsWith(DCTERMS))
    .map((q) => [q.predicate.value.slice(DCTERMS.length), q.object]));
  assert.deepStrictEqual(Object.keys(byName).sort(), ['creator', 'description', 'license', 'title']);
  assert.strictEqual(byName.title.value, 'A node');
  assert.strictEqual(byName.license.value, 'CC0-1.0');
  for (const literal of Object.values(byName)) {
    assert.strictEqual(literal.language, '');
    assert.strictEqual(literal.datatype.value, 'http://www.w3.org/2001/XMLSchema#string');
  }
  const bare = viewOf([concept('a')], {}).quads.filter((q) => q.subject.value === BASE && q.predicate.value.startsWith(DCTERMS));
  assert.deepStrictEqual(bare.map((q) => q.predicate.value.slice(DCTERMS.length)), ['license']);
});

test('the scheme carries skos:prefLabel with the title, so a SKOS tool that labels a scheme by it shows one (AGSC-05-36)', () => {
  const { quads } = viewOf([concept('a')]);
  assert.deepStrictEqual(objectsOf(quads, BASE, `${SKOS}prefLabel`), ['A node']);
  const label = quads.find((q) => q.subject.value === BASE && q.predicate.value === `${SKOS}prefLabel`).object;
  assert.strictEqual(label.language, '');
  const untitled = viewOf([concept('a')], {}).quads.filter((q) => q.subject.value === BASE && q.predicate.value === `${SKOS}prefLabel`);
  assert.deepStrictEqual(untitled, []);
});

test('schemeRecord reads site.title, site.tagline and site.author, and only those', () => {
  const config = { site: { author: 'Z', base: BASE, tagline: 'T', title: 'N' }, bundle: { license_prose: 'x' } };
  assert.deepStrictEqual(skosExport.schemeRecord(config), { creator: 'Z', description: 'T', title: 'N' });
  assert.deepStrictEqual(skosExport.schemeRecord({}), {});
});

test('a graph with no Bundle node and no concept gives the prefix block and nothing else', () => {
  const text = skosExport.skosView('', RECORD);
  assert.strictEqual(text, `@prefix dcterms: <${DCTERMS}> .\n@prefix skos: <${SKOS}> .\n`);
});

test('a label with a quote, a newline and a non-BMP character survives the read-back', () => {
  const title = 'Say "hi"\\ \u{1F600}';
  const { quads } = viewOf([concept('q', { title })]);
  assert.deepStrictEqual(objectsOf(quads, `${BASE}concepts/q/`, `${SKOS}prefLabel`), [title]);
});

// ---------------------------------------------------------------- properties

const slugs = fc.uniqueArray(fc.stringMatching(/^[a-z][a-z0-9]{0,5}$/u), { maxLength: 8, minLength: 1 });
const itemSets = slugs.chain((names) => fc.tuple(...names.map((slug) => fc.record({
  broader: fc.subarray(names.filter((n) => n !== slug), { maxLength: Math.min(2, names.length - 1) }),
  type: fc.constantFrom('concept', 'lesson', 'cluster', 'episode', 'procedure'),
}).map((spec) => ({ slug, ...spec })))))
  .map((specs) => specs.map(({ slug, type, broader }) => (type === 'concept' ? concept(slug, { broader })
    : type === 'lesson' ? item('lesson', slug, { severity: 'info' })
      : type === 'cluster' ? item('cluster', slug)
        : type === 'episode' ? item('episode', slug, { actor: 'human:t', outcome: 'success', started: '2026-01-01T00:00:00Z' })
          : item('procedure', slug))));

test('property: the view does not depend on the order of the items, and a second run gives the same bytes', () => {
  fc.assert(fc.property(itemSets, (items) => {
    const once = viewOf(items).text;
    assert.strictEqual(viewOf([...items].reverse()).text, once);
    assert.strictEqual(viewOf(items).text, once);
  }), { numRuns: 100, seed: 5036 });
});

test('property: the view re-serialises to itself (stable Turtle) and holds no episode or procedure', () => {
  fc.assert(fc.property(itemSets, (items) => {
    const { quads, text } = viewOf(items);
    const again = turtle.serialize(quads.map((q) => nq.quad(
      nq.iri(q.subject.value), nq.iri(q.predicate.value),
      q.object.termType === 'NamedNode' ? nq.iri(q.object.value)
        : nq.literal(q.object.value, { lang: q.object.language || undefined }), null)), skosExport.PREFIXES);
    assert.strictEqual(again, text);
    for (const q of quads) assert.ok(!/\/(episodes|procedures|gates)\//u.test(q.subject.value + q.object.value));
  }), { numRuns: 100, seed: 5037 });
});
