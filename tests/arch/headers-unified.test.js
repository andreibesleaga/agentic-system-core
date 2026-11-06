'use strict';
// AGSC-11-03 / AGSC-11-05 are implemented ONCE. `boundary/visibility.js` owns
// them — the anti-corruption layer where the boundary chapter lives — and
// `distribution/headers.js` turns the same data into the bytes of `_headers`
// (AGSC-06-04, AGSC-06-17). This suite is the proof that the two agree BYTE
// for byte, so the duplication and both reported cannot come
// back unnoticed.

const test = require('node:test');
const assert = require('node:assert');

const headers = require('../../src/distribution/headers.js');
const visibility = require('../../src/boundary/visibility.js');

/** The header map `_headers` yields for one concrete route, glob rules applied. */
function fromHeadersFile(config, route) {
  const out = {};
  for (const set of headers.headerSets(config)) {
    if (!matches(set.route, route)) continue;
    for (const [name, value] of set.headers) out[name] = value;
  }
  return out;
}

/** The `_headers` glob syntax: `*` matches any run of characters. */
function matches(pattern, route) {
  const escaped = String(pattern).replace(/[.+?^${}()|[\]\\]/gu, '\\$&').split('*').join('[^]*');
  return new RegExp(`^${escaped}$`, 'u').test(route);
}

/** The AGSC-11-03/11-05 members alone — the ones both modules claim to own. */
function boundaryMembers(map) {
  const out = {};
  for (const name of ['Access-Control-Allow-Origin', 'Access-Control-Expose-Headers', 'Cache-Control', 'Link']) {
    if (map[name] !== undefined) out[name] = map[name];
  }
  return out;
}

const ROUTES = Object.freeze(['/', '/.well-known/knowledge-linkset', '/graph.jsonld', '/graph.nq',
  '/graph.ttl', '/llms.txt', '/llms-full.txt', '/chunks.jsonl', '/ledger.jsonl', '/search.json',
  '/now.md', '/boards/index.json', '/pages/a.md', '/ns/context.jsonld', '/concepts/a/', '/404.html']);

for (const visibilityValue of ['public', 'restricted']) {
  test(`AGSC-11-03/11-05: _headers and boundary/visibility agree on every route (${visibilityValue})`, () => {
    for (const route of ROUTES) {
      const fromFile = boundaryMembers(fromHeadersFile({ visibility: visibilityValue }, route));
      const fromBoundary = boundaryMembers(visibility.headersFor(route, { level: 2, visibility: visibilityValue }));
      assert.deepStrictEqual(fromFile, fromBoundary, `${route} (${visibilityValue})`);
    }
  });
}

test('the CORS pair and the no-cache list are ONE definition, not two', () => {
  assert.deepStrictEqual(Object.fromEntries(headers.CORS), visibility.CORS_HEADERS);
  assert.strictEqual(headers.NO_CACHE, visibility.NO_CACHE_ROUTES);
  assert.deepStrictEqual(headers.headerSets({}).find((s) => s.route === '/').headers,
    [['Link', visibility.DESCRIBEDBY_LINK_HEADER]]);
});

// AGSC-06-40 (spec/06, a Distribution rule) adds the FAIR Signposting links to the same `Link` field
// of `/`; the boundary's AGSC-11-05 value stays that field's first value, byte for byte.
test('AGSC-06-40 with AGSC-11-05: the Link field of a node with a home page starts with the boundary\'s value', () => {
  const routes = ['/index.html', '/graph.jsonld', '/graph.nq', '/graph.ttl', '/chunks.jsonl'];
  for (const visibilityValue of ['public', 'restricted']) {
    const config = { site: { base: 'https://a.example/' }, visibility: visibilityValue };
    const home = headers.headerSets(config, routes).find((s) => s.route === '/').headers.filter(([name]) => name === 'Link');
    assert.strictEqual(home.length, 1, 'one Link field in the one block of / (AGSC-06-17)');
    assert.ok(home[0][1].startsWith(`${visibility.DESCRIBEDBY_LINK_HEADER}, `), home[0][1]);
    assert.strictEqual(visibility.headersFor('/', { level: 2, visibility: visibilityValue }).Link, visibility.DESCRIBEDBY_LINK_HEADER);
  }
});

test('AGSC-11-03: the credentials header is emitted nowhere', () => {
  const text = headers.headersFile({});
  for (const forbidden of visibility.FORBIDDEN_HEADERS) {
    assert.ok(!text.includes(forbidden), `${forbidden} reached _headers`);
  }
});

test('AGSC-11-05: `immutable` is emitted nowhere at 1.0', () => {
  assert.ok(!headers.headersFile({}).includes('immutable'));
});
