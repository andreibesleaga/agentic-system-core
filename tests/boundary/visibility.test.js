'use strict';
// Unit tests for the visibility half of the Boundary context.
// AGSC-11-01..11-05, AGSC-11-20, AGSC-11-22.

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

const v = require('../../src/boundary/visibility.js');

const plain = (value) => JSON.parse(JSON.stringify(value));

test('AGSC-11-02: an unknown value is read as the most restrictive member', () => {
  assert.strictEqual(v.readReserved('visibility', ['ephemeral']), 'restricted');
  assert.strictEqual(v.readReserved('visibility', 'public'), 'public');
  assert.strictEqual(v.readReserved('agsc-access', ['token-3']), 'credential');
  assert.strictEqual(v.readReserved('agsc-access', ['none']), 'none');
  assert.strictEqual(v.readReserved('agsc-surface', ['holo']), 'not served');
  assert.strictEqual(v.readReserved('agsc-surface', ['mcp']), 'mcp');
  assert.strictEqual(v.readReserved('agsc-surface', ['x-acme-holo']), 'x-acme-holo');
  assert.strictEqual(v.readReserved('agsc-contribute-mode', ['telepathy']), 'not contributable');
  assert.strictEqual(v.readReserved('agsc-contribute-mode', ['pr']), 'pr');
  assert.throws(() => v.readReserved('nonsense', 'x'), TypeError);
});

test('AGSC-11-03: an HTML route is not an artefact; everything else of AGSC-06-01 is', () => {
  assert.strictEqual(v.isArtefact('/graph.nq'), true);
  assert.strictEqual(v.isArtefact('/.well-known/knowledge-linkset'), true);
  assert.strictEqual(v.isArtefact('/concepts/a/'), false);
  assert.strictEqual(v.isArtefact('/404.html'), false);
});

test('AGSC-11-03: a public artefact carries the wildcard and never the credentials header', () => {
  const headers = v.headersFor('/graph.nq', { visibility: 'public' });
  assert.strictEqual(headers['Access-Control-Allow-Origin'], '*');
  assert.strictEqual(headers['Access-Control-Expose-Headers'], 'Link, ETag, Content-Type');
  for (const forbidden of v.FORBIDDEN_HEADERS) assert.strictEqual(headers[forbidden], undefined);
  // An HTML page is outside the rule.
  assert.strictEqual(v.headersFor('/concepts/a/', {})['Access-Control-Allow-Origin'], undefined);
});

test('AGSC-11-20: restricted drops the wildcard everywhere but the discovery document', () => {
  assert.strictEqual(v.headersFor(v.WELLKNOWN, { visibility: 'restricted' })['Access-Control-Allow-Origin'], '*');
  assert.strictEqual(v.headersFor('/graph.nq', { visibility: 'restricted' })['Access-Control-Allow-Origin'], undefined);
  const links = v.visibilityLinks({ access: 'https://a.example/access/', visibility: 'restricted' });
  assert.deepStrictEqual(plain(links.attributes), { 'agsc-visibility': ['restricted'] });
  assert.deepStrictEqual(plain(links.links), [
    { href: 'https://a.example/access/', rel: 'https://w3id.org/agentic-system-core/rel#access' },
  ]);
  assert.strictEqual(links.wildcardAllowed, false);
  // a public node carries no agsc-visibility attribute and no access link.
  const publicNode = v.visibilityLinks({});
  assert.deepStrictEqual(plain(publicNode.attributes), {});
  assert.deepStrictEqual(plain(publicNode.links), []);
  assert.strictEqual(publicNode.wildcardAllowed, true);
  // A restricted node with no access target still declares its visibility.
  assert.deepStrictEqual(plain(v.visibilityLinks({ visibility: 'restricted' }).links), []);
});

test('AGSC-11-05: the describedby Link header on /, quoted SHA-256 ETags, no-cache, no immutable', () => {
  const bytes = '{"linkset":[]}\n';
  const sets = v.headerSets({
    artefacts: { '/graph.jsonld': bytes },
    level: 2,
    routes: ['/', v.WELLKNOWN, '/ledger.jsonl', '/now.md'],
    visibility: 'public',
  });
  assert.strictEqual(sets['/'].Link, v.DESCRIBEDBY_LINK_HEADER);
  assert.strictEqual(sets['/graph.jsonld'].ETag, `"${crypto.createHash('sha256').update(bytes).digest('hex')}"`);
  for (const route of v.NO_CACHE_ROUTES) assert.strictEqual(sets[route]['Cache-Control'], 'no-cache');
  assert.ok(!Object.values(sets).some((h) => String(h['Cache-Control'] || '').includes('immutable')));
  // A Level-0 publisher sends no describedby Link header (AGSC-11-05 is Level >= 2).
  assert.strictEqual(v.headersFor('/', { level: 0 }).Link, undefined);
  assert.strictEqual(v.etag(''), `"${crypto.createHash('sha256').update('').digest('hex')}"`);
  assert.strictEqual(v.etag(undefined), v.etag(''));
  assert.deepStrictEqual(plain(v.headerSets(undefined)), {});
});

test('AGSC-11-04: the profile is accepted from the media type or the Link header alone', () => {
  const byType = { 'content-type': `application/linkset+json; profile="${v.PROFILE_URI}"` };
  const byHeader = { 'content-type': 'application/linkset+json', link: `<${v.PROFILE_URI}>; rel="profile"` };
  assert.strictEqual(v.profileRecognised(byType), true);
  assert.strictEqual(v.profileRecognised(byHeader), true);
  assert.strictEqual(v.profileRecognised({ 'content-type': 'application/linkset+json' }), false);
  assert.strictEqual(v.profileRecognised(undefined), false);
  // A client that cannot read headers still recognises the media-type carrier.
  assert.strictEqual(v.profileRecognisedWithoutHeaders(byType), true);
  assert.strictEqual(v.profileRecognisedWithoutHeaders(byHeader), false);
  assert.strictEqual(v.profileRecognisedWithoutHeaders({ contentType: `x; profile=${v.PROFILE_URI}` }), true);
});

test('AGSC-11-01: an out-of-range or unknown boundary parameter is AGSC-E209', () => {
  const codes = (config) => plain(v.checkBoundaryConfig(config)).map((x) => x.key);
  assert.deepStrictEqual(codes({ federation: { hop_limit: 6 } }), ['federation.hop_limit']);
  assert.deepStrictEqual(codes({ federation: { timeout_ms: 10 } }), ['federation.timeout_ms']);
  assert.deepStrictEqual(codes({ federation: { nonsense: 1 } }), ['federation.nonsense']);
  assert.deepStrictEqual(codes({ federation: [] }), ['federation']);
  assert.deepStrictEqual(codes({ visibility: 'invisible' }), ['visibility']);
  assert.deepStrictEqual(codes({ chunks: { max_bytes: 4 } }), ['chunks.max_bytes']);
  // Inside the range, and a vendor member, are accepted.
  assert.deepStrictEqual(codes({
    chunks: { max_bytes: 4096 },
    federation: { 'x-acme-retry': 2, hop_limit: 0 },
    visibility: 'restricted',
  }), []);
  assert.deepStrictEqual(codes({}), []);
  assert.deepStrictEqual(codes(undefined), []);
  assert.strictEqual(v.checkBoundaryConfig({ related: [{ href: 'https://x/', rel: 'ard', type: 'a/b' }] })[0].code, 'AGSC-E209');
});

test('AGSC-11-22: a retired item keeps its page, leaves the indexes and gains asc:retiredAt', () => {
  const result = v.retirement(
    [{ modified: '2026-09-01', slug: 'old', status: 'retired' }, { slug: 'new', uses: ['old'] }],
    { base: 'https://a.example/' },
  );
  // F27-11 (R64): every Finding carries a message a reader can act on.
  assert.deepStrictEqual(plain(result.findings), [{
    code: 'AGSC-E411', key: 'uses', message: 'uses names old, which is retired (AGSC-11-22)',
    severity: 'warn', slug: 'new', target: 'old',
  }]);
  assert.deepStrictEqual(plain(result.quads), [
    '<https://a.example/concepts/old/> <https://w3id.org/agentic-system-core/ns#retiredAt> '
    + '"2026-09-01T00:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> <https://a.example/> .',
  ]);
  assert.deepStrictEqual(plain(result.pagesKept), ['old']);
  for (const route of ['search.json', '/chunks.jsonl', '/llms.txt', 'composition']) {
    assert.ok(result.excludedFrom.includes(route));
  }
});

test('AGSC-11-22: supersedes may name a retired item without warning', () => {
  const result = v.retirement([{ slug: 'old', status: 'retired' }, { slug: 'new', supersedes: ['old'] }], {});
  assert.deepStrictEqual(plain(result.findings), []);
});

test('AGSC-05-14: retiredAt takes modified, else date, and is omitted when both are absent', () => {
  assert.strictEqual(v.retiredAt({ date: '2026-01-02', modified: '2026-09-01' }), '2026-09-01T00:00:00Z');
  assert.strictEqual(v.retiredAt({ date: '2026-01-02' }), '2026-01-02T00:00:00Z');
  assert.strictEqual(v.retiredAt({ modified: '2026-09-01T12:00:00Z' }), '2026-09-01T12:00:00Z');
  assert.strictEqual(v.retiredAt({}), null);
  assert.deepStrictEqual(plain(v.retirement([{ slug: 'old', status: 'retired' }], {}).quads), []);
  assert.deepStrictEqual(plain(v.retirement(undefined, undefined).retired), []);
  // A cluster keeps the plural its route uses.
  assert.match(v.retirement([{ date: '2026-01-01', slug: 'c', status: 'retired', type: 'cluster' }],
    { base: 'https://a.example/' }).quads[0], /\/clusters\/c\//u);
  assert.ok(v.LINK_KEYS.includes('blocked-by') && v.LINK_KEYS.length === 14);
  assert.deepStrictEqual(v.VISIBILITY_VALUES, ['public', 'restricted']);
  assert.deepStrictEqual(v.CONTRIBUTE_MODES, ['pr', 'channel', 'form']);
  assert.strictEqual(v.CORS_HEADERS['Access-Control-Allow-Origin'], '*');
});

// lens (b): the ETag condition is a conjunction — an artefact AND supplied
// bytes. Turning it into a disjunction survived the whole suite.
test('AGSC-11-05: an ETag is emitted only for an artefact whose bytes are supplied', () => {
  const artefact = '/graph.jsonld';
  const page = '/concepts/a/';
  assert.ok(v.isArtefact(artefact), 'the fixture route is an artefact');
  assert.ok(!v.isArtefact(page), 'the fixture route is not an artefact');

  assert.strictEqual(v.headersFor(artefact, { bytes: 'x' }).ETag, `"${crypto.createHash('sha256').update('x').digest('hex')}"`);
  assert.strictEqual(v.headersFor(artefact, {}).ETag, undefined, 'no bytes, no ETag');
  assert.strictEqual(v.headersFor(artefact, { bytes: undefined }).ETag, undefined);
  assert.strictEqual(v.headersFor(page, { bytes: 'x' }).ETag, undefined, 'a page is not an artefact');
  assert.strictEqual(v.headersFor(page, {}).ETag, undefined);
  // the empty string IS bytes, and hashes to the digest of nothing
  assert.strictEqual(v.headersFor(artefact, { bytes: '' }).ETag,
    `"${crypto.createHash('sha256').update('').digest('hex')}"`);
});
