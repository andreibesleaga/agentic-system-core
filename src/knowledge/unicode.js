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

module.exports = {
  nfc,
  codePointLength,
  compareCodePoint,
  compareUtf16,
  checkCombining,
  isWellFormed,
  COMBINING_BOUND: 256,
};
