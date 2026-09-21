'use strict';
// Unit tests for `src/knowledge/nquads.js` — the dataset and its canonical form.
// Every case names the rule it holds the module to; the conformance vectors prove
// the rest (tests/conformance/areas/graph.js).

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

const nq = require('../../src/knowledge/nquads.js');
const fixture = require('./_graph-fixture.js');

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const lines = (text) => text.split('\n').filter(Boolean);

test('an item IRI is <base>/<type-plural>/<slug>/ (AGSC-05-01)', () => {
  assert.strictEqual(nq.itemIri({ type: 'concept', slug: 'a' }, { base: 'https://e.org' }), 'https://e.org/concepts/a/');
  assert.strictEqual(nq.itemIri({ type: 'cluster', slug: 'a' }, { base: 'https://e.org/' }), 'https://e.org/clusters/a/');
  assert.strictEqual(nq.itemIri({ type: 'lesson', slug: 'a' }, { base: 'https://e.org' }), 'https://e.org/lessons/a/');
  assert.strictEqual(nq.itemIri({ type: 'nonsense', slug: 'a' }, { base: 'https://e.org' }), null);
  assert.strictEqual(nq.typePlural('nonsense'), null);
});

test('the Bundle IRI is the base with exactly one trailing slash (AGSC-05-03)', () => {
  assert.strictEqual(nq.bundleIri('https://e.org'), 'https://e.org/');
  assert.strictEqual(nq.bundleIri('https://e.org///'), 'https://e.org/');
  assert.strictEqual(nq.bundleIri(undefined), '/');
});

test('the escapes are exactly the six of AGSC-05-32', () => {
  assert.strictEqual(nq.escapeLiteral('a"b\\c\td\ne\rf\u0001g\u{1F600}h'), 'a\\"b\\\\c\\td\\ne\\rf\\u0001g\u{1F600}h');
  // an astral character is written as itself, never \U-escaped
  assert.ok(!nq.escapeLiteral('\u{1F600}').includes('\\U'));
  // U+007F is at or above U+0020, so it is written as itself
  assert.strictEqual(nq.escapeLiteral('\u007f'), '\u007f');
  assert.strictEqual(nq.escapeLiteral('\u001f'), '\\u001f');
});

test('an IRI never carries a character an IRIREF cannot hold (AGSC-05-32, AGSC-11-12)', () => {
  assert.strictEqual(nq.escapeIri('https://e.org/a b'), 'https://e.org/a b');
  assert.strictEqual(nq.escapeIri('https://e.org/a<b'), 'https://e.org/a\\u003cb');
  assert.strictEqual(nq.escapeIri('https://e.org/a\u0001b'), 'https://e.org/a\\u0001b');
  // an existing percent escape is preserved byte for byte, never re-encoded
  assert.strictEqual(nq.escapeIri('https://e.org/a%20b'), 'https://e.org/a%20b');
});

test('the three literal forms and no other (AGSC-05-31)', () => {
  assert.strictEqual(nq.nquadsTerm(nq.literal('x')), '"x"^^<http://www.w3.org/2001/XMLSchema#string>');
  assert.strictEqual(nq.nquadsTerm(nq.literal('x', { lang: 'EN' })), '"x"@en');
  assert.strictEqual(nq.nquadsTerm(nq.literal('x', { datatype: nq.XSD_DATETIME })), '"x"^^<http://www.w3.org/2001/XMLSchema#dateTime>');
  // a language-tagged literal never also carries a datatype
  assert.strictEqual(nq.literal('x', { lang: 'en', datatype: nq.XSD_DATETIME }).datatype, undefined);
});

test('lines are de-duplicated and sorted by their serialized bytes (AGSC-04-13/04-15)', () => {
  const one = nq.quad(nq.iri('https://e.org/b'), nq.iri('https://p/'), nq.literal('1'));
  const two = nq.quad(nq.iri('https://e.org/a'), nq.iri('https://p/'), nq.literal('2'));
  const text = nq.serialize([one, two, one]);
  assert.strictEqual(lines(text).length, 2);
  assert.ok(lines(text)[0].startsWith('<https://e.org/a>'));
  assert.strictEqual(nq.serialize([]), '');
});

test('a graph name given as a string becomes an IRI term', () => {
  const text = nq.serialize([nq.quad(nq.iri('https://e.org/a'), nq.iri('https://p/'), nq.literal('1'), 'https://e.org/')]);
  assert.strictEqual(text, '<https://e.org/a> <https://p/> "1"^^<http://www.w3.org/2001/XMLSchema#string> <https://e.org/> .\n');
});

test('a Link materialises its computed inverse, and a symmetric key both directions (AGSC-03-04/05)', () => {
  const items = [
    { type: 'concept', slug: 'a', requires: ['b'], excludes: ['b'] },
    { type: 'concept', slug: 'b' },
  ];
  const text = nq.toNQuads(items, { base: 'https://e.org', graph: null });
  assert.ok(text.includes('<https://e.org/concepts/a/> <http://purl.org/dc/terms/requires> <https://e.org/concepts/b/> .'));
  assert.ok(text.includes('<https://e.org/concepts/b/> <http://purl.org/dc/terms/isRequiredBy> <https://e.org/concepts/a/> .'));
  assert.ok(text.includes('<https://e.org/concepts/b/> <https://w3id.org/agentic-system-core/ns#excludes> <https://e.org/concepts/a/> .'));
});

test('an unresolved Link target emits no edge; that is AGSC-E301, not a triple', () => {
  const text = nq.toNQuads([{ type: 'concept', slug: 'a', requires: ['ghost'] }], { base: 'https://e.org', graph: null });
  assert.ok(!text.includes('requires'));
});

test('a Link value may carry an anchor (AGSC-03-02)', () => {
  const items = [{ type: 'concept', slug: 'a', uses: ['b#part'] }, { type: 'concept', slug: 'b' }];
  const text = nq.toNQuads(items, { base: 'https://e.org', graph: null });
  assert.ok(text.includes('<https://e.org/concepts/b/#part> .'));
});

test('a Collection never enters a semantic relation (AGSC-05-20)', () => {
  const items = [
    { type: 'concept', slug: 'a', broader: ['c'], related: ['c'] },
    { type: 'cluster', slug: 'c' },
  ];
  const text = nq.toNQuads(items, { base: 'https://e.org', graph: null });
  assert.ok(!text.includes('skos/core#broader'));
  assert.ok(!text.includes('skos/core#related'));
});

test('`derived-from` has no invented inverse (AGSC-05-27 closes the list)', () => {
  const items = [{ type: 'concept', slug: 'a', 'derived-from': ['b'] }, { type: 'concept', slug: 'b' }];
  const text = nq.toNQuads(items, { base: 'https://e.org', graph: null });
  assert.ok(text.includes('<http://www.w3.org/ns/prov#wasDerivedFrom>'));
  assert.ok(!text.includes('hadDerivation'));
});

test('a date becomes the midnight instant, an instant is left alone (AGSC-05-14)', () => {
  assert.strictEqual(nq.instant('2026-01-01'), '2026-01-01T00:00:00Z');
  assert.strictEqual(nq.instant('2026-01-01T10:00:00Z'), '2026-01-01T10:00:00Z');
});

test('nothing is inferred: no status, no kind, no date unless authored (AGSC-05-26)', () => {
  const text = nq.toNQuads([{ type: 'concept', slug: 'a', title: 'A' }], { base: 'https://e.org', graph: null });
  assert.ok(!text.includes('#status'));
  assert.ok(!text.includes('#kind'));
  assert.ok(!text.includes('dc/terms/created'));
});

test('a key a rule does not name for this type emits nothing (AGSC-05-26)', () => {
  const text = nq.toNQuads([{ type: 'procedure', slug: 'p', kind: 'explainer', level: 'L1' }], { base: 'https://e.org', graph: null });
  assert.ok(!text.includes('#kind'));
  assert.ok(!text.includes('#level'));
});

test('a retired item keeps its node and gains asc:retiredAt (AGSC-11-22)', () => {
  const base = { base: 'https://e.org', graph: null };
  const fromModified = nq.toNQuads([{ type: 'concept', slug: 'a', status: 'retired', modified: '2026-09-01', date: '2020-01-01' }], base);
  assert.ok(fromModified.includes('#retiredAt> "2026-09-01T00:00:00Z"'));
  const fromDate = nq.toNQuads([{ type: 'concept', slug: 'a', status: 'retired', date: '2020-01-01' }], base);
  assert.ok(fromDate.includes('#retiredAt> "2020-01-01T00:00:00Z"'));
  const neither = nq.toNQuads([{ type: 'concept', slug: 'a', status: 'retired' }], base);
  assert.ok(!neither.includes('#retiredAt'));
});

test('verdict_digest, prov.agent and prov.agreement are never exported (AGSC-05-26/05-30)', () => {
  assert.deepStrictEqual(nq.NEVER_EXPORTED, ['verdict_digest', 'prov.agent', 'prov.agreement']);
  const text = nq.toNQuads(fixture.ITEMS, fixture.options({ graph: null }));
  assert.ok(!/verdict/iu.test(text));
  assert.ok(!text.includes('#agent'));
  assert.ok(!text.includes('#agreement'));
});

test('a Source and a Review are fragment IRIs reachable from their item (AGSC-05-14/15)', () => {
  const text = nq.toNQuads(fixture.ITEMS, fixture.options({ graph: null }));
  assert.ok(text.includes('<https://example.org/concepts/a2a/> <https://w3id.org/agentic-system-core/ns#source> <https://example.org/concepts/a2a/#source-1> .'));
  assert.ok(text.includes('<https://example.org/concepts/a2a/#review-1> <https://w3id.org/agentic-system-core/ns#verifiedAt> "2026-01-01T00:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .'));
  assert.ok(!text.includes('bibliographicCitation'));
  assert.ok(!text.includes('wasAssociatedWith'));
});

test('an attachment without bytes carries no sha256 (AGSC-05-29)', () => {
  const item = { type: 'concept', slug: 'a', attachments: [{ file: 'x.svg', media_type: 'image/svg+xml', alt: 'X' }] };
  const quads = nq.attachmentQuads(item, { base: 'https://e.org', graph: null, sha256 });
  assert.ok(!quads.some((q) => q.predicate.value.endsWith('#sha256')));
  const withBytes = nq.attachmentQuads(item, {
    base: 'https://e.org', graph: null, sha256, attachmentBytes: new Map([['a/x.svg', 'body']]),
  });
  assert.ok(withBytes.some((q) => q.object.value === sha256('body')));
});

test('an attachment licence falls back to the Bundle prose licence (AGSC-05-29)', () => {
  const item = { type: 'concept', slug: 'a', attachments: [{ file: 'x.svg', media_type: 'image/svg+xml', alt: 'X', license: 'CC0-1.0' }] };
  const own = nq.attachmentQuads(item, { base: 'https://e.org', graph: null, bundle: { license_prose: 'LicenseRef-X' } });
  assert.ok(own.some((q) => q.object.value === 'CC0-1.0'));
});

test('the attachment bytes may be supplied by a function', () => {
  const item = { type: 'concept', slug: 'a', attachments: [{ file: 'x.svg', media_type: 'image/svg+xml', alt: 'X' }] };
  const quads = nq.attachmentQuads(item, {
    base: 'https://e.org', graph: null, sha256, attachmentBytes: (slug, file) => `${slug}/${file}`,
  });
  assert.ok(quads.some((q) => q.object.value === sha256('a/x.svg')));
});

test('the Bundle node is emitted only when the Bundle is given (AGSC-05-03/05-26)', () => {
  const without = nq.toNQuads([], { base: 'https://e.org', graph: null });
  assert.strictEqual(without, '');
  const withBundle = nq.toNQuads([], {
    base: 'https://e.org',
    graph: null,
    bundle: { spec_version: '1.0.0-rc.4', license_prose: 'LicenseRef-X' },
  });
  assert.ok(withBundle.includes('#specVersion> "1.0.0-rc.4"'));
  // AGSC-05-26 as amended at rc.5 (V9A-02): both schema.org properties are
  // `xsd:string` literals (AGSC-05-31 form c), and `schema:usageInfo` carries the
  // CONSTANT Content Use Terms identifier of AGSC-06-18, never a caller-supplied IRI.
  assert.ok(withBundle.includes('<https://schema.org/license> "LicenseRef-X"^^<http://www.w3.org/2001/XMLSchema#string>'));
  assert.ok(withBundle.includes(`<https://schema.org/usageInfo> "${nq.CONTENT_USE_TERMS}"^^<http://www.w3.org/2001/XMLSchema#string>`));
  assert.ok(!withBundle.includes('<https://schema.org/usageInfo> <'), 'usageInfo was emitted as an IRI');
});

test('the two configuration licence rows are on the Bundle AND on every item (AGSC-05-26, rc.5)', () => {
  const items = [{ type: 'concept', slug: 'a', title: 'A' }];
  const options = { base: 'https://e.org', graph: null, bundle: { license_prose: 'CC0-1.0' } };
  const text = nq.toNQuads(items, options);
  for (const subject of ['<https://e.org/>', '<https://e.org/concepts/a/>']) {
    assert.ok(text.includes(`${subject} <https://schema.org/license> "CC0-1.0"^^<${nq.XSD_STRING}>`), subject);
    assert.ok(text.includes(`${subject} <https://schema.org/usageInfo> "${nq.CONTENT_USE_TERMS}"^^<${nq.XSD_STRING}>`), subject);
  }
  // With no configuration there is no licence to name: a bare item list is unchanged,
  // which is what keeps graph-0001/0002/0004/0006 byte-identical across rc.5.
  const bare = nq.toNQuads(items, { base: 'https://e.org', graph: null });
  assert.ok(!bare.includes('schema.org'));
  // `license_prose` absent, configuration present: the constant still holds, the
  // licence has no source and emits nothing (AGSC-05-26 "a key absent emits no triple").
  const noLicence = nq.toNQuads(items, { base: 'https://e.org', graph: null, bundle: { id: 'e' } });
  assert.ok(!noLicence.includes('<https://schema.org/license>'));
  assert.strictEqual(noLicence.split('\n').filter((l) => l.includes('usageInfo')).length, 2);
});

test('the dataset is blank-node-free (AGSC-05-08)', () => {
  assert.strictEqual(nq.countBlankNodes(nq.toNQuads(fixture.ITEMS, fixture.options())), 0);
  assert.strictEqual(nq.countBlankNodes('<a> <b> _:x .\n'), 1);
});

test('the static fragments are the lines of graph.nq, named by the IRI hash (AGSC-06-33)', () => {
  const text = nq.toNQuads(fixture.ITEMS, fixture.options());
  const { files, index } = nq.shard(text, { sha256, generatedAt: '2026-01-01T00:00:00Z' });
  const all = lines(text);
  for (const file of files) for (const line of lines(file.text)) assert.ok(all.includes(line));
  assert.strictEqual(index.subjects.length + index.predicates.length, files.length);
  assert.deepStrictEqual([...index.subjects].sort(), index.subjects);
  assert.ok(index.subjects.every((p) => /^s\/[0-9a-f]{16}\.nq$/u.test(p)));
  assert.ok(index.predicates.every((p) => /^p\/[0-9a-f]{16}\.nq$/u.test(p)));
  assert.strictEqual(nq.fragmentName('https://a.example/concepts/a/', sha256), '6f1ba47e10c664e3');
});

test('a writer that emits no fragment emits no index (AGSC-06-33)', () => {
  assert.deepStrictEqual(nq.shard('', { sha256 }), { files: [], index: null });
  assert.deepStrictEqual(nq.shard('not an n-quads line\n', { sha256 }), { files: [], index: null });
});

test('the same input twice gives the same bytes (AGSC-04-01)', () => {
  const options = fixture.options();
  assert.strictEqual(nq.toNQuads(fixture.ITEMS, options), nq.toNQuads(fixture.ITEMS, options));
  const shuffled = [...fixture.ITEMS].reverse();
  assert.strictEqual(nq.toNQuads(shuffled, options), nq.toNQuads(fixture.ITEMS, options));
});

test('an inline-link edge becomes asc:mentions when the Links module supplies it (AGSC-03-11)', () => {
  const items = [{ type: 'concept', slug: 'a' }, { type: 'concept', slug: 'b' }];
  const options = { base: 'https://e.org', graph: null, mentions: [{ source: 'a', target: 'b' }] };
  const text = nq.toNQuads(items, options);
  assert.ok(text.includes('<https://e.org/concepts/a/> <https://w3id.org/agentic-system-core/ns#mentions> <https://e.org/concepts/b/> .'));
  // `mentions` is never authored (AGSC-03-11), so an unresolved pair emits nothing
  assert.ok(!nq.toNQuads(items, { ...options, mentions: [{ source: 'a', target: 'ghost' }] }).includes('mentions'));
});
