'use strict';
// The discovery document beyond disc-0003/0004/0005, and the route helpers:
// AGSC-06-08a's Level rule, AGSC-06-10's ordering and relation names, AGSC-06-35's
// related-system links, AGSC-11-20's `restricted` node and AGSC-11-23's tombstone.

const test = require('node:test');
const assert = require('node:assert');
const discovery = require('../../src/distribution/discovery.js');
const site = require('../../src/distribution/site.js');

const BASE = 'https://a.example';
const CONFIG = { site: { base: `${BASE}/` } };

test('the suffix is one constant from which the path and the alias derive (AGSC-06-07)', () => {
  assert.strictEqual(discovery.WELLKNOWN_PATH, `/.well-known/${discovery.WELLKNOWN_SUFFIX}`);
  assert.strictEqual(discovery.WELLKNOWN_ALIAS, '/.well-known/agentic-knowledge');
  assert.strictEqual(discovery.wellknownUrl(`${BASE}/`), `${BASE}/.well-known/knowledge-linkset`);
});

test('links within one relation are ordered by href, code point (AGSC-06-10)', () => {
  const doc = discovery.linkset(CONFIG, { level: 2, routes: ['/graph.nq', '/graph.ttl'] });
  const graph = doc.linkset[0][`${discovery.REL}graph`];
  assert.deepStrictEqual(graph.map((l) => l.href), [`${BASE}/graph.nq`, `${BASE}/graph.ttl`]);
});

test('a related-system link uses a registered short name and is never derived (AGSC-06-35)', () => {
  const doc = discovery.linkset({
    ...CONFIG,
    related: [{ rel: 'related', href: 'https://other.example/void', type: 'text/turtle' }],
  }, { level: 2, routes: [] });
  assert.deepStrictEqual(doc.linkset[0].related,
    [{ href: 'https://other.example/void', type: 'text/turtle' }]);
  assert.deepStrictEqual(discovery.check(doc, { level: 0 }), []);
});

test('a restricted node carries agsc-visibility; a public one carries none (AGSC-11-20)', () => {
  const open = discovery.linkset(CONFIG, { level: 0 });
  assert.ok(!('agsc-visibility' in open.linkset[0].describedby[0]), 'a public node declared a visibility');
  const shut = discovery.linkset({ ...CONFIG, visibility: 'restricted', access: `${BASE}/access/` }, { level: 0 });
  assert.deepStrictEqual(shut.linkset[0].describedby[0]['agsc-visibility'], ['restricted']);
  assert.strictEqual(shut.linkset[0][`${discovery.REL}access`].length, 1);
});

test('a tombstoned peer is resolved, not mutual (AGSC-11-23, AGSC-10-12)', () => {
  const a = { url: discovery.wellknownUrl('https://a.example/'), level: 0,
    doc: discovery.linkset({ site: { base: 'https://a.example/' }, peers: [discovery.wellknownUrl('https://b.example/')] }, { level: 0 }) };
  const b = { url: discovery.wellknownUrl('https://b.example/'), level: 0,
    doc: discovery.linkset({ site: { base: 'https://b.example/' }, peers: [a.url] }, { level: 0, tombstone: '2026-01-01T00:00:00Z' }) };
  const result = discovery.peerCheck([a, b]);
  assert.strictEqual(result.both_resolve, true);
  assert.strictEqual(result.each_names_the_other, true);
  assert.strictEqual(result.mutual, false);
  assert.deepStrictEqual(result.tombstoned, [b.url]);
});

test('check() names the structural faults with registered codes, never a thrown string', () => {
  const codes = (doc, level) => discovery.check(doc, { level }).map((f) => f.code);
  assert.deepStrictEqual(codes({ linkset: [], extra: 1 }, 2), ['AGSC-E209']);
  assert.deepStrictEqual(codes({ linkset: [{ anchor: `${BASE}/`, knowledge: [] }] }, 0), ['AGSC-E209']);
  assert.deepStrictEqual(codes({ linkset: [{ anchor: `${BASE}/`, license: [{ href: 'x', digest: 'not-an-array' }] }] }, 0),
    ['AGSC-E209', 'AGSC-E209']);
});

test('agsc-counts is one string per type, in code-point order (AGSC-06-08)', () => {
  assert.deepStrictEqual(discovery.countsOf([{ type: 'concept' }, { type: 'cluster' }, { type: 'concept' }]),
    ['clusters=1', 'concepts=2', 'episodes=0', 'gates=0', 'lessons=0', 'procedures=0']);
});

test('the digest is RFC 9530 syntax over the target bytes', () => {
  assert.strictEqual(discovery.digestOf(''), 'sha-256=:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=:');
});

test('routeOf follows AGSC-05-01 for every item type', () => {
  assert.strictEqual(site.routeOf({ type: 'procedure', slug: 'p' }), '/procedures/p/');
  assert.strictEqual(site.routeOf({ type: 'cluster', slug: 'c' }), '/clusters/c/');
  assert.strictEqual(site.routeOf({ type: 'gate', slug: 'g' }), '/gates/g/');
});

test('sitemap, robots and tdmrep state one policy three ways (AGSC-06-18/06-19)', () => {
  assert.ok(site.sitemap(BASE, ['/b/', '/a/'], '2026-01-01T00:00:00Z')
    .indexOf(`${BASE}/a/`) < site.sitemap(BASE, ['/b/', '/a/'], '2026-01-01T00:00:00Z').indexOf(`${BASE}/b/`));
  assert.ok(site.robots(BASE).includes('ai-train=no'));
  assert.deepStrictEqual(site.tdmrep(BASE), [{ location: `${BASE}/`, 'tdm-reservation': 1 }]);
});

test('check() reports every structural fault a malformed document can carry', () => {
  const codes = (doc, level) => discovery.check(doc, { level }).map((f) => f.code);
  assert.deepStrictEqual(codes(null, 2), ['AGSC-E209']);
  assert.deepStrictEqual(codes([], 2), ['AGSC-E209']);
  assert.deepStrictEqual(codes({ linkset: 'no' }, 2), ['AGSC-E209']);
  assert.deepStrictEqual(codes({ linkset: [{ noAnchor: true }] }, 0), ['AGSC-E209']);
  assert.deepStrictEqual(codes({ linkset: [{ anchor: 'a', license: 'no' }] }, 0), ['AGSC-E209']);
  assert.deepStrictEqual(codes({ linkset: [{ anchor: 'a', license: [{ noHref: true }] }] }, 0), ['AGSC-E209']);
  // AGSC-06-08a: a Level-0 document that carries a digest is reported.
  assert.deepStrictEqual(codes({ linkset: [{ anchor: 'a', license: [{ href: 'x', digest: ['d'] }] }] }, 0), ['AGSC-E209']);
  // AGSC-06-08a at Level ≥ 2: every required anchor attribute must be present.
  assert.strictEqual(codes({ linkset: [{ anchor: 'a' }] }, 2).length, discovery.ANCHOR_ATTRIBUTES.length);
  // AGSC-06-11: a rel#ledger link missing its attributes at Level ≥ 2.
  const withLedger = { linkset: [{ anchor: 'a', [`${discovery.REL}ledger`]: [{ href: 'x' }] }] };
  assert.strictEqual(codes(withLedger, 2).filter((c) => c === 'AGSC-E209').length,
    discovery.ANCHOR_ATTRIBUTES.length + discovery.LEDGER_ATTRIBUTES.length);
});

test('a peer that does not resolve is AGSC-E907, never "mutual" (AGSC-10-12)', () => {
  const a = { url: 'https://a.example/.well-known/knowledge-linkset', level: 0,
    doc: discovery.linkset({ site: { base: 'https://a.example/' } }, { level: 0 }) };
  const result = discovery.peerCheck([a, { url: 'https://b.example/.well-known/knowledge-linkset', doc: null }]);
  assert.strictEqual(result.both_resolve, false);
  assert.strictEqual(result.mutual, false);
  assert.deepStrictEqual(result.findings.map((f) => f.code), ['AGSC-E907']);
});

test('peersOf and tombstoneOf read an empty document without throwing', () => {
  assert.deepStrictEqual(discovery.peersOf(undefined), []);
  assert.strictEqual(discovery.tombstoneOf(undefined), null);
  assert.strictEqual(discovery.tombstoneOf({ linkset: [{ anchor: 'a' }] }), null);
});
