'use strict';
// Shared comparison helpers for the conformance area handlers (AGSC-09-06).
// Bytes where the vector carries a string; CODES, never messages, for negative
// cases; a `findings[]` entry asserts a SUBSET of the AGSC-09-11 finding members.

/** Deep structural equality (arrays are order-sensitive, objects are not). */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && deepEqual(a[k], b[k]));
}

/** True when every member the vector states is present and equal in `actual`. */
function subsetOf(expected, actual) {
  if (expected === null || typeof expected !== 'object') return deepEqual(expected, actual);
  if (actual === null || typeof actual !== 'object') return false;
  return Object.keys(expected).every((k) => deepEqual(expected[k], actual[k]));
}

/** Each expected finding must be matched by at least one actual finding. */
function findingsMatch(expected, actual) {
  const missing = expected.filter((e) => !actual.some((a) => subsetOf(e, a)));
  return {
    ok: missing.length === 0,
    detail: missing.length === 0 ? '' : `unmatched findings ${JSON.stringify(missing)} in ${JSON.stringify(actual)}`,
  };
}

/** Build the handler result the runner expects. */
function verdict(ok, detail) {
  return ok ? { status: 'pass', detail: '' } : { status: 'fail', detail };
}

/** Assert a list of `[label, ok, detail]` checks at once. */
function checks(list) {
  const failed = list.filter(([, ok]) => !ok);
  return verdict(failed.length === 0, failed.map(([label, , detail]) => `${label}: ${detail}`).join('; '));
}

module.exports = { deepEqual, subsetOf, findingsMatch, verdict, checks };
