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

// AGSC-08-25 / AGSC-02-14: an episode is dated by `started`, the instant its schema
// branch requires — `trace`, `remember` and a hand-written episode carry it and
// usually no `date`. Before, the rollup read `date`, else `modified`, so a month of
// real episodes reported 0 USD and the cap of AGSC-01-38 could never trip.
test('AGSC-08-25: an episode belongs to the month of its `started` instant', () => {
  const items = [
    { type: 'episode', slug: 'run-1', started: '2026-09-02T10:00:00Z', actor: 'worker', usage: { cost_usd: 0.25 } },
    { type: 'episode', slug: 'run-2', started: '2026-09-20T10:00:00Z', actor: 'process:worker', usage: { cost_usd: 0.04 } },
    { type: 'episode', slug: 'run-3', started: '2026-08-31T23:59:59Z', actor: 'worker', usage: { cost_usd: 9 } },
  ];
  const rollup = now.spend(items, { budget: { usd_month: 0.29 } }, { month: '2026-09' });
  assert.strictEqual(rollup.episodes, 2);
  assert.strictEqual(Math.round(rollup.spent_usd * 100) / 100, 0.29);
  assert.deepStrictEqual(rollup.findings.map((f) => f.code), ['AGSC-E510'], 'the cap trips on real episodes');
  const state = now.state(items, { agents: [{ name: 'worker', enabled: true }], budget: { usd_month: 1 } },
    { instant: '2026-09-24T00:00:00Z', allItems: items });
  const lane = (state.agents || []).find((l) => l.name === 'worker');
  assert.ok(lane, JSON.stringify(state));
  assert.strictEqual(lane.runs, 2);
});
