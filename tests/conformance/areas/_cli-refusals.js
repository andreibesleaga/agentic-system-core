'use strict';
// tests/conformance/areas/_cli-refusals.js — two `cli` cases added for 1.0.0
// (2026-10-06), kept beside `cli.js` so neither file outgrows the line limit:
// cli-0016 supersedes cli-0009 and cli-0017 supersedes cli-0013.

const path = require('node:path');
const { main } = require('../../../src/application/cli/main.js');
const { createFileSystem } = require('../../../src/adapters/node-fs.js');
const compose = require('../../../src/application/cli/verbs/compose.js');
const { captureStream } = require('./_shared.js');

/** A scratch copy of the minimal fixture, removed by `done()`. */
function minimalCopy(ctx, prefix) {
  const nodeFs = require('node:fs');
  const os = require('node:os');
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), prefix));
  nodeFs.cpSync(path.join((ctx && ctx.root) || '.', 'tests', 'fixtures', 'minimal'), root, { recursive: true });
  return { root, done: () => nodeFs.rmSync(root, { force: true, recursive: true }) };
}

/**
 * cli-0016 (AGSC-00-20 with AGSC-00-23; supersedes cli-0009, withdrawn for 1.0.0) —
 * a value outside a CLOSED operator list is `AGSC-E203` and a FINDING (exit 1), never
 * `AGSC-E002` and a usage error (exit 2), because `--emit` and `--target` are known
 * flags carrying values the registry does not hold (AGSC-09-08).
 *
 * The two refusals are run end to end through the real CLI, over a copy of the
 * minimal fixture that carries the `router` the vector's argv names — the argv is
 * used exactly as the vector states it.
 *
 * The third case (`--emit gabbe`) states what it is about: the REGISTRY accepts the
 * name (`registry_accepts`), and the distribution then writes the rendering (exit 0)
 * or, shipping none, refuses with the registry's code (AGSC-00-20) — `exit_one_of`,
 * `error_codes_allowed` — and never answers `AGSC-E001`, the unknown-verb code
 * (`codes_absent`).
 */
function runCli0016(vector, ctx) {
  const nodeFs = require('node:fs');
  const os = require('node:os');
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'agsc-cli-0016-'));
  nodeFs.cpSync(path.join((ctx && ctx.root) || '.', 'tests', 'fixtures', 'minimal'), root,
    { recursive: true });
  nodeFs.writeFileSync(path.join(root, 'content', 'concepts', 'router.md'),
    '---\ntype: concept\nkind: pattern\ntitle: Router\n'
    + 'description: A pattern that routes work to the worker that fits it, carried here for cli-0016.\n'
    + 'prov:\n  origin: human\n  operator: human:tester\n---\n\n## Intent\n\nRoute work.\n\n'
    + '## Selection\n\n```yaml agsc-selection\n- supervisor\n```\n');

  const problems = [];
  const byName = new Map((vector.expected.cases || []).map((c) => [c.name, c]));
  for (const input of vector.input.cases || []) {
    const want = byName.get(input.name);
    const stdout = captureStream();
    const stderr = captureStream();
    const exitCode = main([...input.argv, '--json', '--quiet'], {
      env: { SOURCE_DATE_EPOCH: '1767225600' },
      ports: { fs: createFileSystem(root) },
      root,
      specVersion: (vector.options || {}).spec_version,
      stderr,
      stdout,
      version: (vector.options || {}).spec_version,
    });
    const envelope = JSON.parse(stdout.text() || '{}');
    const findings = envelope.findings || [];
    const codes = findings.map((f) => f.code);

    if ((want.findings || []).length > 0) {
      // A refusal: the stated code, the stated severity, and the stated exit.
      for (const one of want.findings) {
        if (!findings.some((f) => f.code === one.code && f.severity === one.severity)) {
          problems.push(`${input.name}: ${one.code} (${one.severity}) not among ${JSON.stringify(codes)}`);
        }
      }
      if (exitCode !== want.exit) problems.push(`${input.name}: exit ${exitCode} != ${want.exit}`);
      if (codes.includes('AGSC-E002')) {
        problems.push(`${input.name}: AGSC-E002 is a usage error and this is a finding (AGSC-09-08)`);
      }
    } else {
      // The control: the registry holds the name and says nothing about it.
      const emit = input.argv[input.argv.indexOf('--emit') + 1];
      if (compose.emitterRefusal(emit) !== null) {
        problems.push(`${input.name}: the registry refused the registered name ${emit}`);
      }
      for (const code of want.codes_absent || []) {
        if (codes.includes(code)) problems.push(`${input.name}: a registered target must not be ${code}`);
      }
      if (want.registry_accepts !== true) problems.push(`${input.name}: the case states no registry verdict`);
      if (!(want.exit_one_of || []).includes(exitCode)) {
        problems.push(`${input.name}: exit ${exitCode} not among ${JSON.stringify(want.exit_one_of)}`);
      }
      const allowed = want.error_codes_allowed || [];
      const other = findings
        .filter((f) => f.severity === 'error' && !allowed.includes(f.code))
        .map((f) => f.code);
      if (other.length > 0) {
        problems.push(`${input.name}: unexpected ${JSON.stringify(other)}; a registered target is`
          + ` rendered or refused with ${JSON.stringify(allowed)} (AGSC-00-20)`);
      }
      if (exitCode === 0 && findings.some((f) => f.severity === 'error')) {
        problems.push(`${input.name}: exit 0 with an error`);
      }
    }
  }
  nodeFs.rmSync(root, { force: true, recursive: true });
  return problems.length === 0
    ? { status: 'pass', detail: '' }
    : { status: 'fail', detail: problems.join('; ') };
}

/**
 * cli-0017 (AGSC-09-94 with AGSC-09-10; supersedes cli-0013, withdrawn for 1.0.0) —
 * `run` and `trace` refused because `run.enabled` is false: exit 2 with `AGSC-E004`,
 * and, the verb being resolved and the code registered, exactly one JCS-canonical
 * envelope on stdout naming the verb, plus the same finding as one object on stderr.
 */
function runCli0017(vector, ctx) {
  const { canonicalize } = require('../../../src/knowledge/jcs.js');
  const scratch = minimalCopy(ctx, 'agsc-cli-0017-');
  const problems = [];
  const byName = new Map((vector.expected.cases || []).map((c) => [c.name, c]));
  try {
    for (const input of vector.input.cases || []) {
      const want = byName.get(input.name);
      const stdout = captureStream();
      const stderr = captureStream();
      const exit = main([...input.argv, '--json'], {
        env: { SOURCE_DATE_EPOCH: '1767225600' },
        ports: { fs: createFileSystem(scratch.root) },
        root: scratch.root,
        specVersion: (vector.options || {}).spec_version,
        stderr,
        stdout,
        version: (vector.options || {}).spec_version,
      });
      if (exit !== want.exit) problems.push(`${input.name}: exit ${exit} != ${want.exit}`);
      let envelope = null;
      try { envelope = JSON.parse(stdout.text()); } catch { /* reported below */ }
      if (envelope === null || stdout.text() !== `${canonicalize(envelope)}\n`) {
        problems.push(`${input.name}: stdout is not exactly one JCS-canonical envelope: ${JSON.stringify(stdout.text())}`);
      } else {
        if (envelope.verb !== want.envelope.verb) problems.push(`${input.name}: verb ${envelope.verb}`);
        if (envelope.status !== want.envelope.status) problems.push(`${input.name}: status ${envelope.status}`);
        const codes = (envelope.findings || []).map((f) => f.code);
        if (JSON.stringify(codes) !== JSON.stringify(want.envelope.codes)) problems.push(`${input.name}: findings ${JSON.stringify(codes)}`);
      }
      const lines = stderr.text().split('\n').filter((l) => l !== '');
      const stderrCodes = [];
      for (const line of lines) {
        try { stderrCodes.push(JSON.parse(line).code); } catch { problems.push(`${input.name}: stderr line is not JSON: ${line}`); }
      }
      if (JSON.stringify(stderrCodes) !== JSON.stringify(want.stderr_codes)) problems.push(`${input.name}: stderr ${JSON.stringify(stderrCodes)}`);
    }
  } finally { scratch.done(); }
  return problems.length === 0 ? { status: 'pass', detail: '' } : { status: 'fail', detail: problems.join('; ') };
}

module.exports = { runCli0016, runCli0017 };
