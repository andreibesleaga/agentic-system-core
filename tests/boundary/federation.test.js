'use strict';
// Unit tests for the federation half of the Boundary context (WP-10-F).
// AGSC-11-06..11-15, AGSC-11-23, AGSC-10-12, AGSC-06-35.
// No network: every fetch is injected and driven by the test's own graph.

const test = require('node:test');
const assert = require('node:assert');

const f = require('../../src/boundary/federation.js');

const plain = (v) => JSON.parse(JSON.stringify(v));

test('AGSC-11-06: the defaults apply when no federation object is configured', () => {
  assert.deepStrictEqual(plain(f.effectiveFederation({})), {
    fan_out: 50, hop_limit: 3, max_requests: 500, redirect_limit: 3, timeout_ms: 10000,
  });
  // A publisher may tighten; an out-of-range value falls back to the default.
  assert.strictEqual(f.effectiveFederation({ federation: { hop_limit: 1 } }).hop_limit, 1);
  assert.strictEqual(f.effectiveFederation({ federation: { hop_limit: 6 } }).hop_limit, 3);
  assert.strictEqual(f.effectiveFederation({ federation: { hop_limit: 0 } }).hop_limit, 0);
  assert.strictEqual(f.effectiveFederation(undefined).fan_out, 50);
});

test('AGSC-11-12: a peer base is derived syntactically, with no fetch', () => {
  assert.strictEqual(f.peerBase('https://b.example/.well-known/knowledge-linkset'), 'https://b.example/');
  assert.strictEqual(f.peerBase('https://b.example/'), 'https://b.example/');
});

test('AGSC-11-06: one rel#peer link per declared peer, in document order', () => {
  assert.deepStrictEqual(plain(f.peerLinks({ peers: ['https://b.example/x', 'https://a.example/x'] })), [
    { href: 'https://b.example/x', rel: 'https://w3id.org/agentic-system-core/rel#peer' },
    { href: 'https://a.example/x', rel: 'https://w3id.org/agentic-system-core/rel#peer' },
  ]);
  assert.deepStrictEqual(plain(f.peerLinks(undefined)), []);
});

test('AGSC-11-07: https always, http only to a loopback literal under --dev', () => {
  assert.strictEqual(f.checkScheme('https://b.example/x'), null);
  assert.strictEqual(f.checkScheme('HTTPS://b.example/x'), null);
  assert.strictEqual(f.checkScheme('http://b.example/x', { dev: true }), 'AGSC-E905');
  assert.strictEqual(f.checkScheme('file:///etc/passwd', { dev: true }), 'AGSC-E905');
  assert.strictEqual(f.checkScheme('/relative', { dev: true }), 'AGSC-E905');
  assert.strictEqual(f.checkScheme('http://127.0.0.1:8080/x', { dev: true }), null);
  assert.strictEqual(f.checkScheme('http://[::1]:8080/x', { dev: true }), null);
  assert.strictEqual(f.checkScheme('http://127.0.0.1:8080/x'), 'AGSC-E905');
  assert.strictEqual(f.checkScheme('http://localhost/x', { dev: true }), 'AGSC-E905');
});

test('AGSC-11-08: the closed special-purpose list, in both families and through a mapping', () => {
  assert.strictEqual(f.checkAddresses(['93.184.215.14']), null);
  assert.strictEqual(f.checkAddresses(['2606:2800:21f:cb07::']), null);
  for (const address of ['10.0.0.5', '127.0.0.1', '169.254.1.1', '192.0.2.5', '198.51.100.5',
    '203.0.113.5', '100.64.0.1', '224.0.0.1', '255.255.255.255',
    '::1', 'fe80::1', 'fc00::1', '2001:db8::1', '2002::1', 'ff02::1', '::ffff:192.168.1.2']) {
    assert.strictEqual(f.checkAddresses([address]), 'AGSC-E905', address);
  }
  // A host with one public and one private address is refused.
  assert.strictEqual(f.checkAddresses(['93.184.215.14', '10.0.0.5']), 'AGSC-E905');
  assert.strictEqual(f.checkAddresses(['not-an-address']), 'AGSC-E905');
  // F27-05: an absent or empty resolution fails CLOSED — AGSC-11-08 refuses addresses
  // before connecting, which an empty list cannot establish.
  assert.strictEqual(f.checkAddresses(undefined), 'AGSC-E905');
  assert.strictEqual(f.checkAddresses([]), 'AGSC-E905');
  // --dev exempts the two loopback prefixes and nothing else.
  assert.strictEqual(f.checkAddresses(['127.0.0.1'], { dev: true }), null);
  assert.strictEqual(f.checkAddresses(['::1'], { dev: true }), null);
  assert.strictEqual(f.checkAddresses(['10.0.0.5'], { dev: true }), 'AGSC-E905');
  assert.strictEqual(f.isLoopbackLiteral('example.com'), false);
});

test('AGSC-11-09: at most redirect_limit hops, every hop re-checked, the peer unchanged', () => {
  const peer = 'https://b.example/.well-known/knowledge-linkset';
  const four = ['https://b.example/r1', 'https://b.example/r2', 'https://b.example/r3', 'https://b.example/r4'];
  // rc.5 (bnd-0030): AGSC-11-08 is unconditional, so every hop carries a resolution.
  const ok = { resolved: { 'b.example': ['93.184.215.14'] } };
  const capped = f.followRedirects(peer, four, ok);
  assert.deepStrictEqual({ error: capped.error, followed: capped.followed }, { error: 'AGSC-E905', followed: 3 });
  assert.strictEqual(capped.declaredPeer, peer);
  const two = f.followRedirects(peer, four.slice(0, 2), ok);
  assert.deepStrictEqual({ error: two.error, final: two.final, followed: two.followed },
    { error: null, final: 'https://b.example/r2', followed: 2 });
  // A hop to a non-https URL, or to a refused address, fails the fetch.
  assert.strictEqual(f.followRedirects(peer, ['http://b.example/r1'], ok).error, 'AGSC-E905');
  assert.strictEqual(f.followRedirects(peer, ['https://c.example/r1'],
    { resolved: { 'c.example': ['10.0.0.1'] } }).error, 'AGSC-E905');
  assert.strictEqual(f.followRedirects(peer, [], {}).followed, 0);
});

// bnd-0030 — the blocker. The address guard of AGSC-11-08 runs on EVERY hop, with no
// branch that can be taken to skip it. A caller that models no resolution at all is
// refused at the first hop, because it has classified no address to connect to.
test('AGSC-11-08/11-09: the address guard is unconditional — no resolution is a refusal', () => {
  const peer = 'https://b.example/.well-known/knowledge-linkset';
  for (const options of [{}, { dev: false }, { resolved: {} }, { resolved: null }]) {
    const result = f.followRedirects(peer, ['https://b.example/r1'], options);
    assert.strictEqual(result.error, 'AGSC-E905', JSON.stringify(options));
    assert.strictEqual(result.followed, 0, JSON.stringify(options));
    assert.strictEqual(result.final, peer, 'the declared peer is never replaced');
  }
  // An IP literal resolves to itself, so it needs no map — and is judged by the list.
  assert.strictEqual(f.followRedirects(peer, ['https://93.184.215.14/r1'], {}).error, null);
  assert.strictEqual(f.followRedirects(peer, ['https://127.0.0.1/r1'], {}).error, 'AGSC-E905');
  assert.strictEqual(f.followRedirects(peer, ['https://127.0.0.1/r1'], { dev: true }).error, null);
});

function graphFetch(graph, unreachable) {
  const down = new Set(unreachable || []);
  const attempts = Object.create(null);
  const fetch = (key) => {
    attempts[key] = (attempts[key] || 0) + 1;
    if (down.has(key) || !Object.prototype.hasOwnProperty.call(graph, key)) return { ok: false, peers: [] };
    return { ok: true, peers: graph[key] };
  };
  fetch.attempts = attempts;
  return fetch;
}

test('AGSC-11-10: a walk that touches no cap is complete and reports no code', () => {
  const result = f.walk({ fetch: graphFetch({ a: ['b'], b: [] }), start: 'a' });
  assert.deepStrictEqual(plain(result.visited), ['a', 'b']);
  assert.deepStrictEqual({ error: result.error, partial: result.partial, requests: result.requests },
    { error: null, partial: false, requests: 2 });
});

test('AGSC-11-10: the visited set is the cross-origin cycle guard', () => {
  const fetch = graphFetch({ a: ['b'], b: ['a'] });
  const result = f.walk({ fetch, start: 'a' });
  assert.strictEqual(result.requests, 2);
  assert.strictEqual(fetch.attempts.a, 1);
});

test('AGSC-11-10: the request budget ends a walk with AGSC-E906 and partial', () => {
  const result = f.walk({
    federation: { max_requests: 1 }, fetch: graphFetch({ a: ['b'], b: ['c'], c: [] }), start: 'a',
  });
  assert.deepStrictEqual({ error: result.error, partial: result.partial, requests: result.requests },
    { error: 'AGSC-E906', partial: true, requests: 1 });
});

test('AGSC-11-10: an unreachable peer is AGSC-E907, skipped and never retried', () => {
  const fetch = graphFetch({ a: ['b', 'c'], b: [], c: ['b'] }, ['b']);
  const result = f.walk({ federation: { fan_out: 50, hop_limit: 2, max_requests: 500 }, fetch, start: 'a' });
  assert.deepStrictEqual(plain(result.visited), ['a', 'c']);
  assert.deepStrictEqual(plain(result.skipped), [{ code: 'AGSC-E907', peer: 'b' }]);
  assert.strictEqual(fetch.attempts.b, 1);
  assert.strictEqual(result.partial, false);
});

test('AGSC-11-10: a fetch returning nothing at all is treated as unreachable', () => {
  const result = f.walk({ fetch: () => null, start: 'a' });
  assert.deepStrictEqual(plain(result.skipped), [{ code: 'AGSC-E907', peer: 'a' }]);
});

test('AGSC-11-12: normalisation takes the A-label and never re-encodes an escape', () => {
  assert.strictEqual(f.normaliseReference('https://bücher.example/concepts/kanban%20board/#intent').url,
    'https://xn--bcher-kva.example/concepts/kanban%20board/#intent');
  // UTS 46 NON-transitional: eszett survives as itself, never as "ss".
  assert.strictEqual(f.normaliseReference('https://straße.example/').url, 'https://xn--strae-oqa.example/');
  assert.strictEqual(f.normaliseReference('HTTPS://B.EXAMPLE/Path').url, 'https://b.example/Path');
  assert.strictEqual(f.normaliseReference('https://user@b.example:8443/x').url, 'https://user@b.example:8443/x');
  assert.strictEqual(f.normaliseReference('https://[2606:2800::1]:443/x').url, 'https://[2606:2800::1]:443/x');
});

test('AGSC-11-12: a reference that is not an IRI after A-labelling is AGSC-E312', () => {
  for (const bad of ['https://b.example/bad space/', 'not-a-url', 'https:///x',
    'https://b.example/a<b', 'https://b.example/a\u0000b', 'https://[unclosed/x']) {
    assert.deepStrictEqual(f.normaliseReference(bad), { error: 'AGSC-E312', url: null }, bad);
  }
  assert.strictEqual(f.normaliseReference(undefined).error, 'AGSC-E312');
});

test('AGSC-11-12: a citation under a peer base emits seeAlso and peerOrigin, sorted', () => {
  const result = f.peerCitations(
    [{ slug: 'alpha', sources: [{ id: 'k', resource: 'https://b.example/x/' }] },
      { slug: 'beta', sources: [{ id: 'k', resource: 'https://elsewhere.example/y/' }] },
      { slug: 'gamma' }],
    { base: 'https://a.example/', peers: ['https://b.example/.well-known/knowledge-linkset'] },
  );
  assert.strictEqual(result.nquads,
    '<https://a.example/concepts/alpha/> <http://www.w3.org/2000/01/rdf-schema#seeAlso> <https://b.example/x/> <https://a.example/> .\n'
    + '<https://a.example/concepts/alpha/> <https://w3id.org/agentic-system-core/ns#peerOrigin> <https://b.example/> <https://a.example/> .\n');
  assert.strictEqual(result.closureEdgesAdded, 0);
  assert.deepStrictEqual(plain(result.emitted), ['https://b.example/x/']);
  assert.strictEqual(f.peerCitations([], { peers: [] }).nquads, '');
});

test('AGSC-11-12: a non-slug Link value is AGSC-E311; peer-ref is preserved as AGSC-E304', () => {
  const result = f.linkKeyBoundary([
    { requires: ['https://b.example/concepts/beta/', 'local'], slug: 'alpha' },
    { 'peer-ref': ['beta'], slug: 'gamma' },
    { slug: 'delta' },
  ]);
  assert.deepStrictEqual(plain(result.findings).map((x) => [x.code, x.slug]),
    [['AGSC-E311', 'alpha'], ['AGSC-E304', 'gamma']]);
  assert.deepStrictEqual(plain(result.preservedKeys), ['peer-ref']);
  assert.deepStrictEqual(plain(f.linkKeyBoundary(undefined).findings), []);
});

test('AGSC-11-14: a malformed contribute entry is AGSC-E209', () => {
  const bad = [
    { contribute: [{ mode: 'telepathy', target: 'x' }] },
    { contribute: [{ mode: 'pr' }] },
    { contribute: [{ mode: 'pr', target: 'http://x/' }] },
    { contribute: [{ channel: 'mail', mode: 'channel', target: 'https://x/' }] },
    { contribute: [{ channel: 'nope', mode: 'channel', target: 'mailto:a@b' }] },
    { channels: [{ name: 'mail', publish: 'auto' }], contribute: [{ channel: 'mail', mode: 'channel', target: 'mailto:a@b' }] },
  ];
  for (const config of bad) {
    assert.strictEqual(f.checkContribute(config)[0].code, 'AGSC-E209', JSON.stringify(config));
  }
  assert.deepStrictEqual(plain(f.checkContribute(undefined)), []);
});

test('AGSC-11-14: propose uses the first contribute mode the client supports', () => {
  const config = {
    channels: [{ name: 'mail', publish: 'hitl' }],
    contribute: [{ mode: 'pr', target: 'https://forge.example/compare' },
      { channel: 'mail', mode: 'channel', target: 'mailto:p@a.example' }],
  };
  assert.strictEqual(f.contributeLinks(config, { clientSupports: ['channel'] }).proposeUses, 'mailto:p@a.example');
  assert.strictEqual(f.contributeLinks(config, { clientSupports: ['pr', 'channel'] }).proposeUses, 'https://forge.example/compare');
  // With no supported mode, propose returns the payload and writes nothing.
  assert.strictEqual(f.contributeLinks(config, { clientSupports: [] }).proposeUses, null);
  assert.strictEqual(f.contributeLinks(config, {}).links.length, 2);
  assert.deepStrictEqual(plain(f.contributeLinks({ contribute: [{ mode: 'pr', target: 'ftp://x' }] }, {}).links), []);
});

test('AGSC-06-35: only IANA-registered relations, grouped and ordered by href', () => {
  const result = f.relatedLinks({
    related: [
      { href: 'https://z.example/b', rel: 'service-desc', type: 'application/json' },
      { href: 'https://a.example/a', rel: 'service-desc', profile: 'https://p.example/', title: 'A', type: 'application/json' },
    ],
  });
  assert.deepStrictEqual(plain(result.links['service-desc']), [
    { href: 'https://a.example/a', profile: 'https://p.example/', title: 'A', type: 'application/json' },
    { href: 'https://z.example/b', type: 'application/json' },
  ]);
  assert.deepStrictEqual(plain(result.affects), {
    bundle_hash: false, digests: false, peer_check: false, walk: false,
  });
  for (const bad of [{ href: 'https://x/', rel: 'ard', type: 'a/b' }, { href: 'http://x/', rel: 'related', type: 'a/b' },
    { href: 'https://x/', rel: 'related' }]) {
    assert.strictEqual(f.checkRelated({ related: [bad] })[0].code, 'AGSC-E209', JSON.stringify(bad));
  }
  assert.deepStrictEqual(plain(f.relatedLinks(undefined).links), {});
});

test('AGSC-10-12 + AGSC-11-23: mutuality, and a tombstoned peer that is resolved but not mutual', () => {
  const mutual = f.mutualCheck([
    { base: 'https://a.example/', peer: 'https://b.example/.well-known/knowledge-linkset' },
    { base: 'https://b.example/', peer: 'https://a.example/.well-known/knowledge-linkset' },
  ]);
  assert.deepStrictEqual({ bothResolve: mutual.bothResolve, mutual: mutual.mutual }, { bothResolve: true, mutual: true });
  const tombstoned = f.mutualCheck([
    { base: 'https://a.example/', peer: 'https://b.example/.well-known/knowledge-linkset' },
    {
      alternate: 'https://c.example/.well-known/knowledge-linkset',
      base: 'https://b.example/',
      peer: 'https://a.example/.well-known/knowledge-linkset',
      tombstone: '2026-12-31T00:00:00Z',
    },
  ]);
  assert.deepStrictEqual({
    alternate: tombstoned.alternateIsSameNode,
    code: tombstoned.code,
    descends: tombstoned.walkDescendsIntoTombstoned,
    mutual: tombstoned.mutual,
    resolve: tombstoned.bothResolve,
    tombstoned: plain(tombstoned.tombstoned),
  }, {
    alternate: false, code: null, descends: false, mutual: false, resolve: true, tombstoned: ['https://b.example/'],
  });
  // One-sided: b does not list a.
  assert.strictEqual(f.mutualCheck([
    { base: 'https://a.example/', peer: 'https://b.example/.well-known/knowledge-linkset' },
    { base: 'https://b.example/', peer: 'https://z.example/.well-known/knowledge-linkset' },
  ]).mutual, false);
  assert.strictEqual(f.mutualCheck([]).bothResolve, false);
});

test('AGSC-11-13: the union is client-side, de-duplicated, and a build fetches nothing', () => {
  const union = f.clientUnion({
    'https://a.example/graph.nq': '<https://a.example/x> <p> "X" <g> .\n',
    'https://b.example/graph.nq': '<https://b.example/y> <p> "Y" <g> .\n\n',
  });
  assert.strictEqual(union.quads.length, 2);
  assert.strictEqual(union.fetchesDuringBuild, 0);
  assert.strictEqual(union.serverSideQueryEndpoint, false);
  assert.deepStrictEqual(plain(f.clientUnion(undefined).quads), []);
});

test('AGSC-11-15: boards merge by IRI, rename nothing, and expand local slugs', () => {
  const merged = f.mergeBoards([
    {
      board: 'oct',
      iri: 'https://a.example/clusters/oct/',
      tasks: [{ blocked_by: ['other'], iri: 'https://a.example/concepts/ship/', slug: 'ship' }],
    },
    {
      board: 'oct',
      iri: 'https://b.example/clusters/oct/',
      tasks: [{ blocked_by: [], iri: 'https://b.example/concepts/ship/', slug: 'ship' }],
    },
  ]);
  assert.deepStrictEqual(plain(merged.boardsKept), ['https://a.example/clusters/oct/', 'https://b.example/clusters/oct/']);
  assert.deepStrictEqual(plain(merged.tasksKept), ['https://a.example/concepts/ship/', 'https://b.example/concepts/ship/']);
  assert.deepStrictEqual(plain(merged.expandedBlockedBy), {
    'https://a.example/concepts/ship/': ['https://a.example/concepts/other/'],
  });
  assert.deepStrictEqual(plain(merged.renamed), []);
  assert.deepStrictEqual(plain(f.mergeBoards([{ iri: 'not-an-iri' }]).boardsKept), ['not-an-iri']);
  assert.deepStrictEqual(plain(f.mergeBoards(undefined).boardsKept), []);
});

test('AGSC-11-11: a peer-derived result names its origin; a local one does not', () => {
  const result = f.peerResults({
    localHits: [{ slug: 'alpha' }], peer: 'https://b.example/', peerHits: [{ slug: 'beta' }],
  });
  assert.deepStrictEqual(plain(result.results), [
    { slug: 'alpha', trust: 'untrusted' },
    { origin: 'https://b.example/', slug: 'beta', trust: 'untrusted' },
  ]);
  assert.deepStrictEqual({ copy: result.copyPath, refused: result.directCopyRefused },
    { copy: 'proposal', refused: true });
  assert.deepStrictEqual(plain(f.peerResults(undefined).results), []);
});

test('the serializer prefers the Knowledge context N-Quads writer', () => {
  const quads = [{ graph: 'https://g/', object: 'https://o/', predicate: 'https://p/', subject: 'https://s/' }];
  assert.strictEqual(f.serializeQuads(quads), '<https://s/> <https://p/> <https://o/> <https://g/> .\n');
  assert.strictEqual(f.serializeQuads([]), '');
  assert.strictEqual(f.hostOf('not a url'), '');
});

// F27-04: `walk` never applied AGSC-11-07's scheme rule or AGSC-11-08's address rule
// to the peers it dequeued, so a hostile `peers[]` steered the injected fetch at
// `file://`, loopback, link-local and `gopher://` URLs.
test('AGSC-11-07 + AGSC-11-08: walk refuses a hostile peer URL before it is fetched', () => {
  const hostile = [
    'http://169.254.169.254/latest/meta-data/',
    'file:///etc/passwd',
    'http://127.0.0.1:6379/',
    'gopher://10.0.0.1/',
    'https://10.0.0.7/.well-known/knowledge-linkset',
  ];
  const fetched = [];
  const fetch = (key) => {
    fetched.push(key);
    return { ok: true, peers: key === 'https://a.example/.well-known/knowledge-linkset' ? hostile : [] };
  };
  const result = f.walk({
    fetch,
    federation: { fan_out: 50, hop_limit: 4, max_requests: 50 },
    start: 'https://a.example/.well-known/knowledge-linkset',
  });
  assert.deepStrictEqual(fetched, ['https://a.example/.well-known/knowledge-linkset'],
    'not one hostile URL reached the injected fetch');
  assert.deepStrictEqual(result.skipped.map((s) => s.peer).sort(), [...hostile].sort());
  for (const entry of result.skipped) assert.strictEqual(entry.code, 'AGSC-E905');
  assert.deepStrictEqual([...result.visited], ['https://a.example/.well-known/knowledge-linkset']);
});

test('AGSC-11-10: a walk over bare peer keys is unguarded, and a refused start is skipped', () => {
  // AGSC-11-10 models a walk over opaque keys; a key with no scheme carries nothing to judge.
  const graph = { a: ['b'], b: [] };
  const bare = f.walk({
    fetch: (key) => ({ ok: true, peers: graph[key] || [] }),
    federation: { fan_out: 50, hop_limit: 2, max_requests: 50 },
    start: 'a',
  });
  assert.deepStrictEqual([...bare.visited], ['a', 'b']);
  assert.deepStrictEqual([...bare.skipped], []);

  let calls = 0;
  const refused = f.walk({ fetch: () => { calls += 1; return { ok: true, peers: [] }; }, start: 'file:///etc/passwd' });
  assert.strictEqual(calls, 0, 'a refused start is never fetched');
  assert.deepStrictEqual([...refused.visited], []);
  assert.deepStrictEqual(refused.skipped.map((s) => s.code), ['AGSC-E905']);
});

// F27-05: a redirect hop whose host has no entry in a supplied resolution map used to
// pass the AGSC-11-08 guard, which is the normal case since a redirect target is
// discovered during the fetch.
test('AGSC-11-08: a redirect to an unresolved host is refused, not followed', () => {
  const peer = 'https://b.example/.well-known/knowledge-linkset';
  const open = f.followRedirects(peer, ['https://internal.corp/'], { resolved: {} });
  assert.strictEqual(open.error, 'AGSC-E905');
  assert.strictEqual(open.followed, 0);
  assert.strictEqual(open.final, peer, 'the declared peer is never replaced');
  const good = f.followRedirects(peer, ['https://internal.corp/'], { resolved: { 'internal.corp': ['93.184.215.14'] } });
  assert.strictEqual(good.error, null);
  assert.strictEqual(good.followed, 1);
});

// ---------------------------------------------------------------------------
// V9-D lens (c) — hostile inputs at the anti-corruption layer. `walk` is the one
// function of this context that consumes bytes a stranger chose, so a peer that
// misbehaves must become a Finding, never an exception and never a hang.

test('AGSC-11-10(e): a fetch that THROWS makes that peer unreachable, not the walk', () => {
  const start = 'https://a.example/.well-known/knowledge-linkset';
  const result = f.walk({ start, fetch: () => { throw new Error('ECONNRESET'); } });
  assert.deepStrictEqual([...result.visited], []);
  assert.deepStrictEqual(result.skipped.map((s) => s.code), ['AGSC-E907']);
  assert.strictEqual(result.skipped[0].peer, start);

  // One peer throws, its sibling answers: the walk continues past the fault.
  const a = 'https://a.example/.well-known/knowledge-linkset';
  const bad = 'https://bad.example/.well-known/knowledge-linkset';
  const good = 'https://good.example/.well-known/knowledge-linkset';
  const mixed = f.walk({
    start: a,
    fetch: (key) => {
      if (key === a) return { ok: true, peers: [bad, good] };
      if (key === bad) throw new TypeError('fetch failed');
      return { ok: true, peers: [] };
    },
  });
  assert.deepStrictEqual([...mixed.visited], [a, good]);
  assert.deepStrictEqual(mixed.skipped.map((s) => s.code), ['AGSC-E907']);
  assert.strictEqual(mixed.skipped[0].peer, bad);
});

test('AGSC-11-10(b): a `peers` value that is not an array carries no links', () => {
  const start = 'https://a.example/.well-known/knowledge-linkset';
  for (const peers of ['https://b.example/', 42, { 0: 'https://b.example/' }, true]) {
    const result = f.walk({ start, fetch: () => ({ ok: true, peers }) });
    assert.deepStrictEqual([...result.visited], [start],
      `a ${typeof peers} peers member must not be walked: ${JSON.stringify(peers)}`);
    assert.deepStrictEqual([...result.ignoredByFanOut], []);
    assert.strictEqual(result.partial, false);
  }
});

test('AGSC-11-10(b): a peer list far above `fan_out` is bounded, never a stack overflow', () => {
  const start = 'https://a.example/.well-known/knowledge-linkset';
  const peers = Array.from({ length: 200000 }, (_, i) => `https://p${i}.example/`);
  const result = f.walk({ start, fetch: () => ({ ok: true, peers }), federation: { fan_out: 2, max_requests: 1 } });
  assert.strictEqual(result.ignoredByFanOut.length, peers.length - 2);
  assert.strictEqual(result.partial, true);
  assert.strictEqual(result.error, 'AGSC-E906');
});
