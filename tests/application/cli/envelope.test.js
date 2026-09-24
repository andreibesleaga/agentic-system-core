// tests/cli/envelope.test.js — AGSC-09-10/09-11.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEnvelope, compareFindings, main } = require('../../../src/application/cli/main.js');

test('buildEnvelope: shape, counts and pass/fail derivation', () => {
  const pass = buildEnvelope({ verb: 'lint', findings: [], specVersion: '1.0.0-rc.4', version: '0.1.0' });
  assert.deepEqual(pass, {
    counts: { error: 0, warn: 0 },
    findings: [],
    schema: 'agsc.diagnostics.v1',
    spec_version: '1.0.0-rc.4',
    status: 'pass',
    verb: 'lint',
    version: '0.1.0'
  });

  const fail = buildEnvelope({
    verb: 'lint',
    findings: [{ code: 'AGSC-E301', severity: 'error', file: 'a.md', line: 1, col: 1 }],
    specVersion: '1.0.0-rc.4',
    version: '0.1.0'
  });
  assert.equal(fail.status, 'fail');
  assert.equal(fail.counts.error, 1);
});

test('compareFindings orders by (file, line, col, code) code-point-wise', () => {
  const a = { file: 'a.md', line: 5, col: 1, code: 'AGSC-E101' };
  const b = { file: 'a.md', line: 2, col: 1, code: 'AGSC-E101' };
  const c = { file: 'b.md', line: 1, col: 1, code: 'AGSC-E101' };
  const sorted = [a, c, b].sort(compareFindings);
  assert.deepEqual(sorted, [b, a, c]);
});

test('severity literal is "warn", never "warning" (AGSC-09-11)', () => {
  const envelope = buildEnvelope({ verb: 'lint', findings: [{ code: 'AGSC-E406', severity: 'warn' }], specVersion: '1.0.0-rc.4', version: '0.1.0' });
  assert.equal(envelope.counts.warn, 1);
  assert.equal(envelope.status, 'pass'); // a warn-only run still passes
});

test('when knowledge/jcs.js is unavailable, --json fails closed with AGSC-E601 and no stdout (never a hand-rolled RFC 8785 writer)', async () => {
  const chunks = { out: [], err: [] };
  const stdout = { write: (s) => chunks.out.push(s) };
  const stderr = { write: (s) => chunks.err.push(s) };
  const exitCode = await main(['lint', '--json'], { env: {}, stdout, stderr, root: '.' });
  // This assertion documents current behaviour: it is expected to flip once
  // A's src/knowledge/jcs.js lands (see the report's pending-vector notes).
  let hasJcs = true;
  try {
    require('../../../src/knowledge/jcs.js');
  } catch (e) {
    hasJcs = false;
  }
  if (!hasJcs) {
    assert.equal(chunks.out.join(''), '');
    assert.match(chunks.err.join(''), /AGSC-E601/);
    assert.equal(exitCode, 1);
  }
});
