'use strict';
// verifies AGSC-07-25
// The domain paragraph of the composition brief (`src/composition/brief.js`, `DOMAIN_PORTABLE`)
// beyond the bytes of compose-0034: the parts are those of the knowledge readers
// (`knowledge/warrants.js#warrantOf`, `knowledge/contexts.js#contextOf`); with no domain key the
// four files are the bytes of `briefFiles` (a node without the layer keeps its brief); the
// paragraph does not depend on the order of the items or of the selection; two runs give the
// same bytes; and `context.md` keeps its bound with the longer sections. Seeded properties,
// fixed instant, no network.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const brief = require('../../src/composition/brief.js');
const { compose } = require('../../src/composition/compose.js');
const { warrantOf } = require('../../src/knowledge/warrants.js');
const contexts = require('../../src/knowledge/contexts.js');

const INSTANT = '2026-09-16T12:34:56Z';
const SLUGS = ['a', 'b', 'c', 'd', 'e'];
const CLUSTERS = ['x', 'y'];
const RUNS = { numRuns: 150, seed: 20261106 };

/** A warrant as an author may write it: valid, or broken in one of the ways the schema refuses. */
const warrantArbitrary = fc.oneof(
  fc.record({ source: fc.constantFrom('https://example.org/w', 'Evans 2003'), type: fc.constantFrom('literary', 'user', 'organisational') }),
  fc.record({ source: fc.constantFrom('', 'two\nlines', 7), type: fc.constantFrom('literary', 'organizational', 'other') }),
  fc.constantFrom(null, 'literary', ['literary']),
);

/** The domain keys an item may state, each present or absent. */
const domainArbitrary = fc.record({
  clusters: fc.subarray(CLUSTERS, { minLength: 1 }),
  domain_context: fc.constantFrom('x', 'y', 'z'),
  domain_role: fc.constantFrom('aggregate-root', 'entity', 'value-object', 'domain-event', 'policy'),
  domain_type: fc.constantFrom('Invoice', 'Money'),
  warrant: warrantArbitrary,
}, { requiredKeys: [] });

/** The one listed cluster: `x` is an item of every generated Bundle, `y` and `z` never are. */
const CLUSTER_X = Object.freeze({ description: 'The x context.', slug: 'x', title: 'X', type: 'cluster' });

/** A generated Bundle over SLUGS and the cluster `x`: `requires` chains, and the domain keys or none. */
const itemsArbitrary = (withDomain) => fc.tuple(...SLUGS.map((slug, i) => fc.record({
  domain: withDomain ? domainArbitrary : fc.constant({}),
  requires: fc.subarray(SLUGS.slice(i + 1), { maxLength: Math.min(2, SLUGS.length - i - 1) }),
}).map((r) => ({
  body: `Body of ${slug}.\n`, description: `About ${slug}.`, slug, title: slug.toUpperCase(), type: 'concept',
  ...(r.requires.length > 0 ? { requires: r.requires } : {}), ...r.domain,
})))).map((items) => [...items, CLUSTER_X]);

/** The options of the command line, for a selection's verdict. */
function optionsFor(items, declared) {
  return { base: 'https://brief.example/', bundleVersion: '1.0.0', contexts: declared, instant: INSTANT, items,
    licenseProse: 'CC0-1.0', selectionDigest: 'f'.repeat(64), specVersion: '1.0.0' };
}

test('the parts are the warrant of warrants.js and, on a node that lints clean, the context of contexts.js', () => {
  fc.assert(fc.property(domainArbitrary, fc.subarray(CLUSTERS), (keys, declared) => {
    const item = { slug: 'a', type: 'concept', ...keys };
    const parts = brief.domainOf(item, declared) || {};
    assert.deepStrictEqual(parts.warrant === undefined ? null : parts.warrant, warrantOf(item));
    // AGSC-02-25: a `domain_context` that names no declared context is AGSC-E418; for every
    // other item the context is the one AGSC-08-32 defines.
    if (item.domain_context === undefined || declared.includes(item.domain_context)) {
      const entries = declared.map((cluster) => ({ cluster, namespace: `https://example.org/${cluster}#` }));
      assert.strictEqual(parts.context === undefined ? null : parts.context, contexts.contextOf(entries)(item));
    }
    assert.strictEqual(parts.role, item.domain_role);
    assert.strictEqual(parts.type, item.domain_type);
  }), RUNS);
});

test('an item that states no domain key, or only a warrant the schema refuses, has no domain part', () => {
  assert.strictEqual(brief.domainOf({ clusters: ['x'], slug: 'a' }, ['x']), null);
  assert.strictEqual(brief.domainOf({ slug: 'a', warrant: { source: '', type: 'literary' } }, []), null);
  assert.deepStrictEqual(brief.domainOf({ frontmatter: { clusters: ['x'], domain_role: 'policy' }, slug: 'a' }, ['x']),
    { context: 'x', role: 'policy' });
});

test('with no domain key the four files are the bytes of briefFiles (AGSC-07-25: a node without the layer)', () => {
  fc.assert(fc.property(itemsArbitrary(false), fc.subarray(SLUGS, { minLength: 1 }), (items, selection) => {
    const result = compose(items, selection);
    const options = optionsFor(items, CLUSTERS);
    assert.deepStrictEqual(brief.briefDomainFiles(result, options), brief.briefFiles(result, options));
    assert.deepStrictEqual(brief.briefDomainOf(result, options), brief.briefOf(result, options));
  }), RUNS);
});

test('the domain paragraph depends on neither the order of the items nor that of the selection, and two runs agree', () => {
  fc.assert(fc.property(itemsArbitrary(true), fc.subarray(SLUGS, { minLength: 1 }), (items, selection) => {
    const once = brief.briefDomainFiles(compose(items, selection), optionsFor(items, ['x']));
    const reversed = [...items].reverse();
    assert.deepStrictEqual(brief.briefDomainFiles(compose(reversed, [...selection].reverse()), optionsFor(reversed, ['x'])), once);
    assert.deepStrictEqual(brief.briefDomainFiles(compose(items, selection), optionsFor(items, ['x'])), once);
  }), RUNS);
});

test('BRIEF.md has a Domain line and context.md the domain lines of each member with a part, and brief.json its domain member', () => {
  fc.assert(fc.property(itemsArbitrary(true), fc.subarray(SLUGS, { minLength: 1 }), (items, selection) => {
    const result = compose(items, selection);
    const options = optionsFor(items, ['x']);
    const files = new Map(brief.briefDomainFiles(result, options));
    const record = JSON.parse(files.get('brief.json'));
    const withPart = record.items.filter((entry) => entry.domain !== undefined).map((entry) => entry.slug);
    assert.deepStrictEqual(withPart, record.items.map((entry) => entry.slug)
      .filter((slug) => brief.domainOf(items.find((i) => i.slug === slug), ['x']) !== null));
    const md = files.get('BRIEF.md');
    assert.strictEqual(md.includes('\n## Domain\n'), withPart.length > 0);
    for (const slug of withPart) assert.ok(md.includes(`\n- \`${slug}\`: `), `BRIEF.md has no Domain line for ${slug}`);
    if (withPart.length > 0) assert.ok(md.indexOf('## Members') < md.indexOf('## Domain') && md.indexOf('## Domain') < md.indexOf('## Relations'));
    const context = files.get('context.md');
    for (const slug of withPart) {
      const section = context.slice(context.indexOf(`(\`${slug}\`)`));
      const lines = brief.contextDomainLines(record.items.find((entry) => entry.slug === slug).domain);
      assert.ok(section.slice(0, section.indexOf('```')).includes(lines.join('\n')), `the section of ${slug} lacks its domain lines`);
    }
  }), RUNS);
});

test('context.md keeps its bound when the domain lines lengthen the sections, and says how many it left out', () => {
  const long = 'w'.repeat(4000);
  const items = Array.from({ length: 40 }, (_, n) => ({
    body: `${'x'.repeat(2000)}\n`, domain_role: 'entity', slug: `m${String(n).padStart(2, '0')}`, title: `M ${n}`, type: 'concept',
    warrant: { source: `https://example.org/${long}`, type: 'user' },
  }));
  const selection = items.map((i) => i.slug);
  const files = new Map(brief.briefDomainFiles(compose(items, selection), optionsFor(items, [])));
  const context = files.get('context.md');
  assert.ok(Buffer.byteLength(context, 'utf8') <= brief.contextBounds().file, `${Buffer.byteLength(context, 'utf8')} bytes`);
  const plain = new Map(brief.briefFiles(compose(items, selection), optionsFor(items, []))).get('context.md');
  const omitted = (text) => Number(/<!-- truncated: (\d+) of 40 items omitted -->\n$/u.exec(text)[1]);
  assert.ok(omitted(context) > omitted(plain), 'the longer sections leave out more of them');
});

test('a context that is an item not listed (a draft or held-back cluster) is named in no file of the brief (AGSC-07-25)', () => {
  const items = [
    { body: 'Invoice.\n', clusters: ['secret-billing'], domain_role: 'entity', slug: 'inv', title: 'Invoice', type: 'concept' },
    { body: 'Bill.\n', domain_context: 'held', domain_type: 'Bill', slug: 'bill', title: 'Bill', type: 'concept' },
    { description: 'Draft.', slug: 'secret-billing', status: 'draft', title: 'Secret', type: 'cluster' },
    { description: 'Held.', slug: 'held', title: 'Held', type: 'cluster' },
  ];
  const options = { ...optionsFor(items, ['secret-billing', 'held']), listed: ['inv', 'bill'] };
  const files = brief.briefDomainFiles(compose(items, ['inv', 'bill']), options);
  for (const [name, text] of files) {
    assert.doesNotMatch(text, /secret-billing|held/u, `${name} names a context that is not listed`);
  }
  const record = JSON.parse(new Map(files).get('brief.json'));
  assert.deepStrictEqual(record.items.map((entry) => [entry.slug, entry.domain]),
    [['bill', { type: 'Bill' }], ['inv', { role: 'entity' }]]);
  assert.deepStrictEqual(brief.domainWithheld(items, options.listed, options.contexts), ['bill', 'inv']);
  // Listed, the same cluster is named; a context that names no item is kept as stated (compose-0034).
  const listed = brief.briefDomainOf(compose(items, ['inv']), { ...options, listed: ['inv', 'secret-billing'] });
  assert.deepStrictEqual(listed.items[0].domain, { context: 'secret-billing', role: 'entity' });
  const none = brief.briefDomainOf(compose(items.slice(0, 1), ['inv']), { ...options, items: items.slice(0, 1), listed: ['inv'] });
  assert.deepStrictEqual(none.items[0].domain, { context: 'secret-billing', role: 'entity' });
  // A page holds the listed items alone and is handed the list (composition/browser.js).
  const page = brief.briefDomainFiles(compose(items.slice(0, 2), ['inv', 'bill']),
    { ...options, contexts: [], items: items.slice(0, 2), listed: undefined, withheld: ['bill', 'inv'] });
  assert.deepStrictEqual(page, files);
});

// ----------------------------------------------------- domain links in relations

/** The domain links the host hands in (`knowledge/links.js#domainEdges`): `a controls b`, its inverse, and one to `z`. */
const DOMAIN_EDGES = Object.freeze([
  { key: 'controls', origin: 'authored', source: 'a', target: 'b' },
  { key: 'controlled-by', origin: 'inverse', source: 'b', target: 'a' },
  { key: 'pairedWith', origin: 'authored', source: 'c', target: 'z' },
  { key: 'pairedWith', origin: 'symmetric', source: 'z', target: 'c' },
]);

test('a domain link appears in relations like any other key, in BRIEF.md and, authored inside, in brief.mmd (AGSC-07-25)', () => {
  const items = SLUGS.map((slug) => ({ body: `${slug}.\n`, slug, title: slug, type: 'concept' }));
  const options = { ...optionsFor(items, []), domainEdges: DOMAIN_EDGES };
  const files = new Map(brief.briefDomainFiles(compose(items, ['a']), options));
  const record = JSON.parse(files.get('brief.json'));
  assert.deepStrictEqual(record.relations, [
    { key: 'controls', origin: 'authored', scope: 'outside', source: 'a', target: 'b' },
    { key: 'controlled-by', origin: 'inverse', scope: 'outside', source: 'b', target: 'a' },
  ], 'the edge to an item that is not listed is left out');
  assert.ok(files.get('BRIEF.md').includes('- `a` controls `b` (authored, outside)\n'));
  const inside = new Map(brief.briefDomainFiles(compose(items, ['a', 'b']), options));
  assert.match(inside.get('brief.mmd'), /\n {2}a -->\|controls\| b\n/u);
  assert.doesNotMatch(inside.get('brief.mmd'), /controlled-by/u, 'a computed edge is not drawn');
  // Domain links name no member of the domain paragraph, and change nothing a key of the fourteen decides.
  assert.strictEqual(record.items[0].domain, undefined);
  const plain = brief.briefOf(compose(items, ['a', 'b']), options);
  const linked = JSON.parse(inside.get('brief.json'));
  for (const name of ['checklist', 'derived', 'gaps', 'order', 'selection', 'verdict']) assert.deepStrictEqual(linked[name], plain[name], name);
});

test('a domain link that repeats an edge of the fourteen keys is one relation, authored when either is', () => {
  const items = [{ related: ['b'], slug: 'a', title: 'a', type: 'concept' }, { slug: 'b', title: 'b', type: 'concept' }];
  const edges = [{ key: 'related', origin: 'symmetric', source: 'a', target: 'b' }, { key: 'related', origin: 'authored', source: 'b', target: 'a' }];
  const record = brief.briefDomainOf(compose(items, ['a', 'b']), { ...optionsFor(items, []), domainEdges: edges });
  assert.deepStrictEqual(record.relations.map((r) => [r.source, r.key, r.target, r.origin]),
    [['a', 'related', 'b', 'authored'], ['b', 'related', 'a', 'authored']]);
});

test('the relations with domain links depend on neither the order of the items nor that of the edges', () => {
  fc.assert(fc.property(itemsArbitrary(true), fc.subarray(SLUGS, { minLength: 1 }), fc.shuffledSubarray(DOMAIN_EDGES, { minLength: 4 }),
    (items, selection, edges) => {
      const once = brief.briefDomainFiles(compose(items, selection), { ...optionsFor(items, ['x']), domainEdges: DOMAIN_EDGES });
      const reversed = [...items].reverse();
      assert.deepStrictEqual(brief.briefDomainFiles(compose(reversed, selection), { ...optionsFor(reversed, ['x']), domainEdges: edges }), once);
    }), RUNS);
});

// ------------------------------------------- the layout the domain paragraph writes into

/** `text` with every line of `lines` removed once, and a `## Domain` section dropped. */
function withoutDomain(text, lines) {
  let out = text.replace(/\n\n## Domain\n\n[^]*?(?=\n\n## Relations\n)/u, '');
  for (const line of lines) out = out.replace(`\n${line}`, '');
  return out;
}

test('BRIEF.md and context.md with the domain parts are those of briefMd and contextMd with the parts added, and nothing else', () => {
  fc.assert(fc.property(itemsArbitrary(true), fc.subarray(SLUGS, { minLength: 1 }), (items, selection) => {
    const result = compose(items, selection);
    const options = optionsFor(items, ['x']);
    const parts = brief.briefDomainParts(result, options);
    const lines = [...parts.domains.values()].flatMap((domain) => brief.contextDomainLines(domain));
    assert.strictEqual(withoutDomain(brief.briefDomainMd(parts, options), []), brief.briefMd(parts, options));
    const context = brief.contextDomainMd(parts, options);
    assert.strictEqual(withoutDomain(context, lines), brief.contextMd(parts, options));
    // In its place: a member's domain lines end its list of lines, right before the fenced prose.
    for (const [slug, domain] of parts.domains) {
      const section = context.slice(context.indexOf(`(\`${slug}\`)`));
      assert.ok(section.includes(`\n${brief.contextDomainLines(domain).join('\n')}\n\n\`\`\`text agsc-content\n`), slug);
      assert.strictEqual(section.slice(0, section.indexOf('```')).split('\n\n').length, 3, `${slug}: heading, lines, prose`);
    }
  }), RUNS);
});
