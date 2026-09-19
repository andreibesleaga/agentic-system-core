'use strict';
// src/interchange/status.js — CONTEXT Interchange.
//
// `status`, `release` and `tags` on import (M3-T06; AGSC-02-23, AGSC-01-20,
// AGSC-01-21). Three separate rules that the old site ran together in two keys:
//
//   * `status` — the old vocabulary is `published | draft`; AGSC-02-23's is
//     `draft | stable | deprecated | retired`, so `published` is `AGSC-E203`
//     until it is mapped to `stable`.
//   * `release` — AGSC-01-20's switchboard. An item carrying `release: <key>`
//     publishes only when `releases[<key>]` is `true`, so every key an item uses
//     MUST appear in the configuration or the item silently publishes.
//   * `tags` — AGSC-01-21's closed vocabulary. The old `tags` array mixes topics
//     with `batch-*` RELEASE switches, which are not topics at all; the `batch-*`
//     values are dropped from `tags` and expressed through `release` instead.
//
// A caller may OVERRIDE the mapped status per card — the clean-room guard of the
// project's own decision record holds book-overlapping cards back as `draft`,
// and a held-back card is emitted on no public surface (AGSC-06-30). The override
// is data the caller supplies, never a list inside this module.
//
// PURE: no fs, no process, no clock, no network.
//
// Codes: AGSC-E203 (a status value outside AGSC-02-23's enum after mapping).

const { finding } = require('../knowledge/validate.js');

/** AGSC-02-23 (plus `retired`, added at rc.3 by AGSC-11-22). */
const STATUS_VALUES = Object.freeze(['draft', 'stable', 'deprecated', 'retired']);

/**
 * AGSC-01-22/AGSC-03-19's spirit applied to `status`: a foreign value is MAPPED,
 * never added to the vocabulary. `published` is the old site's only foreign one.
 */
const STATUS_SYNONYMS = Object.freeze({
  published: 'stable',
  live: 'stable',
  active: 'stable',
  wip: 'draft',
  stub: 'draft',
  archived: 'retired',
});

/** AGSC-01-21: a `batch-*` value is a release switch, not a topic. */
const RELEASE_TAG_PREFIX = 'batch-';

/** AGSC-01-21, §2.2 table: the 2–5 count the lint warns about. */
const TAGS_MIN = 2;
const TAGS_MAX = 5;

/** The tag grammar `tags.allowed` items must meet (`config.schema.json`). */
const TAG_NAME = /^[a-z0-9][a-z0-9-]*$/u;

/**
 * Map one card's `status`.
 *
 * @param {string} value the old value.
 * @param {{file?:string, slug?:string, override?:string}} [options]
 * @returns {{status:string, mapped:boolean, findings:Array<object>}}
 */
function status(value, options = {}) {
  const at = { file: options.file, slug: options.slug, line: 1 };
  const findings = [];
  const raw = value === undefined || value === null ? '' : String(value).trim().toLowerCase();

  let result;
  let mapped = false;
  if (raw === '') {
    // AGSC-02-23: an item with no `status` starts `stable`.
    result = 'stable';
  } else if (STATUS_VALUES.includes(raw)) {
    result = raw;
  } else if (STATUS_SYNONYMS[raw] !== undefined) {
    result = STATUS_SYNONYMS[raw];
    mapped = true;
  } else {
    findings.push(finding('AGSC-E203',
      `status "${raw}" is outside ${STATUS_VALUES.join('|')} and was imported as draft (AGSC-02-23)`,
      { ...at, severity: 'warn' }));
    result = 'draft';
    mapped = true;
  }

  if (options.override !== undefined && options.override !== '') {
    const override = String(options.override);
    if (!STATUS_VALUES.includes(override)) {
      findings.push(finding('AGSC-E203',
        `the caller's status override "${override}" is outside ${STATUS_VALUES.join('|')}`, at));
    } else result = override;
  }

  return { status: result, mapped, findings };
}

/**
 * Split the old `tags` array into topics and release switches (AGSC-01-20/21).
 *
 * @param {Array<string>} tags
 * @param {{file?:string, slug?:string}} [options]
 * @returns {{tags:string[], releases:string[], findings:Array<object>}}
 */
function tags(list, options = {}) {
  const at = { file: options.file, slug: options.slug, line: 1 };
  const findings = [];
  const topics = [];
  const releases = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const value = String(raw).trim();
    if (value === '') continue;
    if (value.startsWith(RELEASE_TAG_PREFIX)) {
      releases.push(value);
      continue;
    }
    if (!TAG_NAME.test(value)) {
      findings.push(finding('AGSC-E203',
        `tag "${value}" is outside the tag grammar and was dropped (AGSC-01-21)`,
        { ...at, severity: 'warn' }));
      continue;
    }
    // AGSC-04-14: author order is retained; only duplicates go.
    if (!topics.includes(value)) topics.push(value);
  }
  if (topics.length < TAGS_MIN || topics.length > TAGS_MAX) {
    findings.push(finding('AGSC-E203',
      `${topics.length} topic tags after dropping the release switches; AGSC-01-21's §2.2 count is ${TAGS_MIN}–${TAGS_MAX}`,
      { ...at, severity: 'warn' }));
  }
  return { tags: topics, releases, findings };
}

/**
 * The `releases` switchboard for a whole import: every `release` key any item
 * carries, plus every `batch-*` tag that became one, all `true`.
 *
 * AGSC-01-20 publishes an item with `release: <key>` only when the switch is
 * `true`, and a key that is ABSENT from the switchboard leaves the item
 * published. Writing every key explicitly is therefore the honest form: the
 * owner turns one off and one batch disappears from every surface.
 *
 * @param {Iterable<string>} keys
 * @returns {object} keys in code-point order, each `true`.
 */
function switchboard(keys) {
  const out = {};
  for (const key of [...new Set(keys)].filter((k) => k !== '' && TAG_NAME.test(k)).sort()) {
    out[key] = true;
  }
  return out;
}

module.exports = {
  RELEASE_TAG_PREFIX,
  STATUS_SYNONYMS,
  STATUS_VALUES,
  TAGS_MAX,
  TAGS_MIN,
  TAG_NAME,
  status,
  switchboard,
  tags,
};
