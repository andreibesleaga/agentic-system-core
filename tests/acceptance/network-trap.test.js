'use strict';
// The network trap of `steps/_offline.js` in every offline lane. The acceptance
// scenarios load it through `steps/_world.js`; the six-mode walks
// (`tests/e2e/modes/_kit.js`), the use cases (`use-cases/use-cases.test.js`) and the
// documentation pages (`tests/docs/_page-runner.js`) load it in every child they
// start, and each lane fails when a child recorded a network attempt, even one the
// child caught and ignored. These tests make such an attempt on purpose, to loopback
// port 9 (nothing listens there, and nothing leaves the machine), and see the lane
// refuse it, record it and fail.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const OFFLINE = path.join(__dirname, 'steps', '_offline.js');
const kit = require('../e2e/modes/_kit.js');
const pages = require('../docs/_page-runner.js');

/** A child that tries loopback port 9 and ignores the refusal: it exits 0 either way. */
const SWALLOWED = "try { require('node:net').connect(9, '127.0.0.1').on('error', () => {}); } catch (e) { /* ignored */ }";

/** The preload a lane's environment names, if any. */
function preload(env) {
  const m = /--require\s+("(?:[^"\\]|\\.)*"|\S+)/u.exec(env.NODE_OPTIONS || '');
  if (!m) return null;
  return m[1].startsWith('"') ? JSON.parse(m[1]) : m[1];
}

test('the mode walks: every child carries the trap, and a swallowed attempt fails the walk', () => {
  const home = kit.scratch('trap');
  const env = kit.env(home);
  assert.strictEqual(preload(env), OFFLINE, 'the walk children do not load steps/_offline.js');
  assert.ok(env.ACCEPTANCE_NETWORK_TRAP, 'the walk children record no attempt');
  const r = spawnSync(process.execPath, ['-e', SWALLOWED], { encoding: 'utf8', env });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.throws(() => kit.offline(), /reached for the network: net\.connect/u);
  // The record is cleared once reported, so the next step starts clean.
  kit.offline();
});

test('the mode walks: a build that reaches no network passes under the trap', () => {
  const dir = kit.projectBundle('trap-ok');
  kit.commitAll(dir, 'notes');
  const r = kit.agsc(dir, ['build']);
  assert.strictEqual(r.code, 0, r.stderr);
});

test('the documentation pages: every step runs under the trap, and a swallowed attempt fails the page', { skip: pages.SKIP }, () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-trap-env-'));
  try {
    const env = pages.environment(scratch);
    assert.strictEqual(preload(env), OFFLINE, 'the page steps do not load steps/_offline.js');
    assert.ok(env.ACCEPTANCE_NETWORK_TRAP, 'the page steps record no attempt');
  } finally {
    fs.rmSync(scratch, { force: true, recursive: true });
  }
  const page = {
    heading: 'a step that ignores a refused call',
    steps: [{ expect: ['done'], script: `node -e ${JSON.stringify(SWALLOWED)}\necho done` }],
  };
  assert.throws(() => pages.check(page, { prefix: 'agsc-trap-page-' }), /reached for the network: net\.connect/u);
});
