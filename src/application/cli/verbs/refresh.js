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
// The Proposal carries the lane task as its TOP-LEVEL `task` member
// (a design choice of 2026-09-18), one of the agent's declared
// `tasks[]`; a per-change `change.task` overrides it. That is what makes the
// AGSC-E509 task check of `checkProposal` fire here.

const { createTwoFilesPatch } = require('diff');
const { checkProposal, findAgentEntry } = require('../../../governance/agents.js');
const fix = require('../../../governance/fix.js');
const { instantFromEpoch } = require('../../../governance/ledger.js');
const { serialize } = require('../../../knowledge/adopt.js');
const slugs = require('../../../knowledge/slug.js');
const { readSchemas } = require('../../../adapters/node-fs.js');
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
 * provenance of (b).
 */
function episodeOf(entry, task, { started, operator } = {}) {
  const usage = { cost_usd: 0, estimate: true, tokens_in: 0, tokens_out: 0 };
  if (typeof entry.model === 'string' && entry.model !== '') usage.model = entry.model;
  const prov = { origin: 'ai-generated', agent: entry.name };
  if (typeof entry.model === 'string' && entry.model !== '') prov.model = entry.model;
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
  const clock = ctx.ports && ctx.ports.clock;
  const started = clock && typeof clock.iso === 'function' ? clock.iso() : instantFromEpoch(clock ? clock.now() : 0);
  const operator = ((ctx.config || {}).bundle || {}).operator;
  const episode = episodeOf(entry, task, { operator, started });
  const bundle = helpers.bundleOf(ctx);
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
