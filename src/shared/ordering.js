'use strict';
// src/shared/ordering.js — SHARED KERNEL (DDD): the two string orderings this
// system uses, and nothing else. Implements AGSC-04-05 (JSON member names sort by
// UTF-16 code units) and AGSC-04-12 (everything else sorts by Unicode code point).
//
// Why a shared kernel and not a bounded context: the FileSystem ADAPTER owes
// AGSC-01-15 a code-point discovery order and the Knowledge context owes AGSC-04-12
// the same ordering. An adapter that reached into `knowledge/` to borrow the
// comparator was the one cross-context arrow the map did not declare, and
// a second copy of the comparator would be worse than the arrow: two orderings can
// drift, one cannot. So the comparator moved DOWN, to a module that depends on
// nothing and that every context and every adapter may require.
//
// PURE: no fs, no process, no clock, no network, no require of any context.

/** Code-point comparison (AGSC-04-12). Returns -1, 0 or 1. */
function compareCodePoint(a, b) {
  const ia = a[Symbol.iterator]();
  const ib = b[Symbol.iterator]();
  for (;;) {
    const x = ia.next();
    const y = ib.next();
    if (x.done && y.done) return 0;
    if (x.done) return -1;
    if (y.done) return 1;
    const cx = x.value.codePointAt(0);
    const cy = y.value.codePointAt(0);
    if (cx !== cy) return cx < cy ? -1 : 1;
  }
}

/**
 * UTF-16 code-unit comparison (AGSC-04-05). JavaScript's relational operators on
 * strings are already defined over UTF-16 code units, so this is exact.
 */
function compareUtf16(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

module.exports = { compareCodePoint, compareUtf16 };
