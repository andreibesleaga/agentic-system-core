'use strict';
// AGSC-11-01: every value outside the bound table is AGSC-E209 — `chunks`, `attachments`
// and `budget` as well as `federation` — and §9.4's AGSC-E201 ("only where no 2xx code is
// more specific") is not reported beside it. Until 2026-10-02 the attachment and budget
// rows were reported only as AGSC-E201, a federation value as both codes, and the chunk
// maximum not at all.
//
// Deterministic: fixed SOURCE_DATE_EPOCH, no network; scratch copies of the minimal fixture.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const CLI = path.join(ROOT, 'bin', 'agsc.js');

function lintWith(t, key, value) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-bounds-'));
  t.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  fs.cpSync(path.join(ROOT, 'tests', 'fixtures', 'minimal'), dir, { recursive: true });
  const file = path.join(dir, 'agsc.config.json');
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  config[key] = value;
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  const r = spawnSync(process.execPath, [CLI, 'lint', '--json'], {
    cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH, SOURCE_DATE_EPOCH: '1767225600' },
  });
  return JSON.parse(r.stdout).findings.filter((f) => f.severity === 'error').map((f) => f.code);
}

for (const [key, value] of [
  ['attachments', { max_bytes: 5 }],
  ['attachments', { max_bytes: 10485761 }],
  ['budget', { usd_month: -1 }],
  ['chunks', { max_bytes: 70000 }],
  ['chunks', { max_bytes: 100 }],
  ['federation', { max_bytes: 5 }],
  ['federation', { hop_limit: 9 }],
  ['visibility', 'secret'],
]) {
  test(`AGSC-11-01: ${key} ${JSON.stringify(value)} is one AGSC-E209 and nothing else`, (t) => {
    assert.deepEqual(lintWith(t, key, value), ['AGSC-E209']);
  });
}

test('AGSC-11-01: values inside the table raise nothing', (t) => {
  assert.deepEqual(lintWith(t, 'attachments', { max_bytes: 1024 }), []);
  assert.deepEqual(lintWith(t, 'chunks', { max_bytes: 65536 }), []);
  assert.deepEqual(lintWith(t, 'budget', { usd_month: 0 }), []);
});
