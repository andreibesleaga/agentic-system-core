'use strict';
// src/application/cli/verbs/refresh.js — `refresh --agent <name> [--dry-run]`
// (AGSC-09-07, AGSC-08-28(f)).
//
// An agent lane's run opens a Proposal. This engine has no model adapter and no
// channel adapter, so the only path it can honestly take is `--dry-run`: it
// resolves the lane, states the task the run would execute, puts that Proposal
// through the agent-lane gates of AGSC-08-28 (`governance/agents.js`) and
// writes the two files AGSC-08-04 names — calling no model and reaching no
// network. Without `--dry-run` the verb says it is not implemented.
//
// Before anything is written the run checks where a lane run stops: the build
// instant (AGSC-04-09, refused with AGSC-E204 when it defaulted, as `build` refuses),
// the month's spend (the Bundle's Episodes and those earlier dry runs printed, AGSC-08-25) against the lane's and the node's budget (AGSC-08-28(e), the
// warning AGSC-E510, the same meter as the NOW page) and, for a lane that works
// tasks, a task it can claim (AGSC-10-17). A run that stops writes nothing.
//
// The Proposal carries the lane task as its TOP-LEVEL `task` member,
// one of the agent's declared
// `tasks[]`; a per-change `change.task` overrides it. That is what makes the
// AGSC-E509 task check of `checkProposal` fire here.

const { applyPatch, createTwoFilesPatch, parsePatch } = require('diff');
const { checkProposal, findAgentEntry } = require('../../../governance/agents.js');
const fix = require('../../../governance/fix.js');
const { serialize } = require('../../../knowledge/adopt.js');
const slugs = require('../../../knowledge/slug.js');
const frontmatter = require('../../../knowledge/frontmatter.js');
const { readSchemas } = require('../../../adapters/node-fs.js');
const boards = require('../../../governance/boards.js');
const now = require('../../../distribution/now.js');
const propose = require('./propose.js');
const helpers = require('./_helpers.js');

/** AGSC-08-28: `refresh` executes the lane's own refresh task when it declares one. */
function taskOf(entry, requested) {
  if (requested !== undefined) return String(requested);
  const declared = Array.isArray(entry.tasks) ? entry.tasks : [];
  return declared.includes('refresh') ? 'refresh' : declared[0];
}

/**
 * AGSC-08-28(d): the Episode of one run, as a conforming item — `actor` the lane,
 * in the actor grammar of AGSC-02-09 (`process:<name>`), `started` the run's
 * instant, `usage` the AGSC-02-14 record of a run that called no model, and the
 * provenance of (b), with the `agent` and `model` of AGSC-08-01.
 */
function episodeOf(entry, task, { started, operator } = {}) {
  const usage = { cost_usd: 0, estimate: true, tokens_in: 0, tokens_out: 0 };
  if (typeof entry.model === 'string' && entry.model !== '') usage.model = entry.model;
  // AGSC-08-01: an `ai-*` origin names its agent and its model. A `process` lane has
  // no `model` (AGSC-01-36: "absent otherwise") and its run calls none, so its Episode
  // names the lane's kind, `process`, and stays an item `lint` accepts.
  const prov = { origin: 'ai-generated', agent: entry.name };
  prov.model = typeof entry.model === 'string' && entry.model !== '' ? entry.model : 'process';
  const who = typeof entry.operator === 'string' && entry.operator !== '' ? entry.operator : operator;
  if (typeof who === 'string' && who !== '') prov.operator = who;
  return {
    actor: `process:${slugs.slugify(String(entry.name)) || 'agent'}`,
    outcome: 'partial',
    prov,
    started,
    task,
    title: `Dry run of the ${entry.name} lane`,
    type: 'episode',
    usage,
  };
}

/** The Episode as the bytes of a new item file, through the one writer (AGSC-04-19). */
function episodeText(episode, number) {
  const frontmatter = { ...episode };
  delete frontmatter.task;
  const itemSchema = readSchemas(helpers.ENGINE_ROOT).item;
  const ordered = fix.orderKeys(frontmatter, fix.declaredOrder(itemSchema, 'episode'), itemSchema, 'episode', null);
  const body = [
    '', '## What happened', '',
    `Proposal ${number} was a dry run of the lane, task \`${episode.task}\`: the lane and its gates were`,
    'resolved, no model was called and no network was reached (AGSC-08-28(f)).', '',
    '## Outcome', '', 'No content change was generated; this Episode records the run and its spend.', '',
    '## Next', '', 'Run the lane without --dry-run once a model adapter and a channel adapter are configured.', ''];
  return fix.normaliseText(`${serialize(fix.quoteTemporal(ordered))}${body.join('\n')}`);
}

/** AGSC-04-09: the Clock reports that the build instant fell to 0 (AGSC-E606). */
function instantDefaulted(clock) {
  if (!clock) return true;
  return typeof clock.findings === 'function' && clock.findings().some((f) => f && f.code === 'AGSC-E606');
}

/** Every item as the boards and the NOW meter read it: its front matter, slug, type and path. */
function itemsOf(bundle) {
  return (bundle.items || []).map((item) => (item && item.frontmatter
    ? { ...item.frontmatter, path: item.path, slug: item.slug, type: item.type } : item));
}

/**
 * AGSC-10-17: a lane whose `tasks[]` include `work` runs only while a board it may
 * touch holds a task it can claim — `TASK_STATE_SUBMITTED`, or `TASK_STATE_WORKING`
 * under its own name, the holder read as every count of held tasks reads it (the
 * derived `claimed_by`, else `prov.agent`). A board is a cluster holding a task
 * (AGSC-10-13); a lane touches a task only when `concept` is among its `types[]`
 * (default all three, AGSC-01-36). A task that needs a person is never claimable.
 */
function hasClaimableTask(entry, items, gitLog) {
  const types = Array.isArray(entry.types) ? entry.types : ['concept', 'episode', 'lesson'];
  if (!types.includes('concept')) return false;
  const derived = boards.claimants(gitLog, items);
  return items.some((item) => {
    if (!item || !boards.isTask(item) || !Array.isArray(item.clusters) || item.clusters.length === 0) return false;
    const state = boards.stateOf(item);
    if (state === 'TASK_STATE_SUBMITTED') return true;
    return state === boards.CLAIMED_STATE
      && boards.sameParticipant(boards.holderOf(item, derived.get(String(item.slug))), entry.name);
  });
}

/**
 * AGSC-08-25: the Episodes the lane run counts besides the Bundle's own — those printed
 * by an earlier dry run, which a build never reads. A dry run writes its Episode as a
 * new file under `content/episodes/` in `dist/proposal/<n>.patch`; each such file whose
 * slug the Bundle does not hold yet (once merged, the Bundle's copy is the one counted)
 * is read as an item. A patch that does not parse, or a file that is no item, adds
 * nothing.
 *
 * @param {object} fs the FileSystem port.
 * @param {object} bundle the loaded Bundle.
 * @returns {Array<object>} the printed Episodes, as `itemsOf` gives items.
 */
function printedEpisodes(fs, bundle) {
  const out = [];
  for (let n = 1; fs.exists(`${propose.DIR}/${n}.md`); n += 1) {
    if (!fs.exists(`${propose.DIR}/${n}.patch`)) continue;
    let files;
    try {
      files = parsePatch(String(fs.readFile(`${propose.DIR}/${n}.patch`, 'utf8')));
    } catch (e) {
      continue;
    }
    for (const file of files) {
      const m = /^b\/content\/episodes\/([a-z0-9-]+)\.md$/u.exec(String(file.newFileName));
      if (m === null || file.oldFileName !== '/dev/null' || bundle.byslug.has(m[1])) continue;
      const at = `content/episodes/${m[1]}.md`;
      const text = applyPatch('', file);
      // Typed as the loader types an item (AGSC-02-03), so `cost_usd` is a number.
      const item = typeof text === 'string' ? frontmatter.parseItem(text, { path: at, schemas: helpers.schemas() }) : null;
      if (item && item.frontmatter && typeof item.frontmatter === 'object') {
        out.push({ ...item.frontmatter, path: at, slug: m[1], type: 'episode' });
      }
    }
  }
  return out;
}

/**
 * The stop conditions of one lane run, checked before anything is written: a
 * `{findings}` result when the run stops, else `null`.
 */
function stopped(ctx, entry, bundle) {
  const clock = ctx.ports && ctx.ports.clock;
  if (instantDefaulted(clock)) {
    // AGSC-04-09 with DP-10's reading of AGSC-08-28(f): the Episode would be dated
    // 1970-01-01 and counted in no month the AGSC-08-25 meter reads, so the run is
    // refused exactly as `build` refuses a defaulted instant.
    const clockFindings = clock && typeof clock.findings === 'function' ? clock.findings() : [];
    return {
      status: 'fail',
      findings: [...clockFindings, {
        code: 'AGSC-E204',
        file: '',
        message: 'the build instant defaulted to 1970-01-01T00:00:00Z, because this run had no SOURCE_DATE_EPOCH and no'
          + ' git history (AGSC-04-09), so the Episode of the run would be dated in a month the spend meter of'
          + ' AGSC-08-25 never counts; commit this Bundle once, or set SOURCE_DATE_EPOCH, then run it again',
        severity: 'error',
      }],
    };
  }
  const items = itemsOf(bundle);
  const config = ctx.config || {};
  // AGSC-08-28(e): the lane stops for the month once its own budget or the node's is
  // reached — the meter of AGSC-08-25, the one the NOW page shows, over the Bundle's
  // Episodes and, as AGSC-08-25 gives the lane run to count, those its earlier dry
  // runs printed.
  const metered = [...items, ...printedEpisodes(ctx.ports.fs, bundle)];
  const reached = now.budgetReached(metered, config, { lane: entry.name, month: helpers.instantOf(ctx).slice(0, 7) });
  if (reached.length > 0) {
    helpers.note(ctx, `refresh: the ${entry.name} lane stops for the month: a monthly budget is reached; nothing was written`);
    return { findings: reached, wrote: [] };
  }
  const tasks = Array.isArray(entry.tasks) ? entry.tasks : [];
  if (tasks.includes('work') && !hasClaimableTask(entry, items, helpers.gitLog(ctx))) {
    helpers.note(ctx, `refresh: nothing can be claimed: no board the ${entry.name} lane may touch holds a task in`
      + ' TASK_STATE_SUBMITTED, or in TASK_STATE_WORKING under its own name, so the lane stops (AGSC-10-17);'
      + ' nothing was written');
    return { findings: [], wrote: [] };
  }
  return null;
}

function run(ctx) {
  const agentName = ctx.verbFlags && ctx.verbFlags.agent;
  if (!agentName) {
    return { status: 'fail', findings: [{ code: 'AGSC-E003', message: 'refresh requires --agent <name>', severity: 'error' }] };
  }
  const entry = findAgentEntry(ctx.config || {}, agentName);
  if (!entry || entry.enabled !== true) {
    return {
      status: 'fail',
      findings: [{ code: 'AGSC-E509', agent: agentName, message: `agent ${agentName} is undeclared or disabled (AGSC-08-28)`, severity: 'error' }],
    };
  }
  if (!(ctx.verbFlags && ctx.verbFlags['dry-run'])) {
    return helpers.notImplemented('refresh', 'AGSC-08-28(f)',
      'opening a real Proposal needs a model adapter and a channel adapter, and this build has neither;'
      + ' --dry-run is implemented and calls no model');
  }

  // AGSC-08-28: the lane's gates run BEFORE anything is written — an undeclared
  // task, an undeclared item type or a lane cap is AGSC-E509/AGSC-E511.
  const task = taskOf(entry, ctx.verbFlags.task);
  const proposal = { agent: entry.name, changes: [], task };
  const gate = checkProposal(ctx.config || {}, proposal);
  if (!gate.accepted) return { status: 'fail', findings: gate.findings.slice() };
  const bundle = helpers.bundleOf(ctx);
  const stop = stopped(ctx, entry, bundle);
  if (stop !== null) return stop;

  const fs = ctx.ports.fs;
  const number = propose.nextNumber(fs);
  const body = [
    '---',
    `agent: ${entry.name}`,
    `channel: ${entry.channel}`,
    `task: ${task}`,
    '---',
    '',
    propose.MARKER,
    '',
    `# Proposal ${number} (dry run)`,
    '',
    '## Rationale',
    '',
    'A dry run of AGSC-08-28(f): no model was called, no network was reached and no',
    'content change was generated. The lane, its task and its gates are what this run',
    'proves; the patch adds the Episode that records the run (AGSC-08-28(d)).',
    '',
    '## Affected slugs',
    '',
    '- (none)',
    '',
  ].join('\n');

  // AGSC-08-28(d)/(f): the dry-run Proposal INCLUDES the Episode of the run, as a
  // new item under content/episodes/, so that applying the patch records the run
  // and its spend where AGSC-08-25's rollup and the NOW page read it.
  const started = helpers.instantOf(ctx);
  const operator = ((ctx.config || {}).bundle || {}).operator;
  const episode = episodeOf(entry, task, { operator, started });
  const slug = slugs.dedupe(`${slugs.slugify(String(entry.name)) || 'agent'}-dry-run-${number}`, new Set(bundle.byslug.keys()));
  const at = `content/episodes/${slug}.md`;
  const patch = createTwoFilesPatch('/dev/null', `b/${at}`, '', episodeText(episode, number), '', '');

  fs.mkdirp(propose.DIR);
  fs.writeFile(`${propose.DIR}/${number}.patch`, patch);
  fs.writeFile(`${propose.DIR}/${number}.md`, body.replace('- (none)\n', `- ${slug} (the Episode of this run)\n`));
  helpers.note(ctx, `wrote: ${propose.DIR}/${number}.patch`);
  helpers.note(ctx, `wrote: ${propose.DIR}/${number}.md`);
  // AGSC-08-28(f): print the commands a person may run, as `propose` does.
  for (const line of propose.commandsFor(at, number, { canonical: true, committed: false })) helpers.note(ctx, `run: ${line}`);

  return { episode, findings: [], wrote: [`${propose.DIR}/${number}.patch`, `${propose.DIR}/${number}.md`] };
}

module.exports = { name: 'refresh', run };
