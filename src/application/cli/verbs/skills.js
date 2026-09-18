'use strict';
// src/application/cli/verbs/skills.js — `skills` (AGSC-09-07).
// AGSC-07-12 names the seven Harness files and AGSC-07-15/07-19 the skill pack
// built from them. `composition/harness.js` renders the wiring of AGSC-07-23 and
// answers AGSC-07-17, but writes none of the seven files, and no compose vector
// asserts a Harness byte at 1.0.0-rc.4 — a file that looked plausible would be
// an unproved claim, so nothing is written and the verb says so.
const { notImplemented } = require('./_helpers.js');

function run() {
  return notImplemented('skills', 'AGSC-07-12, AGSC-07-15 and AGSC-07-19',
    'the seven Harness files are WP-11 work and composition/harness.js writes none of them');
}

module.exports = { name: 'skills', run };
