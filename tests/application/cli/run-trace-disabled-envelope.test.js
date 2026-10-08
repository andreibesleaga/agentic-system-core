'use strict';
// AGSC-09-10 with AGSC-09-94: "Under `--json`, stdout MUST carry exactly one
// JCS-canonical envelope", the only exceptions being an exit 2 reached before a verb
// is resolved (an unknown verb or flag, `AGSC-E001`/`AGSC-E002`) and an internal fault
// with no registered code. `run` and `trace` with `run.enabled` false are neither: the
// verb is resolved, and the refusal is `AGSC-E004`, a registered code. Until
// 2026-10-06 both printed nothing on stdout (and `cli-0013` pinned that); the
// refusal is now an envelope like every other verb's, still exit 2, still reading no
// `run` block. `cli-0013` is withdrawn for `cli-0017`.
//
// Deterministic: fixed SOURCE_DATE_EPOCH, no network; scratch copies of the minimal fixture.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const { main } = require('../../../src/application/cli/main.js');
const { createFileSystem } = require('../../../src/adapters/node-fs.js');
const { canonicalize } = require('../../../src/knowledge/jcs.js');

function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-runoff-'));
  t.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

function agsc(dir, argv) {
  let out = '';
  let err = '';
  const exit = main(argv, {
    env: { SOURCE_DATE_EPOCH: '1767225600' },
    ports: { fs: createFileSystem(dir) },
    root: dir,
    stderr: { write: (s) => { err += s; } },
    stdout: { write: (s) => { out += s; } },
  });
  return { exit, stdout: out, stderr: err };
}

for (const [verb, arg] of [['run', 'handoff'], ['trace', 'record.json']]) {
  test(`AGSC-09-10: \`${verb}\` with run.enabled false prints one envelope under --json, exit 2, AGSC-E004`, (t) => {
    const dir = scratch(t);
    const r = agsc(dir, [verb, arg, '--json']);
    assert.equal(r.exit, 2);
    assert.ok(r.stdout.endsWith('\n') && r.stdout.indexOf('\n') === r.stdout.length - 1, 'exactly one line on stdout');
    const envelope = JSON.parse(r.stdout);
    assert.equal(r.stdout, `${canonicalize(envelope)}\n`, 'the envelope is JCS-canonical');
    assert.equal(envelope.verb, verb);
    assert.equal(envelope.status, 'fail');
    assert.deepEqual(envelope.findings.map((f) => f.code), ['AGSC-E004']);
    const lines = r.stderr.split('\n').filter((l) => l !== '').map((l) => JSON.parse(l));
    assert.deepEqual(lines.map((f) => f.code), ['AGSC-E004'], 'stderr: one finding object per line');
  });

  test(`\`${verb}\` with run.enabled false, without --json: exit 2 and the code on stderr`, (t) => {
    const dir = scratch(t);
    const r = agsc(dir, [verb, arg]);
    assert.equal(r.exit, 2);
    assert.match(r.stderr, /AGSC-E004/u);
  });
}
