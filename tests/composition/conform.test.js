'use strict';
// verifies AGSC-00-12, AGSC-10-01
// Unit tests for the conformance-claim module.
// AGSC-09-01, AGSC-09-02, AGSC-09-03, AGSC-04-22, AGSC-04-24, AGSC-10-15.

const test = require('node:test');
const assert = require('node:assert');

const {
  areasForLevel, claimCompleteness, crossImplementationClaim, divergenceVerdict,
  divergenceVerdicts, report, CROSS_IMPLEMENTATION, HTML_REASON, LEVEL_NAMES,
} = require('../../src/composition/conform.js');

test('AGSC-10-15: a Level names its own area set, and nothing outside 0..3 is a Level', () => {
  assert.deepStrictEqual(areasForLevel(0), ['frontmatter', 'slug', 'bundle', 'discovery']);
  assert.ok(areasForLevel(1).includes('lint') && areasForLevel(1).includes('jcs'));
  assert.ok(areasForLevel(2).includes('boundary') && !areasForLevel(2).includes('compose'));
  assert.ok(areasForLevel(3).includes('compose') && areasForLevel(3).includes('conform'));
  assert.throws(() => areasForLevel(4), TypeError);
  assert.throws(() => areasForLevel('2'), TypeError);
});

test('AGSC-10-06: a higher Level includes every area of the lower Levels', () => {
  for (const level of [1, 2, 3]) {
    for (const area of areasForLevel(level - 1)) {
      assert.ok(areasForLevel(level).includes(area), `Level ${level} must include ${area}`);
    }
  }
});

test('AGSC-09-01 + AGSC-04-22: a complete claim names Level, version, Unicode and vectors', () => {
  const claim = {
    level: 2, spec_version: '1.0.0-rc.6', unicode_version: '16.0.0', vectors_passed: ['slug'],
  };
  assert.deepStrictEqual(claimCompleteness(claim), { complete: true, missing: [] });
  assert.deepStrictEqual(claimCompleteness({}).missing,
    ['level', 'spec_version', 'unicode_version', 'vectors_passed']);
  assert.deepStrictEqual(claimCompleteness(Object.assign({}, claim, { vectors_passed: [] })).missing, ['vectors_passed']);
  assert.deepStrictEqual(claimCompleteness(Object.assign({}, claim, { unicode_version: '' })).missing, ['unicode_version']);
  assert.strictEqual(claimCompleteness(undefined).complete, false);
});

test('AGSC-04-22: a Unicode divergence off the vector set is documented, on it a failure', () => {
  assert.strictEqual(divergenceVerdict({ input: 'outside-vector-set' }), 'documented');
  assert.strictEqual(divergenceVerdict({ input: 'jcs-0005' }), 'failure');
  assert.strictEqual(divergenceVerdict({ input: 'jcs-0005' }, { isVectorId: () => false }), 'documented');
  assert.deepStrictEqual(divergenceVerdicts(undefined), []);
});

test('AGSC-04-24: HTML is never claimable across implementations, and the rest stands', () => {
  const result = crossImplementationClaim(['graph.nq', 'search.json', 'index.html', 'page.html']);
  assert.deepStrictEqual(result.accepted, ['graph.nq', 'search.json']);
  assert.deepStrictEqual(result.rejected, ['index.html', 'page.html']);
  assert.strictEqual(result.reason, HTML_REASON);
  assert.ok(CROSS_IMPLEMENTATION.includes('/llms-full.txt'));
});

test('AGSC-06-21/AGSC-06-31: the shards and the per-item views are claimable too', () => {
  const result = crossImplementationClaim(['search-01.json', 'chunks-02.jsonl', '/boards/index.json', 'pages/a.jsonld', 'nonsense']);
  assert.deepStrictEqual(result.rejected, ['nonsense']);
  assert.strictEqual(result.accepted.length, 4);
  assert.deepStrictEqual(crossImplementationClaim(undefined).accepted, []);
});

test('AGSC-09-03: the report shape, with `class` the Level name of AGSC-09-01', () => {
  const r = report({
    impl: 'agentic-system-core',
    level: 3,
    results: [{ id: 'slug-0001', status: 'pass' }, { got: 'x', id: 'slug-0002', status: 'fail' }, { id: 'slug-0003', status: 'skip' }],
    spec_version: '1.0.0-rc.6',
    version: '0.0.2',
  });
  assert.deepStrictEqual(Object.keys(r), ['class', 'impl', 'results', 'spec_version', 'summary', 'version']);
  assert.strictEqual(r.class, 'full-engine');
  assert.deepStrictEqual(r.summary, { fail: 1, pass: 1, skip: 1 });
  assert.deepStrictEqual(r.results[1], { got: 'x', id: 'slug-0002', status: 'fail' });
  assert.deepStrictEqual(LEVEL_NAMES, ['publisher', 'reader', 'writer', 'full-engine']);
  assert.strictEqual(report({ level: 9 }).class, '9');
  assert.deepStrictEqual(report(undefined).results, []);
});
