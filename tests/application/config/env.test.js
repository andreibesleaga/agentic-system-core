// tests/config/env.test.js — AGSC-01-37. Owner: B. Fixed clock not needed
// (this module reads no clock); no network.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../../../src/application/config/env.js');

test('parseDotenv keeps only AGSC_* names, later line wins, comments/blank ignored', () => {
  const text = [
    '# a comment',
    '',
    'AGSC_BUDGET_USD_MONTH=7',
    'OPENAI_API_KEY=not-read',
    'AGSC_BUDGET_USD_MONTH=9'
  ].join('\n');
  const parsed = env.parseDotenv(text);
  assert.equal(parsed.entries.get('AGSC_BUDGET_USD_MONTH'), '9');
  assert.equal(parsed.entries.has('OPENAI_API_KEY'), false);
  assert.deepEqual(parsed.ignored, ['OPENAI_API_KEY']);
});

test('envNameFor / pathForEnvName round-trip for a scalar key', () => {
  assert.equal(env.envNameFor('build.out'), 'AGSC_BUILD_OUT');
  const desc = env.pathForEnvName('AGSC_BUILD_OUT');
  assert.deepEqual(desc, { kind: 'scalar', path: 'build.out', type: 'string' });
});

test('pathForEnvName resolves integer/boolean types', () => {
  assert.equal(env.pathForEnvName('AGSC_BUDGET_USD_MONTH').type, 'integer');
  assert.equal(env.pathForEnvName('AGSC_RUN_ENABLED').type, 'boolean');
});

test('pathForEnvName recognises the two credential names', () => {
  assert.deepEqual(env.pathForEnvName('AGSC_MODEL_API_KEY'), { kind: 'credential' });
  assert.deepEqual(env.pathForEnvName('AGSC_MODEL_BASE_URL'), { kind: 'credential' });
  assert.equal(env.isCredentialName('AGSC_MODEL_API_KEY'), true);
  assert.equal(env.isCredentialName('AGSC_BUILD_OUT'), false);
});

test('pathForEnvName resolves an AGSC_AGENT_<NAME>_<KEY> override', () => {
  const desc = env.pathForEnvName('AGSC_AGENT_EDITOR_BUDGET_USD_MONTH');
  assert.deepEqual(desc, { kind: 'agent', entryName: 'editor', key: 'budget_usd_month', type: 'integer' });
});

test('pathForEnvName returns null for an unrecognised AGSC_ name', () => {
  assert.equal(env.pathForEnvName('AGSC_NO_SUCH_KEY'), null);
});

test('TRACKED_ENV_CODE is the registered secrets-lint code', () => {
  assert.equal(env.TRACKED_ENV_CODE, 'AGSC-E403');
});

test('allDefaults includes every schema-declared default (mechanical: only keys config.schema.json literally marks "default")', () => {
  const defaults = env.allDefaults();
  assert.equal(defaults.get('budget.usd_month'), 10);
  assert.equal(defaults.get('visibility'), 'public');
  assert.equal(defaults.get('chunks.max_bytes'), 4096);
  // build.out/build.feed/i18n.default/run.enabled have a prose default
  // (AGSC-01-19, AGSC-09-94) but schema/config.schema.json does not encode
  // it as a JSON-Schema "default" keyword, so the mechanical derivation
  // (never hand-typed, per the work-package prompt) correctly omits them;
  // reported as a schema gap in the WP-10-B report, not fixed here.
  assert.equal(defaults.has('build.out'), false);
});
