'use strict';
// PORT (hexagonal boundary) — Clock.
// JSDoc interface only. AGSC-04-09: the build instant comes from SOURCE_DATE_EPOCH,
// defaulting to the last commit time and, where no git history exists, to 0
// (1970-01-01T00:00:00Z) with warning AGSC-E606. A malformed value is AGSC-E603 and
// exits 2 — an environment fault, never a Finding (AGSC-09-08).
// AGSC-04-11: only the `refresh` verb may read a real clock, and what it reads MUST
// NOT reach any emitted artefact.

/**
 * @typedef {object} Clock
 * @property {() => number} now                     whole seconds since the Unix epoch
 * @property {() => string} iso                     `YYYY-MM-DDTHH:MM:SSZ` (AGSC-04-10)
 * @property {() => Array<object>} findings         AGSC-E606 when the instant defaulted
 */

module.exports = {};
