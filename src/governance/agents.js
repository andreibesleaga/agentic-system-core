// src/governance/agents.js — AGSC-01-36/37/38, 08-25, 08-28: the agent lane.
//
// PURE: no fs, no process, no clock, no network (core-purity
// test enforces this for every file under src/governance/).
'use strict';

const TYPE_ENUM = ['concept', 'episode', 'lesson'];
const KIND_ENUM = ['llm', 'process'];
const TASK_ENUM = ['create', 'edit', 'update', 'review', 'summarize', 'translate', 'refresh', 'plan', 'claim', 'work'];

const MAX_NEW_ITEMS_DEFAULT = 20;
const MAX_CLAIMS_DEFAULT = 1;
const BUDGET_USD_MONTH_DEFAULT = 10;

// (AGSC-09-11): `message` is a member of every Finding, and an empty
// one helps nobody, so the default is never silently blank — every caller here
// supplies one.
function finding(code, severity, extra) {
  return Object.assign({ code, message: '', severity }, extra || {});
}

/**
 * checkAgents(config) -> Finding[]
 *
 * Semantic checks over agsc.config.json's agents[] (AGSC-01-36) beyond plain
 * JSON-Schema validation: enum membership of each entry's kind/tasks[]/types[]
 * (reported at the same AGSC-E203 the schema validator would use, so a caller
 * that only has this module still gets the registered code), the llm-kind
 * required-field pair (model, budget_usd_month — AGSC-E202), and the
 * node-wide spend cap: the sum of budget_usd_month over enabled entries MUST
 * NOT exceed config.budget.usd_month (default 10) — AGSC-E212 (AGSC-01-38).
 */
function checkAgents(config) {
  const findings = [];
  const agents = Array.isArray(config && config.agents) ? config.agents : [];

  agents.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object') return;
    if (entry.kind !== undefined && !KIND_ENUM.includes(entry.kind)) {
      findings.push(finding('AGSC-E203', 'error', {
        message: `agents[${i}].kind is "${entry.kind}"; AGSC-01-36 allows ${KIND_ENUM.join(', ')}`,
        path: `agents[${i}].kind`,
      }));
    }
    if (Array.isArray(entry.tasks)) {
      entry.tasks.forEach((t, j) => {
        if (!TASK_ENUM.includes(t)) {
          findings.push(finding('AGSC-E203', 'error', {
            message: `agents[${i}].tasks[${j}] is "${t}"; AGSC-01-36 allows ${TASK_ENUM.join(', ')}`,
            path: `agents[${i}].tasks[${j}]`,
          }));
        }
      });
    }
    if (Array.isArray(entry.types)) {
      entry.types.forEach((t, j) => {
        if (!TYPE_ENUM.includes(t)) {
          findings.push(finding('AGSC-E203', 'error', {
            message: `agents[${i}].types[${j}] is "${t}"; AGSC-01-36 allows ${TYPE_ENUM.join(', ')}`,
            path: `agents[${i}].types[${j}]`,
          }));
        }
      });
    }
    if (entry.kind === 'llm') {
      if (typeof entry.model !== 'string' || entry.model.length === 0) {
        findings.push(finding('AGSC-E202', 'error', {
          message: `agents[${i}] is kind "llm" and MUST name a model (AGSC-01-36)`,
          path: `agents[${i}].model`,
        }));
      }
      if (typeof entry.budget_usd_month !== 'number') {
        findings.push(finding('AGSC-E202', 'error', {
          message: `agents[${i}] is kind "llm" and MUST carry a numeric budget_usd_month (AGSC-01-36, AGSC-01-38)`,
          path: `agents[${i}].budget_usd_month`,
        }));
      }
    }
  });

  const capUsdMonth = (config && config.budget && typeof config.budget.usd_month === 'number')
    ? config.budget.usd_month
    : BUDGET_USD_MONTH_DEFAULT;
  const sumUsdMonth = agents
    .filter((e) => e && e.enabled === true && typeof e.budget_usd_month === 'number')
    .reduce((sum, e) => sum + e.budget_usd_month, 0);
  if (sumUsdMonth > capUsdMonth) {
    findings.push(finding('AGSC-E212', 'error', {
      cap_usd_month: capUsdMonth,
      message: `the enabled agents sum to ${sumUsdMonth} USD a month, above the node cap of ${capUsdMonth} (AGSC-01-38)`,
      path: 'agents',
      sum_usd_month: sumUsdMonth
    }));
  }

  return findings;
}

function findAgentEntry(config, name) {
  const agents = Array.isArray(config && config.agents) ? config.agents : [];
  return agents.find((e) => e && e.name === name) || null;
}

/**
 * checkProposal(config, proposal) -> { accepted, findings }
 *
 * AGSC-08-28(c): a Proposal from an undeclared or disabled agent, or one that
 * touches an item type outside the entry's declared types[] (default all
 * three), is rejected with AGSC-E509 before any lint runs; a Proposal that
 * would create more than the entry's max_new_items (default 20) is rejected
 * with AGSC-E511 in the same place. Checked in that order (type first, then
 * count), matching AGSC-08-28(c)'s prose order.
 *
 * `tasks[]` enforcement (AGSC-08-28(c), added 2026-09-18 per the coordinator's
 * instruction): a Proposal, or one of its changes, MAY declare which
 * AGSC-01-36 task it represents via a `task` member (`proposal.task` for the
 * whole Proposal, `change.task` to override it per change); when declared,
 * a task outside the entry's `tasks[]` is AGSC-E509. This is deliberately
 * NOT derived from `change.op` (the structural `create`/`edit` diff kind):
 * prov-0002's already-conformant vector has the `planner` agent — whose
 * `tasks[]` is `['plan','claim','work']`, not `create` — legitimately
 * issue 21 `op:'create'` changes as part of its `plan` task (a planner
 * decomposing work necessarily creates task items); `op` and `task` are not
 * the same vocabulary, and inferring one from the other would reject that
 * already-passing case. A Proposal that declares no `task` anywhere is not
 * checked against `tasks[]` here (fails open on this one axis) until a
 * data model that names both consistently exists — flagged as an open
 * question in the report. max_claims (AGSC-10-17, prov-0003) stays C's.
 */
function checkProposal(config, proposal) {
  const agentName = proposal && proposal.agent;
  const entry = findAgentEntry(config, agentName);
  if (!entry || entry.enabled !== true) {
    return {
      accepted: false,
      findings: [finding('AGSC-E509', 'error', {
        agent: agentName,
        message: `no enabled agents[] entry is named "${agentName}" (AGSC-08-28)`,
        path: null,
      })]
    };
  }

  const allowedTypes = Array.isArray(entry.types) && entry.types.length > 0 ? entry.types : TYPE_ENUM.slice();
  const allowedTasks = Array.isArray(entry.tasks) ? entry.tasks : [];
  const changes = Array.isArray(proposal.changes) ? proposal.changes : [];

  // AGSC-08-28(c): the lane task the run executed rides on the Proposal as its
  // TOP-LEVEL `task` member. With changes, the loop below checks it per change
  // (and reports the change's path); with NO change — a dry run of
  // AGSC-08-28(f) — it is still checked here, so that a run naming a task the
  // lane never declared is refused before anything is written.
  if (changes.length === 0 && proposal.task !== undefined && !allowedTasks.includes(proposal.task)) {
    return {
      accepted: false,
      findings: [finding('AGSC-E509', 'error', {
        agent: agentName,
        message: `the lane "${agentName}" does not declare the task "${proposal.task}" (AGSC-08-28)`,
        path: null,
        task: proposal.task,
      })]
    };
  }

  for (const change of changes) {
    if (change && change.type !== undefined && !allowedTypes.includes(change.type)) {
      return {
        accepted: false,
        findings: [finding('AGSC-E509', 'error', {
          agent: agentName,
          message: `the lane "${agentName}" does not declare the item type "${change.type}" (AGSC-08-28)`,
          path: change.path,
        })]
      };
    }
    const task = (change && change.task !== undefined) ? change.task : proposal.task;
    if (task !== undefined && !allowedTasks.includes(task)) {
      return {
        accepted: false,
        findings: [finding('AGSC-E509', 'error', {
          agent: agentName,
          message: `the lane "${agentName}" does not declare the task "${task}" (AGSC-08-28)`,
          path: change && change.path,
          task,
        })]
      };
    }
  }

  const maxNewItems = typeof entry.max_new_items === 'number' ? entry.max_new_items : MAX_NEW_ITEMS_DEFAULT;
  const created = changes.filter((c) => c && c.op === 'create').length;
  if (created > maxNewItems) {
    return {
      accepted: false,
      findings: [finding('AGSC-E511', 'error', {
        agent: agentName,
        created,
        max_new_items: maxNewItems,
        message: `the Proposal creates ${created} items, above the lane cap of ${maxNewItems} (AGSC-08-28)`,
      })]
    };
  }

  return { accepted: true, findings: [] };
}

/**
 * capMeter(usage, config) -> { spent_usd, cap_usd, ratio }
 *
 * AGSC-08-25's monthly rollup, restated as the AGSC-01-38 cap meter: `usage`
 * is an array of episode `usage{}` objects (AGSC-02-14) already filtered to
 * the calendar month by the caller (NOW, agent E); this function only sums
 * `cost_usd` and compares it to the node cap.
 */
function capMeter(usage, config) {
  const list = Array.isArray(usage) ? usage : [];
  const spentUsd = list.reduce((sum, u) => sum + (u && typeof u.cost_usd === 'number' ? u.cost_usd : 0), 0);
  const capUsd = (config && config.budget && typeof config.budget.usd_month === 'number')
    ? config.budget.usd_month
    : BUDGET_USD_MONTH_DEFAULT;
  const ratio = capUsd > 0 ? spentUsd / capUsd : (spentUsd > 0 ? Infinity : 0);
  return { spent_usd: spentUsd, cap_usd: capUsd, ratio };
}

module.exports = {
  MAX_NEW_ITEMS_DEFAULT,
  MAX_CLAIMS_DEFAULT,
  BUDGET_USD_MONTH_DEFAULT,
  checkAgents,
  checkProposal,
  capMeter,
  findAgentEntry
};
