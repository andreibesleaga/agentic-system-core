'use strict';
// src/application/cli/verbs/verify.js — `verify` (AGSC-09-07).
// AGSC-04-02: build the Bundle twice and compare the bytes; a difference is
// `AGSC-E602`. With `--ledger` (AGSC-08-23) the derived chain is verified
// against the head the discovery document publishes — `AGSC-E701`/`AGSC-E702`.

const site = require('../../../distribution/site.js');
const ledger = require('../../../governance/ledger.js');
const helpers = require('./_helpers.js');

/** A file of the local build output, or null when it is absent or refused. */
function readLocal(ctx, at) {
  const fs = ctx.ports && ctx.ports.fs;
  try {
    return fs && fs.exists(at) ? String(fs.readFile(at, 'utf8')) : null;
  } catch (e) {
    return null;
  }
}

function parseOrNull(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

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
    // AGSC-08-23: the recomputation is compared with what this node PUBLISHED —
    // the ledger and the well-known file of the local build output — or a
    // tampered line or a truncated tail would go unseen: the fresh derivation
    // always agrees with itself.
    const out = String((ctx.config && ctx.config.build && ctx.config.build.out) || site.DEFAULT_OUT)
      .replace(/\/+$/u, '');
    const localLedger = readLocal(ctx, `${out}/ledger.jsonl`);
    const localWellknown = readLocal(ctx, `${out}/.well-known/knowledge-linkset`);
    const publishedDocument = localWellknown === null ? null : parseOrNull(localWellknown);
    if (emitted === undefined && localLedger === null) {
      // AGSC-08-20a: with no git-log file there is no chain to verify. Saying
      // so is the honest answer; reporting a green ledger would not be.
      findings.push({
        code: 'AGSC-E703',
        message: 'no ledger was derived: this build was given no git-log file (AGSC-08-20a)',
        severity: 'error',
      });
    } else if (emitted === undefined) {
      // A downloaded node: no history, so the published file itself is re-verified.
      findings.push(...ledger.verify(localLedger, publishedDocument));
    } else {
      findings.push(...ledger.verify(emitted, JSON.parse(wellknown)));
      if (localLedger !== null && localLedger !== emitted) {
        const got = localLedger.split('\n');
        const want = emitted.split('\n');
        let line = 0;
        while (line < got.length && line < want.length && got[line] === want[line]) line += 1;
        findings.push({
          code: 'AGSC-E702',
          file: `${out}/ledger.jsonl`,
          line: line + 1,
          message: `the published ledger differs from the recomputation of the same history at line ${line + 1} (AGSC-08-23)`,
          severity: 'error',
        });
      }
      if (publishedDocument !== null) {
        findings.push(...ledger.verify(emitted, publishedDocument)
          .filter((f) => /agsc-ledger-head/u.test(f.message)));
      }
    }
  }
  return { findings: [...clockFindings, ...findings] };
}

module.exports = { name: 'verify', run };
