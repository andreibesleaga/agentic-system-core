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

/** A generated Bundle over SLUGS: `requires` chains, and the domain keys or none. */
const itemsArbitrary = (withDomain) => fc.tuple(...SLUGS.map((slug, i) => fc.record({
  domain: withDomain ? domainArbitrary : fc.constant({}),
  requires: fc.subarray(SLUGS.slice(i + 1), { maxLength: Math.min(2, SLUGS.length - i - 1) }),
}).map((r) => ({
  body: `Body of ${slug}.\n`, description: `About ${slug}.`, slug, title: slug.toUpperCase(), type: 'concept',
  ...(r.requires.length > 0 ? { requires: r.requires } : {}), ...r.domain,
}))));

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
