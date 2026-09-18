'use strict';
// The Ajv wrapper: AGSC-02-24 (code points), AGSC-01-10 (u-flag patterns) and the
// oneOf discrimination that §9.4's precedence depends on.

const test = require('node:test');
const assert = require('node:assert');
const schema = require('../../src/knowledge/schema.js');
const { readSchemas } = require('../../src/adapters/node-fs.js');

const raw = readSchemas();

test('all three shipped schemas compile', () => {
  for (const name of ['item', 'config', 'bundle']) {
    assert.strictEqual(typeof schema.compile(raw[name]), 'function', name);
  }
});

test('lengths are counted in code points (AGSC-02-24, frontmatter-0030)', () => {
  const v = schema.compile(raw.item.properties.title);
  assert.strictEqual(v('😀'.repeat(120)).valid, true);
  const over = v('😀'.repeat(121));
  assert.strictEqual(over.valid, false);
  assert.strictEqual(over.errors[0].keyword, 'maxLength');
});

test('oneOf reports the discriminated branch, not every branch', () => {
  const v = schema.compile(raw.item);
  const missingKind = v({ type: 'concept', title: 'Supervisor', prov: { origin: 'human', operator: 'human:a' } });
  assert.deepStrictEqual(missingKind.errors.map((e) => [e.path, e.keyword, e.params.missingProperty]),
    [['', 'required', 'kind']]);
  const badState = v({
    type: 'concept', kind: 'task', task_state: 'TASK_STATE_FROZEN', title: 'T ok',
    prov: { origin: 'human', operator: 'human:a' },
  });
  assert.deepStrictEqual(badState.errors.map((e) => [e.path, e.keyword]), [['/task_state', 'enum']]);
});

test('a value matching no branch keeps the most specific keyword', () => {
  const v = schema.compile({
    type: 'object',
    properties: { x: { oneOf: [{ enum: ['a'] }, { type: 'string', pattern: '^b$' }] } },
  });
  const r = v({ x: 'zzz' });
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.errors[0].keyword, 'enum');
});

test('a value matching several branches is still a failure', () => {
  const v = schema.compile({ oneOf: [{ type: 'string' }, { type: 'string', minLength: 1 }] });
  assert.strictEqual(v('x').valid, false);
});

test('an unsupported keyword throws at COMPILE time, never at validate time', () => {
  assert.throws(() => schema.compile({ type: 'object', notAKeyword: 1 }), schema.SchemaError);
});

test('keywordsUsed derives the list src/README.md publishes', () => {
  const all = new Set();
  const formats = new Set();
  for (const name of ['item', 'config', 'bundle']) {
    const used = schema.keywordsUsed(raw[name]);
    used.keywords.forEach((k) => all.add(k));
    used.formats.forEach((f) => formats.add(f));
  }
  assert.deepStrictEqual([...formats].sort(), ['uri']);
  for (const expected of ['type', 'enum', 'const', 'required', 'properties', 'patternProperties',
    'additionalProperties', 'items', 'minItems', 'maxItems', 'uniqueItems', 'minLength',
    'maxLength', 'minimum', 'maximum', 'pattern', '$ref', '$defs', 'oneOf', 'allOf', 'if', 'then']) {
    assert.ok(all.has(expected), `${expected} should appear in the derived keyword list`);
  }
  assert.ok(!all.has('unevaluatedProperties'));
});

test('the discriminator compares structured consts, not only strings', () => {
  const v = schema.compile({
    type: 'object',
    oneOf: [
      { type: 'object', properties: { k: { const: ['a', 'b'] }, n: { type: 'integer' } }, required: ['n'] },
      { type: 'object', properties: { k: { const: 'z' } } },
    ],
  });
  const r = v({ k: ['a', 'b'] });
  assert.strictEqual(r.valid, false);
  assert.deepStrictEqual(r.errors.map((e) => e.params.missingProperty), ['n']);
  assert.strictEqual(v({ k: ['a', 'b'], n: 1 }).valid, true);
});

test('local $ref resolves and a boolean subschema is honoured', () => {
  const v = schema.compile({
    type: 'object',
    properties: { a: { $ref: '#/$defs/s' }, b: true },
    $defs: { s: { type: 'string', pattern: '^x$' } },
  });
  assert.strictEqual(v({ a: 'x', b: 1 }).valid, true);
  assert.strictEqual(v({ a: 'y' }).errors[0].keyword, 'pattern');
});
