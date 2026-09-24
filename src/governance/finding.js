'use strict';
// src/governance/finding.js — CONTEXT Governance & Provenance.
// One place where a Governance Finding is built.
// PURE: no fs, no process, no clock, no network.
//
// `knowledge/validate.js#finding` builds the AGSC-09-11 Finding — `code`, `col`,
// `file`, `line`, `message`, `severity`, and `slug`/`key` when they apply — and
// that shape is the contract. Several Governance rules, however, are ABOUT a
// thing that is not the item's file: the attachment path AGSC-01-35 rejects, the
// port name AGSC-02-96 cannot match, the agent lane AGSC-10-17 stops. Those
// members are additive (a reader that does not know them still sees a complete
// Finding), and this helper is the only place that adds one, so the set stays
// closed and greppable.

const { finding: baseFinding } = require('../knowledge/validate.js');

/** The additive members a Governance Finding may carry, and the rule that needs each. */
const EXTRA_MEMBERS = Object.freeze([
  'path', // AGSC-01-35, AGSC-04-23 — the path the rule is about
  'port', // AGSC-02-96 — the unmatched port name
  'agent', // AGSC-08-28, AGSC-10-17 — the agent lane
  'held', // AGSC-10-17 — tasks already held in TASK_STATE_WORKING
  'max_claims', // AGSC-10-17 — the lane's work-in-progress limit
  'task', // AGSC-08-28(c) — the declared lane task
  'operator', // AGSC-08-07 — the operator a trailer names
]);

/**
 * Build a Finding (AGSC-09-11) with the additive Governance members.
 *
 * @param {string} code a registered `AGSC-E<nnn>` (spec/09 §9.4); never invented
 * @param {string} message human-readable, never a value that could be a secret
 * @param {object} [extra] `file`, `line`, `col`, `severity`, `slug`, `key`, plus EXTRA_MEMBERS
 * @returns {object} the Finding
 */
function finding(code, message, extra = {}) {
  const f = baseFinding(code, message, extra);
  for (const member of EXTRA_MEMBERS) {
    if (extra[member] !== undefined) f[member] = extra[member];
  }
  return f;
}

module.exports = { EXTRA_MEMBERS, finding };
