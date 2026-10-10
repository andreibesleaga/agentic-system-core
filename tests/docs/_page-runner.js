'use strict';
// tests/docs/_page-runner.js — runs the commands a documentation page shows and
// compares what they printed with the lines the page quotes. Shared by
// demos.test.js (docs/DEMOS.md) and guides.test.js (docs/guides/*.md).
//
// A fenced block opened with ```bash demo (or with more backticks, when the step
// itself writes a file that holds a fence) is a runnable step; the ```text expect
// block after it lists lines that must appear, exactly, in what the step printed
// (standard output and standard error together). Steps run in order, in one shell,
// in a fresh scratch directory under the system temporary directory, with an empty
// git identity, no network and `agsc` resolved to this repository's own command line.
// A plain ```bash block is shown, not run. Every Node process a step starts runs under
// the network trap of tests/acceptance/steps/_offline.js, which refuses and records
// every network call; a page whose steps recorded one fails, even when the step caught
// the refusal and went on.
//
// DOCS_ENGINE_PACKAGE, when set, names an installed copy of the package (for example
// node_modules/agentic-system-core after installing the packed tarball): `agsc`,
// `agsc-host` and $ENGINE then come from that copy instead of this repository, so
// the pages can be checked against the package exactly as it will be published.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const OFFLINE = path.join(ROOT, 'tests', 'acceptance', 'steps', '_offline.js');
const PACKAGE = process.env.DOCS_ENGINE_PACKAGE ? path.resolve(process.env.DOCS_ENGINE_PACKAGE) : ROOT;

const BASH = process.platform === 'win32' ? null : spawnSync('bash', ['-c', 'echo ok'], { encoding: 'utf8' });
const SKIP = process.platform === 'win32'
  ? 'the pages are written for a POSIX shell; run them by hand in Git Bash'
  : (BASH && BASH.status === 0 ? false : 'bash is not on the PATH');

/**
 * The runs of a page: heading → ordered steps, each a script with its expected lines.
 * With `whole`, the page is one run under that name (its `##` headings are sections of
 * one walk-through); otherwise every `##` heading starts a run of its own.
 */
function parse(markdown, { whole } = {}) {
  const demos = [];
  let demo = whole ? { heading: whole, steps: [] } : null;
  if (demo) demos.push(demo);
  let fence = null;
  for (const line of markdown.split('\n')) {
    if (fence) {
      if (line === fence.close) {
        if (fence.kind === 'demo') demo.steps.push({ expect: [], script: fence.lines.join('\n') });
        else if (fence.kind === 'expect') demo.steps[demo.steps.length - 1].expect.push(...fence.lines.map((l) => l.replace(/\s+$/u, '')).filter((l) => l !== ''));
        fence = null;
      } else {
        fence.lines.push(line);
      }
      continue;
    }
    const open = /^(`{3,})(.*)$/u.exec(line);
    if (line.startsWith('## ') && !whole) {
      demo = { heading: line.slice(3).trim(), steps: [] };
      demos.push(demo);
    } else if (open && open[2] === 'bash demo') {
      assert.ok(demo, 'a runnable block before the first heading');
      fence = { close: open[1], kind: 'demo', lines: [] };
    } else if (open && open[2] === 'text expect') {
      assert.ok(demo && demo.steps.length > 0, `an expect block with no runnable block before it under "${demo && demo.heading}"`);
      fence = { close: open[1], kind: 'expect', lines: [] };
    } else if (open) {
      fence = { close: open[1], kind: 'shown', lines: [] };
    }
  }
  return demos.filter((d) => d.steps.length > 0);
}

/** Where the steps of a run in `scratch` record the network calls the trap refused (beside it, not in it). */
const trapOf = (scratch) => `${scratch}.network-attempts.txt`;

/**
 * The environment of a run: empty git identity, `agsc` on the PATH, the network trap,
 * the build instant if given.
 */
function environment(scratch, epoch) {
  const shims = path.join(scratch, 'bin');
  fs.mkdirSync(shims);
  for (const name of ['agsc', 'agsc-host']) {
    const shim = path.join(shims, name);
    fs.writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${path.join(PACKAGE, 'bin', `${name}.js`)}" "$@"\n`);
    fs.chmodSync(shim, 0o755);
  }
  fs.writeFileSync(path.join(scratch, '.gitconfig-empty'), '');
  const env = {
    ACCEPTANCE_NETWORK_TRAP: trapOf(scratch),
    ENGINE: PACKAGE,
    GIT_AUTHOR_DATE: '2026-09-01T10:00:00Z',
    GIT_AUTHOR_EMAIL: 'operator@example.org',
    GIT_AUTHOR_NAME: 'Operator',
    GIT_COMMITTER_DATE: '2026-09-01T10:00:00Z',
    GIT_COMMITTER_EMAIL: 'operator@example.org',
    GIT_COMMITTER_NAME: 'Operator',
    GIT_CONFIG_GLOBAL: path.join(scratch, '.gitconfig-empty'),
    GIT_CONFIG_NOSYSTEM: '1',
    HOME: scratch,
    NODE_OPTIONS: `--require ${JSON.stringify(OFFLINE)}`,
    NO_COLOR: '1',
    PATH: `${shims}${path.delimiter}${process.env.PATH}`,
  };
  if (epoch) env.SOURCE_DATE_EPOCH = epoch;
  return env;
}

/** Run one demo's steps in one shell and split what they printed, step by step. */
function run(demo, scratch, epoch) {
  const script = ['set -e', 'exec 2>&1', ...demo.steps.map((step, i) => `printf '\\n@@step %s\\n' ${i}\n${step.script}`)].join('\n');
  const r = spawnSync('bash', ['-s'], { cwd: scratch, encoding: 'utf8', env: environment(scratch, epoch), input: `${script}\n` });
  const parts = r.stdout.split(/\n@@step \d+\n/u).slice(1);
  return { outputs: parts.map((p) => p.split('\n').map((l) => l.replace(/\s+$/u, ''))), status: r.status, stdout: r.stdout };
}

/** Run one demo in a fresh scratch directory and assert every expected line was printed. */
function check(demo, { epoch, prefix }) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    const { outputs, status, stdout } = run(demo, scratch, epoch);
    const trap = trapOf(scratch);
    const attempts = fs.existsSync(trap) ? fs.readFileSync(trap, 'utf8').split('\n').filter(Boolean) : [];
    assert.deepStrictEqual(attempts, [], `a step of "${demo.heading}" reached for the network: ${attempts.join(', ')}`);
    assert.strictEqual(status, 0, `a step failed:\n${stdout.slice(-3000)}`);
    assert.strictEqual(outputs.length, demo.steps.length, 'a step printed no marker');
    demo.steps.forEach((step, i) => {
      for (const line of step.expect) {
        assert.ok(outputs[i].includes(line), `step ${i + 1} of "${demo.heading}" did not print the line\n  ${line}\nit printed:\n${outputs[i].join('\n')}`);
      }
    });
  } finally {
    fs.rmSync(scratch, { force: true, recursive: true });
    fs.rmSync(trapOf(scratch), { force: true });
  }
}

module.exports = { PACKAGE, ROOT, SKIP, check, environment, parse };
