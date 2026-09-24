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

const { checkProposal, findAgentEntry } = require('../../../governance/agents.js');
const propose = require('./propose.js');
const helpers = require('./_helpers.js');

/** AGSC-08-28: `refresh` executes the lane's own refresh task when it declares one. */
function taskOf(entry, requested) {
  if (requested !== undefined) return String(requested);
  const declared = Array.isArray(entry.tasks) ? entry.tasks : [];
  return declared.includes('refresh') ? 'refresh' : declared[0];
}

/** AGSC-02-14: the usage record of a run that called no model. */
function episodeOf(entry, task) {
  return {
    actor: entry.name,
    outcome: 'partial',
    task,
    type: 'episode',
    usage: { cost_usd: 0, estimate: true, model: entry.model || null, tokens_in: 0, tokens_out: 0 },
  };
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
    'change was generated. The lane, its task and its gates are what this run proves.',
    '',
    '## Affected slugs',
    '',
    '- (none)',
    '',
  ].join('\n');

  fs.mkdirp(propose.DIR);
  fs.writeFile(`${propose.DIR}/${number}.patch`, '# dry run: no content change was generated (no model call was made)\n');
  fs.writeFile(`${propose.DIR}/${number}.md`, body);
  helpers.note(ctx, `wrote: ${propose.DIR}/${number}.patch`);
  helpers.note(ctx, `wrote: ${propose.DIR}/${number}.md`);

  return { episode: episodeOf(entry, task), findings: [], wrote: [`${propose.DIR}/${number}.patch`, `${propose.DIR}/${number}.md`] };
}

module.exports = { episodeOf, name: 'refresh', run, taskOf };
