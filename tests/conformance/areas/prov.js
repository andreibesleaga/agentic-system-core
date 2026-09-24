// tests/conformance/areas/prov.js — area handler for `prov` vectors.
// Owner of prov-0001, prov-0002: B. prov-0003 is C's — left below
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

// --- appended by C, 2026-09-18: prov-0003 only; nothing above changed ---

const { checkClaims, checkTrailers } = require('../../../src/governance/prov.js');

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

// --- appended, 2026-09-21: prov-0004 (rc.5) ---

/**
 * prov-0004 — AGSC-08-06, the DCO-Plus ABNF, which no vector cited before rc.5
 * Six trailer blocks read straight off the grammar. `valid` means the
 * block matches `trailer-block = signoff *( LF assisted )` with no finding of its
 * own; a `prov` context is deliberately not supplied, because AGSC-08-07's
 * `AGSC-E505` is a different rule and this vector pins the GRAMMAR.
 */
function runTrailerGrammarVector(vector) {
  const problems = [];
  for (const want of vector.expected.results || []) {
    const trailer = (vector.input.trailers || []).find((t) => t.name === want.name);
    if (trailer === undefined) {
      problems.push(`no trailer named ${want.name}`);
      continue;
    }
    const result = checkTrailers(trailer.block, {});
    const valid = result.findings.length === 0;
    if (want.valid !== undefined && valid !== want.valid) {
      problems.push(`${want.name}: valid ${valid} != ${want.valid} (${JSON.stringify(result.findings.map((f) => f.code))})`);
    }
    if (want.code !== undefined && !result.findings.some((f) => f.code === want.code)) {
      problems.push(`${want.name}: no finding with code ${want.code}`);
    }
    if (want.valid === true && result.signoff === null) {
      problems.push(`${want.name}: the signoff was not parsed`);
    }
  }
  // The greedy rule the ABNF's comment fixes: the LAST `SP "<"` starts the email,
  // so a name that itself carries `<`-free angle-like text is still read whole.
  const greedy = checkTrailers('Signed-off-by: A B <c@d.example> (CA-v1)', {});
  if (greedy.signoff === null || greedy.signoff.name !== 'A B') {
    problems.push(`the greedy name rule is not implemented: ${JSON.stringify(greedy.signoff)}`);
  }
  return problems.length === 0 ? { status: 'pass', detail: '' } : { status: 'fail', detail: problems.join('; ') };
}

const HANDLERS = {
  'prov-0001': runCheckProposalVector,
  'prov-0002': runCheckProposalVector,
  'prov-0003': runClaimVector,
  'prov-0004': runTrailerGrammarVector,
  // rc.6: prov-0004's case with a fictitious contributor in every sample line.
  'prov-0005': runTrailerGrammarVector
};

module.exports.run = function run(vector, ctx) {
  const handler = HANDLERS[vector.id];
  if (!handler) {
    return { status: 'skip', detail: `prov.js (B) does not own ${vector.id} — see-CONTRACT.md area ownership table` };
  }
  return handler(vector, ctx);
};
