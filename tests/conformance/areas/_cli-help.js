'use strict';
// tests/conformance/areas/_cli-help.js — cli-0036 (AGSC-09-07, AGSC-09-09): `--help` is a
// flag and `help` is not a seventeenth verb. Kept beside `cli.js`, which is at its line limit.

const { main } = require('../../../src/application/cli/main.js');
const { captureStream } = require('./_shared.js');

/**
 * Each case runs `argv` through the real shell. A case with `error` is a refusal: the
 * code is on stderr and the exit code is the case's. Every other case prints to stdout,
 * which holds each name `stdout_contains` lists (names only, never wording).
 */
function runCli0036(vector) {
  const problems = [];
  const byName = new Map(vector.input.cases.map((c) => [c.name, c]));
  for (const want of vector.expected.cases) {
    const stdout = captureStream();
    const stderr = captureStream();
    const exit = main(byName.get(want.name).argv, { ports: undefined, env: {}, stdout, stderr, root: '.' });
    if (exit !== want.exit) problems.push(`${want.name}: exit ${exit} != ${want.exit}`);
    if (want.error !== undefined && !stderr.text().includes(want.error)) {
      problems.push(`${want.name}: stderr does not mention ${want.error}`);
    }
    const missing = (want.stdout_contains || []).filter((name) => !stdout.text().includes(name));
    if (missing.length > 0) problems.push(`${want.name}: stdout lacks ${missing.join(' ')}`);
  }
  return problems.length === 0 ? { status: 'pass', detail: '' } : { status: 'fail', detail: problems.join('; ') };
}

module.exports = { runCli0036 };
