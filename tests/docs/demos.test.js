'use strict';
// tests/docs/demos.test.js — every command in docs/DEMOS.md is run, and every line
// the page says to expect is compared with what the command printed.
//
// The page holds one demo per `##` heading. A fenced block opened with
// ```bash demo is a runnable step of that demo; the ```text expect block after it
// lists lines that must appear, exactly, in what the step printed (standard output
// and standard error together). A demo's steps run in order, in one shell, in a
// fresh scratch directory under the system temporary directory, with the fixed build
// instant the page names, an empty git identity, no network and `agsc` resolved to
// this repository's own command line. A demo that needs a browser, a forge or a
// model key has no runnable block, so the page can only promise what this test has
// seen. Skipped on Windows, where the demos are written for a POSIX shell.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const PAGE = path.join(ROOT, 'docs', 'DEMOS.md');
/** 2026-09-14T10:00:00Z — the build instant docs/DEMOS.md names. */
const EPOCH = '1789380000';

const BASH = process.platform === 'win32' ? null : spawnSync('bash', ['-c', 'echo ok'], { encoding: 'utf8' });
const SKIP = process.platform === 'win32'
  ? 'the demos are written for a POSIX shell; run them by hand in Git Bash'
  : (BASH && BASH.status === 0 ? false : 'bash is not on the PATH');

/** The demos of the page: heading → ordered steps, each a script with its expected lines. */
function parse(markdown) {
  const demos = [];
  let demo = null;
  let fence = null;
  for (const line of markdown.split('\n')) {
    if (fence) {
      if (line.startsWith('```')) {
        if (fence.kind === 'demo') demo.steps.push({ expect: [], script: fence.lines.join('\n') });
        else demo.steps[demo.steps.length - 1].expect.push(...fence.lines.map((l) => l.replace(/\s+$/u, '')).filter((l) => l !== ''));
        fence = null;
      } else {
        fence.lines.push(line);
      }
      continue;
    }
    if (line.startsWith('## ')) {
      demo = { heading: line.slice(3).trim(), steps: [] };
      demos.push(demo);
    } else if (line === '```bash demo') {
      assert.ok(demo, 'a runnable block before the first heading');
      fence = { kind: 'demo', lines: [] };
    } else if (line === '```text expect') {
      assert.ok(demo && demo.steps.length > 0, `an expect block with no runnable block before it under "${demo && demo.heading}"`);
      fence = { kind: 'expect', lines: [] };
    }
  }
  return demos.filter((d) => d.steps.length > 0);
}

/** The environment of a demo: fixed instant, empty git identity, `agsc` on the PATH. */
function environment(scratch) {
  const shims = path.join(scratch, 'bin');
  fs.mkdirSync(shims);
  for (const name of ['agsc', 'agsc-host']) {
    const shim = path.join(shims, name);
    fs.writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${path.join(ROOT, 'bin', `${name}.js`)}" "$@"\n`);
    fs.chmodSync(shim, 0o755);
  }
  fs.writeFileSync(path.join(scratch, '.gitconfig-empty'), '');
  return {
    ENGINE: ROOT,
    GIT_AUTHOR_DATE: '2026-09-01T10:00:00Z',
    GIT_AUTHOR_EMAIL: 'operator@example.org',
    GIT_AUTHOR_NAME: 'Operator',
    GIT_COMMITTER_DATE: '2026-09-01T10:00:00Z',
    GIT_COMMITTER_EMAIL: 'operator@example.org',
    GIT_COMMITTER_NAME: 'Operator',
    GIT_CONFIG_GLOBAL: path.join(scratch, '.gitconfig-empty'),
    GIT_CONFIG_NOSYSTEM: '1',
    HOME: scratch,
    NO_COLOR: '1',
    PATH: `${shims}${path.delimiter}${process.env.PATH}`,
    SOURCE_DATE_EPOCH: EPOCH,
  };
}

/** Run one demo's steps in one shell and split what they printed, step by step. */
function run(demo, scratch) {
  const script = ['set -e', 'exec 2>&1', ...demo.steps.map((step, i) => `printf '\\n@@step %s\\n' ${i}\n${step.script}`)].join('\n');
  const r = spawnSync('bash', ['-s'], { cwd: scratch, encoding: 'utf8', env: environment(scratch), input: `${script}\n` });
  const parts = r.stdout.split(/\n@@step \d+\n/u).slice(1);
  return { outputs: parts.map((p) => p.split('\n').map((l) => l.replace(/\s+$/u, ''))), status: r.status, stdout: r.stdout };
}

const demos = parse(fs.readFileSync(PAGE, 'utf8'));

test('docs/DEMOS.md holds runnable demos, each with expected lines', { skip: SKIP }, () => {
  assert.ok(demos.length >= 7, `only ${demos.length} demos with runnable steps`);
  for (const demo of demos) {
    assert.ok(demo.steps.every((s) => s.expect.length > 0), `"${demo.heading}": a runnable step states no expected line`);
  }
});

for (const demo of demos) {
  test(`demo "${demo.heading}": every command runs and prints the lines the page states`, { skip: SKIP }, () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-demos-'));
    try {
      const { outputs, status, stdout } = run(demo, scratch);
      assert.strictEqual(status, 0, `a step failed:\n${stdout.slice(-3000)}`);
      assert.strictEqual(outputs.length, demo.steps.length, 'a step printed no marker');
      demo.steps.forEach((step, i) => {
        for (const line of step.expect) {
          assert.ok(outputs[i].includes(line), `step ${i + 1} of "${demo.heading}" did not print the line\n  ${line}\nit printed:\n${outputs[i].join('\n')}`);
        }
      });
    } finally {
      fs.rmSync(scratch, { force: true, recursive: true });
    }
  });
}
