'use strict';
// CONTEXT Governance & Provenance — aggregate: Board (a Cluster read as a board).
// Implements AGSC-10-13 (the two board exports, their shape, the derived `done` and
// the derived `claimed_by`), AGSC-10-16 (what makes a Bundle a live board) and the
// work-in-progress limit of AGSC-10-17 (`AGSC-E511`). AGSC-02-99 supplies the nine
// verbatim Agent2Agent task states.
//
// Project mode adds NO data model: a task is a `concept` of `kind: task`, a board is
// a cluster that contains at least one task, and `blocked-by` / `decided-by` keep
// their AGSC-03-01 meaning. This module derives; it authors nothing.
//
// PURE: no fs, no process, no clock, no network. The build instant and the git log
// arrive as data. Vectors: brd-0001, brd-0002.

const { compareCodePoint } = require('../knowledge/unicode.js');
const { finding } = require('../knowledge/validate.js');
const { TYPE_PLURAL } = require('../knowledge/chunks.js');

/** AGSC-02-99: the nine Agent2Agent 1.0 task states, verbatim. */
const TASK_STATES = Object.freeze([
  'TASK_STATE_UNSPECIFIED', 'TASK_STATE_SUBMITTED', 'TASK_STATE_WORKING',
  'TASK_STATE_INPUT_REQUIRED', 'TASK_STATE_AUTH_REQUIRED', 'TASK_STATE_COMPLETED',
  'TASK_STATE_FAILED', 'TASK_STATE_CANCELED', 'TASK_STATE_REJECTED',
]);
/** AGSC-02-99: the default when `task_state` is absent. */
const DEFAULT_STATE = 'TASK_STATE_UNSPECIFIED';
/** AGSC-10-13: the terminal states that make a board `done`. */
const TERMINAL_STATES = Object.freeze([
  'TASK_STATE_COMPLETED', 'TASK_STATE_CANCELED', 'TASK_STATE_REJECTED', 'TASK_STATE_FAILED',
]);
/** AGSC-10-17: the state a claim puts a task in; the WIP limit counts these. */
const CLAIMED_STATE = 'TASK_STATE_WORKING';
/** AGSC-02-23: an item with no `status` starts `stable`. */
const DEFAULT_STATUS = 'stable';
/** AGSC-01-36: the default `max_claims` of an agent lane — a pull system of one. */
const DEFAULT_MAX_CLAIMS = 1;

/** AGSC-05-01 / AGSC-05-03: `<site.base>/<type-plural>/<slug>/`. */
function iriOf(base, type, slug) {
  const plural = TYPE_PLURAL[type] || TYPE_PLURAL.concept;
  return `${String(base).replace(/\/+$/u, '')}/${plural}/${slug}/`;
}

/** AGSC-10-13: a task is a `concept` of `kind: task`. */
function isTask(item) {
  return item.type === 'concept' && item.kind === 'task';
}

/** AGSC-11-02: a state a reader does not know reads as `TASK_STATE_UNSPECIFIED`. */
function stateOf(item, { foreign = false } = {}) {
  const value = item.task_state;
  if (value == null) return DEFAULT_STATE;
  if (TASK_STATES.includes(value)) return String(value);
  return foreign ? DEFAULT_STATE : String(value);
}

/** A slug array, anchors stripped — `blocked_by` and `decided_by` are LOCAL slugs. */
function slugList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).split('#')[0]).filter((v) => v !== '');
}

/**
 * AGSC-10-13 (derivation restated at rc.6): `claimed_by` — the `author` of the last
 * first-parent commit whose `files[]` names the task's file, derived at build from
 * the extended git-log file of AGSC-08-20b. It is never authored, and absent when no
 * history is supplied, when no commit names the file, or when the last commit that
 * does carries no `author`.
 *
 * A file path in the log is relative to the REPOSITORY root; a task's path is
 * relative to the Bundle root, which may be a directory inside the repository, so a
 * log path names the task when it equals the task path or ends with `/<task path>`.
 *
 * @param {Array<object>} gitLog the git-log file: `[{files?: string[], author?: string}]`, oldest first.
 * @param {Array<object>} items the Bundle's items, flat (`slug`, `type`, `kind`, `path?`).
 * @returns {Map<string,string>} slug → claimant.
 */
function claimants(gitLog, items) {
  const out = new Map();
  const tasks = (items || []).filter((item) => item && isTask(item));
  if (!Array.isArray(gitLog) || tasks.length === 0) return out;
  const pathOf = (task) => (typeof task.path === 'string' && task.path !== ''
    ? task.path : `content/${TYPE_PLURAL[task.type] || TYPE_PLURAL.concept}/${task.slug}.md`);
  const byPath = new Map(tasks.map((task) => [pathOf(task), String(task.slug)]));
  for (const commit of gitLog) {
    for (const file of (commit && Array.isArray(commit.files) ? commit.files : [])) {
      const name = String(file);
      for (const [at, slug] of byPath) {
        if (name !== at && !name.endsWith(`/${at}`)) continue;
        if (typeof commit.author === 'string' && commit.author !== '') out.set(slug, commit.author);
        else out.delete(slug);
      }
    }
  }
  return out;
}

/**
 * Derive every board of a Bundle (AGSC-10-13). A cluster with no task is never a
 * board and is never emitted; a Bundle with no task emits nothing under `/boards/`.
 *
 * @param {Array<object>} items every item's frontmatter, `slug` included.
 * @param {object} [options]
 * @param {string} [options.base] `site.base`.
 * @param {string} [options.generatedAt] the AGSC-04-10 build instant.
 * @param {Array<object>} [options.gitLog] the git-log file; absent means no `claimed_by`.
 * @returns {{index:(object|null), boards:Array<{slug:string, path:string, board:object}>,
 *   findings:Array<object>}}
 */
function boards(items, options = {}) {
  const base = options.base == null ? '' : options.base;
  const claimedBy = claimants(options.gitLog, items);
  const tasks = (items || []).filter(isTask);

  const byCluster = new Map();
  for (const task of tasks) {
    for (const cluster of (Array.isArray(task.clusters) ? task.clusters : [])) {
      const slug = String(cluster);
      if (!byCluster.has(slug)) byCluster.set(slug, []);
      byCluster.get(slug).push(task);
    }
  }
  const titleOf = new Map((items || [])
    .filter((i) => i.type === 'cluster')
    .map((i) => [String(i.slug), i.title == null ? String(i.slug) : String(i.title)]));

  const out = [];
  for (const slug of [...byCluster.keys()].sort(compareCodePoint)) {
    const members = [...byCluster.get(slug)]
      .sort((a, b) => compareCodePoint(String(a.slug), String(b.slug)));
    const list = members.map((task) => {
      const entry = {
        blocked_by: slugList(task['blocked-by']),
        decided_by: slugList(task['decided-by']),
        iri: iriOf(base, task.type, task.slug),
        slug: String(task.slug),
        state: stateOf(task),
        status: task.status == null ? DEFAULT_STATUS : String(task.status),
        title: task.title == null ? String(task.slug) : String(task.title),
      };
      if (task.modified != null) entry.modified = String(task.modified);
      const who = claimedBy.get(String(task.slug));
      if (who !== undefined) entry.claimed_by = who;
      return entry;
    });
    const board = {
      board: titleOf.has(slug) ? titleOf.get(slug) : slug,
      done: list.every((t) => TERMINAL_STATES.includes(t.state)),
      iri: iriOf(base, 'cluster', slug),
      tasks: list,
    };
    if (options.generatedAt != null) board.generated_at = String(options.generatedAt);
    out.push({ slug, path: `/boards/${slug}.json`, board });
  }

  const index = out.length === 0 ? null : {
    boards: out.map((b) => ({ cluster: b.slug, iri: b.board.iri, tasks: b.board.tasks.length })),
  };
  return { index, boards: out, findings: [] };
}

/**
 * AGSC-10-17: two names for one participant — a lane's commit is authored
 * `process:<name>` (AGSC-08-20b's `Channel-Auto` reading) while the lane and the
 * `prov.agent` it writes are the bare `<name>`.
 */
function sameParticipant(a, b) {
  if (a == null || b == null) return false;
  const bare = (v) => String(v).replace(/^process:/u, '');
  return String(a) === String(b) || bare(a) === bare(b);
}

/**
 * AGSC-10-17: who holds a task — its derived `claimed_by`, else its `prov.agent`,
 * else nobody (`null`).
 */
function holderOf(task, claimedBy) {
  if (claimedBy != null) return String(claimedBy);
  const agent = task && task.prov && task.prov.agent;
  return agent == null ? null : String(agent);
}

/**
 * AGSC-10-17: an agent lane MUST NOT hold more than its `max_claims` tasks in
 * `TASK_STATE_WORKING` at once — the work-in-progress limit that makes the board a
 * pull system. Over the limit is `AGSC-E511`. The holder of a task is read as the
 * rule says: the derived `claimed_by`, else the task's `prov.agent`.
 *
 * @param {Array<object>} items
 * @param {object} config `agsc.config.json`, for `agents[]{name, max_claims}`.
 * @param {Map<string,string>} [claimed] the derived claimants of `claimants()`.
 * @returns {Array<object>} Findings.
 */
function wipLimit(items, config, claimed) {
  const agents = Array.isArray(config && config.agents) ? config.agents : [];
  if (agents.length === 0) return [];
  const derived = claimed instanceof Map ? claimed : new Map();
  const holders = [];
  for (const item of (items || [])) {
    if (!isTask(item) || stateOf(item) !== CLAIMED_STATE) continue;
    const who = holderOf(item, derived.get(String(item.slug)));
    if (who !== null) holders.push(who);
  }
  const out = [];
  for (const agent of agents) {
    const cap = agent.max_claims == null ? DEFAULT_MAX_CLAIMS : Number(agent.max_claims);
    const count = holders.filter((who) => sameParticipant(who, agent.name)).length;
    if (count > cap) {
      out.push(finding('AGSC-E511',
        `agent lane "${agent.name}" holds ${count} tasks in ${CLAIMED_STATE}; max_claims is ${cap} (AGSC-10-17)`,
        { file: 'agsc.config.json' }));
    }
  }
  return out;
}

module.exports = {
  boards,
  wipLimit,
  claimants,
  holderOf,
  sameParticipant,
  isTask,
  stateOf,
  iriOf,
  TASK_STATES,
  TERMINAL_STATES,
  CLAIMED_STATE,
  DEFAULT_MAX_CLAIMS,
};
