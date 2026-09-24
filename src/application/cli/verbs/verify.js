'use strict';
// src/application/cli/verbs/verify.js — `verify` (AGSC-09-07).
// AGSC-04-02: build the Bundle twice and compare the bytes; a difference is
// `AGSC-E602`. With `--ledger` (AGSC-08-23) the derived chain is verified
// against the head the discovery document publishes — `AGSC-E701`/`AGSC-E702`.
// Owner: B (shell); wired at integration.

const site = require('../../../distribution/site.js');
const ledger = require('../../../governance/ledger.js');
const helpers = require('./_helpers.js');

function run(ctx) {
  const bundle = helpers.bundleOf(ctx);
  const options = helpers.buildOptions(ctx);
  const findings = [...site.verify(bundle, ctx.ports, options)];
  // AGSC-04-09: the Clock reports when the build instant defaulted to 0
  // (AGSC-E606); that is a build fact, so it is reported by the verbs that emit.
  const clockFindings = ctx.ports.clock && typeof ctx.ports.clock.findings === 'function'
    ? ctx.ports.clock.findings() : [];

  if (ctx.verbFlags && ctx.verbFlags.ledger) {
    const built = site.build(bundle, ctx.ports, options);
    const emitted = built.files.get('/ledger.jsonl');
    const wellknown = built.files.get('/.well-known/knowledge-linkset');
    if (emitted === undefined) {
      // AGSC-08-20a: with no git-log file there is no chain to verify. Saying
      // so is the honest answer; reporting a green ledger would not be.
      findings.push({
        code: 'AGSC-E703',
        message: 'no ledger was derived: this build was given no git-log file (AGSC-08-20a)',
        severity: 'error',
      });
    } else {
      findings.push(...ledger.verify(emitted, JSON.parse(wellknown)));
    }
  }
  return { findings: [...clockFindings, ...findings] };
}

module.exports = { name: 'verify', run };
