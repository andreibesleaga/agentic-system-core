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

// AGSC-08-25: the month's spend is a decimal sum, each addend rounded to six decimal
// places, compared with the cap as a decimal and never as a binary float. Ten runs of
// 0.1 USD reach a cap of 1 USD; a binary-float sum reads 0.9999999999999999 and missed it.
test('AGSC-08-25: ten runs of 0.1 USD reach a cap of 1 USD (decimal, not binary float)', () => {
  const items = Array.from({ length: 10 }, (_, i) => ({
    type: 'episode', slug: `run-${i}`, started: '2026-01-02T00:00:00Z', actor: 'process:worker', usage: { cost_usd: 0.1 },
  }));
  const rollup = now.spend(items, { budget: { usd_month: 1 } }, { month: '2026-01' });
  assert.deepStrictEqual(rollup.findings.map((f) => f.code), ['AGSC-E510']);
  const lane = now.budgetReached(items, { agents: [{ budget_usd_month: 1, enabled: true, name: 'worker' }], budget: { usd_month: 10 } },
    { lane: 'worker', month: '2026-01' });
  assert.deepStrictEqual(lane.map((f) => [f.code, f.severity]), [['AGSC-E510', 'warn']]);
  assert.match(lane[0].message, /worker/u);
});

test('AGSC-08-25: an addend is rounded to six decimal places before it is summed', () => {
  // 0.0000004 rounds to 0, so it adds nothing; 0.9999996 rounds to 1.000000 and reaches
  // a cap of 1 USD, which the unrounded binary sum (0.9999999…) never did.
  const items = [
    { type: 'episode', slug: 'a', started: '2026-01-02T00:00:00Z', usage: { cost_usd: 0.9999994 } },
    { type: 'episode', slug: 'b', started: '2026-01-02T00:00:00Z', usage: { cost_usd: 4e-7 } },
  ];
  assert.deepStrictEqual(now.spend(items, { budget: { usd_month: 1 } }, { month: '2026-01' }).findings, []);
  const rounded = [{ type: 'episode', slug: 'c', started: '2026-01-02T00:00:00Z', usage: { cost_usd: 0.9999996 } }];
  assert.deepStrictEqual(now.spend(rounded, { budget: { usd_month: 1 } }, { month: '2026-01' }).findings.map((f) => f.code), ['AGSC-E510']);
});

// AGSC-08-28(e): a lane stops for the month once ITS OWN budget_usd_month is reached,
// even while the node's cap is not; a lane below its budget, a disabled lane and a
// lane of another month are not reported.
test('AGSC-08-28(e): each enabled lane is compared with its own budget_usd_month', () => {
  const run = (slug, actor, cost, started = '2026-01-05T00:00:00Z') => ({
    type: 'episode', slug, started, actor, usage: { cost_usd: cost },
  });
  const items = [run('w1', 'process:worker', 3), run('w2', 'worker', 2), run('p1', 'process:planner', 1),
    run('old', 'process:planner', 9, '2025-12-31T23:59:59Z'), run('i1', 'process:idle', 7)];
  const config = {
    agents: [
      { budget_usd_month: 5, enabled: true, name: 'worker' },
      { budget_usd_month: 2, enabled: true, name: 'planner' },
      { budget_usd_month: 1, enabled: false, name: 'idle' },
    ],
    budget: { usd_month: 20 },
  };
  const all = now.budgetReached(items, config, { month: '2026-01' });
  assert.deepStrictEqual(all.map((f) => f.code), ['AGSC-E510']);
  assert.match(all[0].message, /"worker"/u);
  assert.deepStrictEqual(now.budgetReached(items, config, { lane: 'planner', month: '2026-01' }), []);
  assert.deepStrictEqual(now.budgetReached(items, config, { lane: 'worker', month: '2026-01' }).length, 1);
});

test('AGSC-08-28(e): the node cap and a lane budget reached are both named, node first', () => {
  const items = [{ type: 'episode', slug: 'w', started: '2026-01-05T00:00:00Z', actor: 'process:worker', usage: { cost_usd: 10 } }];
  const config = { agents: [{ budget_usd_month: 5, enabled: true, name: 'worker' }], budget: { usd_month: 10 } };
  const found = now.budgetReached(items, config, { month: '2026-01' });
  assert.deepStrictEqual(found.map((f) => [f.code, f.severity, f.file]),
    [['AGSC-E510', 'warn', '/now.md'], ['AGSC-E510', 'warn', '/now.md']]);
  assert.match(found[0].message, /node's monthly budget/u);
  assert.match(found[1].message, /"worker"/u);
});

// AGSC-08-28(e): "recording the skipped run as the warning AGSC-E510 in the NOW page".
// Before, `state()` kept only the meter and dropped the warning, so neither `/now.md`
// nor `/now/` said the cap was reached.
test('AGSC-08-28(e): a reached budget is a NOW section naming AGSC-E510', () => {
  const items = [{ type: 'episode', slug: 'w', started: '2026-01-05T00:00:00Z', actor: 'process:worker', usage: { cost_usd: 10 } }];
  const config = { agents: [{ budget_usd_month: 5, enabled: true, name: 'worker' }], budget: { usd_month: 10 } };
  const state = now.state([], config, { allItems: items, instant: INSTANT });
  assert.deepStrictEqual(state.budget_reached.map((f) => f.code), ['AGSC-E510', 'AGSC-E510']);
  const text = now.nowMarkdown(state);
  assert.match(text, /^## Budget reached$/mu);
  assert.strictEqual(text.match(/^- AGSC-E510: /gmu).length, 2, text);
});

test('AGSC-06-22: below every cap the NOW state carries no budget section (bytes unchanged)', () => {
  const items = [{ type: 'episode', slug: 'w', started: '2026-01-05T00:00:00Z', actor: 'process:worker', usage: { cost_usd: 4.99 } }];
  const config = { agents: [{ budget_usd_month: 5, enabled: true, name: 'worker' }], budget: { usd_month: 10 } };
  const state = now.state([], config, { allItems: items, instant: INSTANT });
  assert.ok(!('budget_reached' in state), JSON.stringify(state));
  assert.ok(!now.nowMarkdown(state).includes('AGSC-E510'));
});
