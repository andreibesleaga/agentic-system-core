'use strict';
// src/application/cli/verbs/run.js — `run <slug>` (AGSC-09-07, AGSC-09-94).
// Opt-in and disabled unless `run.enabled` is true; `main.js` refuses it with
// AGSC-E001 and exit 2 while it is false, exactly as AGSC-09-94 requires.
// Executing the `{run}`/`{expect}` blocks of a Procedure needs the `run.allow[]`
// program allow-list, a scrubbed environment, a timeout and a guarantee that
// nothing is written inside the Bundle. None of that is built at this
// milestone, and a partial executor would be the least safe thing in the
// engine, so the verb refuses rather than approximates.
const { notImplemented } = require('./_helpers.js');

function run() {
  return notImplemented('run', 'AGSC-09-94 (with AGSC-02-22)',
    'the sandboxed executor — run.allow[], scrubbed environment, timeout, no write inside the Bundle — is not built');
}

module.exports = { name: 'run', run };
