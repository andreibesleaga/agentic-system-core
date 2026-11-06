'use strict';
// The licence policy of the run-time dependencies (a fitness function).
//
// The engine ships under the Apache License 2.0, and an install with `npm ci --omit=dev` brings
// in every package the lockfile marks as not a development dependency. Each of them must carry a
// permissive licence that the Apache License 2.0 can ship beside: no copyleft, no unknown or
// missing licence. A new dependency with any other licence fails here until a person decides,
// writes the reason into the CHANGELOG and adds the identifier to the list below.
//
// Deterministic: reads package-lock.json only; no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./_scan.js');

/** SPDX expressions a run-time dependency may carry. */
const PERMITTED = Object.freeze([
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'MIT',
  'MIT OR Apache-2.0',
  'PSF-2.0',
]);

const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
const runtime = Object.entries(lock.packages).filter(([where, entry]) => where !== '' && entry.dev !== true && entry.link !== true);

test('every run-time dependency carries a permissive licence the engine can ship beside', () => {
  assert.ok(runtime.length > 0, 'the lockfile lists the run-time dependencies');
  for (const [where, entry] of runtime) {
    assert.ok(PERMITTED.includes(String(entry.license)), `${where} is licensed "${entry.license}", outside the policy`);
  }
});

test('the official MCP SDK is a run-time dependency under the Apache License 2.0, and its 1.x line is gone', () => {
  const at = (name) => lock.packages[`node_modules/${name}`];
  for (const name of ['@modelcontextprotocol/server', '@modelcontextprotocol/core']) {
    assert.equal(at(name).license, 'Apache-2.0', name);
    assert.notEqual(at(name).dev, true, `${name} is installed at run time`);
  }
  assert.equal(at('@modelcontextprotocol/sdk'), undefined, 'the 1.x SDK was replaced by the v2 packages');
});
