'use strict';
// AGSC-08-28(d) as amended 2026-10-02 for 1.0.0: the Episode an agent lane adds to its
// Proposal names the instruction bundle it ran with as `sources[0]` =
// {id: "urn:agsc:prompt:sha256:<hex>", resource: "urn:agsc:channel:<lane>:prompt"}. Until
// then the rule put the digest in `resource`, a form AGSC-02-10 and the item schema refuse, so
// the record a lane MUST write could not validate. This test holds the rule's form to the schema.
//
// Deterministic: reads the schemas of this repository only.

const test = require('node:test');
const assert = require('node:assert/strict');

const validate = require('../../src/knowledge/validate.js');
const { readSchemas } = require('../../src/adapters/node-fs.js');

const S = validate.schemas(readSchemas());
const HEX = 'a'.repeat(64);

function episode(source) {
  return {
    type: 'episode',
    title: 'Editor lane run',
    started: '2026-01-01T00:00:00Z',
    actor: 'process:editor',
    outcome: 'partial',
    sources: [source],
    prov: { origin: 'ai-generated', agent: 'editor', model: 'some-model', operator: 'human:someone' },
  };
}

const errors = (fm) => validate.item(fm, { schemas: S }).filter((f) => f.severity !== 'warn');

test('AGSC-08-28(d): the amended source entry of an agent-lane Episode validates', () => {
  assert.deepEqual(errors(episode({ id: `urn:agsc:prompt:sha256:${HEX}`, resource: 'urn:agsc:channel:editor:prompt' })), []);
});

test('AGSC-02-10: the form the rule used to name is refused by the schema', () => {
  assert.ok(errors(episode({ resource: `urn:agsc:prompt:sha256:${HEX}` })).length > 0);
});
