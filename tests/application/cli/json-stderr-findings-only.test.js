'use strict';
// AGSC-09-10: "Under `--json`, stdout MUST carry exactly one JCS-canonical envelope and stderr
// MUST carry one JSON object per line, one per finding." Until 2026-10-02 the verbs also
// printed their human notes on stderr in that mode — `verdict: {…}`, `harness: dist/…`,
// `wrote: …` — so a machine reading stderr line by line met text that was not a finding.
// Under `--json` a verb's data is the files it writes (the Harness, the conformance report,
// the proposal), and its notes are not printed (AGSC-09-12 as amended for 1.0.0).
//
// Deterministic: fixed SOURCE_DATE_EPOCH, no network; scratch copies of the minimal fixture.

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-json-'));
  t.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

/** The caller's environment without any `AGSC_*` override, plus the fixed clock. */
function cleanEnv(extra = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGSC_')));
  return { ...env, NO_COLOR: '1', SOURCE_DATE_EPOCH: '1767225600', ...extra };
}

function stderrLines(dir, args, extra = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8', env: cleanEnv(extra) });
  JSON.parse(r.stdout); // exactly one envelope on stdout
  return (r.stderr || '').split('\n').filter((l) => l !== '');
}

for (const args of [['compose', 'supervisor'], ['build'], ['ci'], ['lint'], ['propose', 'handoff'], ['conform', '--level', '0', '--to', 'report.json']]) {
  test(`AGSC-09-10: \`agsc ${args.join(' ')} --json\` writes only finding objects to stderr`, (t) => {
    const dir = scratch(t);
    for (const line of stderrLines(dir, [...args, '--json'])) {
      let parsed = null;
      try { parsed = JSON.parse(line); } catch { /* reported below */ }
      assert.ok(parsed && typeof parsed.code === 'string' && typeof parsed.severity === 'string', `not a finding: ${line.slice(0, 120)}`);
    }
  });
}

test('without --json the human notes are still printed', (t) => {
  const dir = scratch(t);
  const r = spawnSync(process.execPath, [CLI, 'compose', 'supervisor'], { cwd: dir, encoding: 'utf8', env: cleanEnv() });
  assert.match(r.stderr, /^verdict: \{/mu);
});

test('AGSC-09-10 with AGSC-01-37: `ci --json` first names each override in effect, as one object, never its value', (t) => {
  const dir = scratch(t);
  const lines = stderrLines(dir, ['ci', '--json'], { AGSC_MODEL_API_KEY: 'a-value-that-must-not-appear' });
  assert.deepEqual(JSON.parse(lines[0]), { override: 'AGSC_MODEL_API_KEY' });
  for (const line of lines.slice(1)) assert.ok(typeof JSON.parse(line).code === 'string', line);
  assert.ok(!lines.join('\n').includes('a-value-that-must-not-appear'));
});
