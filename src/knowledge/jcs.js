'use strict';
// CONTEXT Knowledge — value object: canonical JSON.
// Implements AGSC-04-04, AGSC-04-05, AGSC-04-06 and AGSC-04-21 (RFC 8785 JCS).
//
// PURE: no fs, no process, no clock, no network, no cross-context require.
//
// RFC 8785 itself is the `json-canonicalize` package (MIT, pinned); this file adds
// exactly the two things the specification pins on top of it:
//
//   * AGSC-04-21 ORDER — member names are NFC-normalized FIRST and canonicalized
//     afterwards. A producer that sorts before normalizing emits different bytes for
//     the same input and is non-conforming (vector jcs-0005). No JCS library does
//     this, because RFC 8785 deliberately leaves normalization to the caller.
//   * the I-JSON (RFC 7493) admissibility check AGSC-04-04 requires of a Level-0
//     publisher, which is an AGSC obligation and not part of RFC 8785.
//
// AGSC-04-05's negative-zero rule (`-0` serialises as `0`, erratum 7920) and the
// UTF-16 member-name order are the library's, and vectors jcs-0001…jcs-0004 pin them.
//
// NOTE the two orderings of this system are not interchangeable: member names sort
// by UTF-16 code units (AGSC-04-05, `compareUtf16`), everything else by code point
// (AGSC-04-12, `compareCodePoint`). They differ for astral-plane text (jcs-0003).

const { canonicalize: rfc8785 } = require('json-canonicalize');
const { nfc, compareUtf16, compareCodePoint, isWellFormed } = require('./unicode.js');

const MAX_SAFE = 9007199254740991; // 2^53 - 1, the I-JSON integer bound

/** A programming fault in a canonicalizer input; domain faults are Findings. */
class JcsError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'JcsError';
    this.code = code;
  }
}

/**
 * NFC-normalize every member NAME, depth-first (AGSC-04-21). String VALUES are left
 * verbatim: RFC 8785 does not normalize them, and whole-artefact NFC is AGSC-04-07,
 * the writer's obligation, not the canonicalizer's.
 */
function normalizeNames(value) {
  if (Array.isArray(value)) return value.map(normalizeNames);
  if (value === null || typeof value !== 'object') return value;
  // `assertIJSON` has already refused two names that collide after NFC, and the
  // member is installed with `defineProperty`, so this rewrite cannot lose one: a
  // plain `out[name] = …` assignment would SET THE PROTOTYPE for the name
  // `__proto__` instead of creating an own member, silently dropping it from the
  // canonical bytes.
  const out = {};
  for (const key of Object.keys(value)) Object.defineProperty(out, nfc(key), { configurable: true, enumerable: true, value: normalizeNames(value[key]), writable: true });
  return out;
}

/**
 * Canonicalize to the RFC 8785 form of AGSC-04-05, NFC first (AGSC-04-21).
 * No trailing LF: AGSC-04-04 adds exactly one when the bytes reach a file.
 *
 * The input is checked against I-JSON FIRST (AGSC-04-05: "input restricted to
 * I-JSON"), so a value JavaScript would quietly drop — `undefined`, a function, a
 * lone surrogate — is AGSC-E601 rather than silently missing bytes.
 *
 * @param {unknown} value an I-JSON value.
 * @returns {string} the canonical JSON text.
 * @throws {JcsError} AGSC-E601 when the value is not canonicalizable.
 */
function canonicalize(value) {
  assertIJSON(value);
  return rfc8785(normalizeNames(value));
}

function assertIJSON(value) {
  if (value === null) return;
  const t = typeof value;
  if (t === 'boolean') return;
  if (t === 'number') {
    if (!Number.isFinite(value)) throw new JcsError('AGSC-E601', 'non-finite number');
    if (Number.isInteger(value) && Math.abs(value) > MAX_SAFE) {
      throw new JcsError('AGSC-E601', 'integer outside the I-JSON range');
    }
    return;
  }
  if (t === 'string') {
    if (!isWellFormed(value)) throw new JcsError('AGSC-E601', 'lone surrogate in string');
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertIJSON);
    return;
  }
  if (t === 'object') {
    const seen = new Set();
    for (const key of Object.keys(value)) {
      const name = nfc(key);
      if (seen.has(name)) throw new JcsError('AGSC-E601', `duplicate member name ${name}`);
      seen.add(name);
      assertIJSON(value[key]);
    }
    return;
  }
  throw new JcsError('AGSC-E601', `value of type ${t} is not JSON`);
}

/** RFC 7493 I-JSON admissibility, the Level-0 obligation of AGSC-04-04. */
function isIJSON(value) {
  try {
    assertIJSON(value);
    return true;
  } catch {
    return false;
  }
}

module.exports = { canonicalize, isIJSON, compareUtf16, compareCodePoint, JcsError };
