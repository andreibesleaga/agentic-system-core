'use strict';
// src/application/cli/verbs/import.js — `import` (AGSC-09-07).
// AGSC-01-22/23 (OKF tolerance) and AGSC-03-19 (the import synonyms of the
// fourteen Link keys) are the INTERCHANGE context's, reserved for WP-12.
const { notImplemented } = require('./_helpers.js');

function run() {
  return notImplemented('import', 'AGSC-01-22/23 and AGSC-03-19 (Level 2, AGSC-10-04)',
    'the Interchange context (src/interchange/) is reserved for WP-12 and carries no reader');
}

module.exports = { name: 'import', run };
