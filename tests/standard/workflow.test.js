'use strict';
// AGSC-09-92 for this distribution: its own CI runs every validator on every pull
// request, and a failure fails the check. The workflows are read as data; they run
// on GitHub, never here.
//
// The rest of this file keeps the two lanes honest about what they promise:
//   - every step of the release gates also runs on every push, on the same legs;
//   - the check contexts that branch protection requires are still produced, so a
//     renamed job can never block every pull request;
//   - the coverage bar (NFR-03) is enforced inside a required leg, by the script
//     whose thresholds CONTRIBUTING.md states;
//   - every leg packs both packages and installs the two tarballs together, so the
//     tag push is never the first time the packed files are installed;
//   - the Node line after 24 is tested too, as a leg of its own.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const ROOT = path.resolve(__dirname, '..', '..');
const FILE = path.join(ROOT, '.github', 'workflows', 'test.yml');
const RELEASE = path.join(ROOT, '.github', 'workflows', 'release.yml');

const load = (file) => YAML.parse(fs.readFileSync(file, 'utf8'));

/**
 * The status-check contexts that branch protection on `main` requires, exactly as
 * they were read from the live settings on 9 Oct 2026. A job that stops producing
 * one of them blocks every pull request, so none may be renamed or dropped.
 */
const REQUIRED_CONTEXTS = Object.freeze([
  'actionlint (the workflow files)',
  'test (macos-latest, Node 22.13.0)',
  'test (macos-latest, Node 24)',
  'test (ubuntu-latest, Node 22.13.0)',
  'test (ubuntu-latest, Node 24)',
  'test (windows-latest, Node 22.13.0)',
  'test (windows-latest, Node 24)',
]);

/** The leg that measures coverage: an existing required context, never a new job. */
const COVERAGE_LEG = Object.freeze({ node: '24', os: 'ubuntu-latest' });

/** The coverage bar of NFR-03 and CONTRIBUTING.md, as the `test:coverage` script states it. */
const COVERAGE = Object.freeze({ branches: 93, functions: 99, lines: 99.9 });

/** Every combination of a job's matrix (`include`/`exclude` are not used by these workflows). */
function legs(job) {
  const matrix = (job.strategy && job.strategy.matrix) || {};
  assert.ok(!('include' in matrix) && !('exclude' in matrix), 'expand include/exclude here before using them');
  return Object.entries(matrix).reduce(
    (acc, [key, values]) => acc.flatMap((leg) => values.map((v) => ({ ...leg, [key]: String(v) }))), [{}]);
}

/** The check-run names a job produces: its `name`, with `${{ matrix.x }}` filled per leg. */
function contexts(id, job) {
  const name = job.name || id;
  return legs(job).map((leg) => name.replace(/\$\{\{\s*matrix\.(\w+)\s*\}\}/gu, (_, key) => leg[key]));
}

/**
 * Evaluates a step's `if:` for one leg. Only the grammar these workflows use is
 * read — `matrix.<key> == '<value>'`, `!=`, `&&`, `||`, `!` and parentheses,
 * optionally inside `${{ }}` — and anything else fails the test rather than being
 * guessed at.
 */
function runsOn(step, leg) {
  if (step.if === undefined) return true;
  const source = String(step.if).trim().replace(/^\$\{\{([\s\S]*)\}\}$/u, '$1');
  const tokens = source.match(/matrix\.\w+|'[^']*'|==|!=|&&|\|\||!|\(|\)|\S+/gu);
  let at = 0;
  const peek = () => tokens[at];
  const take = (want) => {
    assert.ok(want === undefined || tokens[at] === want, `if: ${step.if} — expected ${want} at ${tokens[at]}`);
    at += 1;
    return tokens[at - 1];
  };
  const value = () => {
    const token = take();
    if (/^matrix\.\w+$/u.test(token)) return leg[token.slice('matrix.'.length)];
    assert.match(token, /^'[^']*'$/u, `if: ${step.if} — unsupported token ${token}`);
    return token.slice(1, -1);
  };
  const unary = () => {
    if (peek() === '!') { take('!'); return !unary(); }
    if (peek() === '(') { take('('); const inner = or(); take(')'); return inner; }
    const left = value();
    const op = take();
    assert.ok(op === '==' || op === '!=', `if: ${step.if} — unsupported operator ${op}`);
    return op === '==' ? left === value() : left !== value();
  };
  const and = () => { let v = unary(); while (peek() === '&&') { take('&&'); v = unary() && v; } return v; };
  const or = () => { let v = and(); while (peek() === '||') { take('||'); v = and() || v; } return v; };
  const result = or();
  assert.strictEqual(at, tokens.length, `if: ${step.if} — trailing tokens`);
  return result;
}

const sameLeg = (a, b) => a.os === b.os && a.node === b.node;

test('AGSC-09-92: the test workflow runs every validator, the suite and the rule matrix on every push and pull request', () => {
  const workflow = load(FILE);
  assert.ok('pull_request' in workflow.on && 'push' in workflow.on);
  assert.deepStrictEqual(workflow.permissions, { contents: 'read' });
  const job = workflow.jobs.test;
  assert.deepStrictEqual(job.strategy.matrix.os.slice().sort(), ['macos-latest', 'ubuntu-latest', 'windows-latest']);
  assert.ok(job.strategy.matrix.node.some((n) => String(n).startsWith('22')) && job.strategy.matrix.node.includes('24'));
  for (const step of job.steps.filter((s) => s.uses)) {
    assert.match(step.uses, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/u, `${step.uses} is not pinned to a commit`);
  }
  const script = job.steps.map((s) => s.run || '').join('\n');
  assert.match(script, /npm ci/u);
  assert.match(script, /npm test/u);
  assert.match(script, /node tools\/rule-coverage --check/u);
  const validators = fs.readdirSync(path.join(ROOT, 'tools')).filter((n) => n.startsWith('validate-'));
  assert.strictEqual(validators.length, 7);
  // The release gate's loop `for t in tools/validate-*` runs every validator but the one
  // that needs an argument, which has its own steps; a validator named one by one also counts.
  const loop = /for t in tools\/validate-\*; do\n\s+case "\$t" in \*\/validate-wellknown\) continue ;; esac\n\s+node "\$t" --json\n\s*done/u.test(script);
  for (const name of validators) {
    assert.ok(script.includes(name) || (loop && name !== 'validate-wellknown'), `${name} is not run by the workflow`);
  }
});

// The rc.6 release failed on Windows because fourteen gate steps of the release
// workflow ran only on the tag push, after the permanent tag was public. Every step of
// the release gates therefore runs on every push, on the same legs and under the same
// condition, so a tag is never the first time a gate runs.
test('every step of the release gates also runs on every push, on the same legs and under the same condition', () => {
  const release = load(RELEASE).jobs.verify;
  const push = load(FILE).jobs.test;
  assert.deepStrictEqual(push.strategy.matrix, release.strategy.matrix, 'the same operating systems and Node lines');
  const norm = (step) => JSON.stringify({
    env: step.env || {}, if: step.if === undefined ? null : String(step.if).trim(),
    run: String(step.run).trim(), shell: step.shell || null,
  });
  const onPush = new Set(push.steps.filter((s) => s.run).map(norm));
  const gates = release.steps.filter((s) => s.run);
  assert.ok(gates.length >= 14, `only ${gates.length} release gate steps were read`);
  const missing = gates.filter((s) => !onPush.has(norm(s))).map((s) => s.name || s.run);
  assert.deepStrictEqual(missing, [], `release gate steps the push workflow does not run: ${missing.join(' | ')}`);
});

test('every check context that branch protection requires is still produced by the test workflow', () => {
  const workflow = load(FILE);
  const produced = Object.entries(workflow.jobs).flatMap(([id, job]) => contexts(id, job));
  const missing = REQUIRED_CONTEXTS.filter((c) => !produced.includes(c));
  assert.deepStrictEqual(missing, [], `required contexts no job produces: ${missing.join(' | ')}`);
  // The six required legs are still the whole of the 22.13.0 and 24 lines: a new line
  // adds legs of its own and renames none.
  const testLegs = contexts('test', workflow.jobs.test);
  assert.deepStrictEqual(testLegs.filter((c) => /Node (22\.13\.0|24)\)$/u.test(c)).sort(),
    REQUIRED_CONTEXTS.filter((c) => c.startsWith('test (')).slice().sort());
});

test('NFR-03: coverage is enforced inside the required leg test (ubuntu-latest, Node 24), in place of npm test', () => {
  for (const [file, id] of [[FILE, 'test'], [RELEASE, 'verify']]) {
    const job = load(file).jobs[id];
    const suite = job.steps.filter((s) => s.run && String(s.run).trim() === 'npm test');
    const coverage = job.steps.filter((s) => s.run && String(s.run).trim() === 'npm run test:coverage');
    assert.strictEqual(coverage.length, 1, `${path.basename(file)}: one coverage step`);
    for (const leg of legs(job)) {
      const suites = suite.filter((s) => runsOn(s, leg)).length;
      const measured = coverage.filter((s) => runsOn(s, leg)).length;
      const label = `${path.basename(file)} (${leg.os}, Node ${leg.node})`;
      assert.strictEqual(suites + measured, 1, `${label}: the suite runs exactly once`);
      assert.strictEqual(measured, sameLeg(leg, COVERAGE_LEG) ? 1 : 0, `${label}: coverage runs on ${COVERAGE_LEG.os}, Node ${COVERAGE_LEG.node} only`);
    }
  }
  assert.ok(contexts('test', load(FILE).jobs.test).includes(`test (${COVERAGE_LEG.os}, Node ${COVERAGE_LEG.node})`));
  assert.ok(REQUIRED_CONTEXTS.includes(`test (${COVERAGE_LEG.os}, Node ${COVERAGE_LEG.node})`), 'the coverage leg is required');
});

test('NFR-03: the coverage script runs the whole suite and fails below the three thresholds', () => {
  const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts;
  const script = scripts['test:coverage'];
  // The same files `npm test` runs, so the coverage leg loses no test by replacing it.
  const glob = /"tests\/\*\*\/\*\.test\.js"/u;
  assert.match(scripts.test, glob);
  assert.match(script, glob);
  // Node reads its own threshold flags as whole numbers, so the bar runner takes them.
  assert.match(script, /^node tests\/_coverage-bar\.js /u);
  assert.match(script, /--test-coverage-include="src\/\*\*"/u);
  for (const [name, value] of Object.entries(COVERAGE)) {
    const flag = new RegExp(`--test-coverage-${name}=([0-9.]+)(?= |$)`, 'u').exec(script);
    assert.ok(flag, `test:coverage carries no --test-coverage-${name}`);
    assert.strictEqual(Number(flag[1]), value, `--test-coverage-${name}`);
  }
});

test('NFR-03: the bar runner compares each total with its threshold to the decimal', () => {
  const bar = require('../_coverage-bar.js');
  const lcov = (lf, lh, fnf, fnh, brf, brh) => ['TN:', 'SF:/x/src/a.js', `FNF:${fnf}`, `FNH:${fnh}`,
    `BRF:${brf}`, `BRH:${brh}`, `LF:${lf}`, `LH:${lh}`, 'end_of_record', ''].join('\n');
  // Two files: 9989 of 10000 lines is 99.89 %, below 99.9 although Node would pass it.
  const report = lcov(5000, 5000, 100, 99, 100, 93) + lcov(5000, 4989, 100, 100, 100, 94);
  const sum = bar.totals(report);
  assert.deepStrictEqual(sum, { BRF: 200, BRH: 187, FNF: 200, FNH: 199, LF: 10000, LH: 9989, files: 2 });
  const below = bar.verdict(sum, COVERAGE);
  assert.strictEqual(below.ok, false);
  assert.deepStrictEqual(below.rows.map((r) => [r.flag, r.ok]), [['lines', false], ['functions', true], ['branches', true]]);
  assert.match(bar.describe(sum, below), /lines 99\.89 % \(bar 99\.9 %, BELOW\).*: fail$/u);
  // Exactly on the bar passes; an empty measure counts as fully covered.
  assert.strictEqual(bar.verdict({ ...sum, LH: 9990 }, COVERAGE).ok, true);
  assert.strictEqual(bar.verdict({ ...sum, BRF: 0, BRH: 0, LH: 9990 }, COVERAGE).rows[2].percent, 100);
  // CRLF line ends read the same.
  assert.deepStrictEqual(bar.totals(report.replace(/\n/gu, '\r\n')), sum);
});

test('NFR-03: the bar runner takes the three thresholds and passes every other argument to node --test', () => {
  const bar = require('../_coverage-bar.js');
  const parsed = bar.parseArgs(['--test-coverage-include=src/**', '--test-coverage-lines=99.9',
    '--test-coverage-functions=99', '--test-coverage-branches=93', 'tests/**/*.test.js']);
  assert.deepStrictEqual(parsed, {
    errors: [], rest: ['--test-coverage-include=src/**', 'tests/**/*.test.js'],
    thresholds: { branches: 93, functions: 99, lines: 99.9 },
  });
  assert.deepStrictEqual(bar.parseArgs(['--test-coverage-lines=abc', '--test-coverage-functions=101']).errors, [
    '--test-coverage-lines needs a percentage from 0 to 100, not "abc"',
    '--test-coverage-functions needs a percentage from 0 to 100, not "101"',
    '--test-coverage-branches=<n> is required',
  ]);
  const quiet = { write: () => {} };
  assert.strictEqual(bar.main(['tests/x.test.js'], { stderr: quiet, stdout: quiet }), 2, 'a usage fault is exit 2');
});

test('NFR-03: the bar runner passes on a report at the bar, fails below it, and keeps a failing run\'s exit code', () => {
  const bar = require('../_coverage-bar.js');
  const args = ['--test-coverage-lines=99.9', '--test-coverage-functions=99', '--test-coverage-branches=93', 't.test.js'];
  const runWith = (status, body) => (exe, argv) => {
    assert.strictEqual(exe, process.execPath);
    assert.deepStrictEqual(argv.slice(0, 2), ['--test', '--experimental-test-coverage']);
    assert.strictEqual(argv.at(-1), 't.test.js');
    assert.ok(!argv.some((a) => /^--test-coverage-(lines|functions|branches)=/u.test(a)), 'Node is not handed the thresholds');
    const report = argv.find((a) => a.startsWith('--test-reporter-destination=') && a.endsWith('lcov.info'));
    assert.ok(report, 'an LCOV report is asked for');
    if (body !== null) fs.writeFileSync(report.slice('--test-reporter-destination='.length), body);
    return { status };
  };
  const record = (lh) => `SF:a.js\nFNF:1\nFNH:1\nBRF:1\nBRH:1\nLF:1000\nLH:${lh}\nend_of_record\n`;
  let out = '';
  let err = '';
  const io = { stderr: { write: (s) => { err += s; } }, stdout: { write: (s) => { out += s; } } };
  assert.strictEqual(bar.main(args, { ...io, run: runWith(0, record(999)) }), 0);
  assert.match(out, /lines 99\.90 % \(bar 99\.9 %\).*: pass/u);
  assert.strictEqual(bar.main(args, { ...io, run: runWith(0, record(998)) }), 1);
  assert.match(err, /lines 99\.80 % \(bar 99\.9 %, BELOW\)/u);
  assert.strictEqual(bar.main(args, { ...io, run: runWith(7, null) }), 7, 'the test run\'s own exit code');
  assert.strictEqual(bar.main(args, { ...io, run: runWith(0, null) }), 1, 'no report is a failure');
  assert.match(err, /wrote no coverage report/u);
});

test('every leg packs both packages and installs the two tarballs together, then runs every command they install', () => {
  for (const [file, id] of [[FILE, 'test'], [RELEASE, 'verify']]) {
    const job = load(file).jobs[id];
    const packing = job.steps.filter((s) => s.run && /npm pack/u.test(s.run));
    assert.strictEqual(packing.length, 1, `${path.basename(file)}: one pack-and-install step`);
    const [step] = packing;
    assert.strictEqual(step.if, undefined, `${path.basename(file)}: the packed install runs on every leg`);
    assert.strictEqual(step.shell, 'bash', 'one shell on all three systems');
    const run = String(step.run);
    assert.match(run, /set -euo pipefail/u);
    assert.match(run, /npm pack --pack-destination "\$dest"\n/u, 'the engine is packed into the runner temp folder');
    assert.match(run, /npm pack --pack-destination "\$dest" \.\/packages\/agsc-cli\n/u, 'the alias is packed too');
    assert.match(run, /dest="\$RUNNER_TEMP\/[\w-]+"/u);
    assert.match(run, /npm install [^\n]*"\$dest\/agentic-system-core-\$version\.tgz" "\$dest\/agsc-cli-\$version\.tgz"/u,
      'both tarballs are installed together, in one command');
    assert.ok(!/npm (ci|install)[^\n]*--ignore-scripts/u.test(run), 'the install is the one a user runs');
    // The two packages declare a command named `agsc` each, so the alias's own file is
    // also run by path: its forwarding to the installed engine is what it ships for.
    for (const command of [/npx --no-install agsc --version/u, /npx --no-install agentic-system-core --version/u,
      /npx --no-install agsc-cli --version/u, /node node_modules\/agsc-cli\/bin\/agsc\.js --version/u]) {
      assert.match(run, command);
    }
    // Each command must print the packed version, not merely exit 0.
    assert.strictEqual((run.match(/= "agsc \$version"/gu) || []).length, 4, 'all four print "agsc <version>"');
  }
});

test('the Node line after 24 is a leg of both lanes, and the floor stays the lowest', () => {
  for (const [file, id] of [[FILE, 'test'], [RELEASE, 'verify']]) {
    const nodes = load(file).jobs[id].strategy.matrix.node.map(String);
    assert.deepStrictEqual(nodes, ['22.13.0', '24', '26'], `${path.basename(file)}: Node lines`);
  }
});
