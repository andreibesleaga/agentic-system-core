'use strict';
// verifies AGSC-11-24
// Context maps between nodes: a `peers[]` entry may state its relationship (shared kernel,
// conformist, translation layer) and a crosswalk, a Turtle file of SKOS mapping statements
// `<local IRI> <skos:exactMatch|closeMatch|broadMatch|narrowMatch> <peer IRI>`. These tests pin
// what the Boundary context does with them: the crosswalk is read by the pinned `n3` and checked
// (a statement of another shape, or a subject that is a cluster, procedure, episode or gate, is
// AGSC-E209); a typed peer that cannot be applied is refused before any fetch (AGSC-E202, AGSC-E203,
// AGSC-E901, AGSC-E209); and a federating client marks each result from that peer with the
// relationship and, where the crosswalk names the result, the matches in code-point order of
// `local`. Nothing is fetched and every result stays untrusted. Property tests (fast-check, fixed
// seed): applying the map is deterministic, keeps the results and their order, adds nothing but
// `relationship` and `crosswalk`, and never makes a result trusted.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');
const f = require('../../src/boundary/federation.js');

const RUNS = { numRuns: 150, seed: 20261103, verbose: 0 };
const plain = (v) => JSON.parse(JSON.stringify(v));
const PEER = 'https://b.example/.well-known/knowledge-linkset';
const PREFIX = '@prefix skos: <http://www.w3.org/2004/02/skos/core#> .\n';
const BASE = 'https://a.example/';
const ITEMS = [
  { slug: 'account', type: 'concept' }, { slug: 'handover', type: 'lesson' },
  { slug: 'billing', type: 'cluster' }, { slug: 'pay', type: 'procedure' },
];
const codes = (findings) => findings.map((x) => x.code);

test('the relationships and the four mapping predicates are the closed lists of the rule', () => {
  assert.deepStrictEqual(f.RELATIONSHIPS, ['shared-kernel', 'conformist', 'translation-layer']);
  assert.deepStrictEqual(f.CROSSWALK_MATCHES, ['exactMatch', 'closeMatch', 'broadMatch', 'narrowMatch']);
  assert.ok(Object.isFrozen(f.RELATIONSHIPS) && Object.isFrozen(f.CROSSWALK_MATCHES));
});

test('a crosswalk is read as its statements, each {local, match, peer}, in code-point order', () => {
  const text = `${PREFIX}<https://a.example/lessons/handover/> skos:closeMatch <https://b.example/concepts/x/> .\n`
    + '<https://a.example/concepts/account/> skos:exactMatch <https://b.example/concepts/account/> .\n'
    + '<https://ctx.example/billing#Invoice> skos:narrowMatch <https://b.example/concepts/bill/> .\n';
  const read = f.readCrosswalk(text, { base: BASE, contexts: [{ cluster: 'billing', namespace: 'https://ctx.example/billing#' }], items: ITEMS });
  assert.deepStrictEqual(read.findings, []);
  assert.deepStrictEqual(plain(read.statements), [
    { local: 'https://a.example/concepts/account/', match: 'exactMatch', peer: 'https://b.example/concepts/account/' },
    { local: 'https://a.example/lessons/handover/', match: 'closeMatch', peer: 'https://b.example/concepts/x/' },
    { local: 'https://ctx.example/billing#Invoice', match: 'narrowMatch', peer: 'https://b.example/concepts/bill/' },
  ]);
});

test('a statement of another shape, or a subject the rule refuses, is AGSC-E209 and is not applied', () => {
  const refused = [
    ['another predicate', '<https://a.example/concepts/account/> skos:relatedMatch <https://b.example/concepts/account/> .'],
    ['a literal object', '<https://a.example/concepts/account/> skos:exactMatch "account" .'],
    ['a blank subject', '[] skos:exactMatch <https://b.example/concepts/account/> .'],
    ['a cluster subject', '<https://a.example/clusters/billing/> skos:exactMatch <https://b.example/concepts/x/> .'],
    ['a procedure subject', '<https://a.example/procedures/pay/> skos:broadMatch <https://b.example/concepts/x/> .'],
    ['a subject of no item', '<https://a.example/concepts/nothing/> skos:exactMatch <https://b.example/concepts/x/> .'],
    ['a subject of another node', '<https://c.example/concepts/account/> skos:exactMatch <https://b.example/concepts/x/> .'],
    ['an object of this node', '<https://a.example/concepts/account/> skos:exactMatch <https://a.example/lessons/handover/> .'],
  ];
  for (const [name, statement] of refused) {
    const read = f.readCrosswalk(`${PREFIX}${statement}\n`, { base: BASE, file: 'domain/b.ttl', items: ITEMS });
    assert.deepStrictEqual(codes(read.findings), ['AGSC-E209'], name);
    assert.strictEqual(read.findings[0].file, 'domain/b.ttl', name);
    assert.match(read.findings[0].message, /AGSC-11-24/u, name);
    assert.deepStrictEqual(read.statements, [], name);
  }
  const notTurtle = f.readCrosswalk('this is not Turtle', { base: BASE, file: 'domain/b.ttl' });
  assert.deepStrictEqual(codes(notTurtle.findings), ['AGSC-E209']);
});

test('under a context namespace, the namespace itself or a class or property of the site vocabulary is AGSC-E209', () => {
  const contexts = [{ cluster: 'billing', namespace: 'https://ctx.example/billing#' }];
  const terms = ['https://ctx.example/billing#Invoice', 'https://ctx.example/billing#bills'];
  const read = (subject, options = {}) => f.readCrosswalk(`${PREFIX}<${subject}> skos:exactMatch <https://b.example/concepts/x/> .\n`,
    { base: BASE, contexts, file: 'domain/b.ttl', items: ITEMS, ...options });
  for (const subject of ['https://ctx.example/billing#', ...terms]) {
    const refused = read(subject, { terms });
    assert.deepStrictEqual(codes(refused.findings), ['AGSC-E209'], subject);
    assert.deepStrictEqual(refused.statements, [], subject);
  }
  assert.deepStrictEqual(codes(read('https://ctx.example/billing#').findings), ['AGSC-E209'], 'no vocabulary needed to see the bare namespace');
  assert.deepStrictEqual(codes(read('https://ctx.example/billing#Invoice').findings), [], 'with no vocabulary terms, a term is not judged');
  assert.deepStrictEqual(codes(read('https://ctx.example/billing#Receipt', { terms }).findings), [], 'a term the vocabulary does not type');
});

test('an item address is judged by its item type even where a context namespace covers it', () => {
  const contexts = [{ cluster: 'billing', namespace: 'https://a.example/clusters/' }];
  const read = (subject) => f.readCrosswalk(`${PREFIX}<${subject}> skos:exactMatch <https://b.example/concepts/x/> .\n`,
    { base: BASE, contexts, file: 'domain/b.ttl', items: ITEMS });
  const cluster = read('https://a.example/clusters/billing/');
  assert.deepStrictEqual(codes(cluster.findings), ['AGSC-E209']);
  assert.match(cluster.findings[0].message, /is a cluster/u);
  assert.deepStrictEqual(cluster.statements, []);
  assert.deepStrictEqual(codes(read('https://a.example/clusters/Invoice').findings), [], 'a term of the context that is no item is still accepted');
});

test('with no items to judge, a subject under the base is accepted (the client side of the rule)', () => {
  const read = f.readCrosswalk(`${PREFIX}<https://a.example/concepts/account/> skos:exactMatch <https://b.example/concepts/account/> .\n`, { base: BASE });
  assert.deepStrictEqual(read.findings, []);
  assert.strictEqual(read.statements.length, 1);
});

test('a typed peer that cannot be applied is refused before any fetch, with the code of its fault', () => {
  const read = (files) => (path) => (Object.hasOwn(files, path) ? files[path] : null);
  const fault = (peer, files = {}) => codes(f.peerFaults(peer, { base: BASE, read: read(files), where: 'peers[0]' }).findings);
  assert.deepStrictEqual(fault({ relationship: 'translation-layer', url: PEER }), ['AGSC-E202']);
  assert.deepStrictEqual(fault({ relationship: 'friend', url: PEER }), ['AGSC-E203']);
  assert.deepStrictEqual(fault({ crosswalk: 'domain/missing.ttl', relationship: 'conformist', url: PEER }), ['AGSC-E901']);
  assert.deepStrictEqual(fault({ crosswalk: 'domain/b.ttl', relationship: 'shared-kernel', url: PEER },
    { 'domain/b.ttl': `${PREFIX}<https://a.example/concepts/account/> skos:relatedMatch <https://b.example/concepts/account/> .\n` }), ['AGSC-E209']);
  assert.deepStrictEqual(fault({ relationship: 'conformist', url: PEER }), [], 'the crosswalk is optional outside a translation layer');
  assert.deepStrictEqual(fault(PEER), [], 'a plain peer states no relationship');
  const good = f.peerFaults({ crosswalk: 'domain/b.ttl', relationship: 'translation-layer', url: PEER },
    { base: BASE, read: read({ 'domain/b.ttl': `${PREFIX}<https://a.example/concepts/account/> skos:exactMatch <https://b.example/concepts/account/> .\n` }) });
  assert.deepStrictEqual(good.findings, []);
  assert.deepStrictEqual(plain(good.statements), [{ local: 'https://a.example/concepts/account/', match: 'exactMatch', peer: 'https://b.example/concepts/account/' }]);
});

test('a client marks each result from the peer with the relationship and the crosswalk that names it', () => {
  const statements = [
    { local: 'https://a.example/concepts/customer/', match: 'broadMatch', peer: 'https://b.example/concepts/client/' },
    { local: 'https://a.example/concepts/account-holder/', match: 'closeMatch', peer: 'https://b.example/concepts/client/' },
  ];
  const results = f.contextMapResults({
    peer: { relationship: 'translation-layer', url: PEER },
    results: [{ iri: 'https://b.example/concepts/client/', origin: 'https://b.example/' }, { iri: 'https://b.example/concepts/other/' }],
    statements,
  });
  assert.deepStrictEqual(plain(results), [
    { crosswalk: [{ local: 'https://a.example/concepts/account-holder/', match: 'closeMatch' }, { local: 'https://a.example/concepts/customer/', match: 'broadMatch' }],
      iri: 'https://b.example/concepts/client/', origin: 'https://b.example/', relationship: 'translation-layer', trust: 'untrusted' },
    { iri: 'https://b.example/concepts/other/', origin: 'https://b.example/', relationship: 'translation-layer', trust: 'untrusted' },
  ]);
  assert.ok(Object.isFrozen(results) && results.every(Object.isFrozen));
});

const iri = fc.constantFrom('https://b.example/concepts/a/', 'https://b.example/concepts/b/', 'https://b.example/concepts/c/');
const local = fc.constantFrom('https://a.example/concepts/x/', 'https://a.example/concepts/y/', 'https://a.example/lessons/z/');
const statement = fc.record({ local, match: fc.constantFrom(...f.CROSSWALK_MATCHES), peer: iri });
const result = fc.record({ iri, trust: fc.constantFrom('trusted', 'untrusted'), title: fc.string({ maxLength: 8 }) });

test('property: the map keeps every result in its order, adds only its two members, and trusts none', () => {
  fc.assert(fc.property(fc.array(result, { maxLength: 6 }), fc.array(statement, { maxLength: 6 }),
    fc.constantFrom(...f.RELATIONSHIPS), (results, statements, relationship) => {
      const peer = { relationship, url: PEER };
      const once = plain(f.contextMapResults({ peer, results, statements }));
      assert.deepStrictEqual(plain(f.contextMapResults({ peer, results, statements: [...statements].reverse() })), once,
        'the order of the statements does not matter');
      assert.deepStrictEqual(once.map((r) => r.iri), results.map((r) => r.iri));
      for (const [n, out] of once.entries()) {
        assert.strictEqual(out.trust, 'untrusted');
        assert.strictEqual(out.relationship, relationship);
        assert.strictEqual(out.title, results[n].title, 'the result itself is not rewritten');
        const named = statements.filter((s) => s.peer === out.iri);
        assert.strictEqual(out.crosswalk === undefined, named.length === 0);
        if (out.crosswalk !== undefined) {
          assert.strictEqual(out.crosswalk.length, named.length);
          const locals = out.crosswalk.map((c) => c.local);
          assert.deepStrictEqual(locals, [...locals].sort(), 'code-point order of local');
        }
      }
    }), RUNS);
});
