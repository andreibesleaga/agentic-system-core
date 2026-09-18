// tests/conformance/b-owned-vectors.test.js — runs this package's owned
// vectors (cli-0002/0005/0006, bundle-0002..0005, prov-0001/0002) through
// the area handlers directly, independent of A's vector-runner.test.js
// (which does not exist yet). Owner: B. Once the real runner lands, this
// file becomes redundant coverage, not a conflict — different file name,
// same area handlers.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const cliArea = require('./areas/cli.js');
const bundleArea = require('./areas/bundle.js');
const provArea = require('./areas/prov.js');

const pending = JSON.parse(fs.readFileSync(path.join(__dirname, 'pending.json'), 'utf8')).pending;

const OWNED = [
  ['cli', 'cli-0002', cliArea],
  ['cli', 'cli-0005', cliArea],
  ['cli', 'cli-0006', cliArea],
  ['bundle', 'bundle-0002', bundleArea],
  ['bundle', 'bundle-0003', bundleArea],
  ['bundle', 'bundle-0004', bundleArea],
  ['bundle', 'bundle-0005', bundleArea],
  ['prov', 'prov-0001', provArea],
  ['prov', 'prov-0002', provArea]
];

function vectorFile(area, id) {
  const dir = path.join(__dirname, '..', 'vectors', area);
  const name = fs.readdirSync(dir).find((f) => f.startsWith(id + '-'));
  return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
}

for (const [area, id, handler] of OWNED) {
  test(`${id} (owned by B)`, async () => {
    const vector = vectorFile(area, id);
    assert.equal(vector.id, id);
    const result = await handler.run(vector, {});
    if (pending.includes(id)) {
      assert.equal(result.status, 'skip', `${id} is listed in pending.json but did not report skip: ${result.detail}`);
    } else {
      assert.equal(result.status, 'pass', `${id}: ${result.detail}`);
    }
  });
}
