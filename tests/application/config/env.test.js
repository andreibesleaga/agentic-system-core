// tests/config/env.test.js — AGSC-01-37. Fixed clock not needed
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
  // rc.5 (R-18): the three prose defaults of AGSC-01-19 and AGSC-09-94 are now
  // encoded as JSON-Schema `default` keywords in schema/config.schema.json, so
  // the mechanical derivation finds them without a special case. `build.feed`
  // is withdrawn at rc.5 (R-15) and is a name reserved to 1.1, so it has no
  // default and no path at all.
  assert.equal(defaults.get('build.out'), 'www');
  assert.equal(defaults.get('i18n.default'), 'en');
  assert.equal(defaults.get('run.enabled'), false);
  assert.equal(defaults.has('build.feed'), false);
  assert.equal(env.envNameFor('build.feed'), null);
});
