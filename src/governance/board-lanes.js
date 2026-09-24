'use strict';
// CONTEXT Governance & Provenance — the agent-lane gates on a PREPARED board
// Proposal: a claim, a move, a new task (AGSC-08-28, AGSC-10-17).
//
// An agent works a live board only through Proposals (AGSC-10-16): the tool server
// prepares the patch and a person, or a standing decision, merges it. These gates
// run on the prepared Proposal, before anything is handed back, whenever the caller
// declares an agent lane of this node:
//   * the lane must be declared and enabled, and may touch only its declared item
//     types and tasks (`AGSC-E509`, `agents.checkProposal`);
//   * a new task counts against `max_new_items` (`AGSC-E511`, same place);
//   * a claim counts against `max_claims` (`AGSC-E511`, `prov.checkClaims`);
//   * a claim of a task that is already `TASK_STATE_WORKING` under another
//     participant is refused (`AGSC-E511`): the first merged claim wins
//     (AGSC-10-17), and a claim prepared against a state that no longer holds would
//     be the forge conflict that rule describes.
// A caller that declares no lane is held to the "already held" refusal alone, which
// AGSC-10-17 states for every participant; otherwise it is reviewed like any other
// contributor (AGSC-08).
//
// "Held by" reads both places the specification lets a claim be recorded: the
// derived `claimed_by` of the board export (AGSC-10-13, from history) and the
// task's `prov.agent` (the reading of the work-in-progress lint, AGSC-10-17).
//
// PURE: no fs, no clock, no network.

const agents = require('./agents.js');
const prov = require('./prov.js');
const boards = require('./boards.js');
const { finding } = require('./finding.js');

/** The enabled lane a call declares, or `null` when the caller declares none of this node's lanes. */
function laneOf(config, agentName) {
  if (typeof agentName !== 'string' || agentName === '') return null;
  const entry = agents.findAgentEntry(config, agentName);
  return entry === null ? null : entry;
}

/**
 * The gate on a prepared board move of one task.
 *
 * The "already held" refusal comes FIRST and applies to every caller, lane or not:
 * AGSC-10-17 makes a claim of a task already held in `TASK_STATE_WORKING` by another
 * participant `AGSC-E511` whoever proposes it (the portable `pageBoardMove` of both
 * transports runs the same check). The lane gates follow, for a declared lane only.
 *
 * @param {object} config `agsc.config.json`.
 * @param {Array<object>} items every item as a flat frontmatter object (`slug`, `type` included).
 * @param {{agent?:string, operator?:string, slug:string, task_state:string, path:string,
 *   claimed?:Map<string,string>}} move
 * @returns {object|null} the refusing finding, or `null` when the move may be proposed.
 */
function moveRefusal(config, items, move) {
  const claimed = move.claimed instanceof Map ? move.claimed : new Map();
  const task = (items || []).find((i) => i && String(i.slug) === String(move.slug)) || {};
  const holder = boards.holderOf(task, claimed.get(String(move.slug)));
  const caller = move.agent != null ? move.agent : move.operator;
  // A holder no history names is still somebody: only the known holder may re-claim.
  if (move.task_state === boards.CLAIMED_STATE && boards.stateOf(task) === boards.CLAIMED_STATE
    && (holder === null || !boards.sameParticipant(holder, caller))) {
    return finding('AGSC-E511', `the task "${move.slug}" is already ${boards.CLAIMED_STATE}`
      + `${holder === null ? '' : ` under ${holder}`}; the first merged claim wins (AGSC-10-17)`,
    { agent: move.agent, slug: move.slug });
  }
  if (laneOf(config, move.agent) === null) return null;
  const board = {
    tasks: (items || []).filter(boards.isTask).map((t) => {
      const who = boards.holderOf(t, claimed.get(String(t.slug)));
      // A lane's commits are authored `process:<name>`; the lane counts them as its own.
      return {
        claimed_by: who !== null && boards.sameParticipant(who, move.agent) ? String(move.agent) : who,
        slug: String(t.slug),
        state: boards.stateOf(t),
      };
    }),
  };
  const checked = prov.checkClaims(config, {
    agent: move.agent,
    changes: [{ path: move.path, slug: move.slug, task_state: move.task_state, type: 'concept' }],
    task: move.task_state === boards.CLAIMED_STATE ? 'claim' : 'work',
  }, board);
  return checked.accepted ? null : checked.findings[0];
}

/**
 * The gate on a prepared new item (a new task, a comment) from a lane.
 *
 * @param {object} config
 * @param {{agent:string, path:string, type:string, task:string}} created
 * @returns {object|null}
 */
function createRefusal(config, created) {
  if (laneOf(config, created.agent) === null) return null;
  const checked = agents.checkProposal(config, {
    agent: created.agent,
    changes: [{ op: 'create', path: created.path, type: created.type }],
    task: created.task,
  });
  return checked.accepted ? null : checked.findings[0];
}

/** Who holds a task — `boards.holderOf`, kept here for the callers that read it from this module. */
const { holderOf } = boards;

module.exports = { createRefusal, holderOf, laneOf, moveRefusal };
