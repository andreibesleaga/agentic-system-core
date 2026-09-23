'use strict';
// AGSC-11-12: `nquads.dataset`'s `citations` option places the peer-citation pairs
// the Boundary context computed (ENG-9). It invents none: a pair naming an item the
// dataset does not hold, or missing either IRI, contributes nothing.

const test = require('node:test');
const assert = require('node:assert');

const nq = require('../../src/knowledge/nquads.js');

const ITEMS = [{ slug: 'a', title: 'Alpha', type: 'concept' }];
const BASE = 'https://a.example/';

test('a citation pair becomes seeAlso + peerOrigin on the citing item, in the Bundle graph', () => {
  const text = nq.toNQuads(ITEMS, {
    base: BASE,
    citations: [{ peer: 'https://b.example/', see_also: 'https://b.example/x/', source: 'a' }],
  });
  assert.ok(text.includes('<https://a.example/concepts/a/> <http://www.w3.org/2000/01/rdf-schema#seeAlso> <https://b.example/x/> <https://a.example/> .\n'));
  assert.ok(text.includes('<https://a.example/concepts/a/> <https://w3id.org/agentic-system-core/ns#peerOrigin> <https://b.example/> <https://a.example/> .\n'));
});

test('a pair for an absent item or with a missing IRI is ignored', () => {
  const plain = nq.toNQuads(ITEMS, { base: BASE });
  const text = nq.toNQuads(ITEMS, {
    base: BASE,
    citations: [
      { peer: 'https://b.example/', see_also: 'https://b.example/x/', source: 'missing' },
      { peer: 'https://b.example/', source: 'a' },
      { see_also: 'https://b.example/x/', source: 'a' },
    ],
  });
  assert.strictEqual(text, plain);
});
