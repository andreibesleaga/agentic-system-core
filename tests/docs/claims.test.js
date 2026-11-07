'use strict';
// verifies PRD-068
// tests/docs/claims.test.js — the committed results pages pass the claims check that
// docs/BENCHMARKS.md describes: no ranking word in a claims region, and every number of a
// measured region a number of the measurement record (`tools/lint-claims --record`). The
// tool's own tests (tests/tools/lint-claims.test.js) prove it fails a bad page; this file
// proves the pages the repository publishes are not such pages, so an edit that breaks
// one fails the suite rather than waiting for someone to run the command.
//
// The check holds the measured regions. The prose BENCHMARKS.md gives on the one-command
// run, the agent-side kit and the ACM badges is measured, so a number seeded into it fails;
// the figures of MEASUREMENTS.md that the 1.0.0 run gave and the record does not hold are
// marked as such in their sections, so a reader knows which numbers the record cannot trace.
//
// Deterministic: runs the shipped tool on committed files and on scratch copies of them
// under the system temporary directory; no clock, no network.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..', '..');
const LINT_CLAIMS = path.join(ROOT, 'tools', 'lint-claims');

/** The tool run from the repository root with `args`: its exit code and its JSON envelope. */
function lintClaims(args) {
  const r = spawnSync(process.execPath, [LINT_CLAIMS, '--json', ...args], { cwd: ROOT, encoding: 'utf8' });
  return { code: r.status, report: JSON.parse(r.stdout) };
}

const read = (rel) => fs.readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8');

/** The text of one `## <heading>` section of a page, up to the next `## ` heading. */
function section(text, heading) {
  const start = text.indexOf(`\n## ${heading}`);
  assert.ok(start >= 0, `no section "## ${heading}"`);
  const next = text.indexOf('\n## ', start + 4);
  return text.slice(start, next < 0 ? text.length : next);
}

/** The line of BENCHMARKS.md that starts with `opening`, written into a scratch copy with an unbacked figure after it. */
function seeded(opening) {
  const lines = read('docs/BENCHMARKS.md').split('\n');
  const at = lines.findIndex((l) => l.startsWith(opening));
  assert.ok(at >= 0, `no line of docs/BENCHMARKS.md starts with "${opening}"`);
  lines[at] = `${lines[at]} The run took 47.3 minutes.`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-claims-'));
  process.on('exit', () => { try { fs.rmSync(dir, { force: true, recursive: true }); } catch { /* gone */ } });
  const file = path.join(dir, 'BENCHMARKS.md');
  fs.writeFileSync(file, lines.join('\n'));
  return { file, line: at + 1 };
}

test('tools/lint-claims --record docs/measurements.json docs/BENCHMARKS.md docs/MEASUREMENTS.md exits 0 with no finding', () => {
  const { code, report } = lintClaims(['--record', 'docs/measurements.json', 'docs/BENCHMARKS.md', 'docs/MEASUREMENTS.md']);
  assert.deepEqual(report.findings.map((f) => `${f.file}:${f.line}:${f.col} ${f.code} ${f.message}`), []);
  assert.equal(code, 0);
  assert.equal(report.inputs_read, 2);
});

test('the READMEs of the benchmark kit pass the wording check', () => {
  const { code, report } = lintClaims(['bench/README.md', 'bench/queries/agent-study/README.md']);
  assert.deepEqual(report.findings.map((f) => `${f.file}:${f.line}:${f.col} ${f.code} ${f.message}`), []);
  assert.equal(code, 0);
});

test('a number seeded into the 1.1 prose of BENCHMARKS.md is held to the record', () => {
  for (const opening of ['From a clone of this repository', 'What the command needs besides the clone',
    'The second study asks', '**The dry run.**', 'ACM\'s policy "Artifact Review and Badging"', '| Artifacts Available |']) {
    const { file, line } = seeded(opening);
    const { code, report } = lintClaims(['--record', 'docs/measurements.json', file]);
    assert.equal(code, 1, `"${opening}…": an unbacked figure passes`);
    assert.deepEqual(report.findings.map((f) => `${f.line} ${f.code}`), [`${line} AGSC-E202`], opening);
  }
});

test('MEASUREMENTS.md marks each figure of the 1.0.0 run that the record does not hold', () => {
  const page = read('docs/MEASUREMENTS.md');
  const MARK = '1.0.0 run; not in the record';
  for (const heading of ['4. Build cost', '9. Package size', '11. Cost', 'Summary table']) {
    assert.ok(section(page, heading).includes(MARK), `§ "${heading}" does not mark its figures "${MARK}"`);
  }
  assert.ok(section(page, '9. Package size').split(MARK).length - 1 >= 2, 'both 1.0.0 paragraphs of §9 (install, cold start) are marked');
});
