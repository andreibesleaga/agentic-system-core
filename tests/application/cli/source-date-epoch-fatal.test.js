'use strict';

// FINAL-VERIFY-29. AGSC-04-09, `src/adapters/node-clock.js:5` and
// `docs/IMPLEMENTERS-GUIDE.md` all state the same contract: "a malformed
// SOURCE_DATE_EPOCH is AGSC-E603 and exit 2, never a Finding". The clock port is
// built in `bin/agsc.js` BEFORE `main()` is entered, so `EpochError` escaped past
// every handler that knows about codes and landed in the process-level catch, which
// printed a ten-frame stack trace with "agsc: internal error" and exit 1. Only the
// EMPTY string took a path that produced the documented answer, which is why no test
// noticed.
//
// A CI job with a typo in SOURCE_DATE_EPOCH therefore got a crash rather than a
// diagnostic, and a second implementation reading the guide would have implemented
// something the reference engine did not do.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const CLI = path.join(ROOT, 'bin', 'agsc.js');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');

/** Run the CLI in a throwaway copy of the fixture; never throw for a non-zero exit. */
function build(epoch, flags) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-sde-'));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  const env = Object.assign({}, process.env, { SOURCE_DATE_EPOCH: epoch });
  try {
    const stdout = execFileSync(process.execPath, [CLI, 'build', ...flags],
      { cwd: dir, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, stdout, stderr: '', dir };
  } catch (error) {
    return {
      code: typeof error.status === 'number' ? error.status : 1,
      stdout: String(error.stdout === undefined ? '' : error.stdout),
      stderr: String(error.stderr === undefined ? '' : error.stderr),
      dir,
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const MALFORMED = ['notanumber', '-1', '1.5', '0x10', '99999999999999999999', ' 12 ', '+5', '1e3'];

test('a malformed SOURCE_DATE_EPOCH is AGSC-E603 and exit 2, never a stack trace (AGSC-04-09)', () => {
  for (const epoch of MALFORMED) {
    const result = build(epoch, ['--json']);
    assert.equal(result.code, 2, `SOURCE_DATE_EPOCH=${JSON.stringify(epoch)} exited ${result.code}`);
    assert.equal(/internal error/u.test(result.stderr), false,
      `SOURCE_DATE_EPOCH=${JSON.stringify(epoch)} printed an internal error`);
    assert.equal(/^\s+at /mu.test(result.stderr), false,
      `SOURCE_DATE_EPOCH=${JSON.stringify(epoch)} printed a stack trace`);
    // ` 12 ` is accepted by `node-clock` (which trims) and rejected by the
    // second SOURCE_DATE_EPOCH check inside `main()`, which writes its diagnostic to
    // stderr even under `--json`. Both streams are accepted here so this test pins
    // the code and the exit rather than that open inconsistency.
    const text = (result.stdout.trim() || result.stderr.trim()).split('\n')
      .filter((l) => l.startsWith('{')).pop();
    assert.ok(text, `SOURCE_DATE_EPOCH=${JSON.stringify(epoch)} printed no diagnostic`);
    const diagnostic = JSON.parse(text);
    assert.equal(diagnostic.code, 'AGSC-E603');
    assert.equal(diagnostic.severity, 'error');
    assert.ok(/SOURCE_DATE_EPOCH/u.test(diagnostic.message));
  }
});

test('without --json the same fault is one line on stderr, and --quiet says nothing', () => {
  const plain = build('notanumber', []);
  assert.equal(plain.code, 2);
  assert.ok(/AGSC-E603/u.test(plain.stderr), plain.stderr);
  assert.equal(/^\s+at /mu.test(plain.stderr), false);
  const quiet = build('notanumber', ['--quiet']);
  assert.equal(quiet.code, 2);
  assert.equal(quiet.stdout.trim(), '');
});

test('a well-formed SOURCE_DATE_EPOCH still builds, so the guard is not vacuous', () => {
  const ok = build('1767225600', ['--json']);
  assert.equal(ok.code, 0, ok.stderr || ok.stdout);
  const envelope = JSON.parse(ok.stdout.trim().split('\n').pop());
  assert.equal(envelope.status, 'pass');
});
