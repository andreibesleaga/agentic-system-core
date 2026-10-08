'use strict';
// AGSC-00-20 and the note to PRD-037: at 1.0 the six runtime renderings of AGSC-07-18
// are registered, and "a rendering the distribution does not ship is refused with the
// registry's code" — `AGSC-E203`, a value outside the set the distribution can act on
// (AGSC-01-26a gives an adapter the distribution does not ship the same code). Until
// 2026-10-06 `compose --emit crewai` answered `AGSC-E001`, the code registered for an
// unknown verb (verification finding Q9), and two refusals said "not implemented at
// this milestone … no conformance Level is claimed before 1.0.0", which is false on the
// day 1.0.0 ships (finding G20).
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
const compose = require('../../../src/application/cli/verbs/compose.js');

function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-unshipped-'));
  t.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

function agsc(dir, argv) {
  let out = '';
  const exit = main([...argv, '--json'], {
    env: { SOURCE_DATE_EPOCH: '1767225600' },
    ports: { fs: createFileSystem(dir) },
    root: dir,
    stderr: { write: () => {} },
    stdout: { write: (s) => { out += s; } },
  });
  return { exit, envelope: JSON.parse(out) };
}

const DATED = /milestone|before 1\.0\.0/u;

test('Q9: a registered rendering this distribution does not ship is AGSC-E203, exit 1', (t) => {
  const dir = scratch(t);
  for (const target of ['gabbe', 'kaiban-distributed', 'crewai', 'langgraph', 'adk-msaf', 'n8n']) {
    assert.equal(compose.emitterRefusal(target), null, `the registry holds ${target}`);
    const r = agsc(dir, ['compose', 'supervisor', '--emit', target]);
    assert.equal(r.exit, 1, target);
    const errors = r.envelope.findings.filter((f) => f.severity === 'error');
    assert.deepEqual(errors.map((f) => f.code), ['AGSC-E203'], `${target}: ${JSON.stringify(errors)}`);
    assert.match(errors[0].message, new RegExp(target, 'u'));
    assert.doesNotMatch(errors[0].message, DATED, target);
  }
});

test('G20: refresh --agent without --dry-run names no milestone and no release', (t) => {
  const dir = scratch(t);
  const configFile = path.join(dir, 'agsc.config.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  fs.writeFileSync(configFile, `${JSON.stringify({
    ...config,
    agents: [{
      channel: 'github-pr', enabled: true, model: 'any-model', name: 'baker', operator: 'human:andreibesleaga',
      tasks: ['refresh-stale'], types: ['concept'],
    }],
  }, null, 2)}\n`);
  const r = agsc(dir, ['refresh', '--agent', 'baker']);
  assert.equal(r.exit, 1, JSON.stringify(r.envelope.findings));
  const errors = r.envelope.findings.filter((f) => f.severity === 'error');
  assert.equal(errors.length, 1, JSON.stringify(errors));
  assert.match(errors[0].message, /AGSC-08-28/u);
  assert.doesNotMatch(errors[0].message, DATED);
});
