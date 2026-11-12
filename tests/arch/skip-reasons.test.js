'use strict';
// tests/arch/skip-reasons.test.js — every skip of the suite names its reason.
//
// node:test prints the value of a `skip` option as the reason of the skip, and a bare
// `true` prints nothing, so a skipped test would leave no trace of why it did not run.
// This test reads every test file as text and refuses a `skip` option whose value is a
// bare comparison (`a === b`, `a !== b`): such a value is a boolean, never a reason.
// A string, or `<condition> ? false : '<reason>'`, or a constant that holds one, passes.
//
// Deterministic: it reads files only; no clock, no network.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const TESTS = path.resolve(__dirname, '..');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory()
    ? walk(path.join(dir, e.name))
    : [path.join(dir, e.name)]));
}

/** A `skip:` option whose whole value is a comparison, with no `?` choosing a reason. */
const BOOLEAN_SKIP = /\{[^{}]*\bskip:\s*([^,}?]*(?:===|!==)[^,}?]*)[,}]/gu;

test('every skip option of the suite names its reason, never a bare boolean', () => {
  const found = [];
  for (const file of walk(TESTS).filter((f) => f.endsWith('.js')).sort()) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(BOOLEAN_SKIP)) {
      found.push(`${path.relative(TESTS, file).split(path.sep).join('/')}: skip: ${m[1].trim()}`);
    }
  }
  assert.deepStrictEqual(found, []);
});
