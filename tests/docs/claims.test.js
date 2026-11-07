'use strict';
// verifies PRD-068
// tests/docs/claims.test.js — the committed results pages pass the claims check that
// docs/BENCHMARKS.md describes: no ranking word in a claims region, and every number of a
// measured region a number of the measurement record (`tools/lint-claims --record`). The
// tool's own tests (tests/tools/lint-claims.test.js) prove it fails a bad page; this file
// proves the pages the repository publishes are not such pages, so an edit that breaks
// one fails the suite rather than waiting for someone to run the command.
//
// Deterministic: runs the shipped tool on committed files; no clock, no network.

const assert = require('node:assert/strict');
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
