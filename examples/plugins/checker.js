'use strict';
// examples/plugins/checker.js — a MINIMAL, complete checker (AGSC-00-24).
//
// It is here to be read and copied, and to be proved: `tests/arch/plugin-contract
// .test.js` runs every example in this directory against its row of
// `src/application/plugins.js#KINDS` — it must declare the four members, register
// into its own registry, reach no network, write nothing outside its declared
// outputs and change no canonical byte of a 1.0 surface.
//
// Selector: one of the nine of AGSC-09-90. It answers the AGSC-09-11 envelope and
// writes no file. It MUST NOT pass over nothing: a checker that read no input
// reports `AGSC-E901` and exits 1, which is the whole point of the rule —
// "nothing is wrong" must be tellable from "nothing was looked at".

module.exports = {
  agsc_spec_version: '1.0.0',
  kind: 'checker',
  name: 'validate-example',
  plugin_api_version: '1.0.0',

  /**
   * @param {Array<{path:string, text:string}>} inputs
   * @returns {{status:string, counts:object, findings:Array<object>, inputs_read:number}}
   */
  check(inputs) {
    const files = Array.isArray(inputs) ? inputs : [];
    const findings = [];
    if (files.length === 0) {
      findings.push({
        code: 'AGSC-E901',
        col: 1,
        file: '',
        line: 1,
        message: 'no input file was read; a validator MUST NOT pass over nothing (AGSC-09-90)',
        severity: 'error',
      });
    }
    for (const file of files) {
      if (String(file.text).endsWith('\n')) continue;
      findings.push({
        code: 'AGSC-E601',
        col: 1,
        file: String(file.path),
        line: 1,
        message: 'the file does not end in exactly one LF (AGSC-04-07)',
        severity: 'error',
      });
    }
    const errors = findings.filter((f) => f.severity === 'error').length;
    return {
      counts: { error: errors, warn: findings.length - errors },
      findings,
      inputs_read: files.length,
      status: errors === 0 ? 'pass' : 'fail',
    };
  },
};
