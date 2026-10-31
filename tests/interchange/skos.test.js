'use strict';
// verifies AGSC-01-39, AGSC-01-22, AGSC-01-23
// tests/interchange/skos.test.js — the SKOS import adapter (`import <file.ttl> --from skos`).
//
// The conformance cases `imp-0006`, `imp-0007` and `imp-0008` pin the mapping, the drops and
// the idempotence on one fixture each. This file adds what a rule states in a sentence and
// no case isolates: the choice among several labels and definitions (the determinism rules
// of AGSC-01-39 (b) and (d)), the collection rules of (f), SKOS-XL, and properties — over
// generated thesauri — that the plan is a function of the file's statements and not of
// their order, that every item is a draft, and that a second run writes the same bytes.
//
// The thesauri here are written for these tests (musical instruments and a few invented
// terms). The example data of any third-party tool is never a fixture.
//
// Deterministic: no clock, no network, seeded generation.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fc = require('fast-check');

const skos = require('../../src/interchange/adapters/skos.js');
const okf = require('../../src/interchange/okf.js');
const { readSchemas } = require('../../src/adapters/node-fs.js');

const ROOT = path.resolve(__dirname, '..', '..');
const ITEM_SCHEMA = readSchemas(ROOT).item;
const EX = 'https://example.org/inst/';
const LONG = 'A stringed instrument played with a bow, the smallest and highest of its family.';

const HEAD = '@prefix skos: <http://www.w3.org/2004/02/skos/core#> .\n'
  + '@prefix skosxl: <http://www.w3.org/2008/05/skos-xl#> .\n'
  + '@prefix dcterms: <http://purl.org/dc/terms/> .\n'
  + '@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .\n'
  + '@prefix owl: <http://www.w3.org/2002/07/owl#> .\n'
  + '@prefix ex: <https://example.org/inst/> .\n\n';

/** The plan of a Turtle body (prefixes added), with the defaults of these tests. */
function planOf(body, options = {}) {
  return skos.plan({ turtle: `${HEAD}${body}` }, {
    i18nDefault: 'en', itemSchema: ITEM_SCHEMA, operator: 'human:tester', ...options,
  });
}

/** `{slug: {frontmatter, body}}` of a plan's writes. */
function itemsOf(planned) {
  const out = {};
  for (const write of planned.writes) {
    const slug = path.basename(write.path, '.md');
    out[slug] = okf.readDocument(write.text);
  }
  return out;
}

const warningsAbout = (planned, predicate) => planned.findings
  .filter((f) => f.severity === 'warn' && f.predicate !== undefined && f.predicate.endsWith(predicate));

test('the adapter is named skos and is a module of the adapters directory (AGSC-01-26a)', () => {
  assert.strictEqual(skos.FORMAT, 'skos');
  assert.strictEqual(typeof skos.plan, 'function');
});

test('AGSC-01-39 (b): the prefLabel in the default language wins, then the untagged one, then the least tag', () => {
  const pick = (labels, i18nDefault = 'en') => {
    const planned = planOf(`ex:c a skos:Concept ; ${labels} .`, { i18nDefault });
    return { planned, title: Object.values(itemsOf(planned))[0].frontmatter.title };
  };
  assert.strictEqual(pick('skos:prefLabel "Viola"@it, "Alto"@en, "Bratsche"@de').title, 'Alto');
  assert.strictEqual(pick('skos:prefLabel "Viola"@it, "Plain", "Bratsche"@de').title, 'Plain');
  assert.strictEqual(pick('skos:prefLabel "Plain", "Alto"@en, "Viola"@it').title, 'Alto', 'the default language beats an untagged label');
  assert.strictEqual(pick('skos:prefLabel "Viola"@it, "Bratsche"@de').title, 'Bratsche');
  assert.strictEqual(pick('skos:prefLabel "Viola"@it, "Alto"@EN', 'en').title, 'Alto', 'tags compare case-insensitively');
  // Two labels of one tag: the lexically least. The other one is a dropped value.
  const both = pick('skos:prefLabel "Zither"@EN, "Alto"@en');
  assert.strictEqual(both.title, 'Alto');
  assert.strictEqual(warningsAbout(both.planned, 'prefLabel').length, 1);
});

test('AGSC-01-39 (b): a concept with no prefLabel takes the last segment of its IRI', () => {
  const planned = planOf('ex:bass-drum a skos:Concept .');
  assert.strictEqual(itemsOf(planned)['bass-drum'].frontmatter.title, 'bass-drum');
  assert.ok(planned.findings.some((f) => /no prefLabel/u.test(f.message)));
  // The segment is read as a percent-encoded name when it is one, and as it stands when it is not.
  assert.strictEqual(Object.values(itemsOf(planOf('<https://example.org/inst/Bass%20drum> a skos:Concept .')))[0].frontmatter.title, 'Bass drum');
  assert.strictEqual(Object.values(itemsOf(planOf('<https://example.org/inst/bad%ZZ> a skos:Concept .')))[0].frontmatter.title, 'bad%ZZ');
});

test('AGSC-01-39: a control character in a label is replaced by a space and reported (AGSC-02-24)', () => {
  const planned = planOf('ex:c a skos:Concept ; skos:prefLabel "Vio\\tlin"@en .');
  assert.strictEqual(Object.values(itemsOf(planned))[0].frontmatter.title, 'Vio lin');
  assert.ok(planned.findings.some((f) => /control character/u.test(f.message)));
});

test('AGSC-01-39 (c): altLabel values are aliases, without duplicates and without the title, in code-point order', () => {
  const planned = planOf('ex:c a skos:Concept ; skos:prefLabel "Fiddle"@en ;'
    + ' skos:altLabel "Violin"@en, "Violin"@de, "Fiddle"@de, "Alt"@en .');
  assert.deepStrictEqual(itemsOf(planned).fiddle.frontmatter.aliases, ['Alt', 'Violin']);
});

test('AGSC-01-39 (c): a SKOS-XL label is read as its literalForm and the label resource is dropped', () => {
  const planned = planOf('ex:c a skos:Concept ; skosxl:prefLabel ex:l1 ; skosxl:altLabel ex:l2 .\n'
    + 'ex:l1 a skosxl:Label ; skosxl:literalForm "Cello"@en .\n'
    + 'ex:l2 a skosxl:Label ; skosxl:literalForm "Violoncello"@en ; dcterms:created "2020-01-01" .');
  const items = itemsOf(planned);
  assert.deepStrictEqual(Object.keys(items), ['cello']);
  assert.deepStrictEqual(items.cello.frontmatter.aliases, ['Violoncello']);
  assert.strictEqual(warningsAbout(planned, 'created').length, 1, 'the label resource keeps no other statement');
});

test('AGSC-01-39 (d): the definition least in code-point order is used, and every other one is reported', () => {
  const planned = planOf(`ex:c a skos:Concept ; skos:prefLabel "Violin"@en ;
    skos:definition "${LONG}"@en, "Zzz another definition that is long enough to be a description."@en .`);
  assert.strictEqual(itemsOf(planned).violin.frontmatter.description, LONG);
  assert.strictEqual(warningsAbout(planned, 'definition').length, 1);
});

test('AGSC-01-39 (d): ties between equal lexical forms are broken by the language tag', () => {
  const planned = planOf(`ex:c a skos:Concept ; skos:prefLabel "Violin"@en ;
    skos:definition "${LONG}"@fr, "${LONG}"@de .`);
  assert.strictEqual(itemsOf(planned).violin.frontmatter.description, LONG);
  assert.strictEqual(warningsAbout(planned, 'definition').length, 1);
});

test('AGSC-01-39 (d): an empty definition says nothing, so it writes no body paragraph and is reported as dropped', () => {
  const planned = planOf('ex:c a skos:Concept ; skos:prefLabel "Violin"@en ; skos:definition " "@en .');
  assert.strictEqual(itemsOf(planned).violin.body, '');
  assert.strictEqual(warningsAbout(planned, 'definition').length, 1);
});

test('AGSC-01-39 (d): a definition of 40 to 200 code points is the description, one of 39 or 201 is the body', () => {
  const run = (length) => itemsOf(planOf(`ex:c a skos:Concept ; skos:prefLabel "Violin"@en ;
    skos:definition "${'x'.repeat(length)}"@en .`)).violin;
  assert.strictEqual(run(40).frontmatter.description, 'x'.repeat(40));
  assert.strictEqual(run(200).frontmatter.description, 'x'.repeat(200));
  for (const length of [39, 201]) {
    const item = run(length);
    assert.strictEqual(item.frontmatter.description, undefined);
    assert.strictEqual(item.body, `${'x'.repeat(length)}\n`);
  }
});

test('AGSC-01-39 (e): broader, narrower and related between two concepts of the file become Links; others are dropped', () => {
  const planned = planOf(`ex:a a skos:Concept ; skos:prefLabel "Strings"@en ; skos:narrower ex:b, ex:b2 ; skos:related ex:b .
    ex:b a skos:Concept ; skos:prefLabel "Violin"@en ; skos:broader ex:a .
    ex:b2 a skos:Concept ; skos:prefLabel "Cello"@en ; skos:broader ex:a, <https://elsewhere.example/x> .`);
  const items = itemsOf(planned);
  assert.deepStrictEqual(items.strings.frontmatter.narrower, ['cello', 'violin']);
  assert.deepStrictEqual(items.strings.frontmatter.related, ['violin']);
  assert.deepStrictEqual(items.cello.frontmatter.broader, ['strings']);
  assert.strictEqual(warningsAbout(planned, 'broader').length, 1);
});

test('AGSC-01-39 (f): collections become clusters, and a collection in several collections takes the first as its broader', () => {
  const planned = planOf(`ex:s a skos:ConceptScheme ; skos:prefLabel "Instruments"@en .
    ex:wind a skos:Collection ; skos:prefLabel "Wind"@en ; skos:member ex:flute .
    ex:brass a skos:Collection ; skos:prefLabel "Brass"@en .
    ex:all a skos:Collection ; skos:prefLabel "All"@en ; skos:member ex:wind, ex:brass .
    ex:more a skos:Collection ; skos:prefLabel "More"@en ; skos:member ex:wind .
    ex:flute a skos:Concept ; skos:prefLabel "Flute"@en ; skos:inScheme ex:s .`);
  const items = itemsOf(planned);
  assert.strictEqual(items.wind.frontmatter.type, 'cluster');
  assert.deepStrictEqual(items.wind.frontmatter.broader, ['all'], 'IRI ex:all precedes ex:more');
  assert.strictEqual(items.brass.frontmatter.broader[0], 'all');
  assert.deepStrictEqual(items.flute.frontmatter.clusters, ['instruments', 'wind']);
  assert.strictEqual(warningsAbout(planned, 'member').length, 1, 'the membership of ex:more is dropped and reported');
});

test('AGSC-01-39 (f): an ordered collection places its members in the cluster, and its order is dropped', () => {
  const planned = planOf(`ex:q a skos:OrderedCollection ; skos:prefLabel "Quartet"@en ; skos:memberList ( ex:v ex:c ) .
    ex:v a skos:Concept ; skos:prefLabel "Violin"@en .
    ex:c a skos:Concept ; skos:prefLabel "Cello"@en .`);
  const items = itemsOf(planned);
  assert.strictEqual(items.quartet.frontmatter.type, 'cluster');
  assert.deepStrictEqual(items.violin.frontmatter.clusters, ['quartet']);
  assert.deepStrictEqual(items.cello.frontmatter.clusters, ['quartet']);
  assert.strictEqual(warningsAbout(planned, 'memberList').length, 1);
});

test('AGSC-01-39 (g) and (h): http sources, the concept IRI, and the licence of its scheme', () => {
  const planned = planOf(`ex:s a skos:ConceptScheme ; skos:prefLabel "Instruments"@en ; dcterms:license <https://creativecommons.org/licenses/by/4.0/> .
    ex:v a skos:Concept ; skos:prefLabel "Violin"@en ; skos:inScheme ex:s ;
      dcterms:source <https://example.org/a>, <https://example.org/a>, <ftp://example.org/b>, "a book" .`);
  const violin = itemsOf(planned).violin.frontmatter;
  assert.deepStrictEqual(violin.sources, [{ resource: 'https://example.org/a' }]);
  assert.strictEqual(violin['x-skos-iri'], `${EX}v`);
  assert.strictEqual(violin['x-skos-license'], 'https://creativecommons.org/licenses/by/4.0/');
  assert.strictEqual(warningsAbout(planned, 'source').length, 2, 'the ftp IRI and the literal are dropped');
});

test('AGSC-01-39: every item is a draft with an imported provenance and one draft warning each', () => {
  const planned = planOf(`ex:s a skos:ConceptScheme ; skos:prefLabel "Instruments"@en .
    ex:v a skos:Concept ; skos:prefLabel "Violin"@en ; skos:inScheme ex:s .`);
  for (const item of Object.values(itemsOf(planned))) {
    assert.strictEqual(item.frontmatter.status, 'draft');
    assert.deepStrictEqual(item.frontmatter.prov, { operator: 'human:tester', origin: 'imported' });
  }
  const drafts = planned.findings.filter((f) => f.severity === 'warn' && /status: draft/u.test(f.message));
  assert.strictEqual(drafts.length, 2);
  assert.ok(planned.findings.every((f) => f.code === 'AGSC-E506' && f.severity === 'warn'));
});

test('AGSC-01-39: slugs come from the title and collide to -2, -3 in IRI order (AGSC-01-23)', () => {
  const planned = planOf(`ex:a a skos:Concept ; skos:prefLabel "Horn"@en .
    ex:b a skos:Concept ; skos:prefLabel "Horn"@fr .
    ex:c a skos:Concept ; skos:prefLabel "Horn"@de .`);
  assert.deepStrictEqual(Object.keys(itemsOf(planned)).sort(), ['horn', 'horn-2', 'horn-3']);
  assert.strictEqual(itemsOf(planned)['horn-2'].frontmatter['x-skos-iri'], `${EX}b`);
});

test('AGSC-01-39: a statement about a class, an individual or a blank-node concept is dropped and reported', () => {
  const planned = planOf(`ex:Thing a owl:Class ; skos:prefLabel "Thing"@en .
    [] a skos:Concept ; skos:prefLabel "Anon"@en .
    ex:v a skos:Concept, owl:NamedIndividual ; skos:prefLabel "Violin"@en .`);
  assert.deepStrictEqual(Object.keys(itemsOf(planned)), ['violin']);
  const subjects = planned.findings.filter((f) => f.predicate !== undefined).map((f) => f.subject);
  assert.strictEqual(subjects.filter((s) => s === `${EX}Thing`).length, 2);
  assert.strictEqual(subjects.filter((s) => s.startsWith('_:')).length, 2, 'a concept with no IRI has nothing to keep as x-skos-iri');
  assert.strictEqual(subjects.filter((s) => s === `${EX}v`).length, 1, 'the owl:NamedIndividual type');
});

test('AGSC-01-39: a title longer than 120 code points is clipped and reported (AGSC-02-90)', () => {
  const planned = planOf(`ex:v a skos:Concept ; skos:prefLabel "${'w'.repeat(130)}"@en .`);
  const item = Object.values(itemsOf(planned))[0];
  assert.strictEqual([...item.frontmatter.title].length, 120);
  assert.ok(planned.findings.some((f) => /clipped/u.test(f.message)));
});

test('a file that is not Turtle, or holds nothing SKOS, writes nothing and says why', () => {
  const broken = skos.plan({ turtle: 'ex:a ex:b' }, { i18nDefault: 'en', itemSchema: ITEM_SCHEMA, operator: 'human:tester' });
  assert.deepStrictEqual(broken.writes, []);
  assert.deepStrictEqual(broken.findings.map((f) => [f.code, f.severity]), [['AGSC-E003', 'error']]);
  const empty = planOf('ex:Thing a owl:Class .');
  assert.deepStrictEqual(empty.writes, []);
  assert.deepStrictEqual(empty.findings.filter((f) => f.severity === 'error').map((f) => f.code), ['AGSC-E901']);
});

// ---------------------------------------------------------------- properties

const WORDS = ['Violin', 'Cello', 'Harp', 'Flute', 'Oboe', 'Drum', 'Lute', 'Horn'];
const LANGS = ['en', 'de', 'fr', 'EN'];

/** A random thesaurus: statements as Turtle lines, concepts `ex:c0`..`ex:cN`. */
const thesaurus = fc.integer({ min: 1, max: 6 }).chain((size) => fc.record({
  labels: fc.array(fc.tuple(fc.nat(size - 1), fc.constantFrom(...WORDS), fc.constantFrom(...LANGS)), { maxLength: 12 }),
  alts: fc.array(fc.tuple(fc.nat(size - 1), fc.constantFrom(...WORDS)), { maxLength: 6 }),
  links: fc.array(fc.tuple(fc.nat(size - 1), fc.constantFrom('broader', 'narrower', 'related'), fc.nat(size - 1)), { maxLength: 8 }),
  size: fc.constant(size),
})).map(({ alts, labels, links, size }) => {
  const lines = [];
  for (let i = 0; i < size; i += 1) lines.push(`ex:c${i} a skos:Concept .`);
  for (const [i, word, lang] of labels) lines.push(`ex:c${i} skos:prefLabel "${word}"@${lang} .`);
  for (const [i, word] of alts) lines.push(`ex:c${i} skos:altLabel "${word}" .`);
  for (const [i, key, j] of links) lines.push(`ex:c${i} skos:${key} ex:c${j} .`);
  return lines;
});

test('property: the plan does not depend on the order of the statements', () => {
  const withShuffle = thesaurus.chain((lines) => fc.tuple(fc.constant(lines),
    fc.shuffledSubarray(lines, { minLength: lines.length, maxLength: lines.length })));
  fc.assert(fc.property(withShuffle, ([lines, shuffled]) => {
    assert.deepStrictEqual(planOf(lines.join('\n')).writes, planOf(shuffled.join('\n')).writes);
  }), { numRuns: 100, seed: 20261031 });
});

test('property: every written item is a draft, and a second run writes the same bytes', () => {
  fc.assert(fc.property(thesaurus, (lines) => {
    const one = planOf(lines.join('\n'));
    const two = planOf(lines.join('\n'));
    assert.deepStrictEqual(one.writes, two.writes);
    assert.deepStrictEqual(one.findings, two.findings);
    for (const write of one.writes) assert.strictEqual(okf.readDocument(write.text).frontmatter.status, 'draft');
  }), { numRuns: 100, seed: 20261031 });
});
