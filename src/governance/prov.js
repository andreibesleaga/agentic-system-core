'use strict';
// src/governance/prov.js — CONTEXT Governance & Provenance, the Provenance and
// Gate aggregates. PURE: no fs, no process, no clock, no
// network — a git log, a board and a Proposal all arrive as records.
//
// Implements AGSC-08-01…08-12 (the provenance contract, the DCO-Plus trailer
// grammar, the Gates) and the claim-and-progress limit of AGSC-10-17, which is
// the `prov-0003` vector. AGSC-08-28's E509/E510/E511(`max_new_items`) checks
// live in `governance/agents.js` (owner B) and are CALLED from here, never
// duplicated.
//
// Codes emitted here, and the rule each comes from:
//   AGSC-E202 `agent`/`model` missing under an `ai-*` origin   AGSC-08-01
//   AGSC-E203 a gate's `checks[]` disagrees with its `level`   AGSC-02-18
//   AGSC-E501 `prov` missing                                   AGSC-08-01
//   AGSC-E503 `prov.operator` missing                          AGSC-08-01
//   AGSC-E504 DCO-Plus trailer missing or malformed            AGSC-08-06
//   AGSC-E505 agent-authored change without matching operator  AGSC-08-07
//   AGSC-E508 Level-0 item inherited `prov` (warning)          AGSC-10-02
//   AGSC-E511 the lane holds more than `max_claims` tasks      AGSC-10-17

const links = require('../knowledge/links.js');
const { finding } = require('./finding.js');
const agents = require('./agents.js');

/** AGSC-02-07: the four origins. */
const ORIGINS = Object.freeze(['human', 'ai-assisted', 'ai-generated', 'imported']);
/** AGSC-08-01: these two origins require `agent` and `model`. */
const AI_ORIGINS = Object.freeze(['ai-assisted', 'ai-generated']);

/** AGSC-02-99: the nine Agent2Agent 1.0 task states, verbatim. */
const TASK_STATES = Object.freeze(['TASK_STATE_UNSPECIFIED', 'TASK_STATE_SUBMITTED',
  'TASK_STATE_WORKING', 'TASK_STATE_INPUT_REQUIRED', 'TASK_STATE_AUTH_REQUIRED',
  'TASK_STATE_COMPLETED', 'TASK_STATE_FAILED', 'TASK_STATE_CANCELED',
  'TASK_STATE_REJECTED']);
/** AGSC-10-13: the terminal states that make a board `done`. */
const TERMINAL_TASK_STATES = Object.freeze(['TASK_STATE_COMPLETED', 'TASK_STATE_CANCELED',
  'TASK_STATE_REJECTED', 'TASK_STATE_FAILED']);
/** AGSC-10-17: the one state that counts against `max_claims`. */
const WORKING = 'TASK_STATE_WORKING';

/** AGSC-08-09: `level` implies the checks, and nothing else does. */
const GATE_CHECKS = Object.freeze({
  L1: Object.freeze(['links', 'schema']),
  L2: Object.freeze(['determinism', 'links', 'provenance', 'review', 'schema']),
});

const SIGNOFF_PREFIX = 'Signed-off-by: ';
const AGREEMENT = 'CA-v1';
const EMAIL_TAIL = /^([A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*)> \(([A-Za-z0-9-]+)\)$/u;
const ASSISTED = /^Assisted-by: ([A-Za-z0-9._-]+)\/([A-Za-z0-9.+-]+) \(operator: (human:[a-z0-9][a-z0-9._-]*)\)$/u;
const ASSISTED_PREFIX = 'Assisted-by: ';
const NAME_CHAR = /^[\x21-\x3B\x3D\x3F-\x7E](?:[\x21-\x3B\x3D\x3F-\x7E ]*[\x21-\x3B\x3D\x3F-\x7E])?$/u;
const TRAILER_LINE = /^[A-Za-z][A-Za-z0-9-]*: /u;
const ACTOR = /^human:[a-z0-9][a-z0-9._-]*$/u;

const asArray = (v) => (Array.isArray(v) ? v : (v === undefined || v === null ? [] : [v]));
const slugOfPath = (p) => {
  const base = String(p).slice(String(p).lastIndexOf('/') + 1);
  return base.endsWith('.md') ? base.slice(0, -3) : base;
};

/**
 * AGSC-08-01 / AGSC-10-02: an item's effective provenance, with the Level-0
 * inheritance made explicit rather than silent.
 *
 * @param {object} item a parsed Item or a flat frontmatter object
 * @param {object} [config] `agsc.config.json` (its `bundle.operator` is the fallback)
 * @returns {{prov:object, inherited:boolean, findings:Array<object>}}
 */
function deriveProv(item, config = {}) {
  const v = links.view(item);
  const at = { file: v.path, slug: v.slug };
  const authored = (v.fm && typeof v.fm.prov === 'object' && v.fm.prov !== null) ? v.fm.prov : null;
  const bundleOperator = config && config.bundle ? config.bundle.operator : undefined;
  const findings = [];

  if (authored === null) {
    if (typeof bundleOperator !== 'string' || bundleOperator === '') {
      findings.push(finding('AGSC-E501', 'this item carries no `prov` (AGSC-08-01)', at));
      return { prov: null, inherited: false, findings };
    }
    // AGSC-10-02: a Level-0 Bundle may leave `prov` to `bundle.operator`; the
    // inheritance is recorded as a warning so that it is never invisible.
    findings.push(finding('AGSC-E508',
      `prov inherited from bundle.operator "${bundleOperator}" (AGSC-10-02)`,
      { ...at, severity: 'warn' }));
    return { prov: { origin: 'human', operator: bundleOperator }, inherited: true, findings };
  }

  const prov = { ...authored };
  if (typeof prov.operator !== 'string' || prov.operator === '') {
    if (typeof bundleOperator === 'string' && bundleOperator !== '') {
      prov.operator = bundleOperator;
      findings.push(finding('AGSC-E508',
        `prov.operator inherited from bundle.operator "${bundleOperator}" (AGSC-10-02)`,
        { ...at, severity: 'warn' }));
    } else {
      findings.push(finding('AGSC-E503', 'this item carries no `prov.operator` (AGSC-08-01)', at));
    }
  }
  if (AI_ORIGINS.includes(prov.origin)) {
    for (const key of ['agent', 'model']) {
      if (typeof prov[key] === 'string' && prov[key] !== '') continue;
      findings.push(finding('AGSC-E202',
        `prov.${key} is required when prov.origin is "${prov.origin}" (AGSC-08-01)`,
        { ...at, key: `prov.${key}` }));
    }
  }
  return { prov, inherited: false, findings };
}

/** The last contiguous run of `Key: value` lines of a commit message (AGSC-08-20b). */
function trailerBlock(message) {
  const lines = String(message === undefined ? '' : message).replace(/\n+$/u, '').split('\n');
  const block = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!TRAILER_LINE.test(lines[i])) break;
    block.unshift(lines[i]);
  }
  return block;
}

/** AGSC-08-06: parse one `Signed-off-by:` line, name disambiguated greedily. */
function parseSignoff(line) {
  if (!line.startsWith(SIGNOFF_PREFIX)) return null;
  const rest = line.slice(SIGNOFF_PREFIX.length);
  const cut = rest.lastIndexOf(' <');
  if (cut <= 0) return null;
  const name = rest.slice(0, cut);
  if (!NAME_CHAR.test(name)) return null;
  const m = EMAIL_TAIL.exec(rest.slice(cut + 2));
  if (m === null || m[2] !== AGREEMENT) return null;
  return { name, email: m[1], agreement: m[2] };
}

/** AGSC-08-06: parse one `Assisted-by:` line. */
function parseAssisted(line) {
  const m = ASSISTED.exec(line);
  if (m === null) return null;
  return { producer: m[1], version: m[2], operator: m[3] };
}

/**
 * AGSC-08-06 / AGSC-08-07: the DCO-Plus trailer block of one contribution.
 *
 * @param {string} message the commit message (or the trailer block alone)
 * @param {{prov?:object, file?:string, slug?:string}} [context]
 * @returns {{signoff:object|null, assisted:Array<object>, findings:Array<object>}}
 */
function checkTrailers(message, context = {}) {
  const at = { file: context.file, slug: context.slug };
  const block = trailerBlock(message);
  const signoffLines = block.filter((l) => l.startsWith(SIGNOFF_PREFIX));
  const signoff = signoffLines.length === 1 ? parseSignoff(signoffLines[0]) : null;
  const assistedLines = block.filter((l) => l.startsWith(ASSISTED_PREFIX));
  const assisted = assistedLines.map(parseAssisted).filter(Boolean);
  const findings = [];

  if (signoff === null) {
    findings.push(finding('AGSC-E504',
      'the DCO-Plus trailer block is missing or malformed (AGSC-08-06)', at));
  }
  // AGSC-08-06: `trailer-block = signoff *( LF assisted )`. A line that announces
  // itself as `Assisted-by:` and does not match `assisted` makes the BLOCK malformed
  // — an `actor` that is not `human:<id>` (AGSC-08-08 is why the grammar admits no
  // other form) or an `idchar` outside `lcalpha / DIGIT / "." / "_" / "-"`, for
  // instance. Until rc.5 such a line was silently dropped, so a trailer naming an
  // agent as its operator passed. Vector `prov-0004`.
  for (const line of assistedLines) {
    if (parseAssisted(line) !== null) continue;
    findings.push(finding('AGSC-E504',
      `the Assisted-by line does not match the AGSC-08-06 grammar: ${JSON.stringify(line)}`, at));
  }
  const prov = context.prov || {};
  if (AI_ORIGINS.includes(prov.origin)) {
    const match = assisted.some((a) => a.operator === prov.operator);
    if (!match) {
      findings.push(finding('AGSC-E505',
        `an "${prov.origin}" change needs an Assisted-by line naming prov.operator (AGSC-08-07)`,
        { ...at, operator: prov.operator }));
    }
  }
  return { signoff, assisted, findings };
}

/**
 * AGSC-08-09 / AGSC-02-18: a Gate's `checks[]` MUST equal what its `level` implies.
 *
 * @param {object} item a `type: gate` item
 * @returns {{checks:string[], findings:Array<object>}}
 */
function checkGate(item) {
  const v = links.view(item);
  const at = { file: v.path, slug: v.slug };
  const level = v.fm.level;
  const implied = GATE_CHECKS[level];
  if (implied === undefined) {
    return { checks: [], findings: [finding('AGSC-E203',
      `gate level "${level}" is outside L1|L2 (AGSC-02-18)`, { ...at, key: 'level' })] };
  }
  const declared = asArray(v.fm.checks).filter((c) => typeof c === 'string');
  if (declared.length === 0) return { checks: [...implied], findings: [] };
  const sorted = [...declared].sort();
  const same = sorted.length === implied.length && sorted.every((c, i) => c === implied[i]);
  if (same) return { checks: [...implied], findings: [] };
  return {
    checks: [...implied],
    findings: [finding('AGSC-E203',
      `gate "${v.slug}" declares checks[${sorted.join(', ')}] but level ${level} implies [${implied.join(', ')}] (AGSC-02-18)`,
      { ...at, key: 'checks' })],
  };
}

/**
 * AGSC-11-02: a task state met in a board this node did not author is read as
 * `TASK_STATE_UNSPECIFIED` when it is not one of the nine. In the node's OWN
 * frontmatter the same value is `AGSC-E203` — that check belongs to the schema
 * (`knowledge/validate.js`), and this function is deliberately the only other
 * reading of the enum, so the two never drift.
 */
function readForeignTaskState(value) {
  return TASK_STATES.includes(value) ? value : 'TASK_STATE_UNSPECIFIED';
}

/** AGSC-10-13: a board is `done` when every task's state is terminal. */
function isTerminal(state) {
  return TERMINAL_TASK_STATES.includes(state);
}

/** The tasks a board holds in `TASK_STATE_WORKING` for one agent (AGSC-10-17). */
function heldBy(board, agentName) {
  return asArray(board && board.tasks)
    .filter((t) => t && t.claimed_by === agentName
      && readForeignTaskState(t.state || t.task_state) === WORKING)
    .map((t) => t.slug);
}

/**
 * AGSC-10-17: the work-in-progress limit of an agent lane. A Proposal whose
 * changes would leave the lane holding more than `max_claims` tasks in
 * `TASK_STATE_WORKING` is rejected with `AGSC-E511` BEFORE any lint runs; a
 * Proposal that first completes a held task and then claims another is accepted.
 *
 * AGSC-08-28(c)'s own checks (`AGSC-E509`, `max_new_items`) are delegated to
 * `governance/agents.js#checkProposal` and run first, exactly as AGSC-08-28
 * orders them.
 *
 * @param {object} config `agsc.config.json` (its `agents[]` carries `max_claims`)
 * @param {object} proposal `{agent, changes:[{path, task_state, …}]}`
 * @param {object} board `{cluster, tasks:[{slug, state, claimed_by}]}`
 * @returns {{accepted:boolean, findings:Array<object>, held_after:number}}
 */
function checkClaims(config, proposal, board) {
  const declared = agents.checkProposal(config, proposal);
  const agentName = proposal && proposal.agent;
  const held = new Set(heldBy(board, agentName));
  if (!declared.accepted) {
    return { accepted: false, findings: declared.findings, held_after: held.size };
  }

  const entry = agents.findAgentEntry(config, agentName);
  const maxClaims = entry && typeof entry.max_claims === 'number'
    ? entry.max_claims
    : agents.MAX_CLAIMS_DEFAULT;

  for (const change of asArray(proposal && proposal.changes)) {
    if (!change || change.task_state === undefined) continue;
    const slug = change.slug || slugOfPath(change.path);
    const next = change.task_state;
    if (next === WORKING) {
      if (held.has(slug)) continue;
      if (held.size + 1 > maxClaims) {
        return {
          accepted: false,
          held_after: held.size,
          findings: [finding('AGSC-E511',
            `agent lane "${agentName}" already holds ${held.size} task(s) in ${WORKING}; max_claims is ${maxClaims} (AGSC-10-17)`,
            { agent: agentName, held: held.size, max_claims: maxClaims, path: change.path, slug })],
        };
      }
      held.add(slug);
      continue;
    }
    held.delete(slug);
  }
  return { accepted: true, findings: [], held_after: held.size };
}

module.exports = {
  AI_ORIGINS,
  GATE_CHECKS,
  ORIGINS,
  TASK_STATES,
  TERMINAL_TASK_STATES,
  WORKING,
  checkClaims,
  checkGate,
  checkTrailers,
  deriveProv,
  heldBy,
  isTerminal,
  parseAssisted,
  parseSignoff,
  readForeignTaskState,
  trailerBlock,
};
