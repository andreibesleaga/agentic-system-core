'use strict';
// src/application/cli/verbs/trace.js — `trace <file.json>` (AGSC-09-07,
// AGSC-09-94). Opt-in and disabled unless `run.enabled` is true.
//
// AGSC-09-94 makes `trace` a PURE function that maps an already-captured
// agent-run record to an Episode item "through the AGSC-01-22/AGSC-02-14 import
// path". That import path is the Interchange context, reserved for WP-12; a
// mapping that bypassed it would produce an item no `import` could reproduce,
// so the verb states the dependency instead of writing one.
const { notImplemented } = require('./_helpers.js');

function run() {
  return notImplemented('trace', 'AGSC-09-94 (through the AGSC-01-22/AGSC-02-14 import path)',
    'the Interchange context (src/interchange/) is reserved for WP-12 and carries no import path');
}

module.exports = { name: 'trace', run };
