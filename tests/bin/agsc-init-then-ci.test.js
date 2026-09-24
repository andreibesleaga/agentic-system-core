'use strict';
// AGSC-02-94 and the drop-in promise (PRD-053): `agsc init` on a bare folder, then
// `agsc ci`, exits 0 — once the two things `init` cannot author are in place: the
// publisher's security contact (AGSC-06-36, the publisher's own file) and a build
// instant (AGSC-04-09, one commit or SOURCE_DATE_EPOCH). `init` writes the
// reference crawler list, because the default prose licence adopts the Content Use
// Terms and a reservation with no crawler named fails the build (AGSC-E202), and it
// prints the remaining steps on stderr instead of leaving them to the next command.
//
// Deterministic: the commit instant is fixed, no network, and git runs only inside
// a scratch directory this test creates and removes.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const init = require('../../src/distribution/init.js');

const ROOT = path.join(__dirname, '..', '..');
const CLI = path.join(ROOT, 'bin', 'agsc.js');
const COMMIT_SECONDS = 1767225600; // 2026-01-01T00:00:00Z, the suite's fixed instant

function envWithoutEpoch(extra) {
  const env = Object.assign({}, process.env, extra);
  delete env.SOURCE_DATE_EPOCH;
  return env;
}

function agsc(dir, args) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd: dir, env: envWithoutEpoch({ NO_COLOR: '1' }), encoding: 'utf8',
  });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}

function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-init-ci-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'notes'));
  fs.writeFileSync(path.join(dir, 'notes', 'handoff.md'), '# Handoff\n\nAn agent passes control to another agent.\n');
  return dir;
}

function commitAll(dir) {
  const date = `${COMMIT_SECONDS} +0000`;
  const gitEnv = envWithoutEpoch({
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.org', GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.org', GIT_COMMITTER_DATE: date,
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
  });
  const git = (...args) => execFileSync('git', args, { cwd: dir, env: gitEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'adopted');
}

test('init in a bare folder names the steps a build still needs, and writes no false date', (t) => {
  const dir = scratch(t);
  const r = agsc(dir, ['init']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /before you build: add \.well-known\/security\.txt with a Contact: line/u);
  assert.match(r.err, /before you build: agsc\.config\.json names the reference crawler list/u);
  assert.match(r.err, /before you build: commit once, or set SOURCE_DATE_EPOCH/u);
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8'));
  assert.deepEqual(config.site.tdm_crawlers, [...init.REFERENCE_TDM_CRAWLERS]);
  const index = fs.readFileSync(path.join(dir, 'content', 'index.md'), 'utf8');
  assert.match(index, /Adopted from 1 Markdown files by agsc init\./u);
  assert.doesNotMatch(index, /1970/u, 'a defaulted instant must not become a date in authored content');
});

test('init with an instant writes the date, and after the two steps ci exits 0', (t) => {
  const dir = scratch(t);
  // Step one: the publisher's security contact (RFC 9116), authored before init.
  fs.mkdirSync(path.join(dir, '.well-known'));
  fs.writeFileSync(path.join(dir, '.well-known', 'security.txt'),
    'Contact: https://example.org/security-contact\nPreferred-Languages: en\n');
  // Step two: a build instant — one commit.
  commitAll(dir);
  const first = agsc(dir, ['init']);
  assert.equal(first.code, 0, first.err);
  assert.doesNotMatch(first.err, /before you build: add \.well-known/u);
  assert.doesNotMatch(first.err, /before you build: commit once/u);
  assert.match(first.err, /before you build: agsc\.config\.json names the reference crawler list/u);
  const index = fs.readFileSync(path.join(dir, 'content', 'index.md'), 'utf8');
  assert.match(index, /by agsc init on 2026-01-01\./u);
  const ci = agsc(dir, ['ci', '--json']);
  assert.equal(ci.code, 0, `ci failed:\n${ci.out}\n${ci.err}`);
  const envelope = JSON.parse(ci.out.trim().split('\n').pop());
  assert.equal(envelope.status, 'pass');
  assert.equal(envelope.counts.error, 0);
});
