'use strict';
// The vacuous-pass guard of the `build` and `cli` area handlers
// (tests/conformance/areas/_expected-reads.js): a pass is kept only when the handler
// read every top-level member of `expected`.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { guarded } = require('./areas/_expected-reads.js');
const conformance = require('../../src/application/conformance.js');
const { createFileSystem } = require('../../src/adapters/node-fs.js');

const ROOT = path.resolve(__dirname, '..', '..');
const PASS = { status: 'pass', detail: '' };

test('a pass whose handler read every expected member stays a pass', () => {
  const run = guarded((v) => (v.expected.a === 1 && v.expected.b === 2 ? PASS : { status: 'fail', detail: 'x' }));
  assert.deepEqual(run({ id: 'x-0001', expected: { a: 1, b: 2 } }), PASS);
});

test('listing the members counts as reading them', () => {
  const run = guarded((v) => (Object.keys(v.expected).length === 2 ? PASS : { status: 'fail', detail: 'x' }));
  assert.deepEqual(run({ id: 'x-0002', expected: { a: 1, b: 2 } }), PASS);
});

test('a pass that left a member unread becomes a fail naming the member', () => {
  const run = guarded((v) => (v.expected.a === 1 ? PASS : { status: 'fail', detail: 'x' }));
  const got = run({ id: 'x-0003', expected: { a: 1, unread_member: true } });
  assert.equal(got.status, 'fail');
  assert.match(got.detail, /x-0003: no branch of the handler reads "unread_member"/u);
});

test('a pass over a case that states no expected member is a fail', () => {
  const got = guarded(() => PASS)({ id: 'x-0004', expected: {} });
  assert.equal(got.status, 'fail');
  assert.match(got.detail, /states no expected member/u);
});

test('a fail or a skip is passed through unchanged', () => {
  const fail = { status: 'fail', detail: 'reason' };
  assert.deepEqual(guarded(() => fail)({ id: 'x-0005', expected: { a: 1 } }), fail);
  const skip = { status: 'skip', detail: 'why' };
  assert.deepEqual(guarded(() => skip)({ id: 'x-0006', expected: { a: 1 } }), skip);
});

test('a case with no expected object is handed to the handler as it is', () => {
  const run = guarded((v) => (v.expected === undefined ? PASS : { status: 'fail', detail: 'x' }));
  assert.deepEqual(run({ id: 'x-0007' }), PASS);
});

test('the build and cli area handlers are guarded', () => {
  // A real case of each area with one member added that no branch reads: the pass the
  // handler would give becomes a fail naming that member.
  const all = conformance.vectors(createFileSystem(ROOT));
  const ctx = { root: ROOT, specVersion: '1.0.0-rc.7' };
  for (const id of ['build-0016', 'cli-0010']) {
    const vector = all.find((v) => v.id === id);
    const area = require(`./areas/${vector.area}.js`);
    assert.equal(area.run(vector, ctx).status, 'pass', id);
    const got = area.run({ ...vector, expected: { ...vector.expected, member_no_branch_reads: true } }, ctx);
    assert.equal(got.status, 'fail', id);
    assert.match(got.detail, /member_no_branch_reads/u, id);
  }
});
