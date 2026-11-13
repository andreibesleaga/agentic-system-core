'use strict';
// tests/conformance/areas/_boundary-context-map.js — the handlers of the `boundary` vectors of
// AGSC-11-24 (context maps between nodes), kept beside `boundary.js`, which registers them.

const federation = require('../../../src/boundary/federation.js');
const { checks, deepEqual } = require('./_assert.js');

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

/** A `read` over the crosswalk files a vector supplies: the text, or `null` when the file is absent. */
function crosswalkReader(crosswalks) {
  return (file) => (Object.hasOwn(crosswalks || {}, file) ? crosswalks[file] : null);
}

/**
 * bnd-0046, bnd-0047 — AGSC-11-24: a federating client applies a typed peer's context map to the
 * results it derived from that peer. The peer is checked first (`peerFaults`, no fetch), then its
 * crosswalk statements mark the results (`contextMapResults`).
 */
function runResults(vector) {
  const input = vector.input;
  const read = crosswalkReader(input.crosswalks);
  const results = [];
  const faults = [];
  for (const peer of input.peers) {
    const checked = federation.peerFaults(peer, { base: input.site.base, read });
    faults.push(...checked.findings);
    results.push(...federation.contextMapResults({ peer, results: input.results, statements: checked.statements }));
  }
  return checks([
    ['peer faults', faults.length === 0, JSON.stringify(plain(faults))],
    ['results', deepEqual(vector.expected.results, plain(results)), JSON.stringify(plain(results))],
  ]);
}

/** bnd-0048 — AGSC-11-24: a typed peer that cannot be applied is refused with the code of its fault. */
function runRefusals(vector) {
  const input = vector.input;
  const got = input.cases.map((entry) => {
    const checked = federation.peerFaults(entry.peer, { base: input.site.base, read: crosswalkReader(entry.crosswalks) });
    return { error: checked.findings.length > 0 ? checked.findings[0].code : null, name: entry.name };
  });
  return checks([['cases', deepEqual(vector.expected.cases, got), JSON.stringify(got)]]);
}

module.exports = { runRefusals, runResults };
