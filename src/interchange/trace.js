'use strict';
/**
 * CONTEXT Interchange — `trace <file.json>` (AGSC-09-94).
 *
 * "`trace <file.json>` is a **pure** function: it maps an already-captured agent-run
 * record to an Episode item through the AGSC-01-22/AGSC-02-14 import path and
 * executes no process."
 *
 * So this module is pure, it spawns nothing, it reads no clock, and it goes through
 * the two rules the sentence names:
 *   * AGSC-01-22 — the IMPORT TOLERANCE. A trace file is foreign: unknown keys are
 *     accepted and preserved, missing optional fields are accepted, and nothing is
 *     refused for being foreign. A key this mapping does not know is kept under the
 *     `x-trace-` vendor namespace (AGSC-02-05a) so that it survives a lossless
 *     export (AGSC-01-26) instead of being dropped.
 *   * AGSC-02-14 — the `usage` object `{model, tokens_in, tokens_out, cost_usd,
 *     estimate}`, which is what makes a run reach the monthly rollup of AGSC-08-25
 *     and the cap of AGSC-01-38. It is copied member by member and never invented.
 *
 * THE INPUT SHAPE IS PINNED SINCE rc.6 (ENG5-S9). AGSC-09-94: "A trace record is a
 * JSON object carrying at least `started` (an instant, AGSC-02-06), and OPTIONALLY
 * `ended`, `actor` (AGSC-02-09), `title`, `outcome` (AGSC-02-07's enum), `body` and
 * `usage` (AGSC-02-14); every other member is preserved under the `x-<vendor>-<key>`
 * namespace of AGSC-02-05a."
 *
 * So this reader places those seven members under those seven names and NOTHING
 * ELSE. Until rc.6 no rule said what a record looks like, so it also accepted the
 * names an agent-run record usually carries — `at`, `start`, `end`, `agent`,
 * `status`, `summary`, `output`, `name` — and a record written for this engine
 * would not have imported into another, which is the interoperability AGSC-01-22
 * exists to provide. A member under one of those older names is now preserved,
 * not dropped: it reappears as `x-trace-<key>`, where a person can see it and
 * rename it.
 *
 * NO CLOCK. AGSC-04-11: a trace whose record carries no `started` cannot be turned
 * into a conforming Episode (the schema REQUIRES it) and is reported rather than
 * dated from a wall clock.
 *
 * Rules: AGSC-09-94, AGSC-01-22, AGSC-02-14, AGSC-02-09, AGSC-04-11, AGSC-02-91.
 * Owner: ENG-5 (WP-12).
 */

const slugs = require('../knowledge/slug.js');
const { singleLine, nfc } = require('../knowledge/unicode.js');
const { finding } = require('../knowledge/validate.js');

/** AGSC-02-14: the five members of `usage`, and no sixth. */
const USAGE_MEMBERS = Object.freeze(['cost_usd', 'estimate', 'model', 'tokens_in', 'tokens_out']);

/**
 * The Episode members this mapping places, and the one name AGSC-09-94 gives each.
 * The value is a list for the reader's sake: it is the set of names that map to
 * that member, and since rc.6 every set has exactly one element.
 */
const ALIASES = Object.freeze({
  actor: ['actor'],
  body: ['body'],
  ended: ['ended'],
  outcome: ['outcome'],
  started: ['started'],
  title: ['title'],
});

/** AGSC-02-07: the Episode outcomes, and the one a foreign value becomes. */
const OUTCOMES = Object.freeze(['success', 'partial', 'failure']);

/** The vendor namespace an unplaced key is preserved under (AGSC-02-05a). */
const KEEP_PREFIX = 'x-trace-';

/** The first present alias of a member, or `undefined`. */
function pick(record, member) {
  for (const name of ALIASES[member]) {
    if (record[name] !== undefined && record[name] !== null) return record[name];
  }
  return undefined;
}

/** A key name that is legal under AGSC-02-05a's vendor grammar. */
function keepKey(name) {
  const tail = String(name).toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '');
  return tail === '' ? null : `${KEEP_PREFIX}${tail}`;
}

/**
 * Map one agent-run record to an Episode item.
 *
 * @param {object} record the parsed trace file.
 * @param {object} options `{operator, taken}` — the Bundle's `bundle.operator`
 *   (AGSC-08-01) and the slugs already in use (AGSC-01-23's `-2`, `-3`, … rule).
 * @returns {{body:string, findings:Array<object>, frontmatter:(object|null),
 *   path:(string|null), slug:(string|null)}}
 */
function toEpisode(record, options = {}) {
  const findings = [];
  const file = String(options.file === undefined ? 'trace.json' : options.file);
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    findings.push(finding('AGSC-E201',
      'a trace file must be one JSON object holding an agent-run record (AGSC-09-94)',
      { file, severity: 'error' }));
    return { body: '', findings, frontmatter: null, path: null, slug: null };
  }

  const started = pick(record, 'started');
  if (started === undefined) {
    findings.push(finding('AGSC-E202',
      'the trace carries no `started`, and an Episode REQUIRES an'
      + ' instant; AGSC-04-11 forbids reading a clock to supply one (AGSC-09-94, AGSC-02-06)',
      { file, severity: 'error' }));
    return { body: '', findings, frontmatter: null, path: null, slug: null };
  }

  const title = singleLine(nfc(String(pick(record, 'title') === undefined
    ? `Agent run ${String(started)}` : pick(record, 'title'))));
  const slug = slugs.dedupe(slugs.slugify(title) || 'agent-run',
    options.taken instanceof Set ? options.taken : new Set());

  const outcomeRaw = pick(record, 'outcome');
  let outcome = 'partial';
  if (outcomeRaw !== undefined) {
    if (OUTCOMES.includes(String(outcomeRaw))) {
      outcome = String(outcomeRaw);
    } else {
      findings.push(finding('AGSC-E506',
        `the outcome ${JSON.stringify(String(outcomeRaw))} is not one of ${OUTCOMES.join(', ')};`
        + ' it was imported as "partial" and kept verbatim (AGSC-01-22, AGSC-02-05a)',
        { file, severity: 'warn' }));
    }
  }

  const frontmatter = {
    actor: String(pick(record, 'actor') === undefined ? 'process:agsc-trace' : pick(record, 'actor')),
    outcome,
    prov: {
      operator: String(options.operator === undefined ? 'human:unknown' : options.operator),
      origin: 'imported',
    },
    started: String(started),
    title,
    type: 'episode',
  };
  const ended = pick(record, 'ended');
  if (ended !== undefined) frontmatter.ended = String(ended);

  // AGSC-02-14: copied member by member, never invented, never defaulted.
  const usage = record.usage;
  if (usage !== null && typeof usage === 'object' && !Array.isArray(usage)) {
    const out = {};
    for (const member of USAGE_MEMBERS) if (usage[member] !== undefined) out[member] = usage[member];
    if (Object.keys(out).length > 0) frontmatter.usage = out;
  }

  // AGSC-01-22 / AGSC-02-05a: everything this mapping did not place is preserved.
  const placed = new Set(['usage', ...Object.values(ALIASES).flat()]);
  for (const [name, value] of Object.entries(record)) {
    if (placed.has(name)) continue;
    const key = keepKey(name);
    if (key === null) continue;
    frontmatter[key] = value;
  }
  if (outcomeRaw !== undefined && outcome !== String(outcomeRaw)) {
    frontmatter[`${KEEP_PREFIX}outcome`] = String(outcomeRaw);
  }

  const bodyRaw = pick(record, 'body');
  const body = bodyRaw === undefined ? '' : `${nfc(String(bodyRaw)).replace(/\n+$/u, '')}\n`;
  return {
    body: body === '' ? `# ${title}\n` : `# ${title}\n\n${body}`,
    findings,
    frontmatter,
    path: `content/episodes/${slug}.md`,
    slug,
  };
}

module.exports = { ALIASES, KEEP_PREFIX, OUTCOMES, USAGE_MEMBERS, keepKey, pick, toEpisode };
