'use strict';
// CONTEXT Distribution (Emission) — Surface: `/now/` and `/now.md`.
// Implements AGSC-06-22 (generated from STORED STATE only; a section whose input is
// absent is omitted, never guessed) and AGSC-08-25 (the monthly `usage.cost_usd`
// rollup, which at rc.4 is also the meter of the node-wide cap `budget.usd_month`
// of AGSC-01-38, and the `AGSC-E510` warning a skipped run records here).
//
// The rollup counts every Episode of the calendar month whose `usage` carries
// `cost_usd` — merged ones, those in open Proposals of the node's own lanes, and
// those printed by a dry run (AGSC-08-28(f)) — so the caller passes the whole set,
// not only the merged items.
//
// Pure function of its input: the build instant arrives through the Clock port and
// reaches this module as a string.

const { compareCodePoint } = require('../knowledge/unicode.js');
const { finding } = require('../knowledge/validate.js');
const { capMeter } = require('../governance/agents.js');
const { COUNTED_TYPES } = require('./discovery.js');

/** AGSC-02-14: an Episode carries the `usage` record the rollup counts. */
function isEpisode(item) {
  return item.type === 'episode';
}

/** The `YYYY-MM` of an AGSC-04-10 instant or an AGSC-04-10 date. */
function monthOf(value) {
  return String(value == null ? '' : value).slice(0, 7);
}

/**
 * AGSC-08-25: the calendar month's spend, and the cap meter of AGSC-01-38.
 *
 * @param {Array<object>} items every item, merged and proposed.
 * @param {object} config `agsc.config.json`.
 * @param {{month:string}} options the calendar month, `YYYY-MM`, derived from the
 *   build instant — never from a wall clock.
 * @returns {{month:string, spent_usd:number, cap_usd:number, ratio:number,
 *   episodes:number, findings:Array<object>}}
 */
function spend(items, config, options = {}) {
  const month = String(options.month);
  const usage = (items || [])
    .filter((i) => isEpisode(i) && i.usage != null)
    .filter((i) => monthOf(i.date == null ? i.modified : i.date) === month)
    .map((i) => i.usage);
  const meter = capMeter(usage, config);
  const findings = [];
  if (meter.cap_usd > 0 && meter.spent_usd >= meter.cap_usd) {
    findings.push(finding('AGSC-E510',
      `the node's monthly budget of ${meter.cap_usd} USD is reached for ${month}; every model-calling path stops for the month (AGSC-08-25, AGSC-01-38)`,
      { file: '/now.md', severity: 'warn' }));
  }
  return { month, episodes: usage.length, ...meter, findings };
}

/** AGSC-02-06: an item whose `stale_after` has passed, at the build instant. */
function staleItems(items, instant) {
  return (items || [])
    .filter((i) => i.stale_after != null && String(i.stale_after) < String(instant).slice(0, 10))
    .map((i) => String(i.slug))
    .sort(compareCodePoint);
}

/** AGSC-06-08: the published counts, the same tally the discovery document carries. */
function counts(items) {
  const tally = {};
  for (const plural of Object.values(COUNTED_TYPES)) tally[plural] = 0;
  for (const item of (items || [])) {
    const plural = COUNTED_TYPES[item.type];
    if (plural !== undefined) tally[plural] += 1;
  }
  return tally;
}

/**
 * The NOW state, as data. Every member is derived; a member whose input is absent is
 * ABSENT, so a renderer can omit its section rather than guess one (AGSC-06-22).
 *
 * @param {Array<object>} items the published items.
 * @param {object} config
 * @param {{instant:string, allItems?:Array<object>}} options
 * @returns {object}
 */
function state(items, config, options = {}) {
  const instant = String(options.instant);
  const all = options.allItems || items;
  const out = {
    counts: counts(items),
    last_build: instant,
  };
  const stale = staleItems(items, instant);
  if (stale.length > 0) out.stale = stale;
  const lessons = (items || [])
    .filter((i) => i.type === 'lesson' && i.status !== 'retired')
    .map((i) => String(i.slug))
    .sort(compareCodePoint);
  if (lessons.length > 0) out.open_lessons = lessons;
  const rollup = spend(all, config, { month: monthOf(instant) });
  if (rollup.episodes > 0 || rollup.cap_usd > 0) {
    out.spend = {
      cap_usd: rollup.cap_usd, month: rollup.month, ratio: rollup.ratio, spent_usd: rollup.spent_usd,
    };
  }
  return out;
}

/**
 * `/now.md` — the same state as Markdown, one section per present member.
 * @param {object} nowState from `state()`.
 * @returns {string}
 */
function nowMarkdown(nowState) {
  const lines = ['# Now', '', `Built at ${nowState.last_build}.`, ''];
  lines.push('## Counts', '');
  for (const plural of Object.keys(nowState.counts).sort(compareCodePoint)) {
    lines.push(`- ${plural}: ${nowState.counts[plural]}`);
  }
  lines.push('');
  if (nowState.stale !== undefined) {
    lines.push('## Stale items', '', ...nowState.stale.map((s) => `- ${s}`), '');
  }
  if (nowState.open_lessons !== undefined) {
    lines.push('## Open lessons', '', ...nowState.open_lessons.map((s) => `- ${s}`), '');
  }
  if (nowState.spend !== undefined) {
    lines.push('## Monthly spend', '',
      `- month: ${nowState.spend.month}`,
      `- spent: ${nowState.spend.spent_usd} USD`,
      `- cap: ${nowState.spend.cap_usd} USD`,
      '');
  }
  return `${lines.join('\n').replace(/\n+$/u, '')}\n`;
}

module.exports = {
  state, spend, counts, staleItems, nowMarkdown, monthOf, isEpisode,
};
