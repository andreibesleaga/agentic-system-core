'use strict';
// AGSC-00-15 (as amended 2026-09-25): a writer refuses a Bundle whose
// `agsc.config.json` declares a MAJOR it does not implement — AGSC-E004, the exit-2
// class of AGSC-09-08 — and warns (AGSC-E506) on a newer MINOR of its own MAJOR. The
// tool's version is injected; the Knowledge context knows none of its own.

const test = require('node:test');
const assert = require('node:assert');

const lintVerb = require('../../../src/application/cli/verbs/lint.js');
const main = require('../../../src/application/cli/main.js');

const config = (version) => ({
  bundle: { id: 'example', operator: 'human:alice' },
  site: { base: 'https://example.org/', title: 'Example' },
  spec_version: version,
});
const codes = (version, own) => lintVerb.configAndRoot({ config: config(version), index: null }, { ownVersion: own })
  .map((f) => [f.code, f.severity]);

test('another MAJOR is AGSC-E004 and exit class 2; a newer MINOR warns; the own version is silent', () => {
  assert.deepStrictEqual(codes('2.0.0', '1.0.0-rc.6'), [['AGSC-E004', 'error']]);
  assert.ok(main.USAGE_CLASS_CODES.has('AGSC-E004'));
  assert.deepStrictEqual(codes('1.1.0', '1.0.0-rc.6'), [['AGSC-E506', 'warn']]);
  assert.deepStrictEqual(codes('1.0.0-rc.6', '1.0.0-rc.6'), []);
  assert.deepStrictEqual(codes('1.0.0', '1.2.3'), []);
});

test('without an injected version nothing is compared, as before', () => {
  assert.deepStrictEqual(lintVerb.configAndRoot({ config: config('9.0.0'), index: null }), []);
});
