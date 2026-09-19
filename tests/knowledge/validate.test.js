'use strict';
// The §9.4 code precedence, AGSC-02-03's type application, AGSC-02-05/05a key
// classification, AGSC-01-03 placement and AGSC-00-15 MAJOR tolerance.

const test = require('node:test');
const assert = require('node:assert');
const validate = require('../../src/knowledge/validate.js');
const { readSchemas } = require('../../src/adapters/node-fs.js');

const S = validate.schemas(readSchemas());
const PROV = { origin: 'human', operator: 'human:andreibesleaga' };
const CONCEPT = {
  type: 'concept',
  title: 'Supervisor',
  description: 'A coordinating agent that routes work to specialised workers and collects their results.',
  kind: 'pattern',
  prov: PROV,
};
const codes = (fm, options) => validate.item(fm, { schemas: S, ...options }).map((f) => f.code);

test('a valid concept produces no finding', () => {
  assert.deepStrictEqual(codes(CONCEPT), []);
});

test('prov faults take AGSC-E501 and AGSC-E503, not AGSC-E202 (AGSC-08-01)', () => {
  const { prov, ...noProv } = CONCEPT;
  assert.deepStrictEqual(codes(noProv), ['AGSC-E501']);
  assert.deepStrictEqual(codes({ ...CONCEPT, prov: { origin: 'human' } }), ['AGSC-E503']);
  // An invalid origin is an enum violation: AGSC-E203, never the reserved AGSC-E502.
  assert.deepStrictEqual(codes({ ...CONCEPT, prov: { ...PROV, origin: 'nope' } }), ['AGSC-E203']);
});

test('pattern and length faults take AGSC-E204 (AGSC-02-06, AGSC-02-24)', () => {
  assert.deepStrictEqual(codes({ ...CONCEPT, stale_after: '2027-01-01' }), ['AGSC-E204']);
  assert.deepStrictEqual(codes({ ...CONCEPT, title: 'ab' }), ['AGSC-E204']);
});

test('a missing branch key takes AGSC-E202 (AGSC-02-12)', () => {
  const { kind, ...noKind } = CONCEPT;
  assert.deepStrictEqual(codes(noKind), ['AGSC-E202']);
});

test('a cluster with two parents is AGSC-E308, never AGSC-E201 (AGSC-03-08)', () => {
  assert.deepStrictEqual(
    codes({ type: 'cluster', title: 'Cluster', description: 'x'.repeat(50), prov: PROV, broader: ['a', 'b'] }),
    ['AGSC-E308']
  );
});

test('AGSC-02-05 / AGSC-02-05a: unknown, vendor and malformed keys', () => {
  const keys = validate.unknownKeys({ ...CONCEPT, 'x-acme-priority': 'high', 'zzz-unknown': 'v', 'Bad Key': 1 },
    { schemas: S });
  assert.deepStrictEqual(keys.vendor, ['x-acme-priority']);
  assert.deepStrictEqual(keys.unknown, ['zzz-unknown']);
  assert.deepStrictEqual(keys.malformed, ['Bad Key']);
  const found = codes({ ...CONCEPT, 'x-acme-priority': 'high', 'zzz-unknown': 'v', 'Bad Key': 1 });
  assert.ok(found.includes('AGSC-E207'));
  assert.ok(found.includes('AGSC-E204'));
  assert.strictEqual(found.filter((c) => c === 'AGSC-E207').length, 1, 'the x- namespace never warns');
  assert.deepStrictEqual(validate.unknownKeys(null, {}), { known: [], vendor: [], unknown: [], malformed: [] });
});

test('AGSC-02-21: a concept or cluster with no description warns AGSC-E408', () => {
  const { description, ...bare } = CONCEPT;
  const findings = validate.item(bare, { schemas: S });
  assert.deepStrictEqual(findings.map((f) => [f.code, f.severity]), [['AGSC-E408', 'warn']]);
});

test('AGSC-01-21: a tag outside the closed vocabulary is AGSC-E203', () => {
  const config = { tags: { allowed: ['agents'] } };
  assert.deepStrictEqual(codes({ ...CONCEPT, tags: ['agents'] }, { config }), []);
  assert.deepStrictEqual(codes({ ...CONCEPT, tags: ['nope'] }, { config }), ['AGSC-E203']);
  assert.deepStrictEqual(codes({ ...CONCEPT, tags: ['nope'] }), []);
});

test('AGSC-02-03: the schema\'s declared types are applied to failsafe strings', () => {
  const fm = validate.applyTypes(
    { type: 'cluster', title: 'C', order: '3', unknown: '1e3' }, S.item.schema
  );
  assert.strictEqual(fm.order, 3);
  assert.strictEqual(fm.unknown, '1e3', 'a key the schema does not type keeps its string');
  const ep = validate.applyTypes(
    { type: 'episode', usage: { tokens_in: '10', cost_usd: '0.5', estimate: 'true' } }, S.item.schema
  );
  assert.deepStrictEqual(ep.usage, { tokens_in: 10, cost_usd: 0.5, estimate: true });
  // A string that is not written as AGSC-02-04 requires is left alone so the schema reports it.
  assert.strictEqual(validate.applyTypes({ type: 'cluster', order: 'x' }, S.item.schema).order, 'x');
  assert.deepStrictEqual(validate.applyTypes(['1'], { type: 'array', items: { type: 'integer' } }), [1]);
  assert.deepStrictEqual(validate.applyTypes(['1'], { type: 'array' }), ['1']);
});

test('the Bundle root is validated against bundle.schema.json (AGSC-01-04)', () => {
  const root = {
    spec_version: '1.0.0-rc.4', okf_version: '0.2', title: 'Bundle root',
    description: 'x'.repeat(50), base: 'https://example.org/',
  };
  assert.deepStrictEqual(validate.index(root, { schemas: S }), []);
  assert.deepStrictEqual(validate.index({ ...root, type: 'concept' }, { schemas: S }).map((f) => f.code),
    ['AGSC-E205']);
  assert.ok(validate.index({ ...root, weird: 1 }, { schemas: S }).some((f) => f.code === 'AGSC-E207'));
  assert.deepStrictEqual(validate.index('nope', { schemas: S }).map((f) => f.code), ['AGSC-E201']);
});

test('configuration is closed: an unknown key is AGSC-E004 (AGSC-01-18)', () => {
  const base = {
    spec_version: '1.0.0-rc.4',
    site: { base: 'https://example.org/', title: 'T' },
    bundle: { id: 'b' },
  };
  assert.deepStrictEqual(validate.config(base, { schemas: S }), []);
  assert.deepStrictEqual(validate.config({ ...base, nope: 1 }, { schemas: S }).map((f) => f.code), ['AGSC-E004']);
  assert.deepStrictEqual(validate.config({ ...base, 'x-acme-key': 1 }, { schemas: S }), []);
  assert.deepStrictEqual(validate.config([], { schemas: S }).map((f) => f.code), ['AGSC-E004']);
});

test('the agent-lane check is INJECTED, never imported (context boundary)', () => {
  const base = {
    spec_version: '1.0.0-rc.4',
    site: { base: 'https://example.org/', title: 'T' },
    bundle: { id: 'b' },
    agents: [],
  };
  const injected = () => [{ code: 'AGSC-E212', col: 1, file: '', line: 1, message: 'm', severity: 'error' }];
  assert.deepStrictEqual(validate.config(base, { schemas: S, checkAgents: injected }).map((f) => f.code),
    ['AGSC-E212']);
});

test('AGSC-01-02 / AGSC-01-03 placement', () => {
  assert.deepStrictEqual(validate.placement('content/concepts/a.md', { type: 'concept' }), []);
  assert.deepStrictEqual(validate.placement('content\\concepts\\a.md', { type: 'concept' }), []);
  assert.deepStrictEqual(validate.placement('content/procedures/a.md', { type: 'concept' }).map((f) => f.code),
    ['AGSC-E205']);
  assert.deepStrictEqual(validate.placement('notes/a.md', { type: 'concept' }).map((f) => f.code), ['AGSC-E205']);
  assert.deepStrictEqual(validate.placement('content/things/a.md', { type: 'thing' }).map((f) => f.code),
    ['AGSC-E205']);
  assert.deepStrictEqual(validate.placement('content/concepts/a.fr.md', { type: 'concept', lang: 'de' })
    .map((f) => f.code), ['AGSC-E205']);
  assert.deepStrictEqual(validate.placement('content/concepts/a.fr.md', { type: 'concept', lang: 'FR' }), []);
  assert.deepStrictEqual(validate.placement('content/concepts/a.md', { type: 'concept', id: 'b' })
    .map((f) => f.code), ['AGSC-E204']);
});

test('AGSC-00-15 MAJOR tolerance (bundle-0001)', () => {
  assert.strictEqual(validate.majorCompatible('1.4.2', '1.0.0-rc.4'), true);
  assert.strictEqual(validate.majorCompatible('2.0.0', '1.0.0-rc.4'), false);
  assert.strictEqual(validate.majorCompatible(undefined, '1.0.0-rc.4'), true);
  assert.strictEqual(validate.majorCompatible('x', '1.0.0-rc.4'), false);
});

test('findings sort by (file, line, col, code) (AGSC-09-10)', () => {
  const f = (file, line, col, code) => ({ file, line, col, code });
  assert.deepStrictEqual(
    validate.sortFindings([f('b', 1, 1, 'AGSC-E201'), f('a', 2, 1, 'AGSC-E201'),
      f('a', 1, 2, 'AGSC-E201'), f('a', 1, 1, 'AGSC-E301'), f('a', 1, 1, 'AGSC-E201')])
      .map((x) => `${x.file}${x.line}${x.col}${x.code}`),
    ['a11AGSC-E201', 'a11AGSC-E301', 'a12AGSC-E201', 'a21AGSC-E201', 'b11AGSC-E201']
  );
});

test('a frontmatter that is not a mapping is AGSC-E201', () => {
  assert.deepStrictEqual(codes(['a']), ['AGSC-E201']);
  assert.deepStrictEqual(codes(null), ['AGSC-E201']);
});

test('severity is the literal "warn", never "warning" (AGSC-09-11)', () => {
  const { description, ...bare } = CONCEPT;
  for (const f of validate.item(bare, { schemas: S })) {
    assert.ok(f.severity === 'warn' || f.severity === 'error', f.severity);
  }
});

test('a fault no 2xx code names falls back to AGSC-E201 (§9.4 precedence)', () => {
  assert.deepStrictEqual(codes({ ...CONCEPT, tags: 'not-an-array' }), ['AGSC-E201']);
  assert.strictEqual(validate.codeFor({ keyword: 'uniqueItems', path: '/tags', params: {} }, 'item'), 'AGSC-E201');
  assert.strictEqual(validate.codeFor({ keyword: 'format', path: '/peers/0', params: {} }, 'config'), 'AGSC-E204');
});

test('the Bundle root reports its own schema faults (AGSC-01-04)', () => {
  const findings = validate.index({ title: 'x' }, { schemas: S });
  assert.ok(findings.some((f) => f.code === 'AGSC-E202'));
  assert.ok(findings.some((f) => f.code === 'AGSC-E204'));
  assert.ok(findings.every((f) => f.file === 'content/index.md'));
});

test('applyTypes follows patternProperties and leaves a vendor key alone', () => {
  const out = validate.applyTypes({ 'x-acme-n': '3' }, {
    type: 'object',
    patternProperties: { '^x-[a-z0-9]+-[a-z0-9]+$': { type: 'integer' } },
  });
  assert.strictEqual(out['x-acme-n'], 3);
  assert.deepStrictEqual(validate.applyTypes('7', { type: 'integer' }), 7);
  assert.deepStrictEqual(validate.applyTypes('7', {}), '7');
  assert.deepStrictEqual(validate.applyTypes(null, { type: 'object' }), null);
});

// V9-D lens (b): `deref` follows a `$ref` chain, so it needs a bound. Dropping
// the bound survived the whole suite, because no test drove a chain longer than
// one hop — and a cyclic `$ref` would then loop for ever inside a pure reader.
test('AGSC-02-03: a cyclic or very long $ref chain terminates instead of looping', () => {
  const cyclic = {
    $defs: { a: { $ref: '#/$defs/b' }, b: { $ref: '#/$defs/a' } },
    properties: { x: { $ref: '#/$defs/a' } },
    type: 'object',
  };
  // The contract is termination with a value, not a particular value: a reader
  // that cannot resolve a type leaves the failsafe string alone (AGSC-02-03).
  const out = validate.applyTypes({ x: '7' }, cyclic, cyclic);
  assert.deepStrictEqual(out, { x: '7' });

  // A chain longer than the bound resolves to something, and still terminates.
  const long = { $defs: {}, properties: { n: { $ref: '#/$defs/s0' } }, type: 'object' };
  for (let i = 0; i < 64; i += 1) long.$defs[`s${i}`] = { $ref: `#/$defs/s${i + 1}` };
  long.$defs.s64 = { type: 'integer' };
  const deep = validate.applyTypes({ n: '7' }, long, long);
  assert.ok(deep.n === '7' || deep.n === 7, JSON.stringify(deep));

  // A chain inside the bound DOES resolve, so the guard is not simply refusing.
  const short = { $defs: { s0: { $ref: '#/$defs/s1' }, s1: { type: 'integer' } }, properties: { n: { $ref: '#/$defs/s0' } }, type: 'object' };
  assert.deepStrictEqual(validate.applyTypes({ n: '7' }, short, short), { n: 7 });
});
