'use strict';

// FINAL-VERIFY-29 (FV29-03). AGSC-09-90's checkers exit 0, 1 or 2 and report a
// FINDING; a stack trace on stdout is not a diagnostic and blocks nothing usefully
// in the CI lane AGSC-09-92 mandates. Two inputs made `tools/validate-schemas` throw
// an uncaught exception:
//
//   * a schema document nested deeper than the JavaScript call stack — `patterns()`
//     recursed without a bound and threw `RangeError: Maximum call stack size
//     exceeded`;
//   * an `item.schema.json` that is valid JSON but carries no `/properties/type/enum`
//     — `canonicalize(undefined)` called `Object.keys(undefined)` and threw
//     `TypeError: Cannot convert undefined or null to object`.
//
// Both are now findings. The real `schema/` is unaffected, which the last case pins.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const TOOL = path.join(ROOT, 'tools', 'validate-schemas');

/** Run the tool as the shell runs it; never throw for a non-zero exit. */
function run(root) {
  try {
    const stdout = execFileSync(process.execPath, [TOOL, '--json', root],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      code: typeof error.status === 'number' ? error.status : 1,
      stdout: String(error.stdout === undefined ? '' : error.stdout),
      stderr: String(error.stderr === undefined ? '' : error.stderr),
    };
  }
}

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-vs-'));
  fs.mkdirSync(path.join(dir, 'schema'));
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, 'schema', name), body);
  }
  return dir;
}

/** A finding envelope, never an exception. */
function assertDiagnostic(result, label) {
  assert.equal(/^\s+at /mu.test(result.stdout + result.stderr), false,
    `${label}: the tool printed a stack trace:\n${(result.stderr || result.stdout).slice(0, 400)}`);
  assert.ok(result.code === 1 || result.code === 2, `${label}: exit was ${result.code}`);
  const last = result.stdout.trim().split('\n').pop();
  const envelope = JSON.parse(last);
  assert.equal(envelope.schema, 'agsc.diagnostics.v1', `${label}: envelope`);
  assert.equal(envelope.verb, 'validate-schemas');
  assert.ok(envelope.findings.length > 0, `${label}: no finding`);
  return envelope;
}

test('a schema nested past the walk bound is a finding, not a RangeError', () => {
  const deep = `{${'"a":{'.repeat(5000)}${'}'.repeat(5000)}}\n`;
  const dir = fixture({
    'item.schema.json': deep,
    'bundle.schema.json': '{}\n',
    'config.schema.json': '{}\n',
  });
  const envelope = assertDiagnostic(run(dir), 'deep nesting');
  assert.ok(envelope.findings.some((f) => /nests deeper than/u.test(f.message)),
    'the depth bound must name itself in a finding');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('an item schema with no type enum is a finding, not a TypeError', () => {
  const dir = fixture({
    'item.schema.json': '{}\n',
    'bundle.schema.json': '{}\n',
    'config.schema.json': '{}\n',
  });
  assertDiagnostic(run(dir), 'empty objects');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('an empty and a binary schema file are findings, not exceptions', () => {
  const dir = fixture({
    'item.schema.json': '',
    'bundle.schema.json': Buffer.from([0x00, 0x01, 0xff, 0xfe]),
    'config.schema.json': '{}\n',
  });
  assertDiagnostic(run(dir), 'empty and binary');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the shipped schema/ still passes, so the guards are not vacuous', () => {
  const result = run(ROOT);
  assert.equal(result.code, 0, result.stdout.slice(0, 400));
  const envelope = JSON.parse(result.stdout.trim().split('\n').pop());
  assert.equal(envelope.status, 'pass');
  assert.deepEqual(envelope.findings, []);
});
