'use strict';
// Requirement: PRD-075 (docs/PRD.md).
// verifies AGSC-05-35
// AGSC-05-35 — `lint --suggest`: the five generators G1 to G5, as a pure function of the
// items. Offline and deterministic: fixed seed, no clock, no network. The whole-file cases
// are the vectors lint-0046 to lint-0050; this file pins the edges those cases do not reach.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');
const suggest = require('../../src/knowledge/suggest.js');

const RUNS = { numRuns: 150, seed: 20261031, verbose: 0 };
const human = { origin: 'human', operator: 'human:tester' };
const robot = { origin: 'ai-generated', operator: 'human:tester', model: 'm', agent: 'a' };
const item = (slug, extra = {}) => ({ slug, type: 'concept', kind: 'principle', title: `Note ${slug}`, prov: human, ...extra });
const only = (list, generator) => list.filter((s) => s.generator === generator);

test('G1: an inline link with no Link between the items suggests related with the mention as evidence', () => {
  const list = suggest.suggestions([item('a', { body: 'See [b](b).' }), item('b')]);
  assert.deepStrictEqual(list, [{ evidence: [{ kind: 'mention' }], generator: 'G1', key: 'related', source: 'a', target: 'b' }]);
});

test('G1: a Link in either direction, authored or computed, silences the pair', () => {
  assert.deepStrictEqual(suggest.suggestions([item('a', { body: '[b](b)', related: ['b'] }), item('b')]), []);
  assert.deepStrictEqual(suggest.suggestions([item('a', { body: '[b](b)' }), item('b', { uses: ['a'] })]), []);
});

test('G1: the link of an ai-generated item is ignored, and a link to itself is no pair', () => {
  assert.deepStrictEqual(suggest.suggestions([item('a', { body: '[b](b)', prov: robot }), item('b')]), []);
  assert.deepStrictEqual(suggest.suggestions([item('a', { body: '[a](a)' })]), []);
});

test('G2: two shared sources suggest related from the earlier slug to the later, one evidence entry each', () => {
  const sources = [{ resource: 'https://e.example/2' }, { resource: 'https://e.example/1' }];
  const list = suggest.suggestions([item('b', { sources }), item('a', { sources })]);
  assert.deepStrictEqual(list, [{
    evidence: [{ kind: 'shared-source', resource: 'https://e.example/1' }, { kind: 'shared-source', resource: 'https://e.example/2' }],
    generator: 'G2', key: 'related', source: 'a', target: 'b',
  }]);
});

test('G2: one shared source is not enough, and resources are compared exactly', () => {
  const one = [{ resource: 'https://e.example/1' }, { resource: 'https://e.example/x' }];
  const two = [{ resource: 'https://e.example/1' }, { resource: 'https://e.example/X' }];
  assert.deepStrictEqual(suggest.suggestions([item('a', { sources: one }), item('b', { sources: two })]), []);
});

test('G3: a whole-phrase match of a title or alias suggests related, naming the label as authored', () => {
  const target = item('t', { title: 'Rate limiter', aliases: ['Throttle'] });
  const list = suggest.suggestions([target, item('s', { body: 'A RATE LIMITER, and a throttle.' })]);
  assert.deepStrictEqual(list, [{
    evidence: [{ kind: 'phrase', phrase: 'Rate limiter' }, { kind: 'phrase', phrase: 'Throttle' }],
    generator: 'G3', key: 'related', source: 's', target: 't',
  }]);
});

test('G3: a letter or digit beside the phrase, a short label, a code span and a fenced block give nothing', () => {
  const target = item('t', { title: 'Rate limiter' });
  for (const body of ['rate limiters', 'xrate limiter', 'rate limiter2', '`rate limiter`', '```\nrate limiter\n```',
    'rate `x` limiter']) {
    assert.deepStrictEqual(suggest.suggestions([target, item('s', { body })]), [], body);
  }
  assert.deepStrictEqual(suggest.suggestions([item('t', { title: 'API' }), item('s', { body: 'API is fast.' })]), []);
});

test('G3: a phrase that wraps over a line break still matches, and punctuation beside it does not matter', () => {
  const target = item('t', { title: 'Rate limiter' });
  assert.strictEqual(suggest.suggestions([target, item('s', { body: '(rate\nlimiter).' })]).length, 1);
});

test('G3: a term is never suggested as related, and an ai-generated source is ignored', () => {
  const term = item('t', { kind: 'term', title: 'Idempotency key' });
  assert.deepStrictEqual(only(suggest.suggestions([term, item('s', { body: 'an idempotency key' })]), 'G3'), []);
  const target = item('t', { title: 'Rate limiter' });
  assert.deepStrictEqual(suggest.suggestions([target, item('s', { body: 'a rate limiter', prov: robot })]), []);
});

test('G5: the same match against a term suggests uses', () => {
  const term = item('t', { kind: 'term', title: 'Idempotency key' });
  assert.deepStrictEqual(suggest.suggestions([term, item('s', { body: 'an idempotency key' })]), [{
    evidence: [{ kind: 'phrase', phrase: 'Idempotency key' }], generator: 'G5', key: 'uses', source: 's', target: 't',
  }]);
});

test('G1 to G3: no related is suggested for a pair with a cluster, which AGSC-05-20 keeps out of skos:related', () => {
  const group = (slug, extra = {}) => ({ slug, type: 'cluster', title: `Group ${slug}`, prov: human, ...extra });
  const sources = [{ resource: 'https://e.example/1' }, { resource: 'https://e.example/2' }];
  assert.deepStrictEqual(suggest.suggestions([item('a', { body: 'See [c](c), the Group c.', sources }), group('c', { sources })]), []);
  assert.deepStrictEqual(suggest.suggestions([group('c', { body: 'See [a](a), the Note a.' }), item('a')]), []);
  // Near miss: uses toward a term (G5) is no SKOS relation, so a cluster's body still suggests it.
  const term = item('t', { kind: 'term', title: 'Throttle' });
  assert.deepStrictEqual(only(suggest.suggestions([group('c', { body: 'A throttle.' }), term]), 'G5').map((s) => [s.source, s.key, s.target]),
    [['c', 'uses', 't']]);
});

test('G4: a lesson with no derived-from suggests each episode joined to it by any Link or mention', () => {
  const lesson = item('l', { type: 'lesson', kind: undefined, body: 'See [e2](../episodes/e2).' });
  const episodes = [item('e1', { type: 'episode', kind: undefined, related: ['l'] }), item('e2', { type: 'episode', kind: undefined })];
  const list = suggest.suggestions([lesson, ...episodes]);
  assert.deepStrictEqual(only(list, 'G4').map((s) => [s.source, s.target, s.key, s.evidence]),
    [['l', 'e1', 'derived-from', [{ kind: 'episode' }]], ['l', 'e2', 'derived-from', [{ kind: 'episode' }]]]);
});

test('G4: with no episode the one suggestion has a null target, and a derived-from silences it', () => {
  const lesson = item('l', { type: 'lesson', kind: undefined });
  assert.deepStrictEqual(suggest.suggestions([lesson]), [{ evidence: [{ kind: 'none' }], generator: 'G4', key: 'derived-from', source: 'l', target: null }]);
  const derived = item('l', { type: 'lesson', kind: undefined, 'derived-from': ['e'] });
  assert.deepStrictEqual(suggest.suggestions([derived, item('e', { type: 'episode', kind: undefined })]), []);
});

test('G4: a link authored by an ai-generated lesson is no evidence of an episode', () => {
  const lesson = item('l', { type: 'lesson', kind: undefined, prov: robot, body: '[e](e)' });
  const list = suggest.suggestions([lesson, item('e', { type: 'episode', kind: undefined })]);
  assert.deepStrictEqual(list.map((s) => [s.target, s.evidence]), [[null, [{ kind: 'none' }]]]);
});

test('the list is sorted by source, target (null first), key and generator, without repeats', () => {
  const list = suggest.suggestions([
    item('a', { type: 'lesson', kind: undefined }), item('b', { type: 'lesson', kind: undefined, body: '[a](a)' }),
    item('c', { body: '[a](../lessons/a) and [b](../lessons/b)' }),
  ]);
  assert.deepStrictEqual(list.map((s) => [s.source, s.target, s.generator]), [
    ['a', null, 'G4'], ['b', null, 'G4'], ['b', 'a', 'G1'], ['c', 'a', 'G1'], ['c', 'b', 'G1'],
  ]);
});

test('file: JCS-canonical text with the content version, ending in one LF (AGSC-05-35)', () => {
  const text = suggest.file([item('a', { body: '[b](b)' }), item('b')], '1.2.3');
  assert.strictEqual(text, '{"bundle_version":"1.2.3","suggestions":[{"evidence":[{"kind":"mention"}],'
    + '"generator":"G1","key":"related","source":"a","target":"b"}]}\n');
  assert.strictEqual(suggest.file([], '1.2.3'), '{"bundle_version":"1.2.3","suggestions":[]}\n');
});

// ---- properties (the laws, not the cases)

const slugs = fc.constantFrom('a', 'b', 'c', 'd', 'e');
const bodyOf = fc.array(fc.constantFrom('[a](a)', '[b](b)', '[c](c)', 'note a', 'note b', 'text', '`note c`'), { maxLength: 4 })
  .map((parts) => parts.join(' '));
const items = fc.uniqueArray(slugs, { minLength: 1, maxLength: 5 }).chain((names) =>
  fc.tuple(...names.map((slug) => fc.record({
    body: bodyOf,
    related: fc.subarray(names.filter((n) => n !== slug)),
    sources: fc.subarray(['https://e.example/1', 'https://e.example/2']).map((list) => list.map((resource) => ({ resource }))),
  }).map((extra) => item(slug, { ...extra, title: `note ${slug}` })))));

test('property: the same items give the same bytes, in any order of the input', () => {
  fc.assert(fc.property(items, (list) => {
    const once = suggest.file(list, '0.0.0');
    assert.strictEqual(suggest.file([...list].reverse(), '0.0.0'), once);
  }), RUNS);
});

test('property: no suggestion joins a pair that already has a Link, and none names its own source', () => {
  fc.assert(fc.property(items, (list) => {
    const linked = new Set(list.flatMap((i) => i.related.map((t) => [i.slug, t].sort().join('|'))));
    for (const s of suggest.suggestions(list)) {
      if (s.generator === 'G4') continue;
      assert.notStrictEqual(s.source, s.target);
      assert.ok(!linked.has([s.source, s.target].sort().join('|')), JSON.stringify(s));
    }
  }), RUNS);
});
