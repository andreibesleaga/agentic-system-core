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

const NUL = String.fromCharCode(0);
const US = String.fromCharCode(31);

/**
 * One record in the shape `git log --format=%x00%H%x1f%P%x1f%ct%x1f%D%x1f%B%x00
 * --name-only` writes: NUL, the header and message, NUL, then the changed paths.
 * (Until 2026-10-06 the read used RS/US/GS, which a message may contain: finding C3,
 * `git-history-hostile.test.js`.)
 */
const record = (sha, parents, seconds, decorations, message, files = []) =>
  `${NUL}${[sha, parents, seconds, decorations, message].join(US)}${NUL}${files.length === 0 ? '\n' : `\n\n${files.join('\n')}\n`}`;

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
  assert.deepStrictEqual(calls[0][1].slice(0, 5), ['-c', 'core.quotepath=off', 'log', '--first-parent', '--reverse']);
  assert.ok(calls[0][1].includes('--name-only'), 'files[] is asked for (AGSC-08-20b)');
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

// AGSC-08-20b (1.1): `author_email` is supplied when `ledger.actors` is configured, and only then.
test('AGSC-08-20b: with ledger.actors configured the author addresses are read in a second process', () => {
  const calls = [];
  const sha = (c) => c.repeat(40);
  const stdout = record(sha('a'), '', '1756684800', '', 'first\n') + record(sha('b'), sha('a'), '1757289600', '', 'second\n');
  const run = (cmd, args) => {
    calls.push(args);
    return args.includes('--name-only') ? { code: 0, stderr: '', stdout }
      : { code: 0, stderr: '', stdout: `${sha('a')}${US}Ada@Example.org\n${sha('b')}${US}\n` };
  };
  const ctx = { ...ctxWith(run), config: { ledger: { actors: { 'ada@example.org': 'human:ada' } } } };
  const log = helpers.gitLog(ctx);
  assert.strictEqual(calls.length, 2);
  assert.deepStrictEqual(calls[1].slice(0, 4), ['log', '--first-parent', '--reverse', '--format=%H%x1f%ae']);
  assert.deepStrictEqual(log.map((e) => e.author_email), ['ada@example.org', undefined]);

  calls.length = 0;
  helpers.gitLog({ ...ctxWith(run), config: { ledger: { actors: {} } } });
  helpers.gitLog(ctxWith(run));
  assert.strictEqual(calls.length, 2, 'no map, no second process: one process for each of the two reads');
});

test('AGSC-08-20b: an address list the reader cannot match to the chain is no address, never a wrong one', () => {
  const sha = (c) => c.repeat(40);
  const stdout = record(sha('a'), '', '1756684800', '', 'first\n');
  const ctx = (second) => ({ ...ctxWith((cmd, args) => (args.includes('--name-only') ? { code: 0, stderr: '', stdout } : second)),
    config: { ledger: { actors: { 'ada@example.org': 'human:ada' } } } });
  for (const answer of [{ code: 1, stderr: '', stdout: '' }, { code: 0, stderr: '', stdout: 42 }, null,
    { code: 0, stderr: '', stdout: `${sha('z')}${US}ada@example.org\n` }]) {
    assert.deepStrictEqual(helpers.gitLog(ctx(answer)).map((e) => e.author_email), [undefined]);
  }
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
  assert.strictEqual(helpers.gitLog(ctxWith(() => ({ code: 0, stderr: '', stdout: `${good}${NUL}not-a-record${NUL}\n` }))),
    undefined, 'an unparseable record');
  assert.strictEqual(helpers.gitLog(ctxWith(() => ({ code: 0, stderr: '', stdout: `${good}${NUL}${['zz', '', '1', '', 'x'].join(US)}${NUL}\n` }))),
    undefined, 'a sha that is not hexadecimal');
  assert.strictEqual(helpers.gitLog(ctxWith(() => ({ code: 0, stderr: '', stdout: `${good}${NUL}${['b'.repeat(40), '', 'later', '', 'x'].join(US)}${NUL}\n` }))),
    undefined, 'a committer time that is not an integer');
  assert.strictEqual(helpers.gitLog(ctxWith(() => ({ code: 0, stderr: '', stdout: `${good}${NUL}${'b'.repeat(40)}` }))),
    undefined, 'a record that is not closed');
  assert.strictEqual(helpers.gitLog(ctxWith(() => ({ code: 0, stderr: '', stdout: `stray${good}` }))),
    undefined, 'text before the first record');
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

// ------------------------------------------------ the extended entry shape (AGSC-08-20b)

/** One record with its `--name-only` list (the shape of `record` above). */
const named = (sha, parents, seconds, decorations, message, files) => record(sha, parents, seconds, decorations, message, files);

test('AGSC-08-20b: files[] from --name-only, in code-point order, and the author from the trailers', () => {
  const stdout = named('a'.repeat(40), '', '1756684800', '',
    'first\n\nSigned-off-by: Ada Lovelace <Ada.Lovelace@example.org> (CA-v1)\n', ['content/b.md', 'content/a.md'])
    + named('b'.repeat(40), 'a'.repeat(40), '1757289600', '',
      'second\n\nSigned-off-by: Ada <ada@example.org>\nAssisted-by: tool/1.0 (operator: human:ada)\n', ['content/é.md'])
    + named('c'.repeat(40), 'b'.repeat(40), '1758024000', '', 'third\n\nChannel-Auto: Night Lane\n', ['content/a.md'])
    + named('d'.repeat(40), 'c'.repeat(40), '1758024001', '', 'an empty commit with no trailer\n', []);
  const log = helpers.gitLog(ctxWith(() => ({ code: 0, stderr: '', stdout })));
  assert.deepStrictEqual(log.map((e) => e.files), [['content/a.md', 'content/b.md'], ['content/é.md'], ['content/a.md'], []]);
  assert.deepStrictEqual(log.map((e) => e.author), ['human:ada.lovelace', 'human:ada', 'process:night-lane', undefined]);
  // The message stops at its closing NUL: no file name leaks into the trailers.
  assert.deepStrictEqual(Object.keys(log[2].trailers), ['Channel-Auto']);
  assert.strictEqual(log[0].trailers['Signed-off-by'], 'Ada Lovelace <Ada.Lovelace@example.org> (CA-v1)');
});

test('authorOf: Channel-Auto first, then the Assisted-by operator, then the sign-off, else none', () => {
  const ledger = require('../../src/governance/ledger.js');
  assert.strictEqual(ledger.authorOf({ 'channel-auto': '  ', 'Signed-off-by': 'A <a@example.org>' }), 'process:unknown');
  assert.strictEqual(ledger.authorOf({ 'Assisted-by': 'x/1 (operator: process:ci)' }), 'process:ci');
  // An Assisted-by line without a readable operator falls through to the sign-off.
  assert.strictEqual(ledger.authorOf({ 'Assisted-by': 'x/1', 'Signed-off-by': 'B <b@example.org>' }), 'human:b');
  assert.strictEqual(ledger.authorOf({ 'Assisted-by': 'x/1' }), null);
  assert.strictEqual(ledger.authorOf({}), null);
  // produce() copies the two members only when the reader supplied them.
  const [bare] = ledger.produce([{ sha: 'a', parents: [], committer_timestamp: '2026-01-01T00:00:00Z', message: 'x', tags: [] }]);
  assert.ok(!('files' in bare) && !('author' in bare));
});

test('AGSC-08-20a: the content tree is read at HEAD:./content, and every failure is undefined', () => {
  const calls = [];
  const tree = 'f'.repeat(40);
  assert.strictEqual(helpers.contentTree(ctxWith((cmd, args) => { calls.push([cmd, args]); return { code: 0, stdout: `${tree}\n` }; })), tree);
  assert.deepStrictEqual(calls, [['git', ['rev-parse', '--verify', '--quiet', 'HEAD:./content']]]);
  assert.strictEqual(helpers.contentTree({}), undefined);
  assert.strictEqual(helpers.contentTree(ctxWith(() => { throw new Error('no git'); })), undefined);
  assert.strictEqual(helpers.contentTree(ctxWith(() => ({ code: 1, stdout: '' }))), undefined);
  assert.strictEqual(helpers.contentTree(ctxWith(() => ({ code: 0, stdout: 'not a tree' }))), undefined);
  assert.strictEqual(helpers.contentTree(ctxWith(() => null)), undefined);
});

test('buildOptions hands the build both the git-log file and the content tree', () => {
  const tree = 'e'.repeat(40);
  const run = (cmd, args) => (args[0] === 'rev-parse'
    ? { code: 0, stdout: `${tree}\n` }
    : { code: 0, stdout: named('a'.repeat(40), '', '1756684800', '', 'first\n', ['content/a.md']) });
  const options = helpers.buildOptions(ctxWith(run));
  assert.strictEqual(options.contentTree, tree);
  assert.strictEqual(options.gitLog.length, 1);
  // No git-log file: no tree is asked for, and no ledger can be derived.
  const none = helpers.buildOptions(ctxWith(() => ({ code: 128, stdout: '' })));
  assert.ok(!('contentTree' in none));
});

test('agsc build over a real git history publishes /ledger.jsonl, and verify --ledger agrees', (t) => {
  const cp = require('node:child_process');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  if (cp.spawnSync('git', ['--version']).status !== 0) { t.skip('git is not installed'); return; }
  const ROOT = path.resolve(__dirname, '..', '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-ledger-'));
  try {
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
    git('commit', '-q', '-m', 'first', '-m', 'Signed-off-by: Ada <ada@example.org> (CA-v1)');
    const agsc = (...args) => cp.spawnSync(process.execPath, [path.join(ROOT, 'bin', 'agsc.js'), ...args],
      { cwd: dir, encoding: 'utf8', env });
    const built = agsc('build');
    assert.strictEqual(built.status, 0, built.stderr);
    const text = fs.readFileSync(path.join(dir, 'www', 'ledger.jsonl'), 'utf8');
    const lines = text.trim().split('\n').map((l) => JSON.parse(l));
    // From 1.1 the build entry names the build step and no implementation or version (AGSC-08-20a).
    assert.deepStrictEqual(lines.map((l) => [l.kind, l.actor]), [['commit', 'human:ada'], ['build', 'process:agsc']]);
    const tree = cp.execFileSync('git', ['rev-parse', 'HEAD:content'], { cwd: dir, encoding: 'utf8' }).trim();
    assert.strictEqual(lines[1].ref, tree, 'the build entry names the committed content tree');
    const wellknown = fs.readFileSync(path.join(dir, 'www', '.well-known', 'knowledge-linkset'), 'utf8');
    assert.ok(wellknown.includes('rel#ledger'), 'the discovery document links the ledger');
    const verified = agsc('verify', '--ledger');
    assert.strictEqual(verified.status, 0, verified.stderr);
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test('AGSC-08-20a (1.1): a commit with no sign-off takes its actor from ledger.actors, end to end', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const cp = require('node:child_process');
  const ROOT = path.resolve(__dirname, '..', '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-ledger-actors-'));
  try {
    fs.cpSync(path.join(ROOT, 'tests', 'fixtures', 'minimal'), dir, { recursive: true });
    const file = path.join(dir, 'agsc.config.json');
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    config.ledger = { actors: { 'ada@example.org': 'human:ada' } };
    fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
    const env = {
      ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGSC_') && !k.startsWith('GIT_'))),
      GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
      GIT_CONFIG_GLOBAL: path.join(dir, '.no-global'), GIT_CONFIG_NOSYSTEM: '1', SOURCE_DATE_EPOCH: '1767225600',
    };
    const git = (...args) => cp.execFileSync('git', ['-c', 'user.name=Ada', '-c', 'user.email=Ada@Example.org',
      '-c', 'commit.gpgsign=false', ...args], { cwd: dir, env, stdio: 'pipe' });
    git('init', '-q', '-b', 'main');
    git('add', '-A');
    git('commit', '-q', '-m', 'first, no sign-off');
    const built = cp.spawnSync(process.execPath, [path.join(ROOT, 'bin', 'agsc.js'), 'build'], { cwd: dir, encoding: 'utf8', env });
    assert.strictEqual(built.status, 0, built.stderr);
    const text = fs.readFileSync(path.join(dir, 'www', 'ledger.jsonl'), 'utf8');
    assert.deepStrictEqual(text.trim().split('\n').map((l) => JSON.parse(l).actor), ['human:ada', 'process:agsc']);
    assert.ok(!text.includes('example.org'), 'the address reaches no ledger byte');
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});
