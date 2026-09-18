'use strict';
// tests/conformance/areas/conform.js — area handler for `conform` vectors.
// Owner: F (WP-10-F). Rules: AGSC-04-22, AGSC-04-24, AGSC-10-15.

const {
  areasForLevel, claimCompleteness, crossImplementationClaim, divergenceVerdicts,
} = require('../../../src/composition/conform.js');
const { checks, deepEqual } = require('./_assert.js');

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

/** conform-0001 — the claim names the Unicode version; two divergence verdicts. */
function runConform0001(vector) {
  const completeness = claimCompleteness(vector.input.claim);
  const verdicts = plain(divergenceVerdicts(vector.input.divergences));
  return checks([
    ['claim_complete', completeness.complete === vector.expected.claim_complete,
      `missing ${JSON.stringify(plain(completeness.missing))}`],
    ['divergence_verdicts', deepEqual(vector.expected.divergence_verdicts, verdicts), JSON.stringify(verdicts)],
  ]);
}

/** conform-0002 — byte-identity across implementations is for machine artefacts only. */
function runConform0002(vector) {
  const result = plain(crossImplementationClaim(vector.input.claim.cross_implementation));
  return checks([
    ['accepted', deepEqual(vector.expected.accepted, result.accepted), JSON.stringify(result.accepted)],
    ['rejected', deepEqual(vector.expected.rejected, result.rejected), JSON.stringify(result.rejected)],
    ['reason', result.reason === vector.expected.reason, result.reason],
  ]);
}

/**
 * conform-0003 — the Level IS the vector set.
 *
 * AGSC-10-02..05 and AGSC-10-15 fix the MEMBERSHIP of a Level's area set and
 * no rule of the specification fixes an order for it, so the comparison here
 * is set equality; the vector's array order is not derivable from any rule
 * (reported to the owner rather than pinned by an invented convention).
 */
function runConform0003(vector) {
  const areas = plain(areasForLevel(vector.input.claim.level));
  const expected = vector.expected.areas.slice().sort();
  const actual = areas.slice().sort();
  return checks([
    ['areas', deepEqual(expected, actual), JSON.stringify(areas)],
    ['source', vector.expected.source === 'AGSC-10-02, AGSC-10-03',
      'the vector names a source this handler does not reproduce'],
    ['second_list_consulted', vector.expected.second_list_consulted === false,
      'conform.js reads AGSC-10-02..05 only; the class sentences of AGSC-00-09..11 are never consulted'],
  ]);
}

const HANDLERS = {
  'conform-0001': runConform0001,
  'conform-0002': runConform0002,
  'conform-0003': runConform0003,
};

module.exports.run = function run(vector) {
  const handler = HANDLERS[vector.id];
  if (!handler) return { status: 'fail', detail: `conform.js has no handler for ${vector.id}` };
  return handler(vector);
};
