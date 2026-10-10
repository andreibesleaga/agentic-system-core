'use strict';
// The vacuous-pass guard (tests/conformance/areas/_expected-reads.js) on the
// `discovery` area handler: a pass is kept only when the handler read every top-level
// member of the case's `expected`. `disc-0004` states its Level as `expected.level`,
// and the handler judges the document at that Level.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const conformance = require('../../src/application/conformance.js');
const { createFileSystem } = require('../../src/adapters/node-fs.js');

const ROOT = path.resolve(__dirname, '..', '..');
const area = require('./areas/discovery.js');

/** One released case of the tree, by id. */
function caseOf(id) {
  const vector = conformance.vectors(createFileSystem(ROOT)).find((v) => v.id === id);
  assert.ok(vector, id);
  return vector;
}

test('the discovery area handler is guarded', () => {
  // A Level-0 document, a set of sub-cases, and the cases the shipped checker judges:
  // with one member added that no branch reads, the pass becomes a fail naming it.
  const ctx = { root: ROOT, specVersion: '1.0.0-rc.7' };
  for (const id of ['disc-0004', 'disc-0017', 'disc-0022']) {
    const vector = caseOf(id);
    assert.equal(area.run(vector, ctx).status, 'pass', id);
    const got = area.run({ ...vector, expected: { ...vector.expected, member_no_branch_reads: true } }, ctx);
    assert.equal(got.status, 'fail', id);
    assert.match(got.detail, /member_no_branch_reads/u, id);
  }
});

test('disc-0004 is judged at the Level it states', () => {
  const vector = caseOf('disc-0004');
  assert.equal(vector.expected.level, 0);
  // The same case stating another Level is not the Level-0 case any more.
  const got = area.run({ ...vector, expected: { ...vector.expected, level: 2 } }, { root: ROOT });
  assert.equal(got.status, 'fail');
  assert.match(got.detail, /level/u);
});
