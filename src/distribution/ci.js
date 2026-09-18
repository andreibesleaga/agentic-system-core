'use strict';
// CONTEXT Distribution (Emission) — the `ci` use case: lint → build → verify.
// Implements AGSC-09-08 (the exit codes: 0 success, 1 findings or a non-reproducible
// build, 2 a usage or configuration fault), AGSC-04-02 (the build is run twice and
// the bytes compared), AGSC-02-92 (adoption's warnings never fail `ci`, so a folder
// of bare notes is green offline) and AGSC-08-27/08-30 (the `ci` lane contains no
// model call — nothing here can reach one).
//
// The four N9 lints are `governance/lint.js`, owned by another package of this
// milestone. They are INJECTED as `options.lint`; when neither an injected lint nor
// that module is present, `ci` still runs the schema-and-placement obligations that
// `knowledge/validate.js` owns — the AGSC-02-92 pass that `adopt-0004` asserts —
// and names the missing lane in its result rather than reporting a false green.

const { sortFindings } = require('../knowledge/validate.js');
const site = require('./site.js');

/** A finding of severity `error` is what fails a gate (AGSC-09-08, AGSC-09-11). */
function countOf(findings) {
  return {
    error: findings.filter((f) => f.severity !== 'warn').length,
    warn: filterWarn(findings).length,
  };
}

function filterWarn(findings) {
  return findings.filter((f) => f.severity === 'warn');
}

/**
 * Run the pipeline.
 *
 * @param {object} bundle the loaded Bundle.
 * @param {object} ports `{fs, clock, proc}`.
 * @param {object} [options] everything `site.build` takes, plus:
 * @param {(bundle:object, context:object)=>Array<object>} [options.lint] the N9 lints.
 * @returns {{exit:number, counts:{error:number,warn:number}, findings:Array<object>,
 *   files:Map<string,string>, skipped:Array<string>, lanes:Array<string>}}
 */
function ci(bundle, ports, options = {}) {
  const lanes = [];
  const findings = [...(bundle.findings || [])];

  // ---- lint
  const lint = options.lint;
  if (typeof lint === 'function') {
    findings.push(...lint(bundle, { ports }));
    lanes.push('lint');
  } else {
    lanes.push('lint (validate-only: the four N9 lints of governance/lint.js were not wired)');
  }

  // ---- build
  const built = site.build(bundle, ports, options);
  findings.push(...built.findings);
  lanes.push('build');

  // ---- verify (AGSC-04-02: build twice, compare bytes)
  const second = site.build(bundle, ports, options);
  for (const key of built.files.keys()) {
    if (built.files.get(key) !== second.files.get(key)) {
      findings.push({
        code: 'AGSC-E602',
        col: 1,
        file: key,
        line: 1,
        message: `two builds of one Bundle differ at ${key} (AGSC-04-02)`,
        severity: 'error',
      });
    }
  }
  lanes.push('verify');

  const sorted = sortFindings(findings);
  const counts = countOf(sorted);
  return {
    exit: counts.error > 0 ? 1 : 0,
    counts,
    findings: sorted,
    files: built.files,
    skipped: built.skipped,
    lanes,
  };
}

module.exports = { ci, countOf };
