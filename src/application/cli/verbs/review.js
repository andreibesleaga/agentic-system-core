'use strict';
// src/application/cli/verbs/review.js — `review` (AGSC-09-07).
//
// AGSC-08-27: the LLM review lane is OPTIONAL, is controlled by the single
// environment flag `AGSC_FEATURE_LLM_REVIEW=1`, is non-blocking, and "the
// launch pipeline — the `ci` and `review` lanes and everything they call — MUST
// contain no model call". This engine therefore implements `review` as a
// LINT-ONLY lane (D41): it runs exactly the checks `lint` runs and adds a
// Proposal-shaped reading of them; no model is reachable from this file, which
// is what `tests/governance/*` and the grep-asserted proving lane of NFR-11
// depend on.
//
// AGSC-08-08: nothing here sets, requires or influences an approval.
// Owner: B (shell); wired at integration.

const lintVerb = require('./lint.js');
const helpers = require('./_helpers.js');

/** AGSC-08-27: the one environment flag, and the only thing that reads it. */
const FEATURE_FLAG = 'AGSC_FEATURE_LLM_REVIEW';

function run(ctx) {
  const bundle = helpers.bundleOf(ctx);
  const result = lintVerb.lane(ctx, bundle);
  const findings = [...(bundle.findings || []), ...result.findings];

  for (const name of result.lanes) helpers.note(ctx, `lane: ${name}`);
  helpers.note(ctx, 'lane: review is lint-only — no model call is reachable from it (AGSC-08-27, NFR-11)');
  if ((ctx.env || {})[FEATURE_FLAG] === '1') {
    // The flag is honoured by being REFUSED: an engine that cannot make a model
    // call must not pretend the lane ran. The refusal is non-blocking, exactly
    // as AGSC-08-27 requires of the lane itself.
    findings.push({
      code: 'AGSC-E510',
      message: `${FEATURE_FLAG} is set, but this build has no model adapter: the optional LLM review`
        + ' lane of AGSC-08-27 did not run. It is non-blocking, so this is a warning.',
      severity: 'warn',
    });
  }
  return { findings };
}

module.exports = { FEATURE_FLAG, name: 'review', run };
