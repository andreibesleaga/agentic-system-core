'use strict';
// tests/application/git-log-read.test.js — AGSC-08-20b's production, read through
// the ProcessRunner port.
//
// The git-log file is the input of the derived ledger (AGSC-08-20a) AND of the
// content version (AGSC-04-25), so a build reads it ONCE per invocation and passes
// it down as data. Everything here is against an INJECTED runner: no git, no
// repository, no child process, so the suite stays deterministic and offline
// (AGSC-04-11).
//
// The one property worth stating twice: every way of not getting a usable answer —
// no runner, a runner that throws, a non-zero exit, no stdout, unparseable output —
// gives `undefined` and never a partial chain. A partial chain would make the
// content version's branch-3 count wrong, silently.

const test = require('node:test');
const assert = require('node:assert');

const helpers = require('../../src/application/cli/verbs/_helpers.js');
const { createClock } = require('../../src/adapters/node-clock.js');

const RS = String.fromCharCode(30);
const US = String.fromCharCode(31);

/** One record in the shape `git log --format=%H<US>%P<US>%ct<US>%D<US>%B<RS>` writes. */
const record = (sha, parents, seconds, decorations, message) =>
  [sha, parents, seconds, decorations, message].join(US) + RS;

const ctxWith = (run, env) => ({
  ports: { clock: createClock({ env: env || { SOURCE_DATE_EPOCH: '1767225600' } }), proc: { run } },
});

test('AGSC-08-20b: one process, oldest first, tags read out of the decorations', () => {
  const calls = [];
  const stdout = record('a'.repeat(40), '', '1756684800', '', 'first\n')
    + record('b'.repeat(40), 'a'.repeat(40), '1757289600', 'tag: v1.4.0, origin/main',
      'second\n\nSigned-off-by: Ada <ada@example.org>\n')
    + record('c'.repeat(40), 'b'.repeat(40), '1758024000', 'HEAD -> main, tag: v2.0.0', 'third\n');
  const log = helpers.gitLog(ctxWith((cmd, args) => {
    calls.push([cmd, args]);
    return { code: 0, stderr: '', stdout };
  }));

  assert.strictEqual(calls.length, 1, 'the whole file is read in ONE process');
  assert.strictEqual(calls[0][0], 'git');
  assert.deepStrictEqual(calls[0][1].slice(0, 3), ['log', '--first-parent', '--reverse']);
  assert.deepStrictEqual(log.map((e) => [e.sha.slice(0, 4), e.committed_at, e.tag]), [
    ['aaaa', '2025-09-01T00:00:00Z', undefined],
    ['bbbb', '2025-09-08T00:00:00Z', 'v1.4.0'],
    ['cccc', '2025-09-16T12:00:00Z', 'v2.0.0'],
  ]);
  // `committed_at` is rendered from the COMMITTER SECONDS, never from a local
  // time: a rendered `%cd` would depend on the host's zone (AGSC-04-02).
  assert.deepStrictEqual(log[1].parents, ['a'.repeat(40)]);
  assert.deepStrictEqual(log[0].parents, []);
  assert.strictEqual(log[1].trailers['Signed-off-by'], 'Ada <ada@example.org>');
});

test('the content version this invocation derives comes from that one file', () => {
  const stdout = record('a'.repeat(40), '', '1756684800', 'tag: v1.4.0', 'first\n')
    + record('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', 'a'.repeat(40), '1757289600', '', 'second\n');
  const ctx = ctxWith(() => ({ code: 0, stderr: '', stdout }));
  const derived = helpers.bundleVersionOf(ctx, helpers.gitLog(ctx));
  assert.strictEqual(derived.version, 'v1.4.0+1.ga1b2c3d4e5f6');
  assert.deepStrictEqual(derived.findings, []);
});

test('a tag that cannot be a content version is AGSC-E506, and the read still succeeds', () => {
  const stdout = record('a'.repeat(40), '', '1756684800', 'tag: v1.4.0', 'first\n')
    + record('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', 'a'.repeat(40), '1757289600',
      'tag: v2.0/final', 'second\n');
  const ctx = ctxWith(() => ({ code: 0, stderr: '', stdout }));
  const log = helpers.gitLog(ctx);
  assert.strictEqual(log[1].tag, 'v2.0/final', 'the ledger still sees the tag (AGSC-08-20a)');
  const derived = helpers.bundleVersionOf(ctx, log);
  assert.strictEqual(derived.version, 'v1.4.0+1.ga1b2c3d4e5f6');
  assert.deepStrictEqual(derived.findings.map((f) => [f.code, f.severity]), [['AGSC-E506', 'warn']]);
});

test('every way of not getting an answer is `undefined`, and never a partial chain', () => {
  assert.strictEqual(helpers.gitLog({}), undefined, 'no ports');
  assert.strictEqual(helpers.gitLog({ ports: {} }), undefined, 'no runner');
  assert.strictEqual(helpers.gitLog({ ports: { proc: {} } }), undefined, 'a runner with no run()');
  assert.strictEqual(helpers.gitLog(ctxWith(() => { throw new Error('no git on PATH'); })), undefined,
    'a runner that throws');
  assert.strictEqual(helpers.gitLog(ctxWith(() => ({ code: 128, stderr: 'not a repository', stdout: '' }))),
    undefined, 'a non-zero exit');
  assert.strictEqual(helpers.gitLog(ctxWith(() => ({ code: 0, stderr: '', stdout: 42 }))), undefined,
    'stdout that is not a string');
  assert.strictEqual(helpers.gitLog(ctxWith(() => null)), undefined, 'no result at all');
  // Output the reader cannot parse is ALL-or-nothing: one unusable record refuses
  // the whole file rather than returning the elements before it, because a short
  // chain makes AGSC-04-25's branch-3 count silently wrong.
  const good = record('a'.repeat(40), '', '1756684800', '', 'first\n');
  assert.strictEqual(helpers.gitLog(ctxWith(() => ({ code: 0, stderr: '', stdout: `${good}not-a-record${RS}` }))),
    undefined, 'an unparseable record');
  assert.strictEqual(helpers.gitLog(ctxWith(() => ({ code: 0, stderr: '', stdout: `${good}${['zz', '', '1', '', 'x'].join(US)}${RS}` }))),
    undefined, 'a sha that is not hexadecimal');
  assert.strictEqual(helpers.gitLog(ctxWith(() => ({ code: 0, stderr: '', stdout: `${good}${['b'.repeat(40), '', 'later', '', 'x'].join(US)}${RS}` }))),
    undefined, 'a committer time that is not an integer');
});

test('an empty repository reads as an empty file, and the version takes branch 4', () => {
  const ctx = ctxWith(() => ({ code: 0, stderr: '', stdout: '' }));
  assert.deepStrictEqual(helpers.gitLog(ctx), []);
  assert.strictEqual(helpers.bundleVersionOf(ctx, helpers.gitLog(ctx)).version,
    '0.0.0+20260101T000000Z');
});

test('with no clock at all the derivation is still total', () => {
  assert.match(helpers.bundleVersionOf({}, undefined).version, /^0\.0\.0\+19700101T000000Z$/u);
  assert.match(helpers.bundleVersionOf({ ports: { clock: { now: () => 1767225600 } } }, undefined).version,
    /^0\.0\.0\+20260101T000000Z$/u);
});
