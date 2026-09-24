'use strict';
// AGSC-09-04: a withdrawn vector MAY carry `superseded_by`, the id of the vector that
// supersedes it, so that a machine follows the chain without reading prose. The
// checker requires the link to be a vector id, to sit on a withdrawn vector, and to
// name a vector of the set (AGSC-E201 otherwise; AGSC-E204 when malformed).

const test = require('node:test');
const assert = require('node:assert');
const { envelope, tmpdir, writeTree } = require('./helpers.js');

/** JCS member order is the AGSC-09-06 obligation; the keys below are written sorted. */
function vector(fields) {
  const sorted = {};
  for (const key of Object.keys(fields).sort()) sorted[key] = fields[key];
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

const live = (id, extra = {}) => vector({
  area: 'frontmatter', description: 'A live case for the check.', expected: { valid: true }, id,
  input: { markdown: '---\ntype: concept\ntitle: T\n---\n' }, level: 'required', rule: 'AGSC-02-01', ...extra,
});
const withdrawn = (id, extra = {}) => vector({
  area: 'frontmatter', description: 'A withdrawn case.', expected: { withdrawn: true }, id,
  input: {}, level: 'withdrawn', reason: `superseded, see ${extra.superseded_by || 'the reason'}`, rule: 'AGSC-02-01', ...extra,
});

const codesOf = (json) => json.findings.map((f) => `${f.code} ${f.file.split('/').pop()}`).sort();

test('AGSC-09-04: a withdrawn vector whose superseded_by names a vector of the set passes', () => {
  const dir = writeTree(tmpdir(), {
    'frontmatter/fm-9001-old.json': withdrawn('fm-9001', { superseded_by: 'fm-9002' }),
    'frontmatter/fm-9002-new.json': live('fm-9002'),
  });
  const { code, json } = envelope('validate-vectors', [dir]);
  assert.strictEqual(code, 0, JSON.stringify(json.findings));
  assert.deepStrictEqual(json.findings.filter((f) => f.severity === 'error'), []);
});

test('AGSC-09-04: a superseded_by that names no vector, or sits on a live vector, is AGSC-E201', () => {
  const dir = writeTree(tmpdir(), {
    'frontmatter/fm-9001-old.json': withdrawn('fm-9001', { superseded_by: 'fm-9999' }),
    'frontmatter/fm-9002-new.json': live('fm-9002', { superseded_by: 'fm-9001' }),
    'frontmatter/fm-9003-bad.json': withdrawn('fm-9003', { superseded_by: 'not an id' }),
  });
  const { code, json } = envelope('validate-vectors', [dir]);
  assert.strictEqual(code, 1);
  const codes = codesOf(json);
  assert.ok(codes.includes('AGSC-E201 fm-9001-old.json'), codes.join(', '));
  assert.ok(codes.includes('AGSC-E201 fm-9002-new.json'), codes.join(', '));
  assert.ok(codes.includes('AGSC-E204 fm-9003-bad.json'), codes.join(', '));
  assert.match(json.findings.find((f) => f.file.endsWith('fm-9001-old.json') && f.code === 'AGSC-E201').message, /names no vector/u);
  assert.match(json.findings.find((f) => f.file.endsWith('fm-9002-new.json') && f.code === 'AGSC-E201').message, /only a withdrawn vector/u);
});
