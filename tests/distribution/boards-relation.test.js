'use strict';
// AGSC-10-13 with AGSC-06-10 (2026-09-25): a writer that emits `/boards/index.json`
// links it from the discovery document as `…/rel#boards`, with `type` and, at
// Level ≥ 2, `digest`; a node with no board emits no such link, and a caller that
// states no route set (the disc-0016 shape) gets none either.

const test = require('node:test');
const assert = require('node:assert');

const discovery = require('../../src/distribution/discovery.js');

const REL = 'https://w3id.org/agentic-system-core/rel#';
const BASE = 'https://boards.example';
const ROUTES = ['/graph.jsonld', '/llms.txt', '/graph.nq', '/graph.ttl', '/ns/context.jsonld',
  '/ns/agsc.ttl', '/now.md', '/skills/index.json', '/ledger.jsonl'];

function digestsFor(routes) {
  const out = {};
  for (const route of routes) out[route] = discovery.digestOf(route);
  return out;
}

function level2(routes) {
  return discovery.linkset({ site: { base: BASE } }, {
    bundleHash: discovery.digestOf('bundle'),
    bundleVersion: 'v1.0.0',
    counts: discovery.countsOf([]),
    digests: digestsFor(routes),
    generatedAt: '2026-01-01T00:00:00Z',
    ledgerHead: 'a'.repeat(64),
    level: 2,
    routes,
    specVersion: '1.0.0-rc.6',
  });
}

test('boards is in the closed set of extension relations, after signature (AGSC-06-10)', () => {
  assert.ok(discovery.EXTENSION_RELATIONS.includes('boards'));
  assert.ok(discovery.ALLOWED_RELATIONS.includes(`${REL}boards`));
});

test('a node that emits /boards/index.json links it with type and digest; one that does not emits no link (AGSC-10-13)', () => {
  const withBoard = level2([...ROUTES, '/boards/index.json', '/boards/delivery.json']);
  const link = withBoard.linkset[0][`${REL}boards`];
  assert.deepStrictEqual(link, [{
    digest: [discovery.digestOf('/boards/index.json')],
    href: `${BASE}/boards/index.json`,
    type: 'application/json',
  }]);
  assert.deepStrictEqual(discovery.check(withBoard, { level: 2 }), []);
  const without = level2(ROUTES);
  assert.strictEqual(without.linkset[0][`${REL}boards`], undefined);
  // The disc-0016 shape: no route set stated, digests for the nine routes alone.
  const unstated = discovery.linkset({ site: { base: BASE } }, {
    bundleHash: discovery.digestOf('bundle'), bundleVersion: 'v1.0.0', counts: discovery.countsOf([]),
    digests: digestsFor(ROUTES), generatedAt: '2026-01-01T00:00:00Z', ledgerHead: 'a'.repeat(64), level: 2, specVersion: '1.0.0-rc.6',
  });
  assert.strictEqual(unstated.linkset[0][`${REL}boards`], undefined);
});

test('at Level 0 the link carries no digest (AGSC-06-08a)', () => {
  const doc = discovery.linkset({ site: { base: BASE } }, {
    digests: digestsFor(['/boards/index.json']), level: 0, routes: ['/boards/index.json', '/llms.txt', '/graph.jsonld'],
  });
  assert.deepStrictEqual(doc.linkset[0][`${REL}boards`], [{ href: `${BASE}/boards/index.json`, type: 'application/json' }]);
  assert.deepStrictEqual(discovery.check(doc, { level: 0 }), []);
});
