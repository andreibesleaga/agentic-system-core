'use strict';
// AGSC-03-01…03-13 and AGSC-01-35.
// Deterministic: no clock, no network, no filesystem — items are records.

const test = require('node:test');
const assert = require('node:assert');
const links = require('../../src/knowledge/links.js');

const codes = (result) => result.errors.map((f) => f.code);
const errorsOf = (result) => result.errors.filter((f) => f.severity === 'error').map((f) => f.code);

test('AGSC-03-01: exactly fourteen keys, nine core and five Mode-2', () => {
  assert.strictEqual(links.LINK_KEYS.length, 14);
  assert.strictEqual(links.CORE_KEYS.length, 9);
  assert.strictEqual(links.MODE2_KEYS.length, 5);
  assert.strictEqual(new Set(links.LINK_KEYS).size, 14);
  for (const key of links.LINK_KEYS) {
    assert.ok(links.INVERSE[key], `${key} has no computed inverse`);
  }
});

test('AGSC-03-05: every symmetric key is its own inverse, and only those three', () => {
  for (const key of links.SYMMETRIC) assert.strictEqual(links.INVERSE[key], key);
  const selfInverse = links.LINK_KEYS.filter((k) => links.INVERSE[k] === k);
  assert.deepStrictEqual(selfInverse.sort(), [...links.SYMMETRIC].sort());
});

test('AGSC-03-02: a Link value follows the slug grammar of slug.js, with no drift', () => {
  const ok = links.resolve([{ slug: 'a-1', type: 'concept', related: ['b-2'] },
    { slug: 'b-2', type: 'concept' }]);
  assert.deepStrictEqual(ok.errors.filter((f) => f.code === 'AGSC-E301'), []);
  for (const bad of ['-a', 'a-', 'A', 'a--b', 'a b']) {
    const result = links.resolve([{ slug: 'x', type: 'concept', related: [bad] },
      { slug: bad, type: 'concept' }]);
    assert.ok(result.errors.some((f) => f.code === 'AGSC-E301'), bad);
  }
});

test('AGSC-03-04/05: inverses are computed, symmetric keys both ways', () => {
  const result = links.resolve([
    { slug: 'a', type: 'concept', related: ['b'], requires: ['c'] },
    { slug: 'b', type: 'concept' },
    { slug: 'c', type: 'concept' },
  ]);
  assert.deepStrictEqual(result.edges, [
    { computed: false, key: 'related', source: 'a', target: 'b' },
    { computed: false, key: 'requires', source: 'a', target: 'c' },
    { computed: true, key: 'related', source: 'b', target: 'a' },
    { computed: true, key: 'required-by', source: 'c', target: 'a' },
  ]);
  assert.deepStrictEqual(result.inverses.map((e) => e.key), ['related', 'required-by']);
});

test('AGSC-03-06: broader and narrower asserted both ways stay one edge each', () => {
  const result = links.resolve([
    { slug: 'child', type: 'cluster', broader: ['parent'] },
    { slug: 'parent', type: 'cluster', narrower: ['child'] },
  ]);
  const pairs = result.edges.map((e) => `${e.source} ${e.key} ${e.target} ${e.computed}`);
  assert.deepStrictEqual(pairs, ['child broader parent false', 'parent narrower child false']);
});

test('AGSC-03-04: authoring a computed inverse is AGSC-E306, not a warning', () => {
  const result = links.resolve([{ slug: 'a', type: 'concept', 'used-by': ['b'] },
    { slug: 'b', type: 'concept' }]);
  assert.ok(errorsOf(result).includes('AGSC-E306'));
  assert.ok(!result.edges.some((e) => e.key === 'used-by' && !e.computed));
});

test('AGSC-03-03: a link-shaped name outside the fourteen warns with AGSC-E304', () => {
  const result = links.resolve([{ slug: 'a', type: 'concept', 'peer-ref': ['b'] },
    { slug: 'b', type: 'concept', related: ['a'] }]);
  const warned = result.errors.find((f) => f.code === 'AGSC-E304');
  assert.ok(warned, 'peer-ref must warn');
  assert.strictEqual(warned.severity, 'warn');
});

test('AGSC-03-02: an unresolved target and a bad anchor are both AGSC-E301', () => {
  const missing = links.resolve([{ slug: 'a', type: 'concept', uses: ['nope'] }]);
  assert.ok(errorsOf(missing).includes('AGSC-E301'));
  const badAnchor = links.resolve([
    { slug: 'a', type: 'concept', uses: ['b#nowhere'] },
    { slug: 'b', type: 'concept', body: '## Intent\n' },
  ]);
  assert.ok(errorsOf(badAnchor).includes('AGSC-E301'));
  const good = links.resolve([
    { slug: 'a', type: 'concept', uses: ['b#intent'] },
    { slug: 'b', type: 'concept', body: '## Intent\n' },
  ]);
  assert.ok(!errorsOf(good).includes('AGSC-E301'));
});

test('AGSC-11-12: a Link value that is an absolute URL is AGSC-E311', () => {
  const result = links.resolve([{ slug: 'a', type: 'concept', related: ['https://example.org/x'] }]);
  assert.ok(errorsOf(result).includes('AGSC-E311'));
});

test('AGSC-03-07: a requires cycle is AGSC-E302 and names every slug on it', () => {
  const result = links.resolve([
    { slug: 'a', type: 'concept', requires: ['b'] },
    { slug: 'b', type: 'concept', requires: ['c'] },
    { slug: 'c', type: 'concept', requires: ['a'] },
  ]);
  assert.deepStrictEqual(result.cycle, ['a', 'b', 'c']);
  assert.ok(errorsOf(result).includes('AGSC-E302'));
});

test('AGSC-03-08: a broader cycle is AGSC-E303 and suppresses the depth walk', () => {
  const result = links.resolve([
    { slug: 'c1', type: 'cluster', broader: ['c2'] },
    { slug: 'c2', type: 'cluster', broader: ['c1'] },
  ]);
  assert.ok(errorsOf(result).includes('AGSC-E303'));
  assert.strictEqual(result.chain, null, 'the depth walk never runs on a cyclic tree');
});

test('AGSC-03-08: three levels pass, four are AGSC-E307 root-first', () => {
  const three = links.resolve([
    { slug: 'c1', type: 'cluster' },
    { slug: 'c2', type: 'cluster', broader: ['c1'] },
    { slug: 'c3', type: 'cluster', broader: ['c2'] },
  ]);
  assert.ok(!errorsOf(three).includes('AGSC-E307'));
  const four = links.resolve([
    { slug: 'c1', type: 'cluster' },
    { slug: 'c2', type: 'cluster', broader: ['c1'] },
    { slug: 'c3', type: 'cluster', broader: ['c2'] },
    { slug: 'c4', type: 'cluster', broader: ['c3'] },
  ]);
  assert.deepStrictEqual(four.chain, ['c1', 'c2', 'c3', 'c4']);
  assert.deepStrictEqual(four.chains, [['c1', 'c2', 'c3', 'c4']]);
});

test('AGSC-03-08: two parents are AGSC-E308 with the parents in code-point order', () => {
  const result = links.resolve([
    { slug: 'c1', type: 'cluster' },
    { slug: 'c2', type: 'cluster' },
    { slug: 'c3', type: 'cluster', broader: ['c2', 'c1'] },
  ]);
  assert.deepStrictEqual(result.parents, ['c1', 'c2']);
  assert.ok(errorsOf(result).includes('AGSC-E308'));
});

test('AGSC-03-10: an item with no inbound Link and no cluster warns', () => {
  const lonely = links.resolve([{ slug: 'a', type: 'concept' }]);
  assert.deepStrictEqual(codes(lonely), ['AGSC-E305']);
  const clustered = links.resolve([{ slug: 'a', type: 'concept', clusters: ['x'] }]);
  assert.deepStrictEqual(codes(clustered), []);
});

test('AGSC-03-11: body references resolve, skip external and report AGSC-E310', () => {
  const result = links.resolve([
    {
      slug: 'start',
      type: 'concept',
      body: 'See [a](agents.md), [g](missing.md), [o](https://example.org/x) and [h](agents.md#intent).',
    },
    { slug: 'agents', type: 'concept', body: '## Intent\n\nx\n' },
  ]);
  assert.deepStrictEqual(result.resolved, ['agents.md', 'agents.md#intent']);
  assert.deepStrictEqual(result.unresolved, ['missing.md']);
  assert.deepStrictEqual(result.skipped_external, ['https://example.org/x']);
  assert.deepStrictEqual(result.skippedExternal, result.skipped_external);
  assert.ok(errorsOf(result).includes('AGSC-E310'));
  assert.ok(result.edges.some((e) => e.key === 'mentions' && e.computed));
});

test('AGSC-03-11: a same-document fragment resolves against the item own anchors', () => {
  const ok = links.resolve([{ slug: 'a', type: 'concept', body: '## Intent\n\n[x](#intent)\n' }]);
  assert.deepStrictEqual(ok.resolved, ['#intent']);
  const bad = links.resolve([{ slug: 'a', type: 'concept', body: '## Intent\n\n[x](#nope)\n' }]);
  assert.deepStrictEqual(bad.unresolved, ['#nope']);
  assert.ok(errorsOf(bad).includes('AGSC-E310'));
});

test('AGSC-03-11: an asset resolves when it exists and the path is grammatical', () => {
  // The reference is written from a file whose directory REACHES the asset without
  // a `..` segment, because AGSC-01-35 forbids one in an inline image target.
  const items = [{
    slug: 'index', type: 'concept', path: 'content/index.md', body: '![x](assets/d.png)\n',
  }];
  const withAsset = links.resolve(items, { assets: ['content/assets/d.png'] });
  assert.deepStrictEqual(withAsset.resolved, ['assets/d.png']);
  const without = links.resolve(items);
  assert.deepStrictEqual(without.unresolved, ['assets/d.png']);
  assert.ok(without.errors.some((f) => f.code === 'AGSC-E310'));
});

test('AGSC-01-35: a `..` body reference that stays inside RESOLVES', () => {
  // Read literally, the segment test would stop an item under content/<type-plural>/
  // from referencing content/assets/ at all — every route to it needs `..`.
  // AGSC-01-35 excepts a body target from the segment test and makes the ESCAPE
  // test the operative one; AGSC-03-11 says the same.
  const asset = links.resolve([{ slug: 'a', type: 'concept', body: '![x](../assets/d.png)\n' }],
    { assets: ['content/assets/d.png'] });
  const pathCodes = (r) => r.errors.filter((f) => f.severity !== 'warn')
    .map((f) => f.code).filter((c) => c === 'AGSC-E902' || c === 'AGSC-E310');
  assert.deepStrictEqual(pathCodes(asset), [], 'a `..` reference to an existing asset is not an error');
  assert.deepStrictEqual(asset.resolved, ['../assets/d.png']);
  // AGSC-06-01 emits `/assets/<path>` for every file under `content/assets/` a
  // published body references, so the reference that works in the repository works
  // on the site too, and no warning says otherwise.
  assert.deepStrictEqual(asset.errors.filter((f) => f.code === 'AGSC-E310'), []);

  // A `..` reference to a sibling ITEM resolves in both spellings.
  const items = [
    { slug: 'a', type: 'concept', body: '[b](../concepts/b.md) and [b again](../concepts/b)\n' },
    { slug: 'b', type: 'concept', body: '# B\n' },
  ];
  const sibling = links.resolve(items);
  assert.deepStrictEqual(pathCodes(sibling), []);
  assert.deepStrictEqual(sibling.resolved, ['../concepts/b.md', '../concepts/b']);

  // Inside the root but nothing there is still AGSC-E310, never AGSC-E902.
  const missing = links.resolve([{ slug: 'a', type: 'concept', body: '[x](../assets/nope.png)\n' }]);
  assert.deepStrictEqual(pathCodes(missing), ['AGSC-E310']);

  // The KEYED form of AGSC-01-35 is unchanged: a keyed value keeps the segment test.
  assert.strictEqual(links.pathGrammarError('../assets/d.png', 'content/concepts'), 'dot segment');
  assert.strictEqual(links.bodyPathError('../assets/d.png', 'content/concepts'), null);
});

test('AGSC-01-35: a body reference that escapes the root is AGSC-E902', () => {
  const result = links.resolve([{ slug: 'a', type: 'concept', body: '[x](../../../etc/passwd)\n' }]);
  assert.ok(errorsOf(result).includes('AGSC-E902'));
  assert.ok(result.errors.some((f) => f.message.includes('escapes the Bundle root')),
    'the reason names the escape, which is the test AGSC-01-35 applies to a body target');
  assert.strictEqual(links.bodyPathError('../../../etc/passwd', 'content/concepts'),
    'escapes the Bundle root');
  assert.strictEqual(links.bodyPathError('/abs.png', 'content/concepts'), 'leading slash');
  assert.strictEqual(links.bodyPathError('a\\b.png', 'content/concepts'), 'backslash');
  assert.strictEqual(links.bodyPathError(`n${String.fromCharCode(0)}.png`, 'content/concepts'), 'NUL');
});

test('AGSC-01-35: the path grammar, case by case', () => {
  assert.strictEqual(links.pathGrammarError('ok.svg', ''), null);
  assert.strictEqual(links.pathGrammarError('dir/ok-2.svg', ''), null);
  assert.strictEqual(links.pathGrammarError('', ''), 'empty');
  assert.strictEqual(links.pathGrammarError('/abs.svg', ''), 'leading slash');
  assert.strictEqual(links.pathGrammarError('a\\b.svg', ''), 'backslash');
  assert.strictEqual(links.pathGrammarError(`nul${String.fromCharCode(0)}.svg`, ''), 'NUL');
  assert.strictEqual(links.pathGrammarError('./here.svg', ''), 'dot segment');
  assert.strictEqual(links.pathGrammarError('../up.svg', ''), 'dot segment');
  assert.strictEqual(links.pathGrammarError('a//b.svg', ''), 'empty segment');
  assert.strictEqual(links.pathGrammarError(42, ''), 'empty');
});

test('resolveInside and dirOf are POSIX and never leave the root silently', () => {
  assert.strictEqual(links.resolveInside('content/concepts', 'a.md'), 'content/concepts/a.md');
  assert.strictEqual(links.resolveInside('content/concepts', '../assets/a.png'), 'content/assets/a.png');
  assert.strictEqual(links.resolveInside('', '../a'), null);
  assert.strictEqual(links.resolveInside('a', './b'), 'a/b');
  assert.strictEqual(links.dirOf('content/concepts/a.md'), 'content/concepts');
  assert.strictEqual(links.dirOf('a.md'), '');
});

test('findCycle is iterative and returns null on a forest', () => {
  const adjacency = new Map([['a', ['b']], ['b', ['c']]]);
  assert.strictEqual(links.findCycle(adjacency, new Set(['a', 'b', 'c'])), null);
  const deep = new Map();
  const nodes = new Set();
  for (let i = 0; i < 50000; i += 1) {
    nodes.add(`n${i}`);
    deep.set(`n${i}`, [`n${i + 1}`]);
  }
  nodes.add('n50000');
  assert.strictEqual(links.findCycle(deep, nodes), null, 'a 50k chain must not overflow the stack');
});

test('the parsed items of the loader and the flat vectors give the same graph', () => {
  const flat = links.resolve([{ slug: 'a', type: 'concept', related: ['b'] }, { slug: 'b', type: 'concept' }]);
  const nested = links.resolve([
    { slug: 'a', type: 'concept', path: 'content/concepts/a.md', frontmatter: { type: 'concept', related: ['b'] } },
    { slug: 'b', type: 'concept', path: 'content/concepts/b.md', frontmatter: { type: 'concept' } },
  ]);
  assert.deepStrictEqual(nested.edges, flat.edges);
});

test('a non-string Link value is ignored rather than crashing the pass', () => {
  const result = links.resolve([{ slug: 'a', type: 'concept', related: [42, null] }]);
  assert.deepStrictEqual(errorsOf(result), []);
  assert.deepStrictEqual(links.resolve(undefined).edges, []);
});

test('a scalar Link value is read as a one-element list (AGSC-02-17 broader)', () => {
  const result = links.resolve([
    { slug: 'c1', type: 'cluster' },
    { slug: 'c2', type: 'cluster', broader: 'c1' },
  ]);
  assert.deepStrictEqual(result.edges.filter((e) => !e.computed),
    [{ computed: false, key: 'broader', source: 'c2', target: 'c1' }]);
});

test('AGSC-03-13 is re-exported from links so there is one anchor algorithm', () => {
  assert.deepStrictEqual(links.anchors('## A\n\n## A\n').anchors, ['a', 'a-2']);
});

test('view() derives the conventional path from type and slug (AGSC-01-03)', () => {
  assert.strictEqual(links.view({ slug: 'a', type: 'episode' }).path, 'content/episodes/a.md');
  assert.strictEqual(links.view({ slug: 'a', type: 'nonsense' }).path, 'content/concepts/a.md');
});
