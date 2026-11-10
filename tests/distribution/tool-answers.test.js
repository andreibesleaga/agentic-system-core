'use strict';
// Requirement: PRD-080 (docs/PRD.md).
// verifies AGSC-09-13, AGSC-09-16, AGSC-05-33, AGSC-03-23, AGSC-03-24, AGSC-03-25, AGSC-03-26
// The portable answers of the tools of 1.1 (`src/distribution/tool-answers.js`), held to the
// engine's own modules they restate for the page: the relation table to
// `knowledge/relations.js`, `explain` to the readings of `knowledge/derive.js`, `check` to the
// Link warnings of `knowledge/links.js`, the citation record to `knowledge/chunks.js`; and
// properties over generated inputs — the bound keeps the ranked prefix and says the total only
// above 100, the answers do not depend on the order of the edges, the brief is the same through
// the host's hasher and through Web Crypto; the domain parts join a hit and a `read` body of an
// item that has them, in code-point order of the members, and change no other answer.
// Seeded properties, fixed instant, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHash } = require('node:crypto');
const fc = require('fast-check');

const answers = require('../../src/distribution/tool-answers.js');
const { RELATIONS } = require('../../src/knowledge/relations.js');
const derive = require('../../src/knowledge/derive.js');
const links = require('../../src/knowledge/links.js');
const chunks = require('../../src/knowledge/chunks.js');
const { compose } = require('../../src/composition/compose.js');
const { briefOf, domainOf, domainWithin } = require('../../src/composition/brief.js');
const { selectionDigestInput } = require('../../src/composition/harness.js');
const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const site = require('../../src/distribution/site.js');

const ROOT = path.resolve(__dirname, '..', '..');
const RUNS = { numRuns: 200, seed: 20261106 };
const SLUGS = ['a', 'b', 'c', 'd-e', 'f'];
const KEYS = RELATIONS.map((r) => r.key);
const NAMES = [...new Set(RELATIONS.flatMap((r) => [r.key, r.inverse]))];
const sha256Hex = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** A generated set of items over SLUGS: types, kinds, statuses and Links of the fourteen keys, self-links included. */
const itemsArbitrary = fc.tuple(...SLUGS.map((slug) => fc.record({
  kind: fc.constantFrom('pattern', 'spec', 'task', 'decision', 'explainer', 'architecture'),
  links: fc.dictionary(fc.constantFrom(...KEYS), fc.subarray(SLUGS, { maxLength: 3 }), { maxKeys: 4 }),
  status: fc.constantFrom(undefined, 'stable', 'deprecated'),
  type: fc.constantFrom('concept', 'concept', 'lesson', 'procedure', 'episode', 'gate'),
}).map((r) => ({
  ...r.links,
  ...(r.type === 'concept' ? { kind: r.kind } : {}),
  ...(r.status === undefined ? {} : { status: r.status }),
  body: '',
  slug,
  title: `Item ${slug}`,
  type: r.type,
}))));

const itemOfList = (items) => (slug) => {
  const item = items.find((i) => i.slug === slug);
  return { kind: item.kind, status: item.status, type: item.type };
};

/** The minimal fixture, built with the fixed clock, as route -> text. */
function fixtureRoutes() {
  const fs = createFileSystem(path.join(ROOT, 'tests', 'fixtures', 'minimal'));
  const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(ROOT)) });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } });
  const { files } = site.build(bundle, { clock, fs }, { specVersion: '1.0.0', version: '0.0.2' });
  const out = {};
  for (const [route, text] of files) if (!route.endsWith('.wasm')) out[route] = String(text);
  return out;
}

// ------------------------------------------------------------------- the bound

test('AGSC-09-13: the bound keeps the ranked prefix of at most 100 hits and states the total only above it', () => {
  fc.assert(fc.property(fc.integer({ min: 0, max: 260 }), (n) => {
    const hits = Array.from({ length: n }, (_, i) => ({ slug: `s-${String(i).padStart(3, '0')}` }));
    const body = answers.toolBounded(hits);
    assert.deepEqual(body.hits, hits.slice(0, 100));
    assert.equal(Object.prototype.hasOwnProperty.call(body, 'total'), n > 100);
    if (n > 100) assert.equal(body.total, n);
    // Idempotent: the bound of a bounded list is that list.
    assert.deepEqual(answers.toolBounded(body.hits).hits, body.hits);
  }), RUNS);
  assert.equal(answers.toolHitBound(), 100);
});

// ----------------------------------------------------------- the relation table

test('AGSC-03-01: the restated relation table is the engine\'s, row by row', () => {
  const table = answers.toolRelations();
  assert.deepEqual(Object.keys(table), KEYS);
  for (const row of RELATIONS) {
    const mine = table[row.key];
    assert.equal(mine.inverse, row.inverse, row.key);
    assert.equal(mine.transitive, row.transitive, row.key);
    assert.equal(mine.selfWarns, row.selfLink === 'warning', row.key);
    assert.deepEqual(JSON.parse(JSON.stringify(mine.targets)), JSON.parse(JSON.stringify(row.targets)), row.key);
  }
  const partners = answers.toolPartners();
  for (const row of RELATIONS) {
    assert.equal(partners[row.key], row.inverse);
    assert.equal(partners[row.inverse], row.key);
  }
  assert.deepEqual(Object.keys(partners).sort(), [...NAMES].sort());
});

// -------------------------------------------------------------------- explain

test('AGSC-05-33: explain holds exactly for the authored edges and the readings, with their steps', () => {
  fc.assert(fc.property(itemsArbitrary, (items) => {
    const { edges } = links.resolve(items);
    const readings = derive.readings(edges);
    const reading = new Map(readings.map((r) => [`${r.source} ${r.key} ${r.target}`, r]));
    for (const source of SLUGS) {
      for (const target of SLUGS) {
        for (const key of NAMES) {
          const answer = answers.toolExplanation(edges, key, source, target);
          const authored = edges.some((e) => !e.computed && e.source === source && e.key === key && e.target === target);
          const found = reading.get(`${source} ${key} ${target}`);
          assert.equal(answer.holds, authored || found !== undefined, `${source} ${key} ${target}`);
          const want = authored ? [{ from: [[source, key, target]], rule: 'authored' }] : (found ? found.because : []);
          assert.deepStrictEqual(JSON.parse(JSON.stringify(answer.because)), JSON.parse(JSON.stringify(want)));
          assert.deepEqual(Object.keys(answer), ['because', 'holds', 'key', 'source', 'target']);
        }
      }
    }
  }), { ...RUNS, numRuns: 80 });
});

test('AGSC-09-13: explain and check do not depend on the order of the edges', () => {
  fc.assert(fc.property(itemsArbitrary, fc.integer({ min: 1, max: 1000 }), (items, seed) => {
    const { edges } = links.resolve(items);
    const shuffled = [...edges].sort((x, y) => ((seed * (x.source.length + 7 * x.key.length + 13 * x.target.length)) % 11)
      - ((seed * (y.source.length + 7 * y.key.length + 13 * y.target.length)) % 11) || (x.key < y.key ? 1 : -1));
    const itemOf = itemOfList(items);
    assert.deepEqual(answers.toolLinkWarnings(shuffled, itemOf), answers.toolLinkWarnings(edges, itemOf));
    for (const key of ['requires', 'broader', 'blocks', 'related', 'superseded-by']) {
      assert.deepEqual(answers.toolExplanation(shuffled, key, 'a', 'c'), answers.toolExplanation(edges, key, 'a', 'c'));
    }
  }), RUNS);
});

test('AGSC-05-33: a chain is the first one a breadth-first walk meets, in code-point order', () => {
  const edges = [
    { computed: false, key: 'requires', source: 'a', target: 'c' },
    { computed: false, key: 'requires', source: 'a', target: 'b' },
    { computed: false, key: 'requires', source: 'b', target: 'd' },
    { computed: false, key: 'requires', source: 'c', target: 'd' },
  ];
  assert.deepEqual(answers.toolChain(edges, 'requires', 'a', 'd'), [['a', 'requires', 'b'], ['b', 'requires', 'd']]);
  assert.equal(answers.toolChain(edges, 'requires', 'a', 'b'), null, 'one step is an edge, not a chain');
  assert.equal(answers.toolChain(edges, 'requires', 'd', 'a'), null);
  assert.deepEqual(answers.toolExplanation(edges, 'requires', 'a', 'd').because[0].rule, 'closure');
  // A key whose Transitive reading cell is `no` has no chain, and a relation that does not hold is an answer.
  assert.deepEqual(answers.toolExplanation([...edges.map((e) => ({ ...e, key: 'uses' }))], 'uses', 'a', 'd'),
    { because: [], holds: false, key: 'uses', source: 'a', target: 'd' });
});

// ---------------------------------------------------------------------- check

/** A finding reduced to what both writers state: code, item, key. */
const reduced = (list) => list.map((f) => `${f.code} ${f.slug} ${f.key}`).sort();

test('AGSC-03-23…03-26: check reports the Link warnings lint reports, once each', () => {
  fc.assert(fc.property(itemsArbitrary, (items) => {
    const resolved = links.resolve(items);
    const engine = resolved.findings.filter((f) => /^AGSC-E31[3-6]$/u.test(f.code));
    const mine = answers.toolLinkWarnings(resolved.edges, itemOfList(items));
    assert.deepEqual(reduced(mine), reduced(engine));
    for (const finding of mine) {
      assert.deepEqual(Object.keys(finding).filter((k) => k !== 'with'), ['code', 'key', 'severity', 'slug', 'target']);
      assert.equal(finding.severity, 'warn');
      assert.equal(finding.code === 'AGSC-E314', finding.with !== undefined);
    }
  }), RUNS);
});

test('AGSC-09-13: check orders by item, code, key, target, and two combinations on one pair stay two', () => {
  const items = [
    { body: '', excludes: ['b'], requires: ['b'], slug: 'a', supersedes: ['b'], title: 'A', type: 'concept', kind: 'pattern' },
    { body: '', related: ['b'], slug: 'b', title: 'B', type: 'concept', kind: 'pattern' },
  ];
  const { edges } = links.resolve(items);
  const found = answers.toolLinkWarnings(edges, itemOfList(items));
  assert.deepEqual(found.map((f) => [f.slug, f.code, f.key, f.target, f.with]), [
    ['a', 'AGSC-E314', 'requires', 'b', 'excludes'],
    ['a', 'AGSC-E314', 'requires', 'b', 'supersedes'],
    ['a', 'AGSC-E316', 'supersedes', 'b', undefined],
    ['b', 'AGSC-E313', 'related', 'b', undefined],
  ]);
});

// ------------------------------------------------------- the citation records

test('AGSC-09-13: the citation records are the chunk lines\' values, with exactly the members of the rule', () => {
  const routes = fixtureRoutes();
  const index = answers.toolChunkIndex(routes);
  const host = answers.toolHost(routes);
  assert.equal(index.incomplete, false);
  const lines = String(routes['/chunks.jsonl']).split('\n').filter((l) => l !== '').map((l) => JSON.parse(l));
  assert.deepEqual(Object.values(index.bySlug).flat(), lines);
  for (const line of lines) {
    const record = answers.toolCitationRecord(line, host.bundleVersion);
    assert.deepStrictEqual(record, chunks.citationRecord(line, host.bundleVersion));
    assert.deepEqual(Object.keys(record), ['algorithm', 'bundle_version', 'coverage', 'digest', 'id', 'iri', 'item',
      'license', 'ordinal', 'section', 'terms']);
    assert.equal(record.digest, createHash('sha256').update(line.text, 'utf8').digest('hex'));
  }
  // AGSC-06-44: `license_url` only where the line has one, in its code-point place.
  const withUrl = { ...lines[0], license_url: 'https://minimal.example/legal/' };
  assert.deepEqual(Object.keys(answers.toolCitationRecord(withUrl, 'v1')).slice(7, 10), ['license', 'license_url', 'ordinal']);
  assert.deepStrictEqual(answers.toolCitationRecord(withUrl, 'v1'), chunks.citationRecord(withUrl, 'v1'));
});

test('AGSC-06-31: the chunk index follows the shards a manifest names, and says which it could not read', () => {
  const line = (item, section) => JSON.stringify({ id: `${item}${section}`, item, section });
  const routes = {
    '/chunks-01.jsonl': `${line('a', '')}\n${line('a', 'x')}\nnot json\n\n`,
    '/chunks.jsonl': `${JSON.stringify({ lines_total: 3, shards: ['/chunks-01.jsonl', '/chunks-02.jsonl', 'https://evil.example/c.jsonl'] })}\n`,
  };
  assert.deepEqual(answers.toolChunkShardRoutes(routes['/chunks.jsonl']), ['/chunks-01.jsonl', '/chunks-02.jsonl']);
  const index = answers.toolChunkIndex(routes);
  assert.deepEqual(index.bySlug.a.map((l) => l.section), ['', 'x']);
  assert.equal(index.incomplete, true);
  assert.deepEqual(index.missing, ['/chunks-02.jsonl']);
  // No chunk export (a Level-0 node): no line, nothing missing.
  assert.deepEqual(answers.toolChunkIndex({}), { bySlug: Object.create(null), incomplete: false, missing: [] });
  assert.deepEqual(answers.toolChunkShardRoutes(undefined), []);
  assert.deepEqual(answers.toolChunkShardRoutes('{'), []);
});

test('AGSC-06-08: the host facts come from the discovery document, and nothing is guessed without one', () => {
  const host = answers.toolHost(fixtureRoutes());
  assert.deepEqual(host, { bundleVersion: '0.0.0+20260101T000000Z', instant: '2026-01-01T00:00:00Z', specVersion: '1.0.0' });
  assert.deepEqual(answers.toolHost({}), { bundleVersion: '', instant: '', specVersion: '' });
  assert.deepEqual(answers.toolHost({ '/.well-known/knowledge-linkset': '{' }), { bundleVersion: '', instant: '', specVersion: '' });
  assert.equal(answers.toolDescribed({ '/.well-known/knowledge-linkset': '{"linkset":[{}]}' }, 'agsc-generated-at'), '');
});

// ----------------------------------------------------------------------- brief

test('AGSC-07-25: the brief is the same through the host\'s hasher and through Web Crypto, and writes nothing', async () => {
  const core = { briefOf, compose, selectionDigestInput };
  const items = [
    { body: 'Body of a.\n', description: 'A.', kind: 'pattern', requires: ['b'], slug: 'a', title: 'A', type: 'concept' },
    { body: '', description: 'B.', kind: 'pattern', slug: 'b', title: 'B', type: 'concept' },
  ];
  const facts = {
    base: 'https://brief.example/',
    host: { bundleVersion: 'v1.2.0', instant: '2026-01-01T00:00:00Z', specVersion: '1.0.0' },
    items,
    licenseProse: 'CC-BY-4.0',
  };
  const before = JSON.stringify(items);
  const { body: value } = answers.toolBrief(core, facts, ['a'], sha256Hex);
  const promised = answers.toolBrief(core, facts, ['a'], answers.toolSha256Hex);
  assert.equal(typeof promised.then, 'function');
  assert.deepStrictEqual(await promised, { body: value });
  assert.equal(JSON.stringify(items), before, 'the brief changed its input');
  assert.deepEqual(value.selection, ['a', 'b']);
  assert.equal(value.bundle_version, 'v1.2.0');
  assert.equal(value.generated_at, '2026-01-01T00:00:00Z');
  assert.equal(value.selection_digest, sha256Hex(selectionDigestInput(compose(items, ['a']))));
  // With no content version from the host, the brief derives the one of AGSC-04-25 from the instant.
  const derived = answers.toolBrief(core, { ...facts, host: { ...facts.host, bundleVersion: '' } }, ['a'], sha256Hex).body;
  assert.equal(derived.bundle_version, '0.0.0+20260101T000000Z');
});

/** A chain of 145 Concepts, `c-<i>` requiring `c-<i-1>`: the `derived` of its brief would hold 1,015,872 steps. */
const chainItems = () => Array.from({ length: 145 }, (_, i) => ({
  body: '', kind: 'pattern', ...(i > 0 ? { requires: [`c-${i - 1}`] } : {}), slug: `c-${i}`, title: `C ${i}`, type: 'concept',
}));
/** The discovery document of a build, as far as the brief reads it (AGSC-06-08). */
const LINKSET = JSON.stringify({ linkset: [{ describedby: [{ 'agsc-bundle-version': ['v1'], 'agsc-generated-at': ['2026-01-01T00:00:00Z'], 'agsc-spec-version': ['1.0.0'] }] }] });

test('AGSC-07-25, AGSC-09-13a: with no build instant the brief is AGSC-E901; above the engine\'s bound its derived readings are capped, never a guess or a crash', async () => {
  const core = { briefOf, compose, selectionDigestInput };
  const host = { bundleVersion: 'v1', instant: '2026-01-01T00:00:00Z', specVersion: '1.0.0' };
  const facts = { base: 'https://brief.example/', host, items: chainItems(), licenseProse: 'CC-BY-4.0' };
  const none = answers.toolBrief(core, { ...facts, host: { bundleVersion: '', instant: '', specVersion: '' } }, ['c-1'], sha256Hex);
  assert.equal(none.fault.code, 'AGSC-E901');
  assert.equal(none.body, undefined, 'no content version is invented without a build');
  const capped = answers.toolBrief(core, facts, ['c-144'], sha256Hex).body;
  assert.ok(capped.derived_total > capped.derived.length, 'AGSC-07-25 as amended 2026-11-10: the first readings and their count');
  assert.equal((await answers.toolBrief(core, facts, ['c-144'], answers.toolSha256Hex)).body.derived_total, capped.derived_total);
  // Both transports answer the error envelope (AGSC-09-13a), not a JSON-RPC error.
  const bundle = { config: {}, items: chainItems().map(({ body, slug, type, ...fm }) => ({ body, frontmatter: { ...fm, type }, slug, type })) };
  const local = mcpTools.tools(bundle, { artifacts: new Map([['/.well-known/knowledge-linkset', LINKSET]]) });
  assert.equal(local.call('brief', { selection: ['c-144'] }).body.derived_total, capped.derived_total);
  assert.equal(local.call('brief', { selection: ['c-3'] }).type, 'brief');
  const sources = { '/.well-known/knowledge-linkset': LINKSET };
  for (const i of chainItems()) sources[`/pages/${i.slug}.md`] = `---\ntitle: ${i.title}\ntype: concept\nkind: pattern\n${i.requires ? `requires:\n  - ${i.requires[0]}\n` : ''}---\n\nBody.\n`;
  const page = pageTools.pageToolset(pageTools.pageCorpus(sources, { bundleId: 'x' }), core, sha256Hex);
  assert.equal(page.call('brief', { selection: ['c-144'] }).body.derived_total, capped.derived_total);
  assert.equal(page.call('brief', { selection: ['c-3'] }).type, 'brief');
  delete sources['/.well-known/knowledge-linkset'];
  const bare = pageTools.pageToolset(pageTools.pageCorpus(sources, { bundleId: 'x' }), core, sha256Hex);
  assert.equal(bare.call('brief', { selection: ['c-3'] }).body.code, 'AGSC-E901', 'a page without its discovery document');
});

// ------------------------------------------------------- the two toolsets, their faults

const mcpTools = require('../../src/distribution/mcp-tools.js');
const pageTools = require('../../src/distribution/page-tools.js');

/** A hand-made Bundle with no prose licence, one draft and one superseded stable item. */
function handMade() {
  const item = (slug, frontmatter, body = '') => ({ body, frontmatter: { title: slug, type: 'concept', kind: 'pattern', ...frontmatter }, slug, type: 'concept' });
  return {
    config: { site: { base: 'https://hand.example/' } },
    items: [item('a', { requires: ['b'], supersedes: ['b'] }), item('b', {}), item('c', { requires: ['b'], status: 'draft' })],
  };
}

test('AGSC-09-13, AGSC-09-13a: the local server\'s brief answers over the listed set, explain and check over the Bundle on disk, and their faults are envelopes', () => {
  const local = mcpTools.tools(handMade(), {});
  const code = (name, args) => local.call(name, args).body.code;
  assert.equal(code('brief', { selection: 'a' }), 'AGSC-E201');
  assert.equal(code('check', { selection: 'a' }), 'AGSC-E201');
  assert.equal(code('check', { selection: ['z'] }), 'AGSC-E301', 'a slug that names no item');
  assert.equal(code('explain', { key: 'mentions', source: 'a', target: 'b' }), 'AGSC-E203');
  assert.equal(code('explain', { key: 'requires', source: 'a', target: 'z' }), 'AGSC-E301');
  assert.equal(code('explain', { key: 'requires', source: 'a' }), 'AGSC-E003');
  // AGSC-09-13: the local server answers from the Bundle as it is on disk, a draft included;
  // AGSC-09-16: only a page tool answers AGSC-E301 for an item that is not listed.
  assert.deepEqual(local.call('explain', { key: 'requires', source: 'c', target: 'b' }).body,
    { because: [{ from: [['c', 'requires', 'b']], rule: 'authored' }], holds: true, key: 'requires', source: 'c', target: 'b' });
  assert.deepEqual(local.call('check', { selection: ['c'] }).body, { findings: [], selection: ['c'] });
  assert.deepEqual(local.call('check', {}).body.selection, ['a', 'b'], 'no selection: every listed item (AGSC-09-13 table)');
  assert.equal(local.call('brief', { selection: ['a'] }).body.code, 'AGSC-E901', 'no build, no instant: nothing is guessed');
  const built = mcpTools.tools(handMade(), { artifacts: new Map([['/.well-known/knowledge-linkset', LINKSET]]) });
  assert.deepEqual(built.call('brief', { selection: ['c'] }).body.selection, [], 'the brief names listed items only');
  const brief = built.call('brief', { selection: ['a'] }).body;
  assert.equal(brief.license.prose, 'LicenseRef-AgenticSystemCore-Content-Use-1.0', 'no prose licence: the Content Use Terms');
  assert.equal(brief.generated_at, '2026-01-01T00:00:00Z');
  const check = local.call('check', { selection: ['b', 'a', 'a'] }).body;
  assert.deepEqual(check.selection, ['a', 'b']);
  assert.deepEqual(check.findings.map((f) => f.code), ['AGSC-E314', 'AGSC-E316']);
  assert.deepEqual(local.call('read', { slug: 'a' }).body.chunks, [], 'no build, no chunk line');
});

test('AGSC-09-13: the page tools say when the chunk export or Web Crypto is missing, never an empty answer', async () => {
  const page = '---\ntitle: a\ntype: concept\nkind: pattern\n---\n\nBody.\n';
  const sources = {
    '/.well-known/knowledge-linkset': LINKSET,
    '/chunks.jsonl': `${JSON.stringify({ lines_total: 1, shards: ['/chunks-01.jsonl'] })}\n`,
    '/pages/a.md': page,
  };
  const core = { briefOf, compose, selectionDigestInput };
  const toolset = pageTools.pageToolset(pageTools.pageCorpus(sources, { bundleId: 'x' }), core);
  const read = toolset.call('read', { slug: 'a' });
  assert.equal(read.body.code, 'AGSC-E901');
  assert.match(read.body.message, /chunks-01\.jsonl/u);
  // With Web Crypto the page's own `brief` answers a promise of the envelope.
  const promised = await toolset.call('brief', { selection: ['a'] });
  assert.equal(promised.type, 'brief');
  assert.equal(promised.body.license.prose, 'LicenseRef-AgenticSystemCore-Content-Use-1.0');
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined, writable: true });
  try {
    assert.equal(toolset.call('brief', { selection: ['a'] }).body.code, 'AGSC-E901');
  } finally {
    Object.defineProperty(globalThis, 'crypto', saved);
  }
});

// ------------------------------------------------------------- the domain parts (cli-0037)

const DOMAIN = Object.freeze({ context: 'billing', role: 'aggregate-root' });
const domainOfSlug = (slug) => (slug === 'invoice' ? DOMAIN : null);

test('toolWithDomain puts `domain` among the members in code-point order, and keeps a record with no part as it is', () => {
  const hit = { iri: 'https://a.example/concepts/invoice/', score: 1, slug: 'invoice', title: 'Invoice' };
  assert.deepEqual(Object.keys(answers.toolWithDomain(hit, DOMAIN)), ['domain', 'iri', 'score', 'slug', 'title']);
  assert.equal(answers.toolWithDomain(hit, null), hit);
  // Member names as answers have them (no array-index name, which an object orders first).
  fc.assert(fc.property(fc.dictionary(fc.stringMatching(/^[a-z_]{1,6}$/u).filter((k) => k !== 'domain'), fc.nat()), (record) => {
    const once = answers.toolWithDomain(record, DOMAIN);
    assert.deepEqual(Object.keys(once), [...Object.keys(record), 'domain'].sort());
    assert.deepEqual(answers.toolWithDomain(once, DOMAIN), once);
  }), { numRuns: 100, seed: 20261106 });
});

test('toolDomainAnswer adds the parts to search hits and to a read body, and returns every other answer unchanged', () => {
  const search = { body: { hits: [{ slug: 'note' }, { slug: 'invoice' }] }, source: 'search', type: 'items' };
  assert.deepEqual(answers.toolDomainAnswer('search', search, domainOfSlug).body.hits, [{ slug: 'note' }, { domain: DOMAIN, slug: 'invoice' }]);
  const none = { body: { hits: [{ slug: 'note' }] }, source: 'search', type: 'items' };
  assert.equal(answers.toolDomainAnswer('search', none, domainOfSlug), none);
  const read = { body: { body: 'B.', slug: 'invoice' }, source: 'read', type: 'item' };
  assert.deepEqual(answers.toolDomainAnswer('read', read, domainOfSlug).body, { body: 'B.', domain: DOMAIN, slug: 'invoice' });
  const fault = { body: { code: 'AGSC-E301' }, source: 'read', type: 'error' };
  assert.equal(answers.toolDomainAnswer('read', fault, domainOfSlug), fault);
  const links = { body: { slug: 'invoice' }, source: 'links', type: 'item' };
  assert.equal(answers.toolDomainAnswer('links', links, domainOfSlug), links);
  assert.equal(answers.toolDomainAnswer('read', { type: 'item' }, domainOfSlug).body, undefined);
});

test('toolDomainToolset applies the parts to synchronous and to promised answers, and needs the algebra', async () => {
  const corpus = { bySlug: { invoice: { frontmatter: { domain_role: 'entity' }, slug: 'invoice' } } };
  const core = { domainOf: (item) => ({ role: item.frontmatter.domain_role }), domainWithin: (domain) => domain };
  const toolset = { call: (name, args) => (name === 'brief' ? Promise.resolve({ body: {}, type: 'brief' })
    : { body: { slug: args.slug }, type: 'item' }) };
  const wrapped = answers.toolDomainToolset(toolset, corpus, core, []);
  assert.deepEqual(wrapped.call('read', { slug: 'invoice' }).body, { domain: { role: 'entity' }, slug: 'invoice' });
  assert.deepEqual(wrapped.call('read', { slug: 'other' }).body, { slug: 'other' });
  assert.deepEqual(await wrapped.call('brief', {}), { body: {}, type: 'brief' });
  assert.equal(answers.toolDomainToolset(toolset, corpus, undefined, []), toolset);
  assert.equal(answers.toolDomainToolset(toolset, null, core, []).call('read', { slug: 'invoice' }).body.domain, undefined);
});

test('toolDomainToolset leaves out the context of a withheld item, whose context is an item not listed (AGSC-09-16)', () => {
  const corpus = { bySlug: {
    inv: { frontmatter: { clusters: ['secret-billing'], domain_role: 'entity' }, slug: 'inv' },
    pay: { frontmatter: { clusters: ['billing'], domain_role: 'policy' }, slug: 'pay' },
    billing: { frontmatter: { type: 'cluster' }, slug: 'billing' },
    only: { frontmatter: { domain_context: 'secret-billing' }, slug: 'only' },
  } };
  const toolset = { call: (name, args) => ({ body: { slug: args.slug }, type: 'item' }) };
  const wrapped = answers.toolDomainToolset(toolset, corpus, { domainOf, domainWithin }, ['billing', 'secret-billing'], ['inv', 'only']);
  assert.deepEqual(wrapped.call('read', { slug: 'inv' }).body, { domain: { role: 'entity' }, slug: 'inv' });
  assert.deepEqual(wrapped.call('read', { slug: 'pay' }).body, { domain: { context: 'billing', role: 'policy' }, slug: 'pay' });
  assert.deepEqual(wrapped.call('read', { slug: 'only' }).body, { slug: 'only' }, 'no part is left, so no domain member');
});
