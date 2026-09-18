'use strict';
// AGSC-06-22 and AGSC-08-25: NOW is derived from stored state only, a section whose
// input is absent is OMITTED rather than guessed, and the monthly rollup is the
// meter of the node-wide cap of AGSC-01-38 (`AGSC-E510` when it is reached).

const test = require('node:test');
const assert = require('node:assert');
const now = require('../../src/distribution/now.js');

const INSTANT = '2026-01-15T00:00:00Z';
const EPISODE = (date, cost) => ({ type: 'episode', slug: `e-${date}`, date, usage: { cost_usd: cost } });

test('a section whose input is absent is omitted, not guessed (AGSC-06-22)', () => {
  const state = now.state([{ type: 'concept', slug: 'a' }], {}, { instant: INSTANT });
  assert.deepStrictEqual(Object.keys(state).sort(), ['counts', 'last_build', 'spend']);
  assert.ok(!('stale' in state), 'a stale section was invented');
  assert.ok(!('open_lessons' in state), 'an open-lessons section was invented');
});

test('the rollup counts only the calendar month under the build instant (AGSC-08-25)', () => {
  const items = [EPISODE('2026-01-02', 1.5), EPISODE('2026-01-30', 2), EPISODE('2025-12-31', 99)];
  const rollup = now.spend(items, { budget: { usd_month: 10 } }, { month: '2026-01' });
  assert.strictEqual(rollup.spent_usd, 3.5);
  assert.strictEqual(rollup.cap_usd, 10);
  assert.strictEqual(rollup.episodes, 2);
  assert.deepStrictEqual(rollup.findings, []);
});

test('reaching the cap records AGSC-E510 as a warning (AGSC-01-38, AGSC-08-28(e))', () => {
  const rollup = now.spend([EPISODE('2026-01-02', 10)], { budget: { usd_month: 10 } }, { month: '2026-01' });
  assert.deepStrictEqual(rollup.findings.map((f) => [f.code, f.severity]), [['AGSC-E510', 'warn']]);
});

test('stale items and open lessons appear only when they exist (AGSC-02-06)', () => {
  const state = now.state([
    { type: 'concept', slug: 'old', stale_after: '2026-01-01' },
    { type: 'concept', slug: 'fresh', stale_after: '2027-01-01' },
    { type: 'lesson', slug: 'l1' },
    { type: 'lesson', slug: 'gone', status: 'retired' },
  ], {}, { instant: INSTANT });
  assert.deepStrictEqual(state.stale, ['old']);
  assert.deepStrictEqual(state.open_lessons, ['l1']);
});

test('/now.md renders exactly the sections the state carries', () => {
  const state = now.state([{ type: 'concept', slug: 'a' }], {}, { instant: INSTANT });
  const text = now.nowMarkdown(state);
  assert.ok(text.startsWith('# Now\n'));
  assert.ok(text.includes('## Counts'));
  assert.ok(!text.includes('## Stale items'));
  assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'));
});

test('/now.md renders every section when the state carries them', () => {
  const state = now.state([
    { type: 'concept', slug: 'old', stale_after: '2026-01-01' },
    { type: 'lesson', slug: 'l1' },
    EPISODE('2026-01-02', 1),
  ], { budget: { usd_month: 10 } }, { instant: INSTANT });
  const text = now.nowMarkdown(state);
  for (const heading of ['## Counts', '## Stale items', '## Open lessons', '## Monthly spend']) {
    assert.ok(text.includes(heading), `${heading} is missing`);
  }
  assert.ok(text.includes('- month: 2026-01'));
});
