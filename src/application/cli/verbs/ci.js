'use strict';
// src/application/cli/verbs/ci.js — `ci` (AGSC-09-07, AGSC-09-08): lint →
// build → verify, with the exit codes of AGSC-09-08. AGSC-01-37 makes `ci`
// print the NAMES — never the values — of the configuration overrides in
// effect, so that step runs first and unconditionally.
//
// The pipeline itself is `distribution/ci.js`; the four N9 lints are a LANE,
// injected here as `options.lint`, so the pipeline can be run with a stricter
// or a narrower lint set without changing it.
//
// AGSC-09-20 with AGSC-10-19: the check of the site's invariants and competency questions is
// injected as `options.siteChecks` (`_site-checks.js`); it belongs to the full engine of Level 3,
// so `ci --level 0`, `1` or `2` does not run it.

const pipeline = require('../../../distribution/ci.js');
const lintVerb = require('./lint.js');
const helpers = require('./_helpers.js');
const siteChecks = require('./_site-checks.js');

/** AGSC-10-19: the check of AGSC-09-20 is a Level-3 addition; a lower claimed Level runs none. */
const SITE_CHECKS_LEVEL = 3;

function printOverrideNames(ctx) {
  for (const name of ctx.envOverrides || []) {
    if (!ctx.stderr || !ctx.stderr.write) continue;
    // AGSC-01-37: the NAME, never the value. `ctx.credentials` is never read.
    if (ctx.flags && ctx.flags.json) ctx.stderr.write(`${JSON.stringify({ override: name })}\n`);
    else ctx.stderr.write(`override in effect: ${name}\n`);
  }
}

function run(ctx) {
  const refused = helpers.levelRefusal(ctx);
  if (refused !== null) return refused;
  printOverrideNames(ctx);

  const bundle = helpers.bundleOf(ctx);
  let lanes = [];
  const options = helpers.buildOptions(ctx);
  const claimsLevel3 = options.level === undefined || options.level >= SITE_CHECKS_LEVEL;
  const result = pipeline.ci(bundle, ctx.ports, {
    ...options,
    lint: (loaded) => {
      const lint = lintVerb.lane(ctx, loaded);
      lanes = lint.lanes;
      return lint.findings;
    },
    siteChecks: (files) => (claimsLevel3 ? siteChecks.check(bundle, files) : null),
  });

  for (const l of lanes) helpers.note(ctx, `lane: ${l}`);
  for (const s of result.skipped) helpers.note(ctx, `skipped: ${s}`);
  const clockFindings = ctx.ports.clock && typeof ctx.ports.clock.findings === 'function'
    ? ctx.ports.clock.findings() : [];
  return { findings: [...clockFindings, ...result.findings] };
}

module.exports = { name: 'ci', run };
