// tests/conformance/areas/prov.js — area handler for `prov` vectors.
// Owner of prov-0001, prov-0002: B (WP-10-B). prov-0003 is C's — left below
// for C to add a case for.
'use strict';

const { checkProposal } = require('../../../src/governance/agents.js');

function runCheckProposalVector(vector) {
  const result = checkProposal(vector.input.config, vector.input.proposal);
  const problems = [];
  if (result.accepted !== vector.expected.accepted) problems.push(`accepted ${result.accepted} != ${vector.expected.accepted}`);
  if (vector.expected.error !== undefined) {
    if (!result.findings.some((f) => f.code === vector.expected.error)) problems.push(`no finding with code ${vector.expected.error}`);
  }
  for (const wantFinding of vector.expected.findings || []) {
    const match = result.findings.some((f) => Object.keys(wantFinding).every((k) => f[k] === wantFinding[k]));
    if (!match) problems.push(`no finding matching ${JSON.stringify(wantFinding)}`);
  }
  return problems.length === 0 ? { status: 'pass', detail: '' } : { status: 'fail', detail: problems.join('; ') };
}

// --- appended by C (WP-10-C), 2026-09-18: prov-0003 only; nothing above changed ---

const { checkClaims } = require('../../../src/governance/prov.js');

/**
 * prov-0003 — AGSC-10-17: the work-in-progress limit of an agent lane. Each
 * Proposal is evaluated against the SAME board (a Proposal is atomic: the board
 * only changes when one is merged), so the second Proposal is judged on the
 * state the first one did not change.
 */
function runClaimVector(vector) {
  const problems = [];
  for (const want of vector.expected.results || []) {
    const proposal = (vector.input.proposals || []).find((p) => p.id === want.id);
    if (proposal === undefined) {
      problems.push(`no proposal with id ${want.id}`);
      continue;
    }
    const result = checkClaims(vector.input.config, proposal, vector.input.board);
    if (want.accepted !== undefined && result.accepted !== want.accepted) {
      problems.push(`${want.id}: accepted ${result.accepted} != ${want.accepted}`);
    }
    if (want.error !== undefined && !result.findings.some((f) => f.code === want.error)) {
      problems.push(`${want.id}: no finding with code ${want.error}`);
    }
    if (want.held_after !== undefined && result.held_after !== want.held_after) {
      problems.push(`${want.id}: held_after ${result.held_after} != ${want.held_after}`);
    }
    for (const wantFinding of want.findings || []) {
      const match = result.findings.some((f) => Object.keys(wantFinding)
        .every((k) => f[k] === wantFinding[k]));
      if (!match) problems.push(`${want.id}: no finding matching ${JSON.stringify(wantFinding)}`);
    }
  }
  return problems.length === 0 ? { status: 'pass', detail: '' } : { status: 'fail', detail: problems.join('; ') };
}

const HANDLERS = {
  'prov-0001': runCheckProposalVector,
  'prov-0002': runCheckProposalVector,
  'prov-0003': runClaimVector
};

module.exports.run = function run(vector, ctx) {
  const handler = HANDLERS[vector.id];
  if (!handler) {
    return { status: 'skip', detail: `prov.js (B) does not own ${vector.id} — see WP-10-CONTRACT.md area ownership table` };
  }
  return handler(vector, ctx);
};
