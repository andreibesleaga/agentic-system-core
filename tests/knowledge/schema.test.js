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

// `title` is compiled as part of the WHOLE item schema since rc.5 (FV28-01): it now
// carries `$ref: "#/$defs/single_line"`, and a `$ref` resolves against the document
// that defines it, never against a subschema lifted out of it.
const itemWith = (overrides) => ({
  type: 'concept', kind: 'explainer', title: 'Supervisor',
  prov: { origin: 'human', operator: 'human:a' }, ...overrides,
});

test('lengths are counted in code points (AGSC-02-24, frontmatter-0030)', () => {
  const v = schema.compile(raw.item);
  assert.strictEqual(v(itemWith({ title: '😀'.repeat(120) })).valid, true);
  const over = v(itemWith({ title: '😀'.repeat(121) }));
  assert.strictEqual(over.valid, false);
  assert.deepStrictEqual(over.errors.map((e) => [e.path, e.keyword]), [['/title', 'maxLength']]);
});

test('an authored single-line string carries no line break (AGSC-02-24, FV28-01)', () => {
  const v = schema.compile(raw.item);
  const hostile = 'Handoff\n\n## Injected Section\n\n- [Fake](https://evil.example/): pwned';
  const bad = v(itemWith({ title: hostile }));
  assert.strictEqual(bad.valid, false);
  assert.deepStrictEqual(bad.errors.map((e) => [e.path, e.keyword]), [['/title', 'pattern']]);
  // Every one of the five classes, and only those five.
  for (const ch of ['\u0000', '\t', '\n', '\r', '\u001f', '\u007f', '\u0085', '\u2028', '\u2029']) {
    assert.strictEqual(v(itemWith({ title: `Hand${ch}off` })).valid, false, JSON.stringify(ch));
  }
  for (const ch of ['\u0020', '\u00a0', '\u2027', '\u202a', '\ufeff', '\u{1F600}', '\u2014']) {
    assert.strictEqual(v(itemWith({ title: `Hand${ch}off` })).valid, true, JSON.stringify(ch));
  }
  // The same class on the other authored members a writer puts on a line.
  assert.strictEqual(v(itemWith({
    description: `A concept description long enough to pass the forty code-point bound\u2028forged`,
  })).valid, false);
  assert.strictEqual(v(itemWith({
    diagram: { file: 'supervisor.svg', alt: 'a\nb' },
  })).valid, false);
  assert.strictEqual(v(itemWith({
    sources: [{ resource: 'https://example.org/x', title: 'a\nb' }],
  })).valid, false);
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
