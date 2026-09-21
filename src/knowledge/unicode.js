'use strict';
// src/knowledge/unicode.js — Unicode primitives (AGSC-04-05, AGSC-04-07, AGSC-04-12,
// AGSC-04-21, AGSC-04-22, AGSC-04-23, AGSC-02-24).
//
// PURE: no fs, no process, no clock, no network.
//
// Two orderings live in this system and they are NOT interchangeable:
//   * JSON member names sort by UTF-16 code units      (AGSC-04-05) -> compareUtf16
//   * everything else sorts by Unicode code point       (AGSC-04-12) -> compareCodePoint
// They differ only for astral-plane text; vectors jcs-0002 and jcs-0003 prove it.
//
// Length is always counted in Unicode code points (AGSC-02-24), never UTF-16 code
// units, never bytes, never grapheme clusters.
//
// The two comparators themselves live in the shared kernel `src/shared/ordering.js`,
// because the FileSystem adapter owes AGSC-01-15 the same code-point order and an
// adapter may not reach into a bounded context (F27-13). They are re-exported here
// so every existing caller keeps one import and the system keeps ONE ordering.

const { compareCodePoint, compareUtf16 } = require('../shared/ordering.js');

/** NFC-normalize a string (AGSC-04-07). Non-strings pass through unchanged. */
function nfc(s) {
  return typeof s === 'string' ? s.normalize('NFC') : s;
}

/** Number of Unicode code points in `s` (AGSC-02-24). */
function codePointLength(s) {
  let n = 0;
  for (const _ of s) n += 1; // eslint-disable-line no-unused-vars
  return n;
}

const COMBINING = /\p{M}/u;

/**
 * AGSC-04-23: a starter followed by more than `max` combining marks is AGSC-E607.
 * Returns `{ ok, index, count }` where `index` is the code-unit offset of the
 * starter that opened the offending sequence. Never throws, never truncates.
 */
function checkCombining(s, max = 256) {
  let run = 0;
  let starter = 0;
  for (let i = 0; i < s.length; ) {
    const cp = s.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    const width = cp > 0xffff ? 2 : 1;
    if (COMBINING.test(ch)) {
      run += 1;
      if (run > max) return { ok: false, index: starter, count: run };
    } else {
      run = 0;
      starter = i;
    }
    i += width;
  }
  return { ok: true, index: -1, count: 0 };
}

/** True when every code point of `s` is a valid scalar value (no lone surrogate). */
function isWellFormed(s) {
  return s.isWellFormed();
}

// ---------------------------------------------------------------------------
// AGSC-02-24 as amended at rc.5 (FV28-01): AUTHORED SINGLE-LINE STRINGS.
//
// A `title`, a `description`, a `tags[]` value, a `diagram.alt`, an
// `attachments[].alt`, a `sources[].title` — every authored string a writer puts
// on a LINE of a line-oriented text surface (`/llms.txt`, `/llms-full.txt`,
// `/now.md`, the Harness files, `llms-ctx.txt`, `robots.txt`, `_headers`,
// `_redirects`, `/.well-known/security.txt`) — MUST NOT carry a C0 control
// (U+0000–U+001F), U+007F, U+0085, U+2028 or U+2029. A line break inside such a
// value creates a NEW line in those dialects: a forged `## ` heading, a forged
// link entry, a forged response header. AGSC-01-29 fences the item BODY as data;
// it never fenced the title the layout puts on a line of its own.
//
// TWO layers, and this module is the character set both of them read:
//   1. VALIDATION — `schema/item.schema.json#/$defs/single_line` carries the same
//      class as a `pattern`, so the fault is `AGSC-E204` at lint (§9.4's
//      precedence paragraph gives every pattern violation that code). The suite
//      asserts, code point by code point, that the schema and this module agree.
//   2. NEUTRALISATION — every writer of a line-oriented surface calls
//      `singleLine()` on what it interpolates, so a Bundle that reached the
//      writer WITHOUT passing validation (an imported Bundle AGSC-01-22, a
//      channel contribution AGSC-01-30…33, an agent-lane Proposal AGSC-08-28)
//      still cannot inject structure. Neutralisation is one U+0020 per forbidden
//      code point — deterministic, idempotent, and a no-op on every conforming
//      string, so no emitted byte of a conforming Bundle moves.
//
// The class uses only character escapes and a negated class: no lookahead, no
// back-reference, no quantifier-based bound (AGSC-01-35, AGSC-02-24), so it is
// the ECMA-262 dialect JSON Schema 2020-12 names and transliterates mechanically
// to the `\x{…}` escapes of RE2, Go and Rust.

/**
 * The forbidden set, written ONCE, as regular-expression escapes. The anchored
 * `pattern` the schemas carry and the global matcher the neutraliser uses are both
 * built from it, so the two layers cannot drift.
 */
const SINGLE_LINE_CLASS = '\\x00-\\x1F\\x7F\\x85\\u2028\\u2029';

/** The negated character class, ANCHORED — the exact `pattern` the schemas carry. */
const SINGLE_LINE_PATTERN = `^[^${SINGLE_LINE_CLASS}]*$`;

/** The same class, unanchored and global, for the neutraliser. */
const SINGLE_LINE_FORBIDDEN = new RegExp(`[${SINGLE_LINE_CLASS}]`, 'gu');

/** AGSC-02-24 (rc.5, FV28-01): true when `s` carries no forbidden code point. */
function isSingleLine(s) {
  SINGLE_LINE_FORBIDDEN.lastIndex = 0;
  return !SINGLE_LINE_FORBIDDEN.test(String(s == null ? '' : s));
}

/**
 * AGSC-02-24 (rc.5, FV28-01): the writer-side neutralisation — one U+0020 per
 * forbidden code point. Total, idempotent, and the identity on every conforming
 * string. `null` and `undefined` become the empty string, because a writer that
 * has nothing to interpolate emits nothing, never the word "null".
 */
function singleLine(s) {
  SINGLE_LINE_FORBIDDEN.lastIndex = 0;
  return String(s == null ? '' : s).replace(SINGLE_LINE_FORBIDDEN, ' ');
}

module.exports = {
  nfc,
  codePointLength,
  compareCodePoint,
  compareUtf16,
  checkCombining,
  isWellFormed,
  isSingleLine,
  singleLine,
  SINGLE_LINE_PATTERN,
  COMBINING_BOUND: 256,
};
