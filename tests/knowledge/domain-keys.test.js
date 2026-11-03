'use strict';
// verifies AGSC-02-25, AGSC-03-27
// The front-matter keys of the domain layer as the item schema reads them: `warrant` faults
// take AGSC-E512, the code the registry names for them, over the schema codes AGSC-E202 and
// AGSC-E203 (§9.4 precedence: the more specific code wins); `domain_links` is a known key
// whose members are arrays of Link values. The whole-item cases are fm-0022 to fm-0027.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const validate = require('../../src/knowledge/validate.js');
const { readSchemas } = require('../../src/adapters/node-fs.js');

const SCHEMAS = validate.schemas(readSchemas(path.resolve(__dirname, '..', '..')));
const BASE = Object.freeze({
  description: 'A term of the tests on the domain keys; its keys are the point of the tests.',
  kind: 'term',
  prov: { operator: 'human:tester', origin: 'human' },
  title: 'Account',
  type: 'concept',
});
const codesOf = (extra) => validate.item({ ...BASE, ...extra }, { schemas: SCHEMAS, file: 'content/concepts/account.md' })
  .map((f) => f.code);

test('a warrant with no type, no source, or a type outside the three is AGSC-E512 (AGSC-02-25)', () => {
  assert.deepStrictEqual(codesOf({ warrant: { source: 'https://example.org/a' } }), ['AGSC-E512']);
  assert.deepStrictEqual(codesOf({ warrant: { type: 'user' } }), ['AGSC-E512']);
  assert.deepStrictEqual(codesOf({ warrant: {} }), ['AGSC-E512', 'AGSC-E512']);
  assert.deepStrictEqual(codesOf({ warrant: { source: 'Z39.19', type: 'organizational' } }), ['AGSC-E512']);
});

test('a warrant that meets the rule is silent, and a member it does not know is preserved (AGSC-02-25)', () => {
  for (const type of ['literary', 'user', 'organisational']) {
    assert.deepStrictEqual(codesOf({ warrant: { source: 'ANSI/NISO Z39.19-2005 (R2010)', type, note: 'kept' } }), []);
  }
});

test('the other faults of a warrant keep the code the §9.4 precedence gives them', () => {
  assert.deepStrictEqual(codesOf({ warrant: { source: '', type: 'user' } }), ['AGSC-E204']);
  assert.deepStrictEqual(codesOf({ warrant: { source: 'a\nb', type: 'user' } }), ['AGSC-E204']);
  assert.deepStrictEqual(codesOf({ warrant: 'https://example.org/a' }), ['AGSC-E201']);
});

test('domain_links is a known key: an object of Link arrays under local names (AGSC-03-27)', () => {
  assert.deepStrictEqual(codesOf({ domain_links: { controls: ['engine-a', 'engine-b#intent'], 'paired_with-x': ['b'] } }), []);
  // A member name outside the grammar is no member the schema admits (AGSC-02-24 has no propertyNames).
  assert.deepStrictEqual(codesOf({ domain_links: { '9lives': ['b'] } }), ['AGSC-E201']);
  assert.deepStrictEqual(codesOf({ domain_links: { controls: ['https://elsewhere.example/b'] } }), ['AGSC-E204']);
  assert.deepStrictEqual(codesOf({ domain_links: { controls: 'b' } }), ['AGSC-E201']);
  assert.deepStrictEqual(codesOf({ domain_links: { controls: ['b', 'b'] } }), ['AGSC-E201']);
  assert.deepStrictEqual(codesOf({ domain_links: ['b'] }), ['AGSC-E201']);
});
