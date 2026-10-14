'use strict';
// The `cli` cases on the build instant and on the order of findings:
//
//   cli-0020 (AGSC-09-10, AGSC-09-11) — `ci --json` over a Bundle whose findings have
//            no position, a whole-file position and a line of their own: every finding
//            carries the six members, the envelope and stderr agree, and the order is
//            (file, line, col, code) by code point;
//   cli-0021 (AGSC-04-09, AGSC-09-08) — a malformed SOURCE_DATE_EPOCH: exit 2 and
//            AGSC-E603, never a finding;
//   cli-0022 (AGSC-04-09) — no SOURCE_DATE_EPOCH and no git history: the instant is 0
//            with the warning AGSC-E606, and the emitted files say so.
//
// "No git history" is exactly what these handlers give the CLI: the file-system port
// alone and no ProcessRunner, so no git command can run (the same choice `cli-0002`
// makes). The scratch Bundle is a copy of the named fixture plus `input.add_files`.

const path = require('node:path');
const nodeFs = require('node:fs');
const os = require('node:os');
const { main } = require('../../../src/application/cli/main.js');
const { createFileSystem } = require('../../../src/adapters/node-fs.js');
const { captureStream } = require('./_shared.js');
const { subsetOf } = require('./_assert.js');

/** A scratch copy of `input.bundle` with `input.add_files` written over it. */
function scratchBundle(ctx, vector) {
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), `agsc-${vector.id}-`));
  nodeFs.cpSync(path.join((ctx && ctx.root) || '.', 'tests', String(vector.input.bundle)), root, { recursive: true });
  for (const [file, text] of Object.entries(vector.input.add_files || {})) {
    nodeFs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    nodeFs.writeFileSync(path.join(root, file), text);
  }
  return { root, done: () => nodeFs.rmSync(root, { force: true, recursive: true }) };
}

/** One run of the whole CLI over `root`, with exactly the environment the case states. */
function runCli(argv, root, environment, vector) {
  const stdout = captureStream();
  const stderr = captureStream();
  const exit = main(argv, {
    env: { ...(environment || {}) },
    ports: { fs: createFileSystem(root) },
    root,
    specVersion: (vector.options || {}).spec_version,
    stderr,
    stdout,
    version: (vector.options || {}).spec_version,
  });
  let envelope;
  try { envelope = JSON.parse(stdout.text()); } catch (e) { envelope = null; }
  return { envelope, exit, stderr: stderr.text(), stdout: stdout.text() };
}

/** The stderr lines that are finding objects (not the `{override}` lines of `ci`). */
function stderrFindings(text) {
  return text.split('\n').filter((l) => l !== '').map((l) => JSON.parse(l))
    .filter((o) => !Object.prototype.hasOwnProperty.call(o, 'override'));
}

const compareCodePoint = (a, b) => {
  const x = [...String(a)].map((c) => c.codePointAt(0));
  const y = [...String(b)].map((c) => c.codePointAt(0));
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
};

/** Compare two findings by the key the case names, member by member (numbers as numbers). */
function compareBy(keys, a, b) {
  for (const key of keys) {
    const d = typeof a[key] === 'number' && typeof b[key] === 'number' ? a[key] - b[key] : compareCodePoint(a[key], b[key]);
    if (d !== 0) return d;
  }
  return 0;
}

/** True when each `wanted` entry is matched, in this order, by a later finding than the last. */
function inOrder(wanted, findings) {
  let at = 0;
  for (const want of wanted) {
    while (at < findings.length && !subsetOf(want, findings[at])) at += 1;
    if (at === findings.length) return false;
    at += 1;
  }
  return true;
}

const result = (problems) => (problems.length === 0
  ? { status: 'pass', detail: '' } : { status: 'fail', detail: problems.join('; ') });

/** cli-0020 (AGSC-09-10 with AGSC-09-11). */
function runCli0020(vector, ctx) {
  const want = vector.expected;
  const scratch = scratchBundle(ctx, vector);
  const problems = [];
  try {
    if (vector.input.git_history !== false) problems.push('the case runs only without git history');
    const got = runCli(vector.input.argv, scratch.root, vector.input.environment, vector);
    const findings = (got.envelope && got.envelope.findings) || [];
    if (got.exit !== want.exit) problems.push(`exit ${got.exit} != ${want.exit}`);
    for (const f of findings) {
      const missing = want.finding_members.filter((m) => !Object.prototype.hasOwnProperty.call(f, m));
      if (missing.length > 0) problems.push(`finding lacks ${missing.join(', ')}: ${JSON.stringify(f)}`);
    }
    for (let i = 1; i < findings.length; i += 1) {
      if (compareBy(want.ordered_by, findings[i - 1], findings[i]) > 0) {
        problems.push(`out of order: ${JSON.stringify(findings[i - 1])} before ${JSON.stringify(findings[i])}`);
      }
    }
    for (const one of want.findings) {
      if (!findings.some((f) => subsetOf(one, f))) problems.push(`no finding matches ${JSON.stringify(one)}`);
    }
    if (!inOrder(want.findings_in_order, findings)) {
      problems.push(`findings_in_order not met by ${JSON.stringify(findings.map((f) => [f.file, f.line, f.col, f.code]))}`);
    }
    const key = (f) => JSON.stringify([f.file, f.line, f.col, f.code, f.severity]);
    const lines = stderrFindings(got.stderr).map(key);
    const same = lines.length === findings.length && lines.every((k, i) => k === key(findings[i]));
    if (same !== want.stderr_lines_match_findings) problems.push(`stderr lines ${JSON.stringify(lines)} vs envelope`);
  } finally { scratch.done(); }
  return result(problems);
}

/** cli-0021 (AGSC-04-09 with AGSC-09-08). */
function runCli0021(vector, ctx) {
  const scratch = scratchBundle(ctx, vector);
  const problems = [];
  const byName = new Map(vector.expected.cases.map((c) => [c.name, c]));
  try {
    for (const input of vector.input.cases) {
      const want = byName.get(input.name);
      if (want === undefined) { problems.push(`${input.name}: no expected case`); continue; }
      const got = runCli(input.argv, scratch.root, input.environment, vector);
      if (got.exit !== want.exit) problems.push(`${input.name}: exit ${got.exit} != ${want.exit}`);
      if (!got.stderr.includes(want.error)) problems.push(`${input.name}: stderr does not name ${want.error}`);
      const asFinding = ((got.envelope && got.envelope.findings) || []).some((f) => f.code === want.error);
      if (asFinding === want.not_a_finding) problems.push(`${input.name}: ${want.error} reported as a finding`);
    }
  } finally { scratch.done(); }
  return result(problems);
}

/** cli-0022 (AGSC-04-09). */
function runCli0022(vector, ctx) {
  const want = vector.expected;
  const scratch = scratchBundle(ctx, vector);
  const problems = [];
  try {
    if (vector.input.git_history !== false) problems.push('the case runs only without git history');
    const got = runCli(vector.input.argv, scratch.root, vector.input.environment, vector);
    const findings = (got.envelope && got.envelope.findings) || [];
    if (got.exit !== want.exit) problems.push(`exit ${got.exit} != ${want.exit}: ${got.stderr.trim()}`);
    for (const one of want.findings) {
      if (!findings.some((f) => subsetOf(one, f))) problems.push(`no finding matches ${JSON.stringify(one)} in ${JSON.stringify(findings)}`);
    }
    const config = JSON.parse(nodeFs.readFileSync(path.join(scratch.root, 'agsc.config.json'), 'utf8'));
    const out = path.join(scratch.root, (config.build && config.build.out) || 'dist');
    for (const [route, texts] of Object.entries(want.files_contain)) {
      const file = path.join(out, ...route.split('/').filter(Boolean));
      const bytes = nodeFs.existsSync(file) ? nodeFs.readFileSync(file, 'utf8') : null;
      for (const text of texts) {
        if (bytes === null || !bytes.includes(text)) problems.push(`${route} does not contain ${JSON.stringify(text)}`);
      }
    }
  } finally { scratch.done(); }
  return result(problems);
}

module.exports = { runCli0020, runCli0021, runCli0022 };
