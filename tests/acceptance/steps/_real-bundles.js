'use strict';
// The probe of the conditional need "real-bundles" (tests/acceptance/pending/): the
// patterns node the real-Bundle lane of tests/e2e/real-bundles.test.js uses is
// checked out beside the engine (or where AGSC_E2E_PATTERNS names it), with its git
// history, and that lane is switched on with AGSC_E2E=1. The runner calls `probe()`
// for every scenario whose pending file has `class: "conditional"` and `needs:
// "real-bundles"`; the scenario runs where it answers `available: true` and is
// skipped, with the reason it gives, where it does not. Nothing here reaches the
// network.
//
// Not a step definition file: its name starts with `_`.

const fs = require('node:fs');
const path = require('node:path');

const { ROOT } = require('./_world.js');

/** Where the patterns node is checked out: AGSC_E2E_PATTERNS, or the sibling checkout. */
function patternsNode() {
  return process.env.AGSC_E2E_PATTERNS || path.join(ROOT, '..', 'AgenticSystemCore-Patterns');
}

/** @returns {{available: boolean, reason: string}} */
function probe() {
  if (process.env.AGSC_E2E !== '1') return { available: false, reason: 'the real-Bundle lane runs only with AGSC_E2E=1' };
  const dir = patternsNode();
  if (!fs.existsSync(path.join(dir, 'agsc.config.json'))) return { available: false, reason: `no Bundle at ${dir}` };
  if (!fs.existsSync(path.join(dir, '.git'))) return { available: false, reason: `the Bundle at ${dir} has no git history to clone` };
  return { available: true, reason: '' };
}

module.exports = { patternsNode, probe };
