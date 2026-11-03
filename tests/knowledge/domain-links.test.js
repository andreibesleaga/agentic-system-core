'use strict';
// verifies AGSC-03-27, AGSC-02-25
// Domain links (AGSC-03-27): typed links whose type the site vocabulary defines, written under
// `domain_links`. The Links module turns them into edges with the inverse or symmetric edge the
// vocabulary declares, and reports the three faults of the rule as AGSC-E317; the items' domain
// keys that name nothing are AGSC-E418 (AGSC-02-25). The whole-case vectors are links-0018,
// links-0019 and lint-0061. Offline and deterministic: fixed seed, no clock, no network.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');
const links = require('../../src/knowledge/links.js');
const domain = require('../../src/knowledge/domain.js');
const { VALID, withExtra } = require('./_domain-fixtures.js');

const RUNS = { numRuns: 60, seed: 20261102, verbose: 0 };
const OPS = 'https://minimal.example/ns/ops#';
const CONTEXTS = [{ cluster: 'ops', namespace: OPS }];

/** VALID declares `controlled-by` and `controls` inverse of each other in both directions:
 * the computed one is `controls`, whose IRI is greater in code-point order (AGSC-03-27). */
const MODEL = domain.load(withExtra([
  'dom:pairedWith a owl:ObjectProperty , owl:SymmetricProperty ; rdfs:label "paired with" ; rdfs:subPropertyOf skos:related .',
  'dom:feeds a owl:ObjectProperty ; rdfs:label "feeds" ; rdfs:subPropertyOf asc:uses .',
  'dom:drives a owl:ObjectProperty ; rdfs:label "drives" ; rdfs:subPropertyOf asc:uses ; owl:inverseOf dom:driven-by .',
  'dom:driven-by a owl:ObjectProperty ; rdfs:label "driven by" ; rdfs:subPropertyOf asc:uses .',
  'dom:needs a owl:ObjectProperty ; rdfs:label "needs" ; rdfs:subPropertyOf <http://purl.org/dc/terms/requires> .',
  'dom:Pump a owl:Class ; rdfs:label "Pump" ; rdfs:subClassOf asc:Concept .',
  `<${OPS}vents> a owl:ObjectProperty ; rdfs:label "vents" ; rdfs:subPropertyOf asc:uses .`,
  `<${OPS}Valve> a owl:Class ; rdfs:label "Valve" ; rdfs:subClassOf asc:Concept .`,
].join('\n')), { contexts: CONTEXTS });

const concept = (slug, extra = {}) => ({ slug, type: 'concept', ...extra });
const cluster = (slug, extra = {}) => ({ slug, type: 'cluster', ...extra });
const resolve = (items, model = MODEL) => links.resolve(items, { domain: model });
const codes = (result) => result.errors.filter((f) => f.severity === 'error').map((f) => [f.code, f.slug, f.key]);

test('an authored domain link is an edge, and its declared inverse is computed back (AGSC-03-27)', () => {
  const result = resolve([concept('a', { domain_links: { 'controlled-by': ['b'], drives: ['b'] } }), concept('b')]);
  assert.deepStrictEqual(result.edges, [
    { computed: false, key: 'controlled-by', source: 'a', target: 'b' },
    { computed: false, key: 'drives', source: 'a', target: 'b' },
    { computed: true, key: 'controls', source: 'b', target: 'a' },
    { computed: true, key: 'driven-by', source: 'b', target: 'a' },
  ]);
  assert.deepStrictEqual(codes(result), []);
});

test('a symmetric property runs both ways; a property with no inverse gives one edge', () => {
  const result = resolve([concept('a', { domain_links: { pairedWith: ['b'], feeds: ['b'] } }), concept('b')]);
  assert.deepStrictEqual(result.edges.map((e) => [e.source, e.key, e.target, e.computed]), [
    ['a', 'feeds', 'b', false], ['a', 'pairedWith', 'b', false], ['b', 'pairedWith', 'a', true]]);
});

test('the three faults of the rule are each the error AGSC-E317 on the item and the member', () => {
  const result = resolve([
    concept('a', { domain_links: { owns: ['b'] } }),
    concept('b', { domain_links: { controls: ['a'], 'driven-by': ['a'] } }),
    cluster('c', { domain_links: { pairedWith: ['a'] } }),
    concept('d', { domain_links: { pairedWith: ['c'] } }),
  ]);
  assert.deepStrictEqual(codes(result), [['AGSC-E317', 'c', 'pairedWith'],
    ['AGSC-E317', 'a', 'owns'], ['AGSC-E317', 'b', 'controls'], ['AGSC-E317', 'b', 'driven-by'], ['AGSC-E317', 'd', 'pairedWith']]);
  assert.deepStrictEqual(result.edges, [], 'a refused member is no edge');
  const message = (slug) => result.errors.find((f) => f.slug === slug && f.code === 'AGSC-E317').message;
  assert.match(message('a'), /no object property of the site vocabulary/u);
  assert.match(message('b'), /computed inverse/u);
  assert.match(message('c'), /skos:Collection/u);
});

test('an unresolved target is AGSC-E301, and an anchor resolves as for every Link (AGSC-03-02)', () => {
  const result = resolve([concept('a', { domain_links: { feeds: ['nowhere', 'b#intent', 'b#absent'] } }),
    concept('b', { body: '## Intent\n\nText.\n' })]);
  assert.deepStrictEqual(codes(result), [['AGSC-E301', 'a', 'feeds'], ['AGSC-E301', 'a', 'feeds']]);
  assert.deepStrictEqual(result.edges, [{ computed: false, key: 'feeds', source: 'a', target: 'b' }]);
});

test('without a site vocabulary the key is read by nobody: no edge and no finding', () => {
  const items = [concept('a', { domain_links: { owns: ['b'], feeds: ['nowhere'] } }), concept('b', { related: ['a'] })];
  const plain = links.resolve(items);
  assert.deepStrictEqual(plain, links.resolve(items.map(({ domain_links, ...rest }) => rest)));
  assert.deepStrictEqual(plain.edges.map((e) => e.key), ['related', 'related']);
});

test('a domain link counts as an inbound reference and is never a Link of the fourteen checks', () => {
  // `b` has no inbound Link: only the domain link of `a` keeps it from being an orphan.
  const result = resolve([cluster('k', { description: 'x' }), concept('a', { clusters: ['k'], domain_links: { feeds: ['a', 'b'], needs: ['c'] } }),
    concept('b'), concept('c', { clusters: ['k'], requires: ['a'] })]);
  const warnings = result.findings.filter((f) => f.severity === 'warn').map((f) => [f.code, f.slug]);
  assert.deepStrictEqual(warnings, [], 'no orphan, no self-link warning, no pair warning');
  assert.strictEqual(result.cycle, null, 'a domain link never closes a requires cycle');
});

test('a member name resolves in the namespace of the item\'s context, else in the site namespace (AGSC-02-25)', () => {
  const items = [cluster('ops', { description: 'x' }), concept('a', { clusters: ['ops'], domain_links: { vents: ['b'], feeds: ['b'] } }),
    concept('b', { domain_context: 'ops', domain_links: { vents: ['a'] } }), concept('e', { domain_links: { vents: ['a'] } })];
  const result = resolve(items);
  assert.deepStrictEqual(codes(result), [['AGSC-E317', 'a', 'feeds'], ['AGSC-E317', 'e', 'vents']]);
  assert.deepStrictEqual(result.edges.filter((e) => e.key === 'vents').map((e) => [e.source, e.target]), [['a', 'b'], ['b', 'a']]);
});

test('the edges and findings do not depend on the order of the items', () => {
  const items = [concept('a', { domain_links: { 'controlled-by': ['b'], pairedWith: ['c'], owns: ['c'] } }),
    concept('b', { domain_links: { feeds: ['c', 'a'] } }), concept('c', { domain_links: { controls: ['a'] } })];
  const once = resolve(items);
  fc.assert(fc.property(fc.shuffledSubarray(items, { minLength: items.length }), (shuffled) => {
    const again = resolve(shuffled);
    assert.deepStrictEqual(again.edges, once.edges);
    assert.deepStrictEqual(again.errors, once.errors);
  }), RUNS);
});

test('the model says which side of an inverse pair is computed, and its local name (AGSC-03-27)', () => {
  const item = concept('a');
  assert.deepStrictEqual([MODEL.propertyFor(item, 'controlled-by').computed, MODEL.propertyFor(item, 'controls').computed], [false, true]);
  assert.deepStrictEqual([MODEL.propertyFor(item, 'drives').computed, MODEL.propertyFor(item, 'driven-by').computed], [false, true]);
  assert.strictEqual(MODEL.propertyFor(item, 'drives').inverseName, 'driven-by');
  assert.strictEqual(MODEL.propertyFor(item, 'feeds').inverseName, null);
  assert.strictEqual(MODEL.propertyFor(item, 'pairedWith').computed, false);
  assert.strictEqual(domain.load(VALID).propertyFor(item, 'controls').inverseName, 'controlled-by');
});

// ---------------------------------------------------------------- AGSC-E418

const item = (slug, extra) => ({ frontmatter: { slug, type: 'concept', ...extra }, path: `content/concepts/${slug}.md`, slug, type: 'concept' });
const e418 = (items, options) => domain.itemFindings(items, options).map((f) => [f.code, f.file, f.key, f.severity]);

test('a domain type that names no class, or on a node with no vocabulary file, is AGSC-E418', () => {
  const items = [item('a', { domain_type: 'Engine' }), item('b', { domain_type: 'Turbine' }), item('c', { domain_role: 'entity' })];
  assert.deepStrictEqual(e418(items, { model: MODEL, vocabulary: true }), [
    ['AGSC-E418', 'content/concepts/b.md', 'domain_type', 'error']]);
  assert.deepStrictEqual(e418(items, { model: null, vocabulary: false }), [
    ['AGSC-E418', 'content/concepts/a.md', 'domain_type', 'error'], ['AGSC-E418', 'content/concepts/b.md', 'domain_type', 'error']]);
  assert.deepStrictEqual(e418(items, { model: null, vocabulary: true }), [], 'a vocabulary that does not load is AGSC-E420 alone');
});

test('domain links on a node with no vocabulary file are the warning AGSC-E207: nothing reads them (AGSC-03-27)', () => {
  const items = [item('a', { domain_links: { owns: ['b'] } }), item('b', { domain_links: {} })];
  assert.deepStrictEqual(e418(items, { model: null, vocabulary: false }), [
    ['AGSC-E207', 'content/concepts/a.md', 'domain_links', 'warn'], ['AGSC-E207', 'content/concepts/b.md', 'domain_links', 'warn']]);
  assert.deepStrictEqual(e418(items, { model: MODEL, vocabulary: true }), [], 'with a vocabulary the links are judged as edges (AGSC-E317)');
  assert.deepStrictEqual(e418(items, { model: null, vocabulary: true }), [], 'a vocabulary that does not load is AGSC-E420 alone');
});

test('a domain context that no entry of domain.contexts declares is AGSC-E418', () => {
  const items = [item('a', { domain_context: 'ops' }), item('b', { domain_context: 'payments' })];
  assert.deepStrictEqual(e418(items, { contexts: CONTEXTS, model: MODEL, vocabulary: true }), [
    ['AGSC-E418', 'content/concepts/b.md', 'domain_context', 'error']]);
  assert.strictEqual(e418(items, { model: null, vocabulary: false }).length, 2, 'no contexts declared at all');
});

test('a domain type resolves under the namespace of the item\'s context (AGSC-02-25)', () => {
  const items = [item('a', { domain_context: 'ops', domain_type: 'Valve' }), item('b', { clusters: ['ops'], domain_type: 'Pump' }),
    item('c', { domain_type: 'Pump' })];
  assert.deepStrictEqual(e418(items, { contexts: CONTEXTS, model: MODEL, vocabulary: true }), [
    ['AGSC-E418', 'content/concepts/b.md', 'domain_type', 'error']]);
});

test('an item with none of the keys gives nothing, whatever the vocabulary', () => {
  fc.assert(fc.property(fc.boolean(), fc.boolean(), (hasModel, vocabulary) => {
    assert.deepStrictEqual(domain.itemFindings([item('a', { title: 'A' })], { model: hasModel ? MODEL : null, vocabulary }), []);
  }), RUNS);
});
