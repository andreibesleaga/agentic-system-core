'use strict';
// AGSC-04-03 and the hexagonal rule: the Knowledge, Governance and Composition
// contexts are PURE. No file system, no process, no clock, no network, no
// randomness, no adapter — the only way those reach the domain is an injected port.
// A test, not a convention: a single `require('node:fs')` in a pure module would
// make every build's output depend on something the vectors cannot pin.

const test = require('node:test');
const assert = require('node:assert');
const { codeOf, requiresOf } = require('./_code.js');
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

/** The host modules and adapters one module of a pure context requires. */
function moduleFaults(text, rel) {
  const faults = [];
  for (const specifier of requiresOf(text, rel)) {
    if (FORBIDDEN_MODULES.includes(specifier)) faults.push(`${rel} requires the host module "${specifier}"`);
    if (specifier.includes('../adapters')) faults.push(`${rel} requires an adapter ("${specifier}"); ports are injected, never imported`);
  }
  return faults;
}

/** The clock, environment and randomness texts in one module's code. */
function textFaults(text, rel) {
  // Every comment is removed (tests/arch/_code.js), so that a rule may be NAMED
  // without tripping the check, at the end of a line of code as well.
  const code = codeOf(text, rel);
  return FORBIDDEN_TEXT.filter(([, re]) => re.test(code))
    .map(([label]) => `${rel} uses ${label}; the domain is deterministic (AGSC-04-03)`);
}

/** The modules of the three pure contexts. */
function pureSources() {
  const found = sources().filter((file) => PURE_CONTEXTS.includes(file.dir.split('/')[0]));
  assert.ok(found.length > 0, 'the scan found no module of a pure context');
  return found;
}

test('pure contexts require no host module', () => {
  for (const file of pureSources()) assert.deepStrictEqual(moduleFaults(file.text, file.rel), []);
});

test('pure contexts read no clock, environment or randomness', () => {
  for (const file of pureSources()) assert.deepStrictEqual(textFaults(file.text, file.rel), []);
});

test('a comment may name what the code may not do; the code beside a comment is still read', () => {
  // Named in a comment at the end of a line, and in a block comment: not a fault.
  const named = [
    "const instant = input.instant; // never Date.now or require('node:fs')",
    '/* Math.random, process.env */ const seed = input.seed;',
  ].join('\n');
  assert.deepStrictEqual([...moduleFaults(named, 'probe.js'), ...textFaults(named, 'probe.js')], []);
  // The code before a trailing comment, or after a string holding "//", is still read.
  const probes = [
    ['const instant = Date.now(); // a trailing comment', 'Date.now'],
    ["const home = 'https://example.org/'; const seed = Math.random();", 'Math.random'],
    ["const fs = require('node:fs'); // a trailing comment", 'node:fs'],
    ['const fs = require("node:fs");', 'node:fs'],
    ["const port = require('../adapters/node-fs.js'); /* a block comment */", 'adapter'],
  ];
  for (const [probe, expected] of probes) {
    const faults = [...moduleFaults(probe, 'probe.js'), ...textFaults(probe, 'probe.js')];
    assert.ok(faults.some((f) => f.includes(expected)), `${probe} → ${JSON.stringify(faults)}`);
  }
});

test('no bounded context touches the process, the clock or randomness', () => {
  // Wider than the three pure contexts: Boundary, Interchange and Distribution may
  // classify addresses (node:net, node:url) but still receive the process streams,
  // the environment and the build instant from the application layer.
  const CONTEXTS = [...PURE_CONTEXTS, 'boundary', 'interchange', 'distribution', 'shared'];
  const PROCESS = /\bprocess\s*\./u;
  for (const file of sources()) {
    if (!CONTEXTS.includes(file.dir.split('/')[0])) continue;
    const code = codeOf(file.text, file.rel);
    assert.ok(!PROCESS.test(code), `${file.rel} reads the process; the application layer passes what it needs`);
    for (const [label, re] of FORBIDDEN_TEXT) {
      assert.ok(!re.test(code), `${file.rel} uses ${label}; the build instant arrives through the Clock port (AGSC-04-03)`);
    }
  }
});

test('ports declare an interface and nothing else', () => {
  for (const file of sources()) {
    if (file.dir !== 'ports') continue;
    assert.deepStrictEqual(file.requires, [], `${file.rel} must be a JSDoc interface with no require`);
    assert.deepStrictEqual(require(file.absolute), {}, `${file.rel} must export nothing executable`);
  }
});
