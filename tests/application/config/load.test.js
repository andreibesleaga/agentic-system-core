// tests/config/load.test.js — AGSC-09-09/AGSC-01-37 precedence. Owner: B.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../../../src/application/config/load.js');

test('defaults only: every schema-declared default is applied with source "default"', () => {
  const loaded = load({ root: '.', ports: undefined, env: {}, argvFlags: {} });
  assert.equal(loaded.config.budget.usd_month, 10);
  assert.equal(loaded.sources['budget.usd_month'], 'default');
});

test('project config overrides defaults; source becomes "project"', () => {
  const loaded = load({ projectConfig: { budget: { usd_month: 4 } }, env: {}, argvFlags: {} });
  assert.equal(loaded.config.budget.usd_month, 4);
  assert.equal(loaded.sources['budget.usd_month'], 'project');
});

test('cli-0006 scenario: flags > env > .env > project, names reported, values never', () => {
  const loaded = load({
    projectConfig: { budget: { usd_month: 10 }, build: { out: 'www' } },
    dotenvText: '# local overrides\nAGSC_BUDGET_USD_MONTH=7\nAGSC_BUILD_OUT=www-next\nOPENAI_API_KEY=not-read\nAGSC_MODEL_API_KEY=secret-value\n',
    env: { AGSC_BUDGET_USD_MONTH: '3' },
    argvFlags: {}
  });
  assert.equal(loaded.config.budget.usd_month, 3); // process env (3) beats .env (7)
  assert.equal(loaded.config.build.out, 'www-next'); // .env beats project
  assert.equal(loaded.sources['budget.usd_month'], 'env');
  assert.equal(loaded.sources['build.out'], 'dotenv');
  assert.deepEqual(loaded.envOverrides, ['AGSC_BUDGET_USD_MONTH', 'AGSC_BUILD_OUT', 'AGSC_MODEL_API_KEY']);
  assert.deepEqual(loaded.ignoredEnvNames, ['OPENAI_API_KEY']);
  assert.equal(loaded.credentials.get('AGSC_MODEL_API_KEY'), 'secret-value');
  assert.equal(loaded.config.AGSC_MODEL_API_KEY, undefined); // never a configuration key
});

test('a flag beats everything, including the process environment', () => {
  const loaded = load({
    projectConfig: { budget: { usd_month: 10 } },
    env: { AGSC_BUDGET_USD_MONTH: '3' },
    argvFlags: { 'budget.usd_month': '1' }
  });
  assert.equal(loaded.config.budget.usd_month, 1);
  assert.equal(loaded.sources['budget.usd_month'], 'flag');
});

test('an unrecognised AGSC_ name is reported as AGSC-E004, never applied', () => {
  const loaded = load({ env: { AGSC_NO_SUCH_KEY: 'x' } });
  assert.ok(loaded.findings.some((f) => f.code === 'AGSC-E004'));
});

test('the four prose defaults schema/config.schema.json omits are still applied (AGSC-01-19, spec/06-surfaces.md, AGSC-01-18, AGSC-09-94)', () => {
  const loaded = load({ env: {}, argvFlags: {} });
  assert.equal(loaded.config.build.out, 'www');
  assert.equal(loaded.config.build.feed, true); // spec/06-surfaces.md: "default true"
  assert.equal(loaded.config.i18n.default, 'en');
  assert.equal(loaded.config.run.enabled, false);
  for (const p of ['build.out', 'build.feed', 'i18n.default', 'run.enabled']) {
    assert.equal(loaded.sources[p], 'default');
  }
});

test('a prose default yields to a project-config value at the same path', () => {
  const loaded = load({ projectConfig: { build: { out: 'dist', feed: false } }, env: {}, argvFlags: {} });
  assert.equal(loaded.config.build.out, 'dist');
  assert.equal(loaded.config.build.feed, false);
  assert.equal(loaded.sources['build.out'], 'project');
});

// ---------------------------------------------------------------------------
// Added at integration (WP-10-G, 2026-09-18): AGSC-11-01's range check.
// The rule lives in the Boundary context and is INJECTED here, because
// Knowledge may not require Boundary and the emitter never clamps a value —
// `chunks.max_bytes` out of range is a configuration fault, AGSC-E209.
// ---------------------------------------------------------------------------

const { checkBoundaryConfig } = require('../../../src/boundary/visibility.js');

const codesFor = (projectConfig) => load({
  argvFlags: {}, checkBoundary: checkBoundaryConfig, env: {}, projectConfig,
}).findings.map((f) => f.code);

test('AGSC-11-01: a boundary value inside its range raises nothing', () => {
  assert.deepEqual(codesFor({
    chunks: { max_bytes: 4096 },
    federation: { fan_out: 4, hop_limit: 2, max_requests: 20, redirect_limit: 1, timeout_ms: 5000 },
    visibility: 'restricted',
  }), []);
});

test('AGSC-11-01 / AGSC-E209: every out-of-range boundary value is reported', () => {
  assert.deepEqual(codesFor({ chunks: { max_bytes: 255 } }), ['AGSC-E209']);
  assert.deepEqual(codesFor({ federation: { hop_limit: -1 } }), ['AGSC-E209']);
  assert.deepEqual(codesFor({ federation: { timeout_ms: 1 } }), ['AGSC-E209']);
  assert.deepEqual(codesFor({ visibility: 'semi-public' }), ['AGSC-E209']);
  assert.deepEqual(codesFor({ federation: { nosuch: 1 } }), ['AGSC-E209']);
  assert.deepEqual(codesFor({ federation: [] }), ['AGSC-E209']);
});

test('AGSC-11-01: the check runs over the RESOLVED configuration, overrides included', () => {
  const loaded = load({
    argvFlags: {},
    checkBoundary: checkBoundaryConfig,
    env: { AGSC_CHUNKS_MAX_BYTES: '4' },
    projectConfig: { chunks: { max_bytes: 4096 } },
  });
  assert.equal(loaded.config.chunks.max_bytes, 4);
  assert.deepEqual(loaded.findings.map((f) => f.code), ['AGSC-E209']);
});

test('AGSC-11-01: a vendor x-<vendor>-<key> member is admitted, not refused', () => {
  assert.deepEqual(codesFor({ federation: { 'x-acme-retries': 3 } }), []);
});

test('load() runs without the boundary check at all (it is injected, never imported)', () => {
  assert.deepEqual(load({ argvFlags: {}, env: {}, projectConfig: { visibility: 'semi-public' } }).findings, []);
});

test('AGSC-01-37: an AGSC_* value of the wrong type is AGSC-E204, and is never applied', () => {
  const boolean = load({ argvFlags: {}, env: { AGSC_BUILD_FEED: 'yes' } });
  assert.deepEqual(boolean.findings.map((f) => f.code), ['AGSC-E204']);
  assert.equal(boolean.config.build.feed, true, 'a malformed override reached the configuration');

  const integer = load({ argvFlags: {}, env: { AGSC_FEDERATION_HOP_LIMIT: 'two' } });
  assert.deepEqual(integer.findings.map((f) => f.code), ['AGSC-E204']);

  // The admitted forms of each type do apply.
  assert.equal(load({ argvFlags: {}, env: { AGSC_BUILD_FEED: 'false' } }).config.build.feed, false);
  assert.equal(load({ argvFlags: {}, env: { AGSC_FEDERATION_HOP_LIMIT: '2' } }).config.federation.hop_limit, 2);
});

test('a malformed agsc.config.json leaves the defaults standing rather than throwing', () => {
  const ports = { exists: () => true, readFile: () => '{ not json' };
  const loaded = load({ argvFlags: {}, env: {}, ports, root: '.' });
  assert.equal(loaded.config.build.out, 'www');
  assert.equal(loaded.sources['build.out'], 'default');
});
