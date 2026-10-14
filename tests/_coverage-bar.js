'use strict';
// The coverage bar, to the decimal: `npm run test:coverage`.
//
//   node tests/_coverage-bar.js --test-coverage-lines=<n> --test-coverage-functions=<n>
//     --test-coverage-branches=<n> [any other `node --test` argument …]
//
// Node's test runner takes the same three threshold flags, but it reads each one as a
// whole number: `--test-coverage-lines=99.9` fails only below 99 %. So this script
// takes the three flags itself, runs `node --test --experimental-test-coverage` with
// every other argument unchanged — the spec report on stdout as usual, and an LCOV
// report into a temporary folder — then sums that report over every measured file
// (lines LH/LF, functions FNH/FNF, branches BRH/BRF; the totals Node prints on its
// "all files" row) and fails when any total is below its threshold as written.
//
// Exit: the test run's own code when the tests fail; otherwise 1 when a total is below
// its threshold or the report is missing, 0 when all three hold; 2 on a usage fault.
// Deterministic and offline: nothing is read but the report; the folder is removed.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/** The three measures, in the order they are reported. */
const MEASURES = Object.freeze([
  { flag: 'lines', found: 'LF', hit: 'LH' },
  { flag: 'functions', found: 'FNF', hit: 'FNH' },
  { flag: 'branches', found: 'BRF', hit: 'BRH' },
]);

/**
 * Splits the arguments into the three thresholds and the rest.
 *
 * @param {string[]} args
 * @returns {{thresholds: Record<string, number>, rest: string[], errors: string[]}}
 */
function parseArgs(args) {
  const thresholds = {};
  const rest = [];
  const errors = [];
  const seen = new Set();
  for (const arg of args) {
    const m = /^--test-coverage-(lines|functions|branches)=(.*)$/u.exec(arg);
    if (m === null) { rest.push(arg); continue; }
    seen.add(m[1]);
    const value = /^\d+(?:\.\d+)?$/u.test(m[2]) ? Number(m[2]) : NaN;
    if (value >= 0 && value <= 100) thresholds[m[1]] = value;
    else errors.push(`--test-coverage-${m[1]} needs a percentage from 0 to 100, not "${m[2]}"`);
  }
  for (const { flag } of MEASURES) {
    if (!seen.has(flag)) errors.push(`--test-coverage-${flag}=<n> is required`);
  }
  return { errors, rest, thresholds };
}

/**
 * The totals of an LCOV report: every `LF`/`LH`/`FNF`/`FNH`/`BRF`/`BRH` record summed.
 *
 * @param {string} text
 * @returns {{files: number, LF: number, LH: number, FNF: number, FNH: number, BRF: number, BRH: number}}
 */
function totals(text) {
  const sum = { BRF: 0, BRH: 0, FNF: 0, FNH: 0, LF: 0, LH: 0, files: 0 };
  for (const line of text.split(/\r?\n/u)) {
    if (line.startsWith('SF:')) sum.files += 1;
    const m = /^(LF|LH|FNF|FNH|BRF|BRH):(\d+)$/u.exec(line);
    if (m !== null) sum[m[1]] += Number(m[2]);
  }
  return sum;
}

/**
 * Each measure's percentage against its threshold. A measure with nothing to cover
 * counts as fully covered. The comparison is exact: 99.89 % is below a threshold of 99.9.
 *
 * @returns {{ok: boolean, rows: Array<{flag: string, percent: number, threshold: number, ok: boolean}>}}
 */
function verdict(sum, thresholds) {
  const rows = MEASURES.map(({ flag, found, hit }) => {
    const percent = sum[found] === 0 ? 100 : (100 * sum[hit]) / sum[found];
    return { flag, ok: percent >= thresholds[flag], percent, threshold: thresholds[flag] };
  });
  return { ok: rows.every((r) => r.ok), rows };
}

/** One line for the log: what was measured, against what, and the result. */
function describe(sum, result) {
  const parts = result.rows.map((r) => `${r.flag} ${r.percent.toFixed(2)} % (bar ${r.threshold} %${r.ok ? '' : ', BELOW'})`);
  return `coverage of ${sum.files} files: ${parts.join(', ')}: ${result.ok ? 'pass' : 'fail'}`;
}

function main(args, { stdout = process.stdout, stderr = process.stderr, run = spawnSync } = {}) {
  const { errors, rest, thresholds } = parseArgs(args);
  if (errors.length > 0) {
    for (const e of errors) stderr.write(`_coverage-bar: ${e}\n`);
    return 2;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-coverage-'));
  try {
    const report = path.join(dir, 'lcov.info');
    const child = run(process.execPath, [
      '--test', '--experimental-test-coverage',
      '--test-reporter=spec', '--test-reporter-destination=stdout',
      '--test-reporter=lcov', `--test-reporter-destination=${report}`,
      ...rest,
    ], { stdio: 'inherit' });
    if (child.status !== 0) return child.status === null ? 1 : child.status;
    if (!fs.existsSync(report)) {
      stderr.write('_coverage-bar: the test run wrote no coverage report\n');
      return 1;
    }
    const sum = totals(fs.readFileSync(report, 'utf8'));
    const result = verdict(sum, thresholds);
    (result.ok ? stdout : stderr).write(`${describe(sum, result)}\n`);
    return result.ok ? 0 : 1;
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { MEASURES, describe, main, parseArgs, totals, verdict };
