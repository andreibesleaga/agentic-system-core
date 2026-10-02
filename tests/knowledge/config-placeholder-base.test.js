'use strict';
// AGSC-01-19: `site.base` MUST be an absolute `https:` URL, with one exception — the
// development placeholder `http://localhost` or `http://localhost:<port>` (optionally with
// a trailing slash) that adoption writes (AGSC-02-94) — "which lint MUST report as
// `AGSC-E506` … until the owner replaces it". Before 2026-10-02 only `init` reported it,
// once, when it wrote the file; `lint`, `build` and `ci` were silent afterwards, so a
// node could reach publication with the placeholder unremarked (adopt-0007 found it).

const test = require('node:test');
const assert = require('node:assert/strict');

const validate = require('../../src/knowledge/validate.js');
const { readSchemas } = require('../../src/adapters/node-fs.js');

const S = validate.schemas(readSchemas());

function config(base) {
  return {
    build: { out: 'www' },
    bundle: { id: 'notes', operator: 'human:someone' },
    site: { base, title: 'Notes' },
    spec_version: '1.0.0-rc.6',
  };
}

const placeholderWarnings = (base) => validate.config(config(base), { schemas: S })
  .filter((f) => f.code === 'AGSC-E506' && f.key === 'site.base');

test('AGSC-01-19: every form of the placeholder is reported once, as a warning naming site.base', () => {
  for (const base of ['http://localhost', 'http://localhost/', 'http://localhost:8080', 'http://localhost:8080/']) {
    const found = placeholderWarnings(base);
    assert.equal(found.length, 1, base);
    assert.equal(found[0].severity, 'warn', base);
    assert.match(found[0].message, /development placeholder/u, base);
  }
});

test('AGSC-01-19: a real https base is not reported', () => {
  assert.deepEqual(placeholderWarnings('https://example.org/'), []);
  assert.deepEqual(placeholderWarnings('https://example.org/notes'), []);
});
