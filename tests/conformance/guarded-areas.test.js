'use strict';
// The vacuous-pass guard (tests/conformance/areas/_expected-reads.js) on the
// `frontmatter`, `lint` and `bundle` area handlers: a pass is kept only when the handler
// read every top-level member of the case's `expected`.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const conformance = require('../../src/application/conformance.js');
const validate = require('../../src/knowledge/validate.js');
const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');

const ROOT = path.resolve(__dirname, '..', '..');

test('the frontmatter, lint and bundle area handlers are guarded', () => {
  // A real case of each area, one of each input shape the guard must see through,
  // with one member added that no branch reads: the pass becomes a fail naming it.
  const all = conformance.vectors(createFileSystem(ROOT));
  const ctx = { root: ROOT, schemas: validate.schemas(readSchemas(ROOT)), specVersion: '1.0.0-rc.7' };
  for (const id of ['fm-0005', 'fm-0009', 'lint-0001', 'lint-0034', 'bundle-0006', 'bundle-0009']) {
    const vector = all.find((v) => v.id === id);
    assert.ok(vector, id);
    const area = require(`./areas/${vector.area}.js`);
    assert.equal(area.run(vector, ctx).status, 'pass', id);
    const got = area.run({ ...vector, expected: { ...vector.expected, member_no_branch_reads: true } }, ctx);
    assert.equal(got.status, 'fail', id);
    assert.match(got.detail, /member_no_branch_reads/u, id);
  }
});
