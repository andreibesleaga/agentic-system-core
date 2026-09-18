'use strict';
// AGSC-04-03 and the hexagonal rule: the Knowledge, Governance and Composition
// contexts are PURE. No file system, no process, no clock, no network, no
// randomness, no adapter — the only way those reach the domain is an injected port.
// A test, not a convention: a single `require('node:fs')` in a pure module would
// make every build's output depend on something the vectors cannot pin.

const test = require('node:test');
const assert = require('node:assert');
const { sources } = require('./_scan.js');

const PURE_CONTEXTS = ['knowledge', 'governance', 'composition'];
const FORBIDDEN_MODULES = [
  'fs', 'node:fs', 'fs/promises', 'node:fs/promises',
  'child_process', 'node:child_process',
  'net', 'node:net', 'http', 'node:http', 'https', 'node:https',
  'os', 'node:os', 'dns', 'node:dns', 'worker_threads', 'node:worker_threads',
];
const FORBIDDEN_TEXT = [
  ['process.env', /\bprocess\s*\.\s*env\b/u],
  ['Date.now', /\bDate\s*\.\s*now\b/u],
  ['new Date', /\bnew\s+Date\b/u],
  ['Math.random', /\bMath\s*\.\s*random\b/u],
  ['performance.now', /\bperformance\s*\.\s*now\b/u],
];

test('pure contexts require no host module', () => {
  for (const file of sources()) {
    const context = file.dir.split('/')[0];
    if (!PURE_CONTEXTS.includes(context)) continue;
    for (const specifier of file.requires) {
      assert.ok(!FORBIDDEN_MODULES.includes(specifier),
        `${file.rel} requires the host module "${specifier}"`);
      assert.ok(!specifier.includes('../adapters'),
        `${file.rel} requires an adapter ("${specifier}"); ports are injected, never imported`);
    }
  }
});

test('pure contexts read no clock, environment or randomness', () => {
  for (const file of sources()) {
    const context = file.dir.split('/')[0];
    if (!PURE_CONTEXTS.includes(context)) continue;
    // Comments are stripped so that a rule may be NAMED without tripping the check.
    const code = file.text.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
    for (const [label, re] of FORBIDDEN_TEXT) {
      assert.ok(!re.test(code), `${file.rel} uses ${label}; the domain is deterministic (AGSC-04-03)`);
    }
  }
});

test('ports declare an interface and nothing else', () => {
  for (const file of sources()) {
    if (file.dir !== 'ports') continue;
    assert.deepStrictEqual(file.requires, [], `${file.rel} must be a JSDoc interface with no require`);
    // eslint-disable-next-line global-require, import/no-dynamic-require
    assert.deepStrictEqual(require(file.absolute), {}, `${file.rel} must export nothing executable`);
  }
});
