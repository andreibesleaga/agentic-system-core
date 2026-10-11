'use strict';
// The vacuous-pass guard (tests/conformance/areas/_expected-reads.js) on the
// `chunks`, `export`, `links`, `prov` and `slug` area handlers: a pass is kept only
// when the handler read every top-level member of the case's `expected`, and a `prov`
// case with no handler is a fail, never a skip that the suite would count as passed.
//
// Deterministic: the export and prov cases copy the minimal fixture under the system
// temporary directory with a fixed build instant, and remove the copy.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const conformance = require('../../src/application/conformance.js');
const validate = require('../../src/knowledge/validate.js');
const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');

const ROOT = path.resolve(__dirname, '..', '..');
const ALL = conformance.vectors(createFileSystem(ROOT));
const CTX = { root: ROOT, schemas: validate.schemas(readSchemas(ROOT)), specVersion: '1.0.0' };

test('the chunks, export, links, prov and slug area handlers are guarded', () => {
  // A real case of each area and of each input shape, with one member added that no
  // branch reads: the pass becomes a fail naming it.
  for (const id of ['chk-0006', 'export-0001', 'export-0002', 'links-0004', 'links-0009', 'prov-0005',
    'prov-0009', 'prov-0010', 'prov-0012', 'slug-0006']) {
    const vector = ALL.find((v) => v.id === id);
    assert.ok(vector, id);
    const area = require(`./areas/${vector.area}.js`);
    assert.equal(area.run(vector, CTX).status, 'pass', id);
    const got = area.run({ ...vector, expected: { ...vector.expected, member_no_branch_reads: true } }, CTX);
    assert.equal(got.status, 'fail', id);
    assert.match(got.detail, /member_no_branch_reads/u, id);
  }
});

test('a prov case with no handler fails', () => {
  const area = require('./areas/prov.js');
  const got = area.run({ area: 'prov', expected: { accepted: true }, id: 'prov-9999', input: {} }, CTX);
  assert.equal(got.status, 'fail');
  assert.match(got.detail, /no handler/u);
});
