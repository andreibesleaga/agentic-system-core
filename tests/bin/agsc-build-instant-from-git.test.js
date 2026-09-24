'use strict';

// AGSC-04-09: with no SOURCE_DATE_EPOCH the build instant is the time of the last
// commit, and only where no git history exists is it 0 (with the AGSC-E606 warning).
// `createClock` has always accepted `lastCommitSeconds`, and `node-proc.js` says its
// one 1.0 caller is "the git-log read behind AGSC-08-20a and AGSC-04-09" — but nothing
// ever performed that read, so the real command fell to 0 inside every git repository.
// Every gate ran with SOURCE_DATE_EPOCH set, which is why no test noticed; once the
// writer refused to derive a security.txt expiry from a defaulted instant, a plain
// `agsc build` in a committed Bundle failed. Found at the close.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { readLastCommitSeconds, createClock } = require('../../src/adapters/node-clock.js');

const ROOT = path.join(__dirname, '..', '..');
const CLI = path.join(ROOT, 'bin', 'agsc.js');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const COMMIT_SECONDS = 1767225600; // 2026-01-01T00:00:00Z, the suite's fixed instant

function envWithoutEpoch(extra) {
  const env = Object.assign({}, process.env, extra);
  delete env.SOURCE_DATE_EPOCH;
  return env;
}

function runCli(dir, args) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args],
      { cwd: dir, env: envWithoutEpoch(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, stdout };
  } catch (error) {
    return { code: typeof error.status === 'number' ? error.status : 1, stdout: String(error.stdout || '') };
  }
}

test('readLastCommitSeconds: a clean integer answer is the instant', () => {
  const proc = { run: (cmd, args) => {
    assert.strictEqual(cmd, 'git');
    assert.deepStrictEqual(args, ['log', '-1', '--format=%ct']);
    return { code: 0, stdout: '1767225600\n', stderr: '' };
  } };
  assert.strictEqual(readLastCommitSeconds(proc), 1767225600);
});

test('readLastCommitSeconds: no repository, no git, or noise is null — never a guess', () => {
  assert.strictEqual(readLastCommitSeconds({ run: () => ({ code: 128, stdout: '', stderr: 'fatal' }) }), null);
  assert.strictEqual(readLastCommitSeconds({ run: () => ({ code: 0, stdout: '', stderr: '' }) }), null);
  assert.strictEqual(readLastCommitSeconds({ run: () => ({ code: 0, stdout: '12 34\n', stderr: '' }) }), null);
  assert.strictEqual(readLastCommitSeconds({ run: () => ({ code: 0, stdout: '99999999999999999999\n', stderr: '' }) }), null);
  assert.strictEqual(readLastCommitSeconds({ run: () => { throw new Error('no git'); } }), null);
  assert.strictEqual(readLastCommitSeconds(undefined), null);
  assert.strictEqual(readLastCommitSeconds({}), null);
});

test('createClock: a null lastCommitSeconds still defaults to 0 with the warning', () => {
  const clock = createClock({ env: {}, lastCommitSeconds: null });
  assert.strictEqual(clock.now(), 0);
  assert.strictEqual(clock.findings()[0].code, 'AGSC-E606');
});

test('the real command takes the build instant from the last commit when SOURCE_DATE_EPOCH is unset', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-git-instant-'));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  const date = `${COMMIT_SECONDS} +0000`;
  const gitEnv = envWithoutEpoch({
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.org', GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.org', GIT_COMMITTER_DATE: date,
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
  });
  const git = (...args) => execFileSync('git', args, { cwd: dir, env: gitEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'fixture');

  const result = runCli(dir, ['build', '--json']);
  const envelope = JSON.parse(result.stdout);
  assert.deepStrictEqual(envelope.findings.filter((f) => f.code === 'AGSC-E606'), [], 'the instant must not default to 0');
  assert.strictEqual(result.code, 0, JSON.stringify(envelope.findings));
  const linkset = fs.readFileSync(path.join(dir, 'www', '.well-known', 'knowledge-linkset'), 'utf8');
  assert.ok(linkset.includes('2026-01-01T00:00:00Z'), 'agsc-generated-at is the commit instant');
  fs.rmSync(dir, { recursive: true, force: true });
});
