'use strict';
// The probe of the conditional need "python-package" (tests/acceptance/pending/): the
// Python checker package of persona P10 is checked out beside the engine and a
// Python 3.9 or newer interpreter runs it. The runner calls `probe()` for every
// scenario whose pending file has `class: "conditional"` and `needs:
// "python-package"`; the scenario runs where it answers `available: true` and is
// skipped, with the reason it gives, where it does not.
//
// Not a step definition file: its name starts with `_`.

const { pythonPackage } = require('./_world.js');

module.exports = { probe: pythonPackage };
