'use strict';
// tests/bench/security-corpus.test.js — the corpus classes of the configuration paths
// and of the long runs (bench/corpus/security-floor.json, run by bench/security.js).
//
// The configuration paths: a `build.out` that leaves the Bundle (a `..` path, an
// absolute path) or names the source tree (`content`), given to `agsc-host emit`; and
// the same source-tree value given through the environment layer (`AGSC_BUILD_OUT`)
// to `agsc build`. Each is refused under the code the rules name, and nothing is
// written: not outside the Bundle, not into `content/`, not a build output.
//
// The long runs: a commit whose `Signed-off-by` value is a run of `<`, a note that is
// a run of `[` handed to `agsc init`, and an item ending in a run of backticks handed
// to `agsc lint --fix`, each just under 1 MiB. A pattern that scans such a run from
// every start position needs on the order of an hour; a linear scan about a second.
// The runner starts each of these commands with a kill bound, so the outcome is
// "finished" or "killed", far apart on either side of the bound: no duration is
// measured or asserted.
//
// Deterministic: a fixed SOURCE_DATE_EPOCH, no network, no randomness. Every write goes
// to a temporary directory outside the repository, removed on exit.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, it } = require('node:test');

const security = require('../../bench/security.js');

const REPO = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(REPO, 'tests', 'fixtures', 'minimal');
const CORPUS = JSON.parse(fs.readFileSync(path.join(REPO, 'bench', 'corpus', 'security-floor.json'), 'utf8'));
const MIB = 1024 * 1024;

function tmpdir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-sec-'));
  process.on('exit', () => { try { fs.rmSync(dir, { force: true, recursive: true }); } catch { /* gone */ } });
  return dir;
}

const byId = (id) => CORPUS.cases.find((c) => c.id === id);

/** The cases this file is about, with the class each belongs to. */
const NEW_CASES = Object.freeze({
  'env-build-out-source-tree': 'environment-layer',
  'history-long-trailer': 'hostile-history',
  'host-out-absolute': 'hostile-host-config',
  'host-out-parent': 'hostile-host-config',
  'host-out-source-tree': 'hostile-host-config',
  'long-run-init': 'long-run',
  'long-run-lint-fix': 'long-run',
});

describe('the corpus: configuration paths and long runs', () => {
  it('carries the corpus version that counts these cases', () => {
    assert.equal(CORPUS.version, 'security-floor-v2');
  });

  it('holds every new case as a scored fault of its class', () => {
    for (const [id, cls] of Object.entries(NEW_CASES)) {
      const c = byId(id);
      assert.ok(c, `the corpus has no case ${id}`);
      assert.equal(c.class, cls, id);
      assert.equal(c.kind, 'bundle', id);
      assert.notEqual(c.fault, false, `${id} is a fault, not a control`);
      assert.notEqual(c.required, false, `${id} is scored`);
    }
  });

  it('gives agsc-host the three hostile build folders: a parent path, an absolute path, the source tree', () => {
    const outOf = (c) => JSON.parse(c.files.find((f) => f.path === 'agsc.config.json').text).build.out;
    const parent = byId('host-out-parent');
    const absolute = byId('host-out-absolute');
    const source = byId('host-out-source-tree');
    for (const c of [parent, absolute, source]) {
      assert.equal(c.command, 'agsc-host', c.id);
      assert.equal(c.verb, 'emit', c.id);
      assert.equal(c.inspect, 'bundle', c.id);
    }
    assert.match(outOf(parent), /^\.\.\//u);
    assert.equal(outOf(absolute), '{{outside}}');
    assert.equal(absolute.outside, true);
    assert.equal(outOf(source), 'content');
    assert.deepEqual(parent.expect, ['AGSC-E204', 'AGSC-E902']);
    assert.deepEqual(absolute.expect, ['AGSC-E204', 'AGSC-E902']);
    assert.deepEqual(source.expect, ['AGSC-E204']);
    // Whatever a run writes outside the Bundle, or into the source tree, is a leak.
    assert.ok(parent.must_not_reach.some((m) => m.under === 'outside'));
    assert.ok(absolute.must_not_reach.some((m) => m.under === 'outside'));
    assert.ok(source.must_not_reach.some((m) => m.path === 'content/.htaccess'));
  });

  it('gives the environment layer the source tree as the build folder', () => {
    const c = byId('env-build-out-source-tree');
    assert.deepEqual(c.env, { AGSC_BUILD_OUT: 'content' });
    assert.equal(c.verb, 'build');
    assert.deepEqual(c.expect, ['AGSC-E204']);
    assert.ok(c.must_not_reach.some((m) => m.path === 'www'));
    // Its control: a valid build folder given through the same layer is not refused.
    const control = byId('ctl-env-build-out');
    assert.equal(control.fault, false);
    assert.equal(control.class, 'environment-layer');
    assert.deepEqual(control.env, { AGSC_BUILD_OUT: 'public' });
    assert.ok(control.forbid.includes('AGSC-E204'));
  });

  it('feeds each long run just under 1 MiB, under the kill bound', () => {
    const trailer = byId('history-long-trailer');
    const message = security.bytesOf(trailer.git.commits[trailer.git.commits.length - 1]).toString('utf8');
    assert.match(message, /\n\nSigned-off-by: <{1000}/u);
    const runs = [
      message,
      security.bytesOf(byId('long-run-init').files.find((f) => f.path === 'note.md')).toString('utf8'),
      security.bytesOf(byId('long-run-lint-fix').files.find((f) => f.path === 'content/concepts/evil.md')).toString('utf8'),
    ];
    for (const text of runs) {
      assert.ok(Buffer.byteLength(text) < MIB, 'a long run stays under the 1 MiB a reader takes');
      assert.ok(Buffer.byteLength(text) > MIB - 1024, 'a long run is just under 1 MiB');
    }
    for (const id of ['history-long-trailer', 'long-run-init', 'long-run-lint-fix']) {
      assert.equal(byId(id).bound, true, id);
      assert.ok(Array.isArray(byId(id).finish.exit), id);
    }
    assert.equal(byId('long-run-init').verb, 'init');
    assert.deepEqual(byId('long-run-lint-fix').args, ['--fix']);
    assert.equal(byId('history-long-trailer').verb, 'build');
  });
});

describe('bench/security.js — the members these cases use', () => {
  it('judges a run stopped by the kill bound as missed, whatever it printed', () => {
    const c = { expect: [], finish: { exit: [0] }, id: 'x' };
    const killed = { codes: [], exit: null, internal: false, killed: true, leaked: [], ran: false };
    assert.deepEqual(security.judge(c, killed), { hit: [], killed: true, ok: false, outcome: 'missed' });
    const refused = { codes: ['AGSC-E204'], exit: null, internal: false, killed: true, leaked: [], ran: false };
    assert.equal(security.judge({ expect: ['AGSC-E204'], id: 'y' }, refused).outcome, 'missed');
  });

  it('judges a run that finished inside the bound with an accepted exit as finished', () => {
    const c = { expect: [], finish: { exit: [0, 1] }, id: 'x' };
    const base = { codes: [], internal: false, killed: false, leaked: [], ran: true };
    assert.deepEqual(security.judge(c, { ...base, exit: 1 }), { hit: [], ok: true, outcome: 'finished' });
    assert.equal(security.judge(c, { ...base, exit: 2 }).outcome, 'missed');
    assert.equal(security.judge(c, { ...base, exit: 0, internal: true }).outcome, 'missed');
    assert.equal(security.judge(c, { ...base, exit: 0, leaked: ['x'] }).outcome, 'missed');
  });

  it('puts the absolute folder outside the Bundle into the text, the arguments and the environment', () => {
    const outside = path.join(tmpdir(), 'case.outside');
    const c = { args: ['--site', '{{outside}}/a'], env: { AGSC_BUILD_OUT: '{{outside}}' }, files: [{ path: 'a.json', text: '{"out":"{{outside}}"}' }] };
    const resolved = security.withOutside(c, outside);
    const slashed = outside.split(path.sep).join('/');
    assert.deepEqual(resolved.args, ['--site', `${slashed}/a`]);
    assert.deepEqual(resolved.env, { AGSC_BUILD_OUT: slashed });
    assert.equal(resolved.files[0].text, `{"out":"${slashed}"}`);
    // The case itself is never changed.
    assert.equal(c.files[0].text, '{"out":"{{outside}}"}');
  });
});

describe('the new cases, end to end on the reference fixture', () => {
  it('handles every one: refused with nothing written, or finished inside the bound', () => {
    // The corpus's other controls run in the measurement itself; this one is the
    // environment layer's: a valid build folder given through it stays clean.
    const cases = CORPUS.cases.filter((c) => Object.hasOwn(NEW_CASES, c.id) || c.id === 'ctl-env-build-out');
    const result = security.score({ cases, version: CORPUS.version }, { base: FIXTURE, scratch: tmpdir() });
    const outcome = Object.fromEntries(result.cases.filter((c) => c.fault).map((c) => [c.id, c.outcome]));
    assert.deepEqual(outcome, {
      'env-build-out-source-tree': 'refused',
      'history-long-trailer': 'finished',
      'host-out-absolute': 'refused',
      'host-out-parent': 'refused',
      'host-out-source-tree': 'refused',
      'long-run-init': 'finished',
      'long-run-lint-fix': 'finished',
    });
    for (const row of result.cases) assert.equal(row.ok, true, `${row.id}: ${row.outcome} ${JSON.stringify(row.codes)}`);
    assert.equal(result.by_class['hostile-host-config'].score, '3/3');
    assert.equal(result.by_class['environment-layer'].controls_clean, '1/1');
  });
});
