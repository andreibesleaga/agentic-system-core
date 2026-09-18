'use strict';
// AGSC-04-09 / AGSC-04-10: the build instant, its default and its fault.

const test = require('node:test');
const assert = require('node:assert');
const { createClock, toInstant, EpochError } = require('../../src/adapters/node-clock.js');

test('SOURCE_DATE_EPOCH is the build instant (AGSC-04-09)', () => {
  const c = createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } });
  assert.strictEqual(c.now(), 1767225600);
  assert.strictEqual(c.iso(), '2026-01-01T00:00:00Z');
  assert.deepStrictEqual(c.findings(), []);
  assert.strictEqual(createClock({ env: { SOURCE_DATE_EPOCH: ' 42 ' } }).now(), 42);
});

test('the last commit time is the fallback, then 0 with AGSC-E606', () => {
  assert.strictEqual(createClock({ env: {}, lastCommitSeconds: 99 }).now(), 99);
  const c = createClock({ env: {} });
  assert.strictEqual(c.now(), 0);
  assert.strictEqual(c.iso(), '1970-01-01T00:00:00Z');
  assert.deepStrictEqual(c.findings().map((f) => [f.code, f.severity]), [['AGSC-E606', 'warn']]);
  assert.notStrictEqual(c.findings(), c.findings(), 'findings are copied, never shared');
  assert.strictEqual(createClock({ env: { SOURCE_DATE_EPOCH: '' } }).now(), 0);
});

test('a malformed value is AGSC-E603 and exit 2, never a Finding (AGSC-09-08)', () => {
  for (const bad of ['nope', '-1', '1.5', '007', '1e3']) {
    assert.throws(() => createClock({ env: { SOURCE_DATE_EPOCH: bad } }), (e) => {
      assert.ok(e instanceof EpochError);
      assert.strictEqual(e.code, 'AGSC-E603');
      assert.strictEqual(e.exitCode, 2);
      return true;
    }, bad);
  }
  assert.throws(() => createClock({ env: { SOURCE_DATE_EPOCH: '9'.repeat(18) } }),
    (e) => e.code === 'AGSC-E603');
});

test('toInstant renders UTC with seconds precision (AGSC-04-10)', () => {
  assert.strictEqual(toInstant(0), '1970-01-01T00:00:00Z');
  assert.strictEqual(toInstant(1767225601), '2026-01-01T00:00:01Z');
  assert.ok(!toInstant(1767225601).includes('.'), 'never milliseconds');
});

test('the default environment is the process environment', () => {
  const saved = process.env.SOURCE_DATE_EPOCH;
  process.env.SOURCE_DATE_EPOCH = '7';
  try {
    assert.strictEqual(createClock().now(), 7);
  } finally {
    if (saved === undefined) delete process.env.SOURCE_DATE_EPOCH;
    else process.env.SOURCE_DATE_EPOCH = saved;
  }
});
