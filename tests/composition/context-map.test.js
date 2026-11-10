'use strict';
// Requirement: PRD-076 (docs/PRD.md).
// verifies AGSC-07-30, AGSC-08-32, AGSC-11-24
// The context map of a composition (AGSC-07-30): for a node that declares contexts, one JSON object
// in JCS form and one LF, `context-map.json`, written in the companion directory beside the Harness
// and never in it. It names the declared contexts the members belong to, the authored Links inside
// the selection that cross from one context to another, the members in no context, and the peers'
// declared relationships and crosswalks (AGSC-11-24). A node that declares no context gets no file.
// The bytes of the full file are pinned by vector compose-0032; these tests pin the parts that
// vector leaves at their simplest (domain_context, a Link to a member in no context, peers) and, by
// fast-check with a fixed seed, that the file is deterministic and places every member once. That the
// seven Harness file kinds keep their bytes is pinned by compose-0032 against compose-0033.

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fc = require('fast-check');
const { compose } = require('../../src/composition/compose.js');
const harness = require('../../src/composition/harness.js');
const contextMap = require('../../src/composition/context-map.js');

const RUNS = { numRuns: 60, seed: 20261103, verbose: 0 };
const CONTEXTS = [
  { cluster: 'billing', namespace: 'https://ctx.example/billing#' },
  { cluster: 'shipping', namespace: 'https://ctx.example/shipping#' },
];
const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const concept = (slug, fields = {}) => ({ description: `About ${slug}.`, kind: 'pattern', slug, sources: [{ resource: `https://example.org/${slug}` }],
  title: slug, type: 'concept', ...fields });
const ITEMS = [
  { description: 'Money.', slug: 'billing', title: 'Billing', type: 'cluster' },
  { description: 'Goods.', slug: 'shipping', title: 'Shipping', type: 'cluster' },
  concept('invoice', { clusters: ['billing'], related: ['glossary'], requires: ['parcel'] }),
  concept('parcel', { clusters: ['shipping'], uses: ['invoice'] }),
  concept('label', { clusters: ['billing'], domain_context: 'shipping', broader: ['parcel'] }),
  concept('glossary', { kind: 'term' }),
];

function optionsFor(result, fields = {}) {
  const selectionDigest = sha256(harness.selectionDigestInput(result));
  return { bundleVersion: '1.4.0', contexts: CONTEXTS, instant: '2026-09-16T12:34:56Z', items: ITEMS,
    licenseProse: 'LicenseRef-AgenticSystemCore-Content-Use-1.0', peers: [], selectionDigest, specVersion: '1.0.0', ...fields };
}

test('the map names each context with its members, the crossing Links, and the members in no context', () => {
  const result = compose(ITEMS, ['invoice', 'label', 'glossary']);
  const map = contextMap.contextMap(result, optionsFor(result));
  assert.deepStrictEqual(map.selection, ['glossary', 'invoice', 'label', 'parcel']);
  assert.deepStrictEqual(map.contexts, [
    { members: ['invoice'], name: 'billing', namespace: 'https://ctx.example/billing#' },
    { members: ['label', 'parcel'], name: 'shipping', namespace: 'https://ctx.example/shipping#' },
  ], 'label is in shipping by its domain_context, whatever its primary cluster');
  assert.deepStrictEqual(map.cross_context_links, [
    { key: 'requires', source: 'invoice', source_context: 'billing', target: 'parcel', target_context: 'shipping' },
    { key: 'uses', source: 'parcel', source_context: 'shipping', target: 'invoice', target_context: 'billing' },
  ], 'label broader parcel stays inside shipping; invoice related glossary has one end in no context');
  assert.deepStrictEqual(map.unassigned, ['glossary']);
  assert.deepStrictEqual(Object.keys(map), ['bundle_version', 'contexts', 'cross_context_links', 'generated_at', 'license',
    'peers', 'selection', 'selection_digest', 'spec_version', 'terms_statement', 'unassigned']);
});

test('AGSC-07-30 as amended 2026-11-10: a context whose cluster is not listed (a draft) is never named', () => {
  const result = compose(ITEMS, ['invoice', 'label', 'glossary']);
  const listed = ITEMS.map((item) => item.slug).filter((slug) => slug !== 'shipping');
  const map = contextMap.contextMap(result, optionsFor(result, { listed }));
  assert.deepStrictEqual(map.contexts, [{ members: ['invoice'], name: 'billing', namespace: 'https://ctx.example/billing#' }]);
  assert.deepStrictEqual(map.cross_context_links, [], 'no Link crosses into a context that is not named');
  assert.deepStrictEqual(map.unassigned, ['glossary', 'label', 'parcel']);
  assert.doesNotMatch(JSON.stringify(map), /shipping/u);
});

test('the peers carry their relationship and crosswalk, ordered by address', () => {
  const result = compose(ITEMS, ['invoice']);
  const peers = [
    { relationship: 'translation-layer', statements: [{ local: 'https://a.example/concepts/invoice/', match: 'closeMatch', peer: 'https://c.example/concepts/bill/' }],
      url: 'https://c.example/.well-known/knowledge-linkset' },
    { relationship: 'conformist', statements: [], url: 'https://b.example/.well-known/knowledge-linkset' },
  ];
  assert.deepStrictEqual(contextMap.contextMap(result, optionsFor(result, { peers })).peers, [
    { crosswalk: [], relationship: 'conformist', url: 'https://b.example/.well-known/knowledge-linkset' },
    { crosswalk: [{ local: 'https://a.example/concepts/invoice/', match: 'closeMatch', peer: 'https://c.example/concepts/bill/' }],
      relationship: 'translation-layer', url: 'https://c.example/.well-known/knowledge-linkset' },
  ]);
});

test('the file is the JCS form and one LF, and a node with no contexts has none', () => {
  const result = compose(ITEMS, ['invoice']);
  const files = contextMap.contextMapFiles(result, optionsFor(result));
  assert.deepStrictEqual(files.map(([name]) => name), ['context-map.json']);
  assert.strictEqual(files[0][1], `${harness.canonicalJson(JSON.parse(files[0][1]))}\n`);
  for (const contexts of [[], undefined]) {
    assert.deepStrictEqual(contextMap.contextMapFiles(result, optionsFor(result, { contexts })), []);
    assert.strictEqual(contextMap.contextMap(result, optionsFor(result, { contexts })), null);
  }
  const invalid = compose(ITEMS, ['missing']);
  assert.deepStrictEqual(contextMap.contextMapFiles(invalid, optionsFor(invalid)), [], 'no Harness, no map (AGSC-07-17)');
});

test('property: the file is deterministic and is written exactly when the node declares contexts', () => {
  const slugs = fc.subarray(['invoice', 'parcel', 'label', 'glossary'], { minLength: 1 });
  fc.assert(fc.property(slugs, fc.subarray(CONTEXTS), (selection, contexts) => {
    const result = compose(ITEMS, selection);
    const options = optionsFor(result, { contexts });
    const once = contextMap.contextMapFiles(result, options);
    assert.deepStrictEqual(contextMap.contextMapFiles(compose(ITEMS, [...selection].reverse()), options), once,
      'the input order of the selection does not reach the file');
    assert.strictEqual(once.length, contexts.length > 0 ? 1 : 0);
    if (once.length === 1) {
      const map = JSON.parse(once[0][1]);
      const placed = [...map.contexts.flatMap((c) => c.members), ...map.unassigned].sort();
      assert.deepStrictEqual(placed, map.selection, 'every member is in exactly one context or unassigned');
    }
  }), RUNS);
});
