'use strict';
// Requirement: PRD-076 (docs/PRD.md).
// verifies AGSC-08-32, AGSC-11-24, AGSC-01-41
// The bounded contexts of a node as every reader of them sees them: the contexts `domain.contexts`
// declares (AGSC-01-41), the context of an item (its `domain_context` when that names a declared
// context, else its primary cluster when that cluster is declared, else none, AGSC-08-32), and the
// address of a `peers[]` entry, which from 1.1 may be an object (AGSC-11-24) and is still named by
// its `url` alone wherever 1.0 named the string. Property tests (fast-check, fixed seed) state that
// the context of an item is total, that a node with no contexts puts every item in none, and that a
// typed peer and its plain form have the same address.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');
const contexts = require('../../src/knowledge/contexts.js');

const RUNS = { numRuns: 200, seed: 20261103, verbose: 0 };
const BILLING = { cluster: 'billing', namespace: 'https://ctx.example/billing#' };
const SHIPPING = { cluster: 'shipping', namespace: 'https://ctx.example/shipping#' };
const PEER = 'https://b.example/.well-known/knowledge-linkset';

test('the declared contexts are the well-formed entries of domain.contexts, in their order', () => {
  assert.deepStrictEqual(contexts.declared({ domain: { contexts: [SHIPPING, BILLING] } }), [SHIPPING, BILLING]);
  assert.deepStrictEqual(contexts.declared({ domain: { contexts: [BILLING, null, { cluster: 'x' }, 'billing'] } }), [BILLING]);
  for (const config of [undefined, null, {}, { domain: {} }, { domain: { contexts: [] } }, { domain: { contexts: 'billing' } }]) {
    assert.deepStrictEqual(contexts.declared(config), []);
    assert.strictEqual(contexts.declaresContexts(config), false);
  }
  assert.strictEqual(contexts.declaresContexts({ domain: { contexts: [BILLING] } }), true);
  assert.ok(Object.isFrozen(contexts.declared({ domain: { contexts: [BILLING] } })));
});

test('the context of an item: its domain_context, else its primary cluster, else none (AGSC-08-32)', () => {
  const contextOf = contexts.contextOf([BILLING, SHIPPING]);
  assert.strictEqual(contextOf({ clusters: ['billing', 'shipping'] }), 'billing', 'the first value of clusters[] is the primary');
  assert.strictEqual(contextOf({ clusters: ['agent-patterns', 'billing'] }), null, 'only the primary cluster counts');
  assert.strictEqual(contextOf({ clusters: ['billing'], domain_context: 'shipping' }), 'shipping');
  assert.strictEqual(contextOf({ clusters: ['shipping'], domain_context: 'payments' }), 'shipping',
    'a domain_context that names no declared context names none (AGSC-E418 reports it)');
  assert.strictEqual(contextOf({ domain_context: 'billing' }), 'billing');
  assert.strictEqual(contextOf({}), null);
  assert.strictEqual(contextOf(null), null);
  assert.strictEqual(contexts.contextOf([])({ clusters: ['billing'], domain_context: 'billing' }), null);
});

test('the namespace of a declared context, and none for anything else', () => {
  const namespaceOf = contexts.namespaceOf([BILLING, SHIPPING]);
  assert.strictEqual(namespaceOf('shipping'), SHIPPING.namespace);
  assert.strictEqual(namespaceOf('payments'), null);
  assert.strictEqual(namespaceOf(null), null);
});

test('a peer is named by its address, in the plain and in the typed form (AGSC-11-24)', () => {
  assert.strictEqual(contexts.peerUrl(PEER), PEER);
  assert.strictEqual(contexts.peerUrl({ relationship: 'conformist', url: PEER }), PEER);
  assert.deepStrictEqual(contexts.peerUrls([PEER, { relationship: 'shared-kernel', url: PEER.replace('b.', 'c.') }]),
    [PEER, PEER.replace('b.', 'c.')]);
  assert.deepStrictEqual(contexts.peerUrls(undefined), []);
  assert.deepStrictEqual(contexts.typedPeers({ peers: [PEER, { relationship: 'conformist', url: PEER }] }),
    [{ relationship: 'conformist', url: PEER }]);
  assert.deepStrictEqual(contexts.typedPeers({}), []);
});

const slug = fc.constantFrom('billing', 'shipping', 'payments', 'agent-patterns', 'glossary');
const item = fc.record({ clusters: fc.array(slug, { maxLength: 3 }), domain_context: fc.option(slug, { nil: undefined }) },
  { requiredKeys: [] });
const declaredSets = fc.subarray([BILLING, SHIPPING]);

test('property: the context of an item is a declared cluster or none, and depends on nothing else', () => {
  fc.assert(fc.property(declaredSets, item, (declared, subject) => {
    const context = contexts.contextOf(declared)(subject);
    assert.ok(context === null || declared.some((entry) => entry.cluster === context));
    assert.strictEqual(contexts.contextOf([...declared].reverse())(subject), context, 'the order of the entries does not matter');
    assert.strictEqual(contexts.contextOf(declared)(JSON.parse(JSON.stringify(subject))), context);
  }), RUNS);
});

test('property: a node that declares no context puts every item in none', () => {
  fc.assert(fc.property(item, (subject) => assert.strictEqual(contexts.contextOf([])(subject), null)), RUNS);
});

test('property: a typed peer has the address of its plain form', () => {
  const host = fc.stringMatching(/^[a-z][a-z0-9-]{0,12}\.example$/u);
  const relationship = fc.constantFrom('shared-kernel', 'conformist', 'translation-layer');
  fc.assert(fc.property(host, relationship, (name, kind) => {
    const url = `https://${name}/.well-known/knowledge-linkset`;
    assert.strictEqual(contexts.peerUrl({ crosswalk: 'domain/b.ttl', relationship: kind, url }), contexts.peerUrl(url));
  }), RUNS);
});
