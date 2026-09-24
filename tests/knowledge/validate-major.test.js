'use strict';
// AGSC-00-17: an item MAY carry `spec_version`; when it does, its MAJOR MUST be the
// one the Bundle root fixes, and another MAJOR is AGSC-E204 (the pattern class, as
// the rule names since 2026-09-24). Before this check the reference engine accepted
// `2.0.0` on an item in silence.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const validate = require('../../src/knowledge/validate.js');
const { readSchemas } = require('../../src/adapters/node-fs.js');

const ROOT = path.resolve(__dirname, '..', '..');
const schemas = validate.schemas(readSchemas(ROOT));
const config = { spec_version: '1.0.0-rc.6' };

function concept(extra) {
  return {
    type: 'concept',
    title: 'Handoff',
    kind: 'explainer',
    description: 'An agent passes control to another agent, with the context it needs to continue.',
    tags: ['agents', 'control'],
    prov: { origin: 'human', operator: 'human:someone' },
    ...extra,
  };
}

const codes = (findings) => findings.map((f) => f.code);

test('AGSC-00-17: an item of another MAJOR is AGSC-E204 on the spec_version key', () => {
  const findings = validate.item(concept({ spec_version: '2.0.0' }), { schemas, config, file: 'content/concepts/handoff.md', slug: 'handoff' });
  const hit = findings.find((f) => f.code === 'AGSC-E204');
  assert.ok(hit, JSON.stringify(codes(findings)));
  assert.strictEqual(hit.key, 'spec_version');
  assert.match(hit.message, /another MAJOR/u);
  assert.strictEqual(hit.severity, 'error');
});

test('AGSC-00-17: the same MAJOR, or no spec_version at all, raises nothing', () => {
  assert.ok(!codes(validate.item(concept({ spec_version: '1.0.0-rc.6' }), { schemas, config, slug: 'handoff' })).includes('AGSC-E204'));
  assert.ok(!codes(validate.item(concept({ spec_version: '1.4.2' }), { schemas, config, slug: 'handoff' })).includes('AGSC-E204'));
  assert.ok(!codes(validate.item(concept(), { schemas, config, slug: 'handoff' })).includes('AGSC-E204'));
  // Without a Bundle root to fix the MAJOR the check has nothing to compare with.
  assert.ok(!codes(validate.item(concept({ spec_version: '2.0.0' }), { schemas, slug: 'handoff' })).includes('AGSC-E204'));
});
