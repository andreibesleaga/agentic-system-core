'use strict';
// tests/application/git-history-hostile.test.js — the Bundle's git history and git
// configuration are inputs the engine reads; neither may steer what it derives or run
// anything.
//
// (a) The git-log read (AGSC-08-20b) split records
//    on the control characters RS, US and GS, which a commit message may contain. One
//    real commit could therefore add a second, fabricated ledger entry — another actor,
//    `kind: release`, a commit id that does not exist — and the forged tag fed the
//    content version (AGSC-04-25). A message containing US alone was cut short. The
//    read now separates records with NUL, the one byte git never prints from a
//    message, so a message is data whatever it holds.
// (b) Git ran with the repository's own
//    configuration, so a `.git/config` that came with a downloaded folder ran a
//    command (`core.fsmonitor`) during `agsc lint`. Every git call of the ProcessRunner
//    adapter now switches that hook off.
//
// Real git in a throwaway repository; skipped where git is not installed. Fixed
// commit dates and SOURCE_DATE_EPOCH, no global or system git configuration.

const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const helpers = require('../../src/application/cli/verbs/_helpers.js');
const { createProcessRunner } = require('../../src/adapters/node-proc.js');

const HAVE_GIT = cp.spawnSync('git', ['--version']).status === 0;
const RS = String.fromCharCode(30);
const US = String.fromCharCode(31);
const GS = String.fromCharCode(29);

function repository(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-hostile-git-'));
  t.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  fs.cpSync(path.join(ROOT, 'tests', 'fixtures', 'minimal'), dir, { recursive: true });
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGSC_') && !k.startsWith('GIT_'))),
    GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
    GIT_CONFIG_GLOBAL: path.join(dir, '.no-global'), GIT_CONFIG_NOSYSTEM: '1', SOURCE_DATE_EPOCH: '1767225600',
  };
  const git = (...args) => cp.execFileSync('git', ['-c', 'user.name=Ada', '-c', 'user.email=ada@example.org',
    '-c', 'commit.gpgsign=false', ...args], { cwd: dir, env, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  return { dir, env, git };
}

/** A commit message whose bytes spell a whole second record in the old RS/US/GS shape. */
function forgingMessage() {
  const forged = [`${'a'.repeat(40)}`, '', '1767225600', 'tag: v9.9.9', 'release\n\nSigned-off-by: Mallory <m@example.org>\nChannel-Auto: forged\n'].join(US);
  return `first${GS}\n${RS}${forged}${GS}\n\nSigned-off-by: Ada <ada@example.org> (CA-v1)`;
}

test('(a) a commit message cannot add a ledger entry or a tag', (t) => {
  if (!HAVE_GIT) { t.skip('git is not installed'); return; }
  const { dir, env, git } = repository(t);
  git('commit', '-q', '-m', forgingMessage());
  const log = helpers.gitLog({ ports: { proc: createProcessRunner({ cwd: dir, env }) } });
  assert.ok(Array.isArray(log), 'the history is read');
  assert.equal(log.length, 1, `one commit, one element: ${JSON.stringify(log)}`);
  assert.equal(log[0].tag, undefined, 'no forged tag');
  assert.ok(!JSON.stringify(log).includes('a'.repeat(40)), 'no forged commit id');

  const built = cp.spawnSync(process.execPath, [path.join(ROOT, 'bin', 'agsc.js'), 'build'], { cwd: dir, encoding: 'utf8', env });
  assert.equal(built.status, 0, built.stderr);
  const ledger = fs.readFileSync(path.join(dir, 'www', 'ledger.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(ledger.map((e) => e.kind), ['commit', 'build']);
  assert.ok(!ledger.some((e) => e.ref === 'a'.repeat(40)), 'the forged ref is not in the ledger');
  assert.equal(ledger[0].actor, 'human:ada');
});

test('(a) a message holding the old separators is kept whole, trailers included', (t) => {
  if (!HAVE_GIT) { t.skip('git is not installed'); return; }
  const { dir, env, git } = repository(t);
  git('commit', '-q', '-m', `subject with a ${US} unit separator`, '-m', 'Signed-off-by: Ada <ada@example.org> (CA-v1)');
  const log = helpers.gitLog({ ports: { proc: createProcessRunner({ cwd: dir, env }) } });
  assert.equal(log.length, 1);
  assert.equal(log[0].trailers['Signed-off-by'], 'Ada <ada@example.org> (CA-v1)');
  assert.ok(log[0].files.includes('content/index.md'), JSON.stringify(log[0].files));
});

test('(b) a .git/config fsmonitor command is not run by lint, build or ci', async (t) => {
  if (!HAVE_GIT) { t.skip('git is not installed'); return; }
  const { dir, env, git } = repository(t);
  git('commit', '-q', '-m', 'first', '-m', 'Signed-off-by: Ada <ada@example.org> (CA-v1)');
  // The hook runs through git's shell in the work tree, so a relative marker works
  // on every platform the suite runs on.
  git('config', 'core.fsmonitor', 'echo ran > fsmonitor-ran; false');
  const marker = path.join(dir, 'fsmonitor-ran');
  // The hook is live: git itself runs it.
  cp.spawnSync('git', ['ls-files'], { cwd: dir, env });
  assert.ok(fs.existsSync(marker), 'the fixture hook works');
  fs.rmSync(marker);
  for (const verb of ['lint', 'build', 'ci']) {
    const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'bin', 'agsc.js'), verb], { cwd: dir, encoding: 'utf8', env });
    assert.ok(!/internal error/u.test(r.stderr), r.stderr);
    assert.ok(!fs.existsSync(marker), `${verb} ran the repository's fsmonitor command`);
  }
});

test('(b) the adapter puts the hardening options before every git subcommand', () => {
  const calls = [];
  const cpModule = require('node:child_process');
  const original = cpModule.execFileSync;
  cpModule.execFileSync = (cmd, args) => { calls.push([cmd, args]); return ''; };
  try {
    // The adapter holds its own reference; load a fresh copy that sees the stub.
    const file = require.resolve('../../src/adapters/node-proc.js');
    const saved = require.cache[file];
    delete require.cache[file];
    try {
      const runner = require('../../src/adapters/node-proc.js').createProcessRunner();
      runner.run('git', ['ls-files', '-z']);
      runner.run('node', ['-v']);
    } finally {
      require.cache[file] = saved;
    }
  } finally {
    cpModule.execFileSync = original;
  }
  assert.deepEqual(calls[0], ['git', ['-c', 'core.fsmonitor=false', '-c', 'log.showSignature=false', 'ls-files', '-z']]);
  assert.deepEqual(calls[1], ['node', ['-v']], 'only git is hardened');
});
