'use strict';
// AGSC-08-10: `ci` writes the gate verdict to `dist/gate.json` once per run, as a
// JCS-canonical object `{gate, level, checks:[{name, status, findings}], status}` —
// `gate: "ci"` with `level: "L1"` when the Bundle holds no `gate` item, one object
// per gate as a JCS-canonical array in slug order when it holds several (the rule as
// stated 2026-09-24; before that no writer produced the file).
//
// Deterministic: fixed SOURCE_DATE_EPOCH, no network; each case runs in a scratch
// copy of the minimal fixture that the test removes.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { canonicalize } = require('../../src/knowledge/jcs.js');
const { GATE_FILE, gateVerdict } = require('../../src/distribution/ci.js');

const ROOT = path.join(__dirname, '..', '..');
const CLI = path.join(ROOT, 'bin', 'agsc.js');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');

function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-gate-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

function ci(dir) {
  const r = spawnSync(process.execPath, [CLI, 'ci', '--json'], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', SOURCE_DATE_EPOCH: '1767225600' },
  });
  return { code: r.status, err: r.stderr || '', out: r.stdout || '' };
}

function gate(dir, slug, level) {
  fs.mkdirSync(path.join(dir, 'content', 'gates'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'content', 'gates', `${slug}.md`),
    `---\ntype: gate\ntitle: ${slug.replace(/-/gu, ' ')}\nlevel: ${level}\nchecks: [schema, links]\n`
    + 'prov:\n  origin: human\n  operator: human:someone\n---\n\nEvery change passes these checks.\n');
}

function readGate(dir) {
  const text = fs.readFileSync(path.join(dir, GATE_FILE), 'utf8');
  const value = JSON.parse(text);
  assert.equal(text, `${canonicalize(value)}\n`, 'dist/gate.json is not JCS-canonical with one trailing LF');
  return value;
}

test('AGSC-08-10: a Bundle with no gate item writes gate "ci" at level L1 with the four checks', (t) => {
  const dir = scratch(t);
  const r = ci(dir);
  assert.equal(r.code, 0, r.out + r.err);
  const verdict = readGate(dir);
  assert.equal(verdict.gate, 'ci');
  assert.equal(verdict.level, 'L1');
  assert.equal(verdict.status, 'pass');
  assert.deepEqual(verdict.checks.map((c) => c.name), ['lint', 'build', 'verify', 'forge']);
  for (const check of verdict.checks) {
    assert.equal(check.status, 'pass');
    assert.ok(Array.isArray(check.findings));
    assert.ok(check.findings.every((f) => f.severity === 'warn'));
  }
  assert.deepEqual(Object.keys(verdict), ['checks', 'gate', 'level', 'status']);
});

test('AGSC-08-10: one gate item names the verdict after itself, at its own level', (t) => {
  const dir = scratch(t);
  gate(dir, 'publication-gate', 'L2');
  const r = ci(dir);
  assert.equal(r.code, 0, r.out + r.err);
  const verdict = readGate(dir);
  assert.equal(verdict.gate, 'publication-gate');
  assert.equal(verdict.level, 'L2');
  assert.equal(verdict.status, 'pass');
});

test('AGSC-08-10: several gate items write one object per gate, as an array in slug order', (t) => {
  const dir = scratch(t);
  gate(dir, 'publication-gate', 'L2');
  gate(dir, 'a-first-gate', 'L1');
  const r = ci(dir);
  assert.equal(r.code, 0, r.out + r.err);
  const verdict = readGate(dir);
  assert.ok(Array.isArray(verdict));
  assert.deepEqual(verdict.map((v) => [v.gate, v.level]), [['a-first-gate', 'L1'], ['publication-gate', 'L2']]);
});

test('AGSC-08-10: a failing check fails the verdict, and the file is still written', (t) => {
  const dir = scratch(t);
  fs.rmSync(path.join(dir, '.well-known', 'security.txt'));
  const r = ci(dir);
  assert.equal(r.code, 1);
  const verdict = readGate(dir);
  assert.equal(verdict.status, 'fail');
  assert.ok(verdict.checks.some((c) => c.status === 'fail' && c.findings.some((f) => f.code === 'AGSC-E901')));
});

test('gateVerdict: the pure rule, without a port', () => {
  const checks = [{ findings: [], name: 'lint', status: 'pass' }];
  assert.deepEqual(gateVerdict([], checks), { checks, gate: 'ci', level: 'L1', status: 'pass' });
  const two = gateVerdict([{ slug: 'z', type: 'gate', level: 'L1' }, { slug: 'a', type: 'gate', level: 'L2' }, { slug: 'c', type: 'concept' }], checks);
  assert.deepEqual(two.map((v) => v.gate), ['a', 'z']);
  assert.equal(gateVerdict([], [{ findings: [{ severity: 'error' }], name: 'build', status: 'fail' }]).status, 'fail');
});
