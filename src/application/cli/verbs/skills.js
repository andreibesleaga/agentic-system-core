'use strict';
// src/application/cli/verbs/skills.js — `skills` (AGSC-09-07).
// AGSC-07-12 names the seven Harness files and AGSC-07-15/07-19 the skill pack
// built from them. Since 2026-09-21 `composition/harness.js#emit` renders all
// seven and `compose --out` writes them (AGSC-07-12/07-13); what AGSC-07-19's
// skill PACK adds beyond them is asserted by no compose vector at 1.0.0-rc.5 —
// a file that looked plausible would be an unproved claim — so this verb still
// writes nothing and says so.
const { notImplemented } = require('./_helpers.js');

function run() {
  return notImplemented('skills', 'AGSC-07-12, AGSC-07-15 and AGSC-07-19',
    'composition/harness.js#emit renders the seven Harness files of AGSC-07-12 and compose'
    + ' --out writes them; what AGSC-07-19\'s published skill PACK adds beyond them is asserted'
    + ' by no vector at 1.0.0-rc.5, so this verb writes nothing rather than an unproved claim');
}

module.exports = { name: 'skills', run };
