'use strict';
// CONTEXT Knowledge — AGSC-04-25 (spec/04 §4.9, added at rc.6 under D113): the
// CONTENT VERSION of a Bundle, `bundle_version`.
//
// One derivation, one place. It is a pure function of the two inputs a build
// already has — the git-log file of AGSC-08-20b and the build instant of
// AGSC-04-09 — so two engines given one repository derive one string, and a
// build that derives it adds no input, no process and no clock read of its own.
//
// PURE: no fs, no process, no clock, no network. The git log arrives as data
// through the ProcessRunner port, read by the application layer.
//
// It lives in the Knowledge context and not beside `governance/ledger.js`
// (which consumes the same git-log file) because the rule is a chapter-04
// rule and because `composition/` — the Harness, the skill packs and the
// archive name — must be able to require it: the context map lets
// composition/, distribution/, governance/ and interchange/ all reach
// knowledge/, and none of them may reach governance/ from composition/.
//
// Vector: `build-0014`. Callers: `application/cli/verbs/_helpers.js` derives it
// once per invocation and hands the STRING to everything that stamps it.

const { finding } = require('./validate.js');

/**
 * AGSC-04-25: the grammar of a content version — one line, ASCII, safe
 * unescaped inside a JSON string, an HTML comment and a link-set attribute.
 */
const GRAMMAR = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u;

/** AGSC-04-25 branches 3 and 4: the version of a Bundle with no tag anywhere. */
const UNTAGGED = '0.0.0';

/** AGSC-04-25 branch 2/3: the fixed width of the abbreviated commit hash. */
const HASH_WIDTH = 12;

/**
 * AGSC-04-25 branch 4: the build instant in AGSC-04-10's form with its
 * separators removed — `YYYYMMDDThhmmssZ` — because `-` is admitted by the
 * grammar but `:` is not, and half a rendering would be worse than none.
 *
 * Total: anything that is not an AGSC-04-10 instant yields the epoch's own
 * rendering rather than a string outside the grammar.
 *
 * @param {string} instant an AGSC-04-10 instant, `YYYY-MM-DDTHH:MM:SSZ`.
 * @returns {string}
 */
function compactInstant(instant) {
  const text = String(instant == null ? '' : instant);
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/u.exec(text);
  if (m === null) return '19700101T000000Z';
  return `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}${m[6]}Z`;
}

/** AGSC-04-25 branch 4: the whole version derived from the build instant alone. */
function fromInstant(instant) {
  return `${UNTAGGED}+${compactInstant(instant)}`;
}

/** The first `HASH_WIDTH` lowercase-hexadecimal characters of a commit `sha`. */
function abbreviate(sha) {
  return String(sha == null ? '' : sha).toLowerCase().slice(0, HASH_WIDTH);
}

/**
 * Does this git-log element carry a `tag` this rule can use? A tag outside the
 * grammar is a legal git tag and not a legal content version: the element is
 * treated as untagged FOR THIS RULE ALONE — the ledger still takes
 * `kind: release` from it (AGSC-08-20a) — and lint reports `AGSC-E506`.
 *
 * @param {object} element
 * @returns {{tag: string|null, rejected: string|null}}
 */
function tagOf(element) {
  const raw = element == null ? undefined : element.tag;
  if (raw == null || String(raw) === '') return { rejected: null, tag: null };
  const text = String(raw);
  if (!GRAMMAR.test(text)) return { rejected: text, tag: null };
  return { rejected: null, tag: text };
}

/**
 * AGSC-04-25: derive the content version. The FIRST branch that applies wins,
 * where *the built commit* is the last element of the git-log file:
 *
 *   1. the `tag` of the built commit, when it carries a usable one;
 *   2. `<tag>+<n>.g<hash>` — the newest earlier element that carries a usable
 *      tag, the number of elements after it up to and including the built
 *      commit, and twelve hexadecimal characters of the built commit's `sha`;
 *   3. `0.0.0+<n>.g<hash>` when no element carries a usable tag, `<n>` being
 *      the number of elements in the git-log file;
 *   4. `0.0.0+<instant>` with no git history at all.
 *
 * The result is ALWAYS inside the grammar: every branch but the first composes
 * it from values this function controls, and the first tests the tag.
 *
 * @param {{gitLog?: Array<object>, buildInstant?: string}} input
 * @returns {{version: string, findings: Array<object>, branch: number}}
 */
function bundleVersion(input = {}) {
  const log = Array.isArray(input.gitLog) ? input.gitLog : [];
  const findings = [];

  if (log.length === 0) {
    return { branch: 4, findings, version: fromInstant(input.buildInstant) };
  }

  const built = log[log.length - 1];
  const hash = abbreviate(built && built.sha);

  // Every unusable tag on the chain is reported once, in the file's own order,
  // so that a publisher learns about the tag they meant to release under even
  // when a later branch would have ignored it anyway.
  for (const element of log) {
    const { rejected } = tagOf(element);
    if (rejected === null) continue;
    findings.push(finding('AGSC-E506',
      `git tag "${rejected}" cannot be a content version — it is outside the grammar `
      + `${GRAMMAR.source} — so the commit is treated as untagged for AGSC-04-25 alone; `
      + 'the ledger still takes kind: release from it (AGSC-08-20a)',
      { severity: 'warn' }));
  }

  const head = tagOf(built);
  if (head.tag !== null) return { branch: 1, findings, version: head.tag };

  for (let i = log.length - 2; i >= 0; i -= 1) {
    const { tag } = tagOf(log[i]);
    if (tag === null) continue;
    const n = log.length - 1 - i;
    return { branch: 2, findings, version: `${tag}+${n}.g${hash}` };
  }

  return { branch: 3, findings, version: `${UNTAGGED}+${log.length}.g${hash}` };
}

/**
 * The version a stamping writer uses when its caller passed none: AGSC-04-25's
 * branch 4, derived from the build instant the same writer already carries.
 * A surface of AGSC-04-25 is never emitted WITHOUT the line — the rule admits
 * no absence — so a writer that was handed no version states the one fact it
 * can still derive rather than emitting an empty value.
 *
 * @param {*} given the `bundleVersion` option, possibly absent.
 * @param {string} instant the AGSC-04-10 build instant the writer carries.
 * @returns {string}
 */
function orFromInstant(given, instant) {
  const text = given == null ? '' : String(given);
  return GRAMMAR.test(text) ? text : fromInstant(instant);
}

/**
 * AGSC-04-25's `/changelog/` row set: one row per element of the git-log file
 * that carries a usable `tag`, OLDEST FIRST — the tag, that element's
 * `committed_at` date (the date alone, not the instant) and its `sha`. Derived
 * from the git-log file and not from `ledger.jsonl`, because a 1.0 ledger entry
 * carries `kind: release` and the commit reference but not the tag's name
 * (AGSC-08-21).
 *
 * @param {Array<object>} gitLog
 * @returns {Array<{tag: string, date: string, sha: string}>}
 */
function versionRows(gitLog) {
  const rows = [];
  for (const element of Array.isArray(gitLog) ? gitLog : []) {
    const { tag } = tagOf(element);
    if (tag === null) continue;
    rows.push({
      date: String(element.committed_at == null ? '' : element.committed_at).slice(0, 10),
      sha: String(element.sha == null ? '' : element.sha),
      tag,
    });
  }
  return rows;
}

module.exports = {
  GRAMMAR,
  HASH_WIDTH,
  UNTAGGED,
  abbreviate,
  bundleVersion,
  compactInstant,
  fromInstant,
  orFromInstant,
  versionRows,
};
