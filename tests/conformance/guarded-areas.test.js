'use strict';
// The vacuous-pass guard (tests/conformance/areas/_expected-reads.js) on every area
// handler: a pass is kept only when the handler read every top-level member of the
// case's `expected`. The second test names all twenty populated areas, so a handler
// file added or left unwrapped fails here.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const fs = require('node:fs');

const conformance = require('../../src/application/conformance.js');
const validate = require('../../src/knowledge/validate.js');
const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');

const ROOT = path.resolve(__dirname, '..', '..');

test('the frontmatter, lint and bundle area handlers are guarded', () => {
  // A real case of each area, one of each input shape the guard must see through,
  // with one member added that no branch reads: the pass becomes a fail naming it.
  const all = conformance.vectors(createFileSystem(ROOT));
  const ctx = { root: ROOT, schemas: validate.schemas(readSchemas(ROOT)), specVersion: '1.0.0' };
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

/** One quick case of each populated area that passes as it is written. */
const ONE_CASE_PER_AREA = Object.freeze({
  adopt: 'adopt-0002',
  boards: 'brd-0002',
  boundary: 'bnd-0001',
  build: 'build-0003',
  bundle: 'bundle-0003',
  chunks: 'chk-0002',
  cli: 'cli-0005',
  compose: 'compose-0014',
  conform: 'conform-0003',
  discovery: 'disc-0009',
  export: 'export-0001',
  frontmatter: 'fm-0004',
  graph: 'graph-0012',
  import: 'imp-0001',
  jcs: 'jcs-0001',
  ledger: 'ledger-0001',
  links: 'links-0002',
  lint: 'lint-0003',
  prov: 'prov-0002',
  slug: 'slug-0002',
});

test('every one of the twenty area handlers is guarded', () => {
  const all = conformance.vectors(createFileSystem(ROOT));
  const ctx = {
    root: ROOT, schemas: validate.schemas(readSchemas(ROOT)), specVersion: '1.0.0', surfaces: conformance.DECLARED_SURFACES,
  };
  // The handler files are the populated areas: one file per area, the helpers start with "_".
  const files = fs.readdirSync(path.join(__dirname, 'areas')).filter((f) => f.endsWith('.js') && !f.startsWith('_'))
    .map((f) => f.slice(0, -'.js'.length)).sort();
  assert.deepEqual(files, Object.keys(ONE_CASE_PER_AREA));
  assert.deepEqual([...new Set(all.map((v) => v.area))].sort(), files);
  for (const [area, id] of Object.entries(ONE_CASE_PER_AREA)) {
    const vector = all.find((v) => v.id === id);
    assert.ok(vector && vector.area === area && vector.level !== 'withdrawn', id);
    const handler = require(`./areas/${area}.js`);
    assert.equal(handler.run(vector, ctx).status, 'pass', id);
    const got = handler.run({ ...vector, expected: { ...vector.expected, member_no_branch_reads: true } }, ctx);
    assert.equal(got.status, 'fail', `${area}: a member no branch reads left ${id} passing`);
    assert.match(got.detail, /member_no_branch_reads/u, id);
  }
});
