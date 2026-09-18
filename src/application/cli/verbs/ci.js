'use strict';
// src/application/cli/verbs/ci.js — `ci` (AGSC-09-07, AGSC-09-08): lint →
// build → verify, with the exit codes of AGSC-09-08. AGSC-01-37 makes `ci`
// print the NAMES — never the values — of the configuration overrides in
// effect, so that step runs first and unconditionally.
//
// The pipeline itself is `distribution/ci.js`; the four N9 lints are a LANE,
// injected here as `options.lint`, so the pipeline can be run with a stricter
// or a narrower lint set without changing it.
// Owner: B (shell); wired at integration (WP-10-G).

const pipeline = require('../../../distribution/ci.js');
const lintVerb = require('./lint.js');
const helpers = require('./_helpers.js');

function printOverrideNames(ctx) {
  for (const name of ctx.envOverrides || []) {
    if (!ctx.stderr || !ctx.stderr.write) continue;
    // AGSC-01-37: the NAME, never the value. `ctx.credentials` is never read.
    if (ctx.flags && ctx.flags.json) ctx.stderr.write(`${JSON.stringify({ override: name })}\n`);
    else ctx.stderr.write(`override in effect: ${name}\n`);
  }
}

function run(ctx) {
  printOverrideNames(ctx);

  const bundle = helpers.bundleOf(ctx);
  let lanes = [];
  const result = pipeline.ci(bundle, ctx.ports, helpers.buildOptions(ctx, {
    lint: (loaded) => {
      const lint = lintVerb.lane(ctx, loaded);
      lanes = lint.lanes;
      return lint.findings;
    },
  }));

  for (const l of lanes) helpers.note(ctx, `lane: ${l}`);
  for (const s of result.skipped) helpers.note(ctx, `skipped: ${s}`);
  const clockFindings = ctx.ports.clock && typeof ctx.ports.clock.findings === 'function'
    ? ctx.ports.clock.findings() : [];
  return { findings: [...clockFindings, ...result.findings] };
}

module.exports = { name: 'ci', run };
