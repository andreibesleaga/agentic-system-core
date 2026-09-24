'use strict';
/**
 * src/application/cli/verbs/run.js — `run <slug>` (AGSC-09-07, AGSC-09-94).
 *
 * OPT-IN. `main.js` already refuses the verb with `AGSC-E001` and exit 2 while
 * `run.enabled` is false, "exactly as an unknown verb"; nothing below is reachable
 * until an operator turns it on in `agsc.config.json`.
 *
 * WHAT IS IMPLEMENTED HERE, AND WHAT IS NOT.
 *
 * Everything AGSC-09-94 pins as a decision is implemented and tested: the
 * configuration gate, the restriction to `procedure` items (AGSC-02-22), the
 * extraction and pairing of the `run` and `expect` blocks, the `run.allow[]`
 * program allow-list, the refusal of any line only a shell could honour, the
 * `--dry-run` that "MUST print the resolved command list and execute nothing", the
 * execution itself through the ProcessRunner port — no shell, a scrubbed
 * environment, a timeout, a working directory OUTSIDE the Bundle so that nothing a
 * step writes can land inside it — and the comparison of each captured result with
 * its `expect` block.
 *
 * ONE OBLIGATION OF THE RULE CANNOT BE DISCHARGED BY THIS PACKAGE: "it MUST run
 * with **no network**". A Node process cannot deny a child process the network from
 * inside the same process; that needs an OS sandbox (a namespace, a seccomp
 * profile, a container, a jail) which is a property of the host and not of this
 * package, and which this engine has no way to verify once it has spawned. So the
 * ProcessRunner port carries one declaration, `isolated`, and this verb EXECUTES
 * only against a runner that sets it. The Node adapter shipped in this
 * distribution does NOT set it — it is the git-log reader of AGSC-08-20a, and it
 * offers no network isolation — so a plain `agsc run <slug>` on this distribution
 * reports exactly what is missing and executes nothing, while `--dry-run` works in
 * full. A host that wires an isolated runner gets the whole verb, and the test
 * suite exercises that path with an injected runner, deterministically and with no
 * real process.
 *
 * This is the honest position: every pinned decision is implemented and provable,
 * the one unimplementable guarantee is named rather than quietly dropped, and no
 * command is ever executed under a guarantee this engine cannot make.
 *
 *
 */

const os = require('node:os');

const runblocks = require('../../../knowledge/runblocks.js');
const { finding } = require('../../../knowledge/validate.js');
const helpers = require('./_helpers.js');

/** AGSC-09-94: a step never writes inside the Bundle, so it runs somewhere else. */
const WORKING_DIRECTORY_NOTE = 'the step ran outside the Bundle root (AGSC-09-94)';

/** The `run{}` settings of AGSC-01-18. */
function settings(ctx) {
  const run = (ctx.config && ctx.config.run) || {};
  return { allow: Array.isArray(run.allow) ? run.allow.map(String) : [] };
}

/** The one line `--dry-run` prints per resolved command (AGSC-09-94). */
function resolvedLine(step, command) {
  return `run: step ${step.ordinal}: ${command.program}`
    + `${command.args.length === 0 ? '' : ` ${command.args.join(' ')}`}`
    + `${command.allowed ? '' : '   [REFUSED: not in run.allow[]]'}`;
}

/**
 * Execute one step and compare (AGSC-09-94). PURE of the clock; the runner is the
 * injected port and the comparison is `knowledge/runblocks.js`'s.
 *
 * @param {object} runner the ProcessRunner port.
 * @param {object} step
 * @param {object} options `{cwd, file, slug, timeoutMs}`
 * @returns {{captured:string, findings:Array<object>, ok:boolean}}
 */
function execute(runner, step, options) {
  const findings = [];
  let captured = '';
  for (const command of step.commands) {
    if (!command.allowed) return { captured: '', findings, ok: false };
    const result = runner.run(command.program, command.args, {
      cwd: options.cwd, timeoutMs: options.timeoutMs,
    });
    captured += String((result && result.stdout) || '');
    if (result && result.code !== 0) {
      findings.push(finding('AGSC-E602',
        `${options.slug}: step ${step.ordinal} exited ${result.code} (${WORKING_DIRECTORY_NOTE})`,
        { file: options.file, line: step.line, severity: 'error' }));
      return { captured, findings, ok: false };
    }
  }
  if (step.expected === null) return { captured, findings, ok: true };
  // AGSC-09-94: "a captured result that differs from
  // its `expect` block is `AGSC-E602`, a recorded result that the run did not
  // reproduce". The registry row names the rule, so this is no longer a borrowed
  // code.
  if (!runblocks.matches(captured, step.expected)) {
    findings.push(finding('AGSC-E602',
      `${options.slug}: step ${step.ordinal} did not reproduce its expect block (AGSC-09-94)`,
      { file: options.file, line: step.line, severity: 'error' }));
    return { captured, findings, ok: false };
  }
  return { captured, findings, ok: true };
}

function run(ctx) {
  const slug = (ctx.argv || [])[0];
  if (slug === undefined) {
    return {
      status: 'fail',
      findings: [finding('AGSC-E003', 'run needs the Procedure slug as its one argument (AGSC-09-94)',
        { file: '', severity: 'error' })],
    };
  }
  const bundle = helpers.bundleOf(ctx);
  const raw = bundle.byslug.get(String(slug));
  if (raw === undefined) {
    return {
      status: 'fail',
      findings: [finding('AGSC-E301', `no item of this Bundle has the slug ${JSON.stringify(String(slug))} (AGSC-09-94)`,
        { file: '', severity: 'error' })],
    };
  }
  const item = { ...raw.frontmatter, body: raw.body, path: raw.path, slug: raw.slug, type: raw.type };
  const parsed = runblocks.steps(item, settings(ctx));
  const findings = [...parsed.findings];

  if (parsed.steps.length === 0) {
    helpers.note(ctx, `run: ${slug} carries no run block (AGSC-02-22)`);
    return { findings };
  }

  // AGSC-09-94: "`--dry-run` MUST print the resolved command list and execute nothing."
  if ((ctx.verbFlags || {})['dry-run'] === true) {
    for (const step of parsed.steps) {
      for (const command of step.commands) helpers.note(ctx, resolvedLine(step, command));
      helpers.note(ctx, `run: step ${step.ordinal}: ${step.expected === null ? 'no expect block' : 'compares with its expect block'}`);
    }
    helpers.note(ctx, `run: --dry-run: ${parsed.steps.length} step(s) resolved, nothing executed`);
    return { findings };
  }

  const runner = ctx.ports && ctx.ports.proc;
  if (!runner || typeof runner.run !== 'function') {
    findings.push(finding('AGSC-E003',
      'run needs a ProcessRunner port and none is wired (AGSC-09-94)', { file: '', severity: 'error' }));
    return { findings, status: 'fail' };
  }
  if (runner.isolated !== true) {
    findings.push(finding('AGSC-E001',
      'run executed nothing: AGSC-09-94 requires a step to run "with no network", and the'
      + ' ProcessRunner this distribution ships does not declare network isolation'
      + ' (`isolated: true`), which a Node process cannot give a child of its own — it needs an'
      + ' OS sandbox on the host. Everything else the rule pins IS implemented: use `run'
      + ' --dry-run` for the resolved command list, or wire a ProcessRunner that declares'
      + ' isolation. No conformance Level requires this verb (AGSC-09-94, AGSC-10-01…06).',
      { file: String(item.path), severity: 'error' }));
    return { findings, status: 'fail' };
  }

  let failed = 0;
  for (const step of parsed.steps) {
    const result = execute(runner, step, {
      // AGSC-09-94: "it MUST NOT write inside the Bundle". The working directory is
      // therefore the host's temporary directory and never the Bundle root, which
      // is what `process.cwd()` would be for every invocation of this CLI.
      cwd: ctx.runCwd === undefined ? os.tmpdir() : ctx.runCwd,
      file: String(item.path),
      slug: String(slug),
      timeoutMs: ctx.runTimeoutMs,
    });
    findings.push(...result.findings);
    if (!result.ok) failed += 1;
  }
  helpers.note(ctx, `run: ${parsed.steps.length - failed} of ${parsed.steps.length} step(s) reproduced`
    + ` their expect block (${WORKING_DIRECTORY_NOTE})`);
  return { findings };
}

module.exports = { execute, name: 'run', resolvedLine, run, settings };
