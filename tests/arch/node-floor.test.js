'use strict';
// The supported Node floor is stated once in package.json and TESTED on that exact
// version by CI: the lowest entry of every workflow matrix is the floor, and the
// alias package states the same one. If they drift, a release could claim a
// version no run ever exercised.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** `>=22.13.0` -> `22.13.0`. */
function floorOf(range) {
  const m = /^>=(\d+\.\d+\.\d+)$/u.exec(String(range));
  assert.ok(m, `engines.node must read ">=MAJOR.MINOR.PATCH", found ${JSON.stringify(range)}`);
  return m[1];
}

/** The exact versions a workflow's `node:` matrix line lists (`'24'` counts as a line, not a floor). */
function matrixOf(workflow) {
  const m = /^\s*node:\s*\[([^\]]*)\]/mu.exec(read(workflow));
  assert.ok(m, `${workflow} has a node matrix`);
  return m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/gu, ''));
}

const byVersion = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};

test('package.json, the alias package and the lowest CI matrix entry name one Node floor', () => {
  const floor = floorOf(JSON.parse(read('package.json')).engines.node);
  assert.strictEqual(floorOf(JSON.parse(read('packages/agsc-cli/package.json')).engines.node), floor);
  for (const workflow of ['.github/workflows/test.yml', '.github/workflows/release.yml']) {
    const lowest = [...matrixOf(workflow)].sort(byVersion)[0];
    assert.strictEqual(lowest, floor, `${workflow}: the lowest Node in the matrix is ${lowest}, the floor is ${floor}`);
  }
});
