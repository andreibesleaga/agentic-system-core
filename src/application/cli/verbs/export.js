'use strict';
// src/application/cli/verbs/export.js — `export` (AGSC-09-07).
// AGSC-01-26…29 define the five export targets (Markdown, OKF, JSON-LD, JSONL,
// steer) as the INTERCHANGE context's, both ways with `import`. That context is
// a README and a reserved directory at this milestone (WP-12), so the verb says
// so and exits 1. The graph and chunk artefacts a Level-2 build already emits
// are `build`'s (AGSC-06-01), not a substitute for the interchange contract.
const { notImplemented } = require('./_helpers.js');

function run() {
  return notImplemented('export', 'AGSC-01-26…29 (Level 2, AGSC-10-04)',
    'the Interchange context (src/interchange/) is reserved for WP-12 and carries no emitter');
}

module.exports = { name: 'export', run };
