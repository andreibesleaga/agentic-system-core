'use strict';
// AGSC-09-11: every Finding carries `code`, `col`, `file`, `line`, `message` and `severity`,
// and AGSC-09-10 orders them by (file, line, col, code). A finding about a whole file — a
// folder note skipped under AGSC-01-05, a missing `agsc.config.json` (AGSC-01-01) — has no
// line of its own. Before this test, such a finding reached the JCS writer of `dist/gate.json`
// with `line` and `col` undefined, the writer refused (`AGSC-E601`), and `ci` printed that one
// code in place of every real finding: a valid Bundle with a folder README failed, and a
// folder with no configuration was told its JSON was invalid. The same finding seen by the
// lint lane and by the build lane was also printed twice, against AGSC-09-11's "one fault is
// counted once".
//
// Deterministic: fixed SOURCE_DATE_EPOCH, no network; each case runs in a scratch directory
// that the test removes.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { canonicalize } = require('../../src/knowledge/jcs.js');
const { withPosition } = require('../../src/knowledge/validate.js');

const ROOT = path.join(__dirname, '..', '..');
const CLI = path.join(ROOT, 'bin', 'agsc.js');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const MEMBERS = ['code', 'col', 'file', 'line', 'message', 'severity'];

function scratch(t, copyFixture = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-nopos-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  if (copyFixture) fs.cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

function run(dir, ...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', SOURCE_DATE_EPOCH: '1767225600' },
  });
  return { code: r.status, err: r.stderr || '', out: r.stdout || '' };
}

function assertWellFormed(f) {
  for (const m of MEMBERS) assert.ok(Object.prototype.hasOwnProperty.call(f, m), `finding lacks ${m}: ${JSON.stringify(f)}`);
  assert.equal(typeof f.code, 'string');
  assert.equal(typeof f.file, 'string');
  assert.equal(typeof f.message, 'string');
  assert.ok(Number.isInteger(f.line) && f.line >= 1, `line: ${JSON.stringify(f)}`);
  assert.ok(Number.isInteger(f.col) && f.col >= 1, `col: ${JSON.stringify(f)}`);
}

test('withPosition gives a finding without a position line 1, col 1 and keeps every defined member', () => {
  const f = withPosition({ code: 'AGSC-E506', file: 'content/concepts/README.md', message: 'm', severity: 'warn', slug: undefined, key: 'k' });
  assert.deepEqual(f, { code: 'AGSC-E506', col: 1, file: 'content/concepts/README.md', key: 'k', line: 1, message: 'm', severity: 'warn' });
  assert.doesNotThrow(() => canonicalize(f));
  const g = withPosition({ code: 'AGSC-E901', message: 'm', severity: 'error' });
  assert.equal(g.file, '');
  const kept = withPosition({ code: 'AGSC-E201', col: 7, file: 'a.md', line: 3, message: 'm', severity: 'error' });
  assert.equal(kept.line, 3);
  assert.equal(kept.col, 7);
});

test('AGSC-01-05 + AGSC-09-11: a valid Bundle with a folder README passes `ci`, and the note is one warning with a position', (t) => {
  const dir = scratch(t);
  fs.writeFileSync(path.join(dir, 'content', 'concepts', 'README.md'), '# About this folder\n\nNot an item.\n');
  const r = run(dir, 'ci', '--json');
  assert.equal(r.code, 0, r.out + r.err);
  assert.doesNotMatch(r.out + r.err, /AGSC-E601/u);
  const envelope = JSON.parse(r.out);
  envelope.findings.forEach(assertWellFormed);
  const notes = envelope.findings.filter((f) => f.code === 'AGSC-E506' && f.file.endsWith('concepts/README.md'));
  assert.equal(notes.length, 1, JSON.stringify(envelope.findings));
  const gate = JSON.parse(fs.readFileSync(path.join(dir, 'dist', 'gate.json'), 'utf8'));
  assert.equal(gate.status, 'pass');
  for (const c of gate.checks) c.findings.forEach(assertWellFormed);
});

test('AGSC-01-01: `ci` in a folder with no configuration names the missing file, not an internal JSON fault', (t) => {
  const dir = scratch(t, false);
  const r = run(dir, 'ci', '--json');
  assert.notEqual(r.code, 0);
  assert.doesNotMatch(r.out + r.err, /AGSC-E601/u);
  assert.match(r.out + r.err, /agsc\.config\.json/u);
  const envelope = JSON.parse(r.out);
  envelope.findings.forEach(assertWellFormed);
  assert.ok(envelope.findings.some((f) => f.code === 'AGSC-E901'), JSON.stringify(envelope.findings));
});

test('AGSC-09-11: a fault both the lint lane and the build lane see is counted once', (t) => {
  const dir = scratch(t);
  // A concept without a description: lint and build both report AGSC-E408 for it.
  const file = path.join(dir, 'content', 'concepts', 'bare.md');
  fs.writeFileSync(file, '---\ntype: concept\ntitle: A bare concept\nclusters: [agent-patterns]\n'
    + 'prov:\n  origin: human\n  operator: human:someone\n---\n\nA concept with a body and no description.\n');
  const r = run(dir, 'ci', '--json');
  const envelope = JSON.parse(r.out);
  const keys = envelope.findings.map((f) => canonicalize(f));
  assert.equal(new Set(keys).size, keys.length, `a finding is listed twice: ${JSON.stringify(envelope.findings)}`);
  const warns = envelope.findings.filter((f) => f.severity === 'warn').length;
  assert.equal(envelope.counts.warn, warns);
});
