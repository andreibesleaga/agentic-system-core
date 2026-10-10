'use strict';
// verifies AGSC-08-26
// Clause (g) of the auto-channel rule, the part the git-log file can show. On a
// Bundle with a channel whose publish choice is `auto`, every element of the
// first-parent chain after the root commit must be a merge commit (two or more
// parents) and must carry a `Signed-off-by`, `Proposal` or `Channel-Auto` trailer;
// `verify` and `ci` report each element that is not, naming its sha. The root
// commit, which no merge can produce, is exempt. A Bundle with no `auto` channel
// satisfies the rule vacuously. What only the forge's records show (that a merge is
// reachable from a merged pull request, the author's forge identity, the bypass
// list) is the forge CI's and is not asked of the engine.
//
// Deterministic: fixed git-log inputs; the command-line cases use scratch
// repositories with fixed identities and dates and a fixed SOURCE_DATE_EPOCH, and
// remove them afterwards. No network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const autoMerge = require('../../src/governance/auto-merge.js');

const ROOT = path.join(__dirname, '..', '..');
const CLI = path.join(ROOT, 'bin', 'agsc.js');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');

// A fictitious contributor; the address is joined at run time.
const SIGNED = `Ada Example <${['ada', 'example.org'].join('@')}> (CA-v1)`;
const sha = (c) => c.repeat(40);

const AUTO = { channels: [{ adapter: 'github', author: 'channel-bot', name: 'main', owner: 'human:ada', publish: 'auto' }] };
const HITL = { channels: [{ adapter: 'github', author: 'channel-bot', name: 'main', owner: 'human:ada', publish: 'hitl' }] };

const root = { committed_at: '2026-01-01T00:00:00Z', parents: [], sha: sha('1'), trailers: {} };
const element = (c, parents, trailers) => ({ committed_at: '2026-01-02T00:00:00Z', parents, sha: sha(c), trailers });
const codes = (findings) => findings.map((f) => f.code);

test('the root commit is exempt, with or without trailers', () => {
  assert.deepEqual(autoMerge.check([root], AUTO), []);
  assert.deepEqual(autoMerge.check([{ ...root, trailers: { Proposal: '1' } }], AUTO), []);
});

test('a non-merge commit after the root without the trailers is AGSC-E706, naming its sha and not the root', () => {
  const direct = element('2', [sha('1')], {});
  const findings = autoMerge.check([root, direct], AUTO);
  assert.deepEqual(codes(findings), ['AGSC-E706']);
  assert.equal(findings[0].severity, 'error');
  assert.match(findings[0].message, new RegExp(sha('2'), 'u'));
  assert.doesNotMatch(findings[0].message, new RegExp(sha('1'), 'u'));
  assert.match(findings[0].message, /not a merge commit/u);
  assert.match(findings[0].message, /none of the trailers/u);
});

test('with no auto channel nothing is reported', () => {
  const history = [root, element('2', [sha('1')], {})];
  assert.deepEqual(autoMerge.check(history, {}), []);
  assert.deepEqual(autoMerge.check(history, { channels: [] }), []);
  assert.deepEqual(autoMerge.check(history, HITL), []);
  assert.deepEqual(autoMerge.check(history, { channels: [{ name: 'x' }] }), [], 'no publish choice is hitl');
  assert.deepEqual(autoMerge.check(history, undefined), []);
});

test('a merge commit with any one of the three trailers passes', () => {
  for (const trailers of [{ 'Signed-off-by': SIGNED }, { Proposal: '12' }, { 'Channel-Auto': 'main' }]) {
    const merge = element('2', [sha('1'), sha('a')], trailers);
    assert.deepEqual(autoMerge.check([root, merge], AUTO), [], JSON.stringify(trailers));
  }
});

test('trailer keys are compared without regard to case, and an empty value is no trailer', () => {
  assert.deepEqual(autoMerge.check([root, element('2', [sha('1'), sha('a')], { 'signed-off-by': SIGNED })], AUTO), []);
  assert.deepEqual(autoMerge.check([root, element('2', [sha('1'), sha('a')], { 'CHANNEL-AUTO': 'main' })], AUTO), []);
  assert.deepEqual(codes(autoMerge.check([root, element('2', [sha('1'), sha('a')], { Proposal: '  ' })], AUTO)),
    ['AGSC-E706']);
  assert.deepEqual(codes(autoMerge.check([root, element('2', [sha('1'), sha('a')], { 'Assisted-by': 'x/1' })], AUTO)),
    ['AGSC-E706'], 'another trailer is not one of the three');
});

test('each condition is checked on its own: a merge without trailers, a signed non-merge commit', () => {
  const unsigned = autoMerge.check([root, element('2', [sha('1'), sha('a')], {})], AUTO);
  assert.deepEqual(codes(unsigned), ['AGSC-E706']);
  assert.match(unsigned[0].message, /none of the trailers/u);
  assert.doesNotMatch(unsigned[0].message, /not a merge commit/u);
  const single = autoMerge.check([root, element('2', [sha('1')], { 'Signed-off-by': SIGNED })], AUTO);
  assert.deepEqual(codes(single), ['AGSC-E706']);
  assert.match(single[0].message, /not a merge commit/u);
  assert.doesNotMatch(single[0].message, /none of the trailers/u);
});

test('one finding per offending element, in the order of the git-log file', () => {
  const history = [root, element('2', [sha('1')], {}), element('3', [sha('2'), sha('b')], { Proposal: '3' }),
    element('4', [sha('3')], {})];
  const findings = autoMerge.check(history, AUTO);
  assert.deepEqual(codes(findings), ['AGSC-E706', 'AGSC-E706']);
  assert.match(findings[0].message, new RegExp(sha('2'), 'u'));
  assert.match(findings[1].message, new RegExp(sha('4'), 'u'));
});

test('no git-log file, an empty one, or malformed elements never throw', () => {
  assert.deepEqual(autoMerge.check(undefined, AUTO), []);
  assert.deepEqual(autoMerge.check([], AUTO), []);
  assert.deepEqual(codes(autoMerge.check([root, { sha: sha('2') }], AUTO)), ['AGSC-E706']);
  assert.equal(autoMerge.hasAutoChannel(AUTO), true);
  assert.equal(autoMerge.hasAutoChannel(HITL), false);
  assert.equal(autoMerge.hasAutoChannel({ channels: 'auto' }), false);
});

// ---- `ci` and `verify` over a real repository

function cleanEnv(extra) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGSC_') && !k.startsWith('GIT_')));
  return { ...env, NO_COLOR: '1', SOURCE_DATE_EPOCH: '1767225600', ...(extra || {}) };
}

const IDENTITY = ['-c', 'user.name=Ada Example', '-c', `user.email=${['ada', 'example.org'].join('@')}`,
  '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', '-c', 'core.autocrlf=false'];

function git(dir, args, when) {
  const date = when || '2026-01-01T00:00:00Z';
  const r = spawnSync('git', [...IDENTITY, ...args], {
    cwd: dir, encoding: 'utf8', env: cleanEnv({ GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }),
  });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function agsc(dir, ...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8', env: cleanEnv() });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}

/** The minimal Bundle with a channel, committed as the root commit of `main`. */
function repository(t, publish) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-auto-g-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8'));
  config.channels = [{ adapter: 'github', author: 'channel-bot', name: 'main', owner: config.bundle.operator, publish }];
  fs.writeFileSync(path.join(dir, 'agsc.config.json'), `${JSON.stringify(config, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, '.gitignore'), 'www/\ndist/\n');
  git(dir, ['init', '-q']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'Initial content']);
  return dir;
}

/** Change one byte of the root document, so a commit has something to record. */
function edit(dir, text) {
  fs.appendFileSync(path.join(dir, 'content', 'index.md'), `\n${text}\n`);
}

function e706(result) {
  return JSON.parse(result.out).findings.filter((f) => f.code === 'AGSC-E706');
}

test('`ci` and `verify` report AGSC-E706 for a direct commit on a Bundle with an auto channel', (t) => {
  const dir = repository(t, 'auto');
  const rootSha = git(dir, ['rev-parse', 'HEAD']);
  edit(dir, 'A direct edit.');
  git(dir, ['commit', '-q', '-am', 'Edit outside a pull request'], '2026-01-02T00:00:00Z');
  const direct = git(dir, ['rev-parse', 'HEAD']);

  const ci = agsc(dir, 'ci', '--json');
  assert.equal(ci.code, 1, ci.out + ci.err);
  const found = e706(ci);
  assert.equal(found.length, 1, ci.out);
  assert.equal(found[0].severity, 'error');
  assert.ok(found[0].message.includes(direct));
  assert.ok(!found[0].message.includes(rootSha));
  const gate = JSON.parse(fs.readFileSync(path.join(dir, 'dist', 'gate.json'), 'utf8'));
  const lane = gate.checks.find((c) => c.name === 'verify');
  assert.equal(lane.status, 'fail');
  assert.deepEqual(lane.findings.map((f) => f.code), ['AGSC-E706']);

  const verify = agsc(dir, 'verify', '--json');
  assert.equal(verify.code, 1, verify.out + verify.err);
  assert.equal(e706(verify).length, 1, verify.out);
});

test('a history that satisfies the clause passes `ci` and `verify`; the same history passes with a hitl channel', (t) => {
  for (const publish of ['auto', 'hitl']) {
    const dir = repository(t, publish);
    git(dir, ['checkout', '-q', '-b', 'proposal']);
    edit(dir, 'A reviewed edit.');
    git(dir, ['commit', '-q', '-am', 'Reviewed edit'], '2026-01-02T00:00:00Z');
    git(dir, ['checkout', '-q', 'main']);
    git(dir, ['merge', '-q', '--no-ff', 'proposal', '-m', `Merge the reviewed edit\n\nSigned-off-by: ${SIGNED}`],
      '2026-01-03T00:00:00Z');
    const ci = agsc(dir, 'ci', '--json');
    assert.equal(ci.code, 0, `${publish}: ${ci.out}${ci.err}`);
    assert.deepEqual(e706(ci), []);
    const verify = agsc(dir, 'verify', '--json');
    assert.equal(verify.code, 0, `${publish}: ${verify.out}${verify.err}`);
  }
});

test('with a hitl channel a direct commit reports nothing', (t) => {
  const dir = repository(t, 'hitl');
  edit(dir, 'A direct edit.');
  git(dir, ['commit', '-q', '-am', 'Edit outside a pull request'], '2026-01-02T00:00:00Z');
  const ci = agsc(dir, 'ci', '--json');
  assert.equal(ci.code, 0, ci.out + ci.err);
  assert.deepEqual(e706(ci), []);
});
