'use strict';
// AGSC-06-08 (amended 2026-10-02 for 1.0.0): a discovery document whose anchor is not on the
// origin it was retrieved from is not that node's discovery document. The engine reads other
// nodes' documents in two places — the mutual peer check (AGSC-10-12) and the federation
// walk (AGSC-11-10) — and both now skip such a document as AGSC-E907.
//
// Deterministic: in-memory documents and an injected fetch; no network.

const test = require('node:test');
const assert = require('node:assert/strict');

const discovery = require('../../src/distribution/discovery.js');
const federation = require('../../src/boundary/federation.js');

const A = 'https://a.example/';
const B = 'https://b.example/';
const doc = (base, peer) => discovery.linkset({ peers: [peer], site: { base } }, { level: 0 });

test('anchorOnOrigin: same origin true, another origin false, no URL not judged', () => {
  assert.equal(discovery.anchorOnOrigin(doc(A, B), discovery.wellknownUrl(A)), true);
  assert.equal(discovery.anchorOnOrigin(doc(A, B), discovery.wellknownUrl(B)), false);
  assert.equal(discovery.anchorOnOrigin(doc(A, B), undefined), true);
});

test('AGSC-10-12: a peer whose document carries another node\'s anchor does not resolve', () => {
  const honest = discovery.peerCheck([
    { doc: doc(A, discovery.wellknownUrl(B)), level: 0, url: discovery.wellknownUrl(A) },
    { doc: doc(B, discovery.wellknownUrl(A)), level: 0, url: discovery.wellknownUrl(B) },
  ]);
  assert.equal(honest.mutual, true);
  // B serves a copy of A's document: it names A's anchor and lists B as A's peer.
  const copied = discovery.peerCheck([
    { doc: doc(A, discovery.wellknownUrl(B)), level: 0, url: discovery.wellknownUrl(A) },
    { doc: doc(A, discovery.wellknownUrl(B)), level: 0, url: discovery.wellknownUrl(B) },
  ]);
  assert.equal(copied.both_resolve, false);
  assert.deepEqual(copied.findings.map((f) => f.code), ['AGSC-E907']);
});

test('AGSC-11-10: the walk skips a peer whose reported anchor is on another origin', () => {
  const a = discovery.wellknownUrl(A);
  const b = discovery.wellknownUrl(B);
  const fetch = (key) => (key === a
    ? { anchor: A, ok: true, peers: [b], url: a }
    : { anchor: A, ok: true, peers: [], url: b }); // B answers with A's anchor
  const result = federation.walk({ fetch, start: a });
  assert.deepEqual([...result.visited], [a]);
  assert.deepEqual(result.skipped.map((s) => ({ code: s.code, peer: s.peer })), [{ code: 'AGSC-E907', peer: b }]);
});

test('AGSC-11-10: a redirect is judged by the URL finally read, not the key asked for', () => {
  const a = discovery.wellknownUrl(A);
  const fetch = () => ({ anchor: B, ok: true, peers: [], url: discovery.wellknownUrl(B) });
  assert.deepEqual([...federation.walk({ fetch, start: a }).visited], [a]);
});
