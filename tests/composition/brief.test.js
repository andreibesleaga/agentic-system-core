'use strict';
// verifies AGSC-07-25, AGSC-07-26, AGSC-07-27, AGSC-07-28
// The composition brief (`src/composition/brief.js`) beyond the bytes of compose-0024 to
// compose-0026: properties over generated graphs (the brief does not depend on the order of the
// selection, two runs give the same bytes, the inputs are not changed, no file names an item
// that is not listed), the readings of `derived` equal those of `knowledge/derive.js`
// (AGSC-05-33), `context.md` stays under its bound, and no narration is ever written or pinned.
// Seeded properties, fixed instant, no network.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const fc = require('fast-check');

const brief = require('../../src/composition/brief.js');
const { compose } = require('../../src/composition/compose.js');
const harness = require('../../src/composition/harness.js');
const links = require('../../src/knowledge/links.js');
const derive = require('../../src/knowledge/derive.js');

const INSTANT = '2026-09-16T12:34:56Z';
const SLUGS = ['a', 'b', 'c-d', 'e', 'f', 'g-h', 'i'];
const KEYS = ['requires', 'broader', 'narrower', 'derived-from', 'uses', 'related', 'excludes',
  'contradicts', 'supersedes', 'verifies', 'blocked-by', 'decided-by', 'implements', 'covers'];
const RUNS = { numRuns: 150, seed: 20261105 };

/** A generated Bundle: items over SLUGS with random Links, types, statuses, sources and ports. */
const itemsArbitrary = fc.tuple(...SLUGS.map((slug) => fc.record({
  links: fc.dictionary(fc.constantFrom(...KEYS), fc.subarray(SLUGS.filter((s) => s !== slug), { maxLength: 2 }), { maxKeys: 3 }),
  ports: fc.record({ consumes: fc.subarray(['p', 'q']), produces: fc.subarray(['p', 'q']) }),
  sources: fc.boolean(),
  status: fc.constantFrom('stable', 'stable', 'deprecated', 'draft'),
  type: fc.constantFrom('concept', 'concept', 'procedure'),
}).map((r) => ({
  ...r.links,
  ...(r.ports.consumes.length > 0 ? { consumes: r.ports.consumes } : {}),
  ...(r.ports.produces.length > 0 ? { produces: r.ports.produces } : {}),
  ...(r.sources ? { sources: [{ resource: `https://example.org/${slug}` }] } : {}),
  body: `The body of ${slug}.\n`,
  description: `The item ${slug}.`,
  slug,
  status: r.status,
  title: `Item ${slug}`,
  type: r.type,
}))));

function optionsFor(result, items, listed) {
  return {
    base: 'https://brief.example/',
    bundleVersion: '1.4.0',
    instant: INSTANT,
    items,
    licenseProse: 'LicenseRef-AgenticSystemCore-Content-Use-1.0',
    listed,
    selectionDigest: createHash('sha256').update(harness.selectionDigestInput(result), 'utf8').digest('hex'),
    specVersion: '1.0.0',
  };
}

const listedOf = (items) => items.filter((i) => i.status !== 'draft').map((i) => i.slug);
const filesOf = (items, selection) => {
  const result = compose(items, selection);
  return brief.briefFiles(result, optionsFor(result, items, listedOf(items)));
};

/** Every string anywhere inside a JSON value. */
function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value !== null && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out));
  return out;
}

test('AGSC-07-26, AGSC-07-09: the brief does not depend on the order of the selection', () => {
  fc.assert(fc.property(itemsArbitrary, fc.subarray(SLUGS, { minLength: 1 }), fc.integer({ min: 0, max: 1000 }), (items, selection, seed) => {
    const shuffled = [...selection].sort((x, y) => ((x.charCodeAt(0) * seed) % 7) - ((y.charCodeAt(0) * seed) % 7));
    return JSON.stringify(filesOf(items, selection)) === JSON.stringify(filesOf(items, [...shuffled].reverse()))
      && JSON.stringify(filesOf(items, selection)) === JSON.stringify(filesOf(items, [...selection, ...selection]));
  }), RUNS);
});

test('AGSC-07-25: the brief does not depend on the order of the items either', () => {
  fc.assert(fc.property(itemsArbitrary, fc.subarray(SLUGS, { minLength: 1 }), (items, selection) => (
    JSON.stringify(filesOf(items, selection)) === JSON.stringify(filesOf([...items].reverse(), selection)))), RUNS);
});

test('AGSC-07-25: two runs over the same input give the same bytes, and neither changes its input', () => {
  fc.assert(fc.property(itemsArbitrary, fc.subarray(SLUGS, { minLength: 1 }), (items, selection) => {
    const before = JSON.stringify(items);
    const first = filesOf(items, selection);
    return JSON.stringify(items) === before && JSON.stringify(filesOf(items, selection)) === JSON.stringify(first);
  }), RUNS);
});

test('AGSC-07-25, AGSC-00-05: no file of the brief names an item that is not listed', () => {
  fc.assert(fc.property(itemsArbitrary, fc.subarray(SLUGS, { minLength: 1 }), (items, selection) => {
    const hidden = new Set(items.filter((i) => i.status === 'draft').map((i) => i.slug));
    const files = new Map(filesOf(items, selection));
    const record = JSON.parse(files.get('brief.json'));
    const named = strings({ ...record, summary: '', terms_statement: '' });
    const mmd = files.get('brief.mmd').split('\n').filter((line) => line.startsWith('  ')).join('\n');
    return named.every((s) => !hidden.has(s)) && [...hidden].every((slug) => !mmd.includes(`"${slug}"`)
      && !files.get('BRIEF.md').includes(`\`${slug}\``) && !files.get('context.md').includes(`\`${slug}\``));
  }), RUNS);
});

test('AGSC-07-25: a member reached only through an item that is not listed is left out with its verdict entry', () => {
  const items = [
    { requires: ['secret'], slug: 'top', title: 'Top', type: 'concept' },
    { requires: ['base'], slug: 'secret', status: 'draft', title: 'Hidden', type: 'concept' },
    { slug: 'base', title: 'Base', type: 'concept' },
  ];
  const result = compose(items, ['top']);
  assert.deepStrictEqual([...result.selection], ['base', 'secret', 'top']);
  const record = brief.briefOf(result, optionsFor(result, items, ['top', 'base']));
  assert.deepStrictEqual(record.selection, ['top']);
  assert.deepStrictEqual(record.verdict.added, []);
  assert.ok(!JSON.stringify(record).includes('secret'));
});

test('AGSC-07-25: without a list of listed items every item handed in is listed (the page)', () => {
  const items = [{ slug: 'a', title: 'A', type: 'concept', uses: ['b'] }, { slug: 'b', status: 'draft', title: 'B', type: 'concept' }];
  const result = compose(items, ['a']);
  const options = optionsFor(result, items, undefined);
  assert.deepStrictEqual(brief.briefOf(result, options).gaps.map((g) => g.kind), ['uses-not-selected', 'no-sources']);
  assert.deepStrictEqual(brief.briefOf(result, { ...options, listed: ['a'] }).gaps.map((g) => g.kind), ['no-sources']);
});

test('AGSC-07-25: the summary of an invalid composition names every conflict code, also one left out for naming an item that is not listed', () => {
  const items = [{ slug: 'a', title: 'A', type: 'concept' }];
  const result = compose(items, ['a', 'missing']);
  const record = brief.briefOf(result, optionsFor(result, items, ['a']));
  assert.deepStrictEqual(record.verdict.conflicts, []);
  assert.strictEqual(record.valid, false);
  assert.match(record.summary, / The composition is not valid \(AGSC-E802\)\.$/u);
});

test('AGSC-07-25, AGSC-05-33: `derived` holds the readings of derive.js with the rule transitive or closure, both ends in the selection', () => {
  fc.assert(fc.property(itemsArbitrary, fc.subarray(SLUGS, { minLength: 1 }), (items, selection) => {
    const all = items.map((i) => ({ ...i, status: 'stable' }));
    const result = compose(all, selection);
    const inside = new Set(result.selection);
    const expected = derive.readings(links.resolve(all).edges)
      .filter((r) => r.because.every((b) => b.rule === 'transitive' || b.rule === 'closure'))
      .filter((r) => inside.has(r.source) && inside.has(r.target));
    const got = brief.briefOf(result, optionsFor(result, all, undefined)).derived;
    return harness.canonicalJson(got) === harness.canonicalJson(expected);
  }), RUNS);
});

/** A chain of `n` Concepts, `c-<i>` requiring `c-<i-1>`: its `derived` grows with the cube of `n`. */
const chainOf = (n) => Array.from({ length: n }, (_, i) => ({
  body: '', ...(i > 0 ? { requires: [`c-${i - 1}`] } : {}), slug: `c-${i}`, title: `C ${i}`, type: 'concept',
}));
const steps = (readings) => readings.reduce((n, r) => n + r.because.reduce((m, b) => m + b.from.length, 0), 0);

test('AGSC-07-25 (engine bound): a brief whose `derived` would hold more than 1,000,000 steps is AGSC-E904, raised before it is built', () => {
  assert.strictEqual(brief.derivedBound(), 1000000);
  const under = chainOf(144);
  const kept = compose(under, ['c-143']);
  assert.strictEqual(steps(brief.briefOf(kept, optionsFor(kept, under, undefined)).derived), 994994, 'at the bound the brief is whole');
  const over = chainOf(145);
  const result = compose(over, ['c-144']);
  const refused = (e) => e.code === 'AGSC-E904' && /1,000,000 steps/u.test(e.message);
  assert.throws(() => brief.briefOf(result, optionsFor(result, over, undefined)), refused);
  assert.throws(() => brief.briefFiles(result, optionsFor(result, over, undefined)), refused);
});

test('AGSC-07-25 (engine bound): the readings are refused exactly when they hold more steps than the bound, whatever the order of the edges', () => {
  fc.assert(fc.property(itemsArbitrary, fc.nat(40), fc.boolean(), (items, bound, reversed) => {
    const all = items.map((i) => ({ ...i, status: 'stable' }));
    const edges = brief.briefEdges(brief.listedIndex({ items: all }));
    const whole = brief.chainReadings(edges, SLUGS);
    const given = reversed ? [...edges].reverse() : edges;
    try {
      const kept = brief.chainReadings(given, SLUGS, bound);
      return steps(whole) <= bound && JSON.stringify(kept) === JSON.stringify(whole);
    } catch (e) {
      return e.code === 'AGSC-E904' && steps(whole) > bound;
    }
  }), RUNS);
});

/** Whether the precedence edges `before` gives hold a cycle (a walk that meets a node on its own path). */
function cyclic(bySlug, before) {
  const state = new Map();
  const visit = (slug) => {
    if (state.get(slug) === 'done') return false;
    if (state.get(slug) === 'open') return true;
    state.set(slug, 'open');
    const found = before(bySlug.get(slug)).some(visit);
    state.set(slug, 'done');
    return found;
  };
  return [...bySlug.keys()].some(visit);
}

test('AGSC-07-26: a member comes after every member it requires, is narrower than or derives from, unless a cycle forces the least slug', () => {
  fc.assert(fc.property(itemsArbitrary, (items) => {
    const all = items.map((i) => ({ ...i, excludes: undefined, status: 'stable', supersedes: undefined }));
    const result = compose(all, SLUGS);
    const record = brief.briefOf(result, optionsFor(result, all, undefined));
    const position = new Map(record.order.map((slug, i) => [slug, i]));
    const before = (item) => [...(item.requires || []), ...(item.broader || []), ...(item['derived-from'] || [])];
    const bySlug = new Map(all.map((x) => [x.slug, x]));
    if (all.some((x) => (x.narrower || []).length > 0) || cyclic(bySlug, before)) return true;
    return record.order.length === SLUGS.length && all.every((x) => before(x).every((t) => position.get(t) < position.get(x.slug)));
  }), RUNS);
});

test('AGSC-07-25: context.md stays within 65,536 bytes and says how many members it left out', () => {
  const big = 'x'.repeat(30000);
  const items = ['m1', 'm2', 'm3', 'm4'].map((slug) => ({ body: `${big}é\n`, slug, title: slug.toUpperCase(), type: 'concept' }));
  const result = compose(items, ['m1', 'm2', 'm3', 'm4']);
  const text = new Map(brief.briefFiles(result, optionsFor(result, items, undefined))).get('context.md');
  assert.ok(Buffer.byteLength(text, 'utf8') <= 65536, `${Buffer.byteLength(text, 'utf8')} bytes`);
  assert.ok(text.endsWith('\n\n<!-- truncated: 2 of 4 items omitted -->\n'), text.slice(-60));
  assert.ok(text.includes('## M2 (`m2`)') && !text.includes('## M3 (`m3`)'));
  const small = compose(items.slice(0, 1), ['m1']);
  assert.ok(!new Map(brief.briefFiles(small, optionsFor(small, items.slice(0, 1), undefined))).get('context.md').includes('truncated'));
});

test('AGSC-07-25: the byte count of context.md is UTF-8, as Buffer counts it', () => {
  fc.assert(fc.property(fc.string({ unit: 'binary' }), fc.string({ unit: 'grapheme' }), (a, b) => (
    brief.utf8Length(a) === Buffer.byteLength(a, 'utf8') && brief.utf8Length(b) === Buffer.byteLength(b, 'utf8'))), RUNS);
  assert.strictEqual(brief.utf8Length('\ud800'), 3, 'a lone surrogate is written as U+FFFD');
});

test('AGSC-07-25: an empty body quotes the description; an empty selection still gives four files', () => {
  const items = [{ body: '  \n', description: 'The description.', slug: 'a', title: 'A', type: 'concept' }];
  const result = compose(items, ['a']);
  assert.match(new Map(brief.briefFiles(result, optionsFor(result, items, undefined))).get('context.md'),
    /```text agsc-content\nThe description\.\n```\n$/u);
  const none = compose([], ['gone']);
  const files = brief.briefFiles(none, optionsFor(none, [], undefined));
  assert.deepStrictEqual(files.map(([name]) => name), ['BRIEF.md', 'brief.json', 'brief.mmd', 'context.md']);
  assert.match(files[0][1], /## Members\n\nNone\.\n/u);
});

test('AGSC-07-28: no narration is written and no vector pins one', () => {
  fc.assert(fc.property(itemsArbitrary, fc.subarray(SLUGS, { minLength: 1 }), (items, selection) => (
    filesOf(items, selection).every(([name]) => name !== 'narration.md'))), { numRuns: 30, seed: 20261105 });
  const root = path.resolve(__dirname, '..', 'vectors');
  const names = [];
  for (const rel of fs.readdirSync(root, { recursive: true }).map(String).filter((f) => f.endsWith('.json'))) {
    const vector = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
    if (JSON.stringify(vector.expected).includes('narration.md')) names.push(rel);
  }
  assert.deepStrictEqual(names, [], 'a vector pins a narration, which AGSC-07-28 keeps out of every vector');
  assert.ok(!fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', 'composition', 'brief.js'), 'utf8').includes("'narration.md'"));
});
