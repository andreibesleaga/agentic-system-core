'use strict';
// CONTEXT Distribution (Emission) — Surface: `/now/` and `/now.md`.
// Implements AGSC-06-22 (generated from STORED STATE only; a section whose input is
// absent is omitted, never guessed) and AGSC-08-25 (the monthly `usage.cost_usd`
// rollup, which is also the meter of the node-wide cap `budget.usd_month`
// of AGSC-01-38, and the `AGSC-E510` warning a skipped run records here).
//
// The rollup counts every Episode of the calendar month whose `usage` carries
// `cost_usd` — merged ones, those in open Proposals of the node's own lanes, and
// those printed by a dry run (AGSC-08-28(f)) — so the caller passes the whole set,
// not only the merged items.
//
// Pure function of its input: the build instant arrives through the Clock port and
// reaches this module as a string.

const { compareCodePoint, singleLine } = require('../knowledge/unicode.js');
const { finding } = require('../knowledge/validate.js');
const { capMeter } = require('../governance/agents.js');
const { withOneTrailingFeed } = require('../shared/trailing.js');
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
/**
 * AGSC-08-25 / AGSC-02-14: the instant an episode belongs to — its `started`, the key
 * its schema branch requires and `trace` and `remember` write; `date`, else
 * `modified`, only for an episode that carries no `started`.
 */
function episodeInstant(item) {
  if (item.started != null) return item.started;
  return item.date == null ? item.modified : item.date;
}

/**
 * AGSC-08-25: one `cost_usd` addend in whole millionths of a dollar — rounded to six
 * decimal places (half up), read from the number's own shortest decimal form so that
 * no binary-float error enters the sum. Anything but a finite number adds nothing,
 * as it adds nothing to the meter's displayed sum.
 */
function micros(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0n;
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/u.exec(String(value));
  const digits = `${m[2]}${m[3] || ''}`;
  const point = m[2].length + Number(m[4] || 0) + 6;
  let whole;
  if (point >= digits.length) whole = BigInt(`${digits}${'0'.repeat(point - digits.length)}`);
  else if (point < 0) whole = 0n;
  else whole = BigInt(digits.slice(0, point) || '0') + (digits[point] >= '5' ? 1n : 0n);
  return m[1] === '-' ? -whole : whole;
}

/**
 * AGSC-08-25: is a cap reached? The sum of the addends, each rounded to six decimal
 * places, compared with the cap as a decimal — never as a binary float, so ten runs of
 * 0.1 USD reach a cap of 1 USD. A cap of 0 is not compared (as the node meter did).
 */
function reached(costs, cap) {
  if (!(typeof cap === 'number' && cap > 0)) return false;
  let sum = 0n;
  for (const cost of costs) sum += micros(cost);
  return sum >= micros(cap);
}

/** The month's Episodes (AGSC-08-25: an Episode belongs to the month of its `started`). */
function monthEpisodes(items, month) {
  return (items || []).filter((i) => isEpisode(i) && i.usage != null && monthOf(episodeInstant(i)) === month);
}

/** AGSC-08-28(d): a lane's Episodes carry `actor` `process:<name>` (or the bare name). */
function ofLane(item, name) {
  return String(item.actor) === name || String(item.actor) === `process:${name}`;
}

function spend(items, config, options = {}) {
  const month = String(options.month);
  const usage = monthEpisodes(items, month).map((i) => i.usage);
  const meter = capMeter(usage, config);
  const findings = [];
  if (reached(usage.map((u) => u.cost_usd), meter.cap_usd)) {
    findings.push(finding('AGSC-E510',
      `the node's monthly budget of ${meter.cap_usd} USD is reached for ${month}; every model-calling path stops for the month (AGSC-08-25, AGSC-01-38)`,
      { file: '/now.md', severity: 'warn' }));
  }
  return { month, episodes: usage.length, ...meter, findings };
}

/**
 * AGSC-08-28(e) and AGSC-01-38: every monthly budget that is reached, as the warning
 * `AGSC-E510` — the node's `budget.usd_month` first, then each enabled lane whose own
 * `budget_usd_month` is reached by the month's Episodes of that lane, in name order.
 * With `options.lane` only that lane is compared (the stop check of one lane run).
 *
 * @param {Array<object>} items every item, merged and proposed.
 * @param {object} config `agsc.config.json`, the environment overrides applied.
 * @param {{month:string, lane?:string}} options
 * @returns {Array<object>} the findings, empty when no budget is reached.
 */
function budgetReached(items, config, options = {}) {
  const month = String(options.month);
  const episodes = monthEpisodes(items, month);
  const out = spend(episodes, config, { month }).findings;
  const lanes = (Array.isArray(config && config.agents) ? config.agents : [])
    .filter((lane) => lane && lane.enabled === true && typeof lane.budget_usd_month === 'number')
    .filter((lane) => options.lane === undefined || String(lane.name) === String(options.lane))
    .sort((a, b) => compareCodePoint(String(a.name), String(b.name)));
  for (const lane of lanes) {
    const name = String(lane.name);
    if (!reached(episodes.filter((i) => ofLane(i, name)).map((i) => i.usage.cost_usd), lane.budget_usd_month)) continue;
    out.push(finding('AGSC-E510',
      `the monthly budget of ${lane.budget_usd_month} USD of the agent lane "${singleLine(name)}" is reached for ${month}; the lane stops for the month (AGSC-08-28(e))`,
      { file: '/now.md', severity: 'warn' }));
  }
  return out;
}

/**
 * AGSC-02-11: an item is stale when its `stale_after` is EARLIER than the build
 * instant, by comparison only. Both are AGSC-02-06 instants (`YYYY-MM-DDTHH:MM:SSZ`),
 * so the code-point order of the two strings is their time order; comparing against
 * the date alone missed an item that went stale earlier on the build's own day.
 */
function staleItems(items, instant) {
  return (items || [])
    .filter((i) => i.stale_after != null && String(i.stale_after) < String(instant))
    .map((i) => String(i.slug))
    .sort(compareCodePoint);
}

/**
 * AGSC-10-17: the two slow-lane states. "an agent lane … stops … when a task needs
 * a person (`TASK_STATE_INPUT_REQUIRED`, `TASK_STATE_AUTH_REQUIRED` — both are
 * slow-lane states)". A person reading NOW needs to see exactly that set, because
 * it is the list of things no agent will ever pick up.
 */
const WAITING_STATES = Object.freeze(['TASK_STATE_AUTH_REQUIRED', 'TASK_STATE_INPUT_REQUIRED']);

/**
 * Every task waiting for a person, in state order then slug order (AGSC-10-17).
 * A task is a `concept` of `kind: task` (AGSC-10-13); the state is read verbatim,
 * never defaulted, so a state this reader does not know is simply not "waiting".
 *
 * @param {Array<object>} items
 * @returns {Array<{slug:string, state:string, title:string, claimed_by?:string}>}
 */
function waitingForAPerson(items, options = {}) {
  const claimedBy = options.claimedBy instanceof Map ? options.claimedBy : new Map();
  const out = [];
  for (const item of (items || [])) {
    if (item.type !== 'concept' || item.kind !== 'task') continue;
    if (!WAITING_STATES.includes(String(item.task_state))) continue;
    const entry = {
      slug: String(item.slug),
      state: String(item.task_state),
      title: item.title == null ? String(item.slug) : String(item.title),
    };
    const who = claimedBy.get(String(item.slug));
    if (who !== undefined) entry.claimed_by = who;
    out.push(entry);
  }
  return out.sort((a, b) => compareCodePoint(a.state, b.state) || compareCodePoint(a.slug, b.slug));
}

/**
 * AGSC-08-25 + AGSC-08-28(d): the monthly rollup PER AGENT LANE — spend, runs and
 * merges — so that a person can see which lane spent what without reading git.
 *
 * `spent_usd` is the sum of `usage.cost_usd` over the month's Episodes whose
 * `actor` is the lane's name (AGSC-08-28(d): "`actor` the agent name"); `runs` is
 * the count of those Episodes; `merges` is the count of the derived ledger's
 * `kind: merge` entries carrying `mode: "auto"` whose actor is that lane
 * (AGSC-08-20a/08-21, AGSC-08-29 — "every merge the lane produces carries
 * `mode: \"auto\"` in the derived ledger, which is what makes an autonomous history
 * auditable after the fact").
 *
 * A lane with no Episode and no merge in the month is reported with three zeros
 * rather than omitted: AGSC-06-22 omits a section whose INPUT is absent, and a
 * declared lane is an input that is present.
 *
 * @param {Array<object>} items every item, merged and proposed.
 * @param {object} config
 * @param {{month:string, ledger?:string}} options `ledger` is `/ledger.jsonl`'s text.
 * @returns {Array<{name:string, merges:number, runs:number, spent_usd:number,
 *   cap_usd?:number, enabled:boolean}>}
 */
function perAgent(items, config, options = {}) {
  const month = String(options.month);
  const lanes = Array.isArray(config && config.agents) ? config.agents : [];
  if (lanes.length === 0) return [];
  const merges = new Map();
  for (const line of String(options.ledger == null ? '' : options.ledger).split('\n')) {
    if (line === '') continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch (e) {
      continue; // `verify --ledger` is what reports a broken ledger (AGSC-E701).
    }
    if (entry === null || typeof entry !== 'object') continue;
    if (entry.kind !== 'merge' || entry.mode !== 'auto') continue;
    const who = entry.actor == null ? '' : String(entry.actor);
    merges.set(who, (merges.get(who) || 0) + 1);
  }
  return lanes.map((lane) => {
    const name = String(lane.name);
    // AGSC-08-28(d) names the lane; AGSC-02-09's grammar writes it `process:<name>`.
    const episodes = monthEpisodes(items, month).filter((i) => ofLane(i, name));
    let spent = 0;
    for (const episode of episodes) {
      const cost = Number(episode.usage.cost_usd);
      if (Number.isFinite(cost)) spent += cost;
    }
    const row = {
      enabled: lane.enabled === true,
      merges: merges.get(name) || 0,
      name,
      runs: episodes.length,
      // Rounded to the cent the cap is expressed in, so a float sum never prints
      // 0.30000000000000004 on a published page (AGSC-04-01: one deterministic form).
      spent_usd: Math.round(spent * 100) / 100,
    };
    if (lane.budget_usd_month != null) row.cap_usd = Number(lane.budget_usd_month);
    return row;
  }).sort((a, b) => compareCodePoint(a.name, b.name));
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
  // AGSC-08-28(e): a budget reached is recorded "as the warning AGSC-E510 in the NOW
  // page" — the node's cap and each lane's own budget. Absent while no budget is reached.
  const reachedBudgets = budgetReached(all, config, { month: monthOf(instant) });
  if (reachedBudgets.length > 0) out.budget_reached = reachedBudgets;
  // AGSC-10-17: the tasks no agent lane will pick up, because they need a person.
  const waiting = waitingForAPerson(all, { claimedBy: options.claimedBy });
  if (waiting.length > 0) out.waiting_for_a_person = waiting;
  // AGSC-08-25 / AGSC-08-28(d): spend, runs and merges per declared lane.
  const lanes = perAgent(all, config, { ledger: options.ledger, month: monthOf(instant) });
  if (lanes.length > 0) out.agents = lanes;
  return out;
}

/**
 * AGSC-06-22: the one pinned line of `/now/` and
 * `/now.md` — the four values of AGSC-04-25, AGSC-04-09, AGSC-04-15 and
 * AGSC-00-17, in that order and with those separators, as one line and its own
 * paragraph. Everything else on the page is implementation-defined.
 *
 * The fingerprint is `bundle.hash`: the lowercase-hex SHA-256 of `graph.nq`
 * (AGSC-04-15). This module never hashes — the caller passes the value, exactly
 * as it passes the instant — so `/now.md` is written AFTER the graph views.
 *
 * @param {{bundleVersion:string, instant:string, fingerprint:string, specVersion:string}} facts
 * @returns {string}
 */
function buildLine(facts) {
  const f = facts || {};
  return `content version ${singleLine(f.bundleVersion)}, built at ${singleLine(f.instant)}, `
    + `fingerprint ${singleLine(f.fingerprint)}, specification ${singleLine(f.specVersion)}`;
}

/**
 * `/now.md` — the same state as Markdown, one section per present member.
 * @param {object} nowState from `state()`.
 * @param {object} [facts] the AGSC-06-22 pinned line's other three values.
 * @returns {string}
 */
function nowMarkdown(nowState, facts) {
  // AGSC-02-24: `/now.md` is line-oriented and several of the values
  // below are authored — a lane `name`, a `claimed_by` actor, a task slug read from a
  // board a reader did not author (AGSC-11-02). Each is neutralised where it is
  // interpolated; the neutralisation is the identity on every conforming value.
  const lines = ['# Now', '',
    buildLine({ ...(facts || {}), instant: nowState.last_build }), ''];
  lines.push('## Counts', '');
  for (const plural of Object.keys(nowState.counts).sort(compareCodePoint)) {
    lines.push(`- ${singleLine(plural)}: ${nowState.counts[plural]}`);
  }
  lines.push('');
  if (nowState.stale !== undefined) {
    lines.push('## Stale items', '', ...nowState.stale.map((s) => `- ${singleLine(s)}`), '');
  }
  if (nowState.open_lessons !== undefined) {
    lines.push('## Open lessons', '', ...nowState.open_lessons.map((s) => `- ${singleLine(s)}`), '');
  }
  if (nowState.waiting_for_a_person !== undefined) {
    lines.push('## Waiting for a person', '',
      'No agent lane will pick these up: both states are slow-lane states (AGSC-10-17).', '',
      ...nowState.waiting_for_a_person.map((t) => `- ${singleLine(t.slug)} — ${singleLine(t.state)}`
        + `${t.claimed_by === undefined ? '' : ` (claimed by ${singleLine(t.claimed_by)})`}`),
      '');
  }
  if (nowState.spend !== undefined) {
    lines.push('## Monthly spend', '',
      `- month: ${singleLine(nowState.spend.month)}`,
      `- spent: ${nowState.spend.spent_usd} USD`,
      `- cap: ${nowState.spend.cap_usd} USD`,
      '');
  }
  if (nowState.budget_reached !== undefined) {
    lines.push('## Budget reached', '',
      'Every model-calling path named here stops for the calendar month (AGSC-08-28(e), AGSC-01-38).', '',
      ...nowState.budget_reached.map((f) => `- ${f.code}: ${singleLine(f.message)}`),
      '');
  }
  if (nowState.agents !== undefined) {
    lines.push('## Agent lanes', '',
      '| lane | enabled | runs | merges | spent USD | cap USD |',
      '|---|---|---|---|---|---|',
      ...nowState.agents.map((a) => `| ${singleLine(a.name)} | ${a.enabled ? 'yes' : 'no'} | ${a.runs} `
        + `| ${a.merges} | ${a.spent_usd} | ${a.cap_usd === undefined ? '—' : a.cap_usd} |`),
      '');
  }
  return withOneTrailingFeed(lines.join('\n'));
}

module.exports = {
  state, spend, budgetReached, counts, staleItems, nowMarkdown, buildLine,
  perAgent, waitingForAPerson, WAITING_STATES,
};
