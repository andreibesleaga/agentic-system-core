'use strict';
// AGSC-05-04b: "`agsc mcp` tools and the CLI MUST resolve `memory://<bundle-id>/<slug>` to
// the item when `<bundle-id>` equals this Bundle's `bundle.id`: the alias is accepted
// wherever a slug argument is accepted, normalized to the slug before any other rule runs";
// another Bundle's id is refused with AGSC-E309; and by AGSC-05-04a the node's https item IRI
// is accepted the same way. The tool server did this; until 2026-10-02 the command line did
// not (`agsc compose memory://minimal/supervisor` answered AGSC-E802).
//
// Deterministic: fixed SOURCE_DATE_EPOCH, no network; each case runs in a scratch copy of the
// minimal fixture (bundle.id `minimal`, site.base `https://minimal.example`).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const CLI = path.join(ROOT, 'bin', 'agsc.js');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');

function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-alias-'));
  t.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

function agsc(dir, ...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', SOURCE_DATE_EPOCH: '1767225600' },
  });
  return { code: r.status, err: r.stderr || '', out: r.stdout || '' };
}

const verdictOf = (r) => (/verdict: (\{.*\})/u.exec(r.err) || [])[1];

test('AGSC-05-04b: compose accepts this Bundle\'s memory:// alias and its https IRI as the slug', (t) => {
  const dir = scratch(t);
  const plain = agsc(dir, 'compose', 'supervisor');
  assert.equal(plain.code, 0, plain.out + plain.err);
  for (const form of ['memory://minimal/supervisor', 'https://minimal.example/concepts/supervisor/']) {
    const r = agsc(dir, 'compose', form);
    assert.equal(r.code, 0, `${form}: ${r.out}${r.err}`);
    assert.equal(verdictOf(r), verdictOf(plain), form);
  }
});

test('AGSC-05-04b: an alias naming another Bundle is refused with AGSC-E309', (t) => {
  const dir = scratch(t);
  const r = agsc(dir, 'compose', 'memory://other/supervisor', '--json');
  assert.notEqual(r.code, 0);
  const envelope = JSON.parse(r.out);
  assert.ok(envelope.findings.some((f) => f.code === 'AGSC-E309'), JSON.stringify(envelope.findings));
});

test('AGSC-05-04b: propose accepts the alias and proposes the same item', (t) => {
  const dir = scratch(t);
  const a = agsc(dir, 'propose', 'memory://minimal/handoff', '--json');
  const b = agsc(dir, 'propose', 'handoff', '--json');
  assert.equal(a.code, b.code, a.out + a.err);
  assert.doesNotMatch(a.out + a.err, /AGSC-E301/u);
});
