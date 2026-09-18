'use strict';
// Unit tests for the Composition context (WP-10-F).
// AGSC-07-03..07-10, AGSC-07-23, AGSC-07-24, AGSC-02-97, AGSC-11-22.
// Deterministic by construction: the combiner is pure, so no clock and no
// fixed epoch are needed — there is nothing here for a wall clock to reach.

const test = require('node:test');
const assert = require('node:assert');

const {
  byCodePoint, compareCodePoint, compose, dedupe, frontmatterOf, indexBySlug, slugOf,
  verdictDigest, verdictOf, CORE_KEYS, INERT_KEYS,
} = require('../../src/composition/compose.js');
const { composeFrom, selectionBlock, selectionFences } = require('../../src/composition/architecture.js');
const { dslRelationships, isEmitted, mermaidEdges, pairs } = require('../../src/composition/harness.js');

const plain = (v) => JSON.parse(JSON.stringify(v));

test('AGSC-04-12: ordering is code point, and astral text sorts above the BMP', () => {
  assert.strictEqual(compareCodePoint('a', 'b'), -1);
  assert.strictEqual(compareCodePoint('b', 'a'), 1);
  assert.strictEqual(compareCodePoint('a', 'a'), 0);
  assert.strictEqual(compareCodePoint('a', 'ab'), -1);
  assert.strictEqual(compareCodePoint('ab', 'a'), 1);
  // U+1D400 is above U+FFFD by code point but below it by UTF-16 code unit.
  assert.strictEqual(compareCodePoint('\u{1D400}', '�'), 1);
  assert.deepStrictEqual(byCodePoint(['c', 'a', 'b']), ['a', 'b', 'c']);
});

test('AGSC-07-03: the selection is de-duplicated, first occurrence kept', () => {
  assert.deepStrictEqual(dedupe(['b', 'a', 'b', 'a']), ['b', 'a']);
  assert.deepStrictEqual(dedupe(undefined), []);
  assert.deepStrictEqual(dedupe([1, 'a']), ['a']);
});

test('an item may be a bare frontmatter object or a parsed Item', () => {
  assert.deepStrictEqual(frontmatterOf({ frontmatter: { slug: 'a' } }), { slug: 'a' });
  assert.deepStrictEqual(frontmatterOf(null), {});
  assert.strictEqual(slugOf({ slug: 'a' }), 'a');
  assert.strictEqual(slugOf({ frontmatter: { slug: 'b' } }), 'b');
  assert.strictEqual(slugOf({}), undefined);
  assert.strictEqual(indexBySlug([{ slug: 'a' }, { slug: 'a', x: 1 }]).size, 1);
  assert.strictEqual(indexBySlug(undefined).size, 0);
});

test('AGSC-07-03: a selected slug absent from the graph is AGSC-E802', () => {
  const v = compose([{ slug: 'a' }], ['a', 'ghost']);
  assert.strictEqual(v.valid, false);
  assert.deepStrictEqual(plain(v.conflicts), [{ code: 'AGSC-E802', key: 'selection', pair: ['ghost', 'ghost'] }]);
});

test('AGSC-11-22: a retired item named in a selection is AGSC-E802', () => {
  const v = compose([{ slug: 'old', status: 'retired' }], ['old']);
  assert.strictEqual(v.valid, false);
  assert.strictEqual(v.conflicts[0].code, 'AGSC-E802');
  assert.strictEqual(v.conflicts[0].key, 'status');
});

test('AGSC-07-04: a requires target that does not exist is AGSC-E802 and is not closed over', () => {
  const v = compose([{ requires: ['ghost'], slug: 'a' }], ['a']);
  assert.deepStrictEqual(plain(v.selection), ['a']);
  assert.strictEqual(v.conflicts[0].code, 'AGSC-E802');
});

test('AGSC-07-04: the closure is breadth-first over the whole selection', () => {
  const items = [
    { requires: ['c'], slug: 'a' }, { requires: ['d'], slug: 'b' },
    { requires: ['d'], slug: 'c' }, { slug: 'd' },
  ];
  assert.deepStrictEqual(plain(compose(items, ['a', 'b']).added), [
    { path: [['a', 'requires', 'c']], slug: 'c' },
    { path: [['b', 'requires', 'd']], slug: 'd' },
  ]);
  // AGSC-07-09: input order never reaches the verdict. It does reach `order[]`,
  // the AGSC-07-12 numbering of `decisions/NNNN-<slug>.md`, which is not a
  // verdict member — the one place where input order is still meaningful.
  assert.deepStrictEqual(plain(verdictOf(compose(items, ['b', 'a']))), plain(verdictOf(compose(items, ['a', 'b']))));
  assert.deepStrictEqual(plain(compose(items, ['b', 'a']).order), ['b', 'a']);
});

test('AGSC-03-02: a `<slug>#<anchor>` Link target composes on its slug', () => {
  const v = compose([{ requires: ['b#intent'], slug: 'a' }, { slug: 'b' }], ['a']);
  assert.deepStrictEqual(plain(v.selection), ['a', 'b']);
});

test('AGSC-07-05: a superseded item is hidden and never appears in added[]', () => {
  const items = [
    { requires: ['legacy'], slug: 'app' }, { slug: 'legacy' }, { slug: 'new', supersedes: ['legacy'] },
  ];
  const v = compose(items, ['new', 'app']);
  assert.deepStrictEqual(plain(v.added), []);
  assert.deepStrictEqual(plain(v.hidden), ['legacy']);
});

test('AGSC-07-05a: a surviving item requiring a hidden one invalidates, naming the superseder', () => {
  const items = [
    { requires: ['legacy'], slug: 'app' }, { slug: 'legacy' }, { slug: 'new', supersedes: ['legacy'] },
  ];
  assert.deepStrictEqual(plain(compose(items, ['new', 'app']).conflicts), [{
    code: 'AGSC-E802', key: 'requires', pair: ['app', 'legacy'], superseding: 'new',
  }]);
});

test('AGSC-07-06: excludes is evaluated over the survivors only, pairs sorted and de-duplicated', () => {
  const items = [
    { excludes: ['b'], slug: 'a' }, { excludes: ['a'], slug: 'b' }, { slug: 'c', supersedes: ['b'] },
  ];
  // With `c` selected, `b` is hidden first, so the mutex never fires — that is
  // exactly why AGSC-07-08 fixes the order.
  assert.strictEqual(compose(items, ['a', 'b', 'c']).valid, true);
  const both = compose(items, ['a', 'b']);
  assert.strictEqual(both.conflicts.length, 1);
  assert.deepStrictEqual(plain(both.conflicts[0].pair), ['a', 'b']);
});

test('AGSC-07-07: contradicts and a missing uses target warn, and never invalidate', () => {
  const items = [
    { contradicts: ['b'], slug: 'a', uses: ['gone'] }, { contradicts: ['a'], slug: 'b' },
  ];
  const v = compose(items, ['a', 'b']);
  assert.strictEqual(v.valid, true);
  assert.deepStrictEqual(plain(v.warnings), [
    { code: 'AGSC-E803', key: 'contradicts', source: 'a', target: 'b' },
    { code: 'AGSC-E803', key: 'uses', source: 'a', target: 'gone' },
  ]);
});

test('AGSC-07-10: related, broader, narrower and derived-from affect no step', () => {
  const items = [
    { broader: ['b'], 'derived-from': ['b'], narrower: ['b'], related: ['b'], slug: 'a' }, { slug: 'b' },
  ];
  const v = compose(items, ['a']);
  assert.deepStrictEqual(plain(v.selection), ['a']);
  assert.deepStrictEqual(plain(v.warnings), []);
  assert.ok(CORE_KEYS.includes('requires') && INERT_KEYS.includes('mentions'));
});

test('AGSC-07-23: wiring is sorted by (consumer, port) and a portless port warns', () => {
  const items = [
    { consumes: ['metrics'], produces: ['task'], slug: 'router' },
    { consumes: ['task'], produces: ['result', 'metrics'], slug: 'worker' },
    { consumes: ['result', 'audit'], slug: 'logger' },
  ];
  const v = compose(items, ['router', 'worker', 'logger']);
  assert.deepStrictEqual(plain(v.wiring), [
    { consumer: 'logger', port: 'audit', producers: [] },
    { consumer: 'logger', port: 'result', producers: ['worker'] },
    { consumer: 'router', port: 'metrics', producers: ['worker'] },
    { consumer: 'worker', port: 'task', producers: ['router'] },
  ]);
  assert.deepStrictEqual(plain(v.warnings), [{ code: 'AGSC-E804', key: 'consumes', source: 'logger', target: 'audit' }]);
  assert.strictEqual(v.valid, true);
});

test('AGSC-07-08: Step 5 is verdict-neutral but for its AGSC-E804 warnings', () => {
  const withPorts = compose([{ consumes: ['x'], slug: 'a' }], ['a']);
  const without = compose([{ slug: 'a' }], ['a']);
  const strip = (v) => Object.assign(verdictOf(v), { warnings: [] });
  assert.deepStrictEqual(plain(strip(withPorts)), plain(strip(without)));
});

test('AGSC-07-09: conflicts sort element-wise over the pair, then by code', () => {
  // Two conflicts sharing pair[0] exercise the second and third sort keys.
  const items = [
    { excludes: ['m', 'z'], slug: 'a' }, { slug: 'm' }, { slug: 'z' },
    { requires: ['hidden'], slug: 'b' }, { slug: 'hidden' }, { slug: 'new', supersedes: ['hidden'] },
  ];
  const v = compose(items, ['a', 'm', 'z', 'b', 'new']);
  assert.deepStrictEqual(plain(v.conflicts).map((c) => [c.code, c.pair]), [
    ['AGSC-E801', ['a', 'm']],
    ['AGSC-E801', ['a', 'z']],
    ['AGSC-E802', ['b', 'hidden']],
  ]);
});

test('AGSC-07-09: warnings sort by (source, target) then code and key', () => {
  const items = [
    { contradicts: ['b'], slug: 'a', uses: ['b', 'aa'] }, { slug: 'b' },
  ];
  const v = compose(items, ['a']);
  assert.deepStrictEqual(plain(v.warnings).map((w) => [w.source, w.target, w.key]),
    [['a', 'aa', 'uses'], ['a', 'b', 'uses']]);
});

test('an architecture item may carry its body inside its frontmatter record', () => {
  const body = '```yaml agsc-selection\n- a\n```\n';
  assert.deepStrictEqual(plain(selectionBlock({ frontmatter: { body, slug: 'arch' } }).selection), ['a']);
  assert.strictEqual(selectionBlock({ frontmatter: { slug: 'arch' } }).findings[0].code, 'AGSC-E202');
});

test('AGSC-07-09: the canonical verdict has exactly six members, in JCS order', () => {
  const v = verdictOf(compose([{ slug: 'a' }], ['a']));
  assert.deepStrictEqual(Object.keys(v), ['added', 'conflicts', 'hidden', 'selection', 'valid', 'warnings']);
});

test('AGSC-07-24: the verdict digest is the SHA-256 of the JCS verdict', () => {
  const digest = verdictDigest(compose([{ slug: 'a' }], ['a']));
  assert.match(digest, /^[0-9a-f]{64}$/u);
  assert.strictEqual(digest, verdictDigest(compose([{ slug: 'a' }], ['a'])));
});

test('AGSC-07-17: a Harness is emitted only for a valid composition', () => {
  assert.strictEqual(isEmitted(compose([{ slug: 'a' }], ['a'])), true);
  assert.strictEqual(isEmitted(compose([{ slug: 'a' }], ['ghost'])), false);
  assert.strictEqual(isEmitted(null), false);
});

test('AGSC-07-23: the Structurizr and Mermaid renderings share one order', () => {
  const items = [
    { consumes: ['metrics'], produces: ['task'], slug: 'router' },
    { consumes: ['task'], produces: ['result', 'metrics'], slug: 'worker' },
    { consumes: ['result'], slug: 'logger' },
  ];
  const v = compose(items, ['router', 'worker', 'logger']);
  assert.deepStrictEqual(plain(dslRelationships(v)), [
    'router -> worker "produces task"',
    'worker -> logger "produces result"',
    'worker -> router "produces metrics"',
  ]);
  assert.deepStrictEqual(plain(mermaidEdges(v)), [
    '  router -->|produces task| worker',
    '  worker -->|produces result| logger',
    '  worker -->|produces metrics| router',
  ]);
  assert.deepStrictEqual(plain(pairs(null)), []);
});

test('AGSC-02-97: exactly one `yaml agsc-selection` fence is extracted', () => {
  const body = 'Text.\n\n```yaml agsc-selection\n- a\n- b\n```\n';
  const block = selectionBlock({ body, slug: 'arch' });
  assert.deepStrictEqual(plain(block.selection), ['a', 'b']);
  assert.strictEqual(block.blocks, 1);
  assert.deepStrictEqual(plain(block.findings), []);
});

test('AGSC-02-97: a second selection block is AGSC-E201; none at all is AGSC-E202', () => {
  const twice = '```yaml agsc-selection\n- a\n```\n\n```yaml agsc-selection\n- b\n```\n';
  assert.strictEqual(selectionBlock({ body: twice, slug: 'arch' }).findings[0].code, 'AGSC-E201');
  assert.strictEqual(selectionBlock({ body: 'no block', slug: 'arch' }).findings[0].code, 'AGSC-E202');
});

test('AGSC-02-97: the block is read in the failsafe subset, and a mapping is AGSC-E201', () => {
  assert.strictEqual(selectionBlock({ body: '```yaml agsc-selection\na: 1\n```\n', slug: 'x' }).findings[0].code, 'AGSC-E201');
  const anchored = '```yaml agsc-selection\n- &a x\n```\n';
  assert.match(selectionBlock({ body: anchored, slug: 'x' }).findings[0].code, /^AGSC-E1/u);
});

test('the selection fence is the Knowledge readers, and other fences are not it', () => {
  // Fence syntax belongs to `knowledge/markdown.js` (owner C); this asserts
  // only the delegation and the AGSC-02-97 filter it is asked for.
  assert.deepStrictEqual(selectionFences('~~~yaml agsc-selection\n- a\n~~~\n').map((f) => f.info), ['yaml agsc-selection']);
  assert.deepStrictEqual(selectionFences('```text\nx\n```\n'), []);
  assert.deepStrictEqual(selectionFences('```yaml\n- a\n```\n'), []);
  assert.deepStrictEqual(selectionFences(undefined), []);
  assert.deepStrictEqual(selectionFences('```yaml agsc-selection\n```\n')[0].content, '');
});

test('AGSC-07-24: compose --from equals the explicit selection, and a stale digest warns', () => {
  const items = [
    {
      body: 'x\n\n```yaml agsc-selection\n- router\n- worker\n```\n',
      kind: 'architecture',
      slug: 'arch',
      verdict_digest: '0'.repeat(64),
    },
    { produces: ['task'], slug: 'router' },
    { consumes: ['task'], slug: 'worker' },
  ];
  const from = composeFrom(items, 'arch');
  assert.deepStrictEqual(plain(verdictOf(from.result)), plain(verdictOf(compose(items, ['router', 'worker']))));
  // F27-11 (R64): every Finding carries a message a reader can act on.
  assert.deepStrictEqual(plain(from.findings), [{
    code: 'AGSC-E805',
    message: 'the stored verdict_digest of arch is stale; recompose to refresh it (AGSC-07-24)',
    severity: 'warn', slug: 'arch',
  }]);
});

test('AGSC-07-24: a correct stored digest does not warn, and an unknown item is AGSC-E301', () => {
  const body = 'x\n\n```yaml agsc-selection\n- a\n```\n';
  const items = [{ body, kind: 'architecture', slug: 'arch' }, { slug: 'a' }];
  assert.deepStrictEqual(plain(composeFrom(items, 'arch').findings), []);
  const digest = verdictDigest(compose(items, ['a']));
  const withDigest = [{ body, kind: 'architecture', slug: 'arch', verdict_digest: digest }, { slug: 'a' }];
  assert.deepStrictEqual(plain(composeFrom(withDigest, 'arch').findings), []);
  assert.strictEqual(composeFrom(items, 'nope').findings[0].code, 'AGSC-E301');
});

test('AGSC-02-97: a block entry naming no item is AGSC-E301 and is dropped from the run', () => {
  const items = [
    { body: '```yaml agsc-selection\n- worker\n- ghost\n```\n', kind: 'architecture', slug: 'arch' },
    { slug: 'worker' },
  ];
  const from = composeFrom(items, 'arch');
  assert.deepStrictEqual(plain(from.findings), [{
    code: 'AGSC-E301',
    message: 'the selection of arch names ghost, which is in no item of this Bundle (AGSC-02-97)',
    severity: 'error', slug: 'arch', target: 'ghost',
  }]);
  assert.deepStrictEqual(plain(from.result.selection), ['worker']);
});
