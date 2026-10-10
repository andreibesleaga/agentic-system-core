'use strict';
// AGSC-09-14b: `remember` MUST synthesize a CONFORMING item, and AGSC-09-13a: a tool
// that cannot fulfil a call answers the error envelope, never a transport error.
//
// Before the fix, the local tool server did not check its
// arguments:
//   (a) `kind: "constructor"` (or `toString`, `__proto__`) was a table hit and gave a
//       Proposal for `content/function Object() { [native code] }s/….md`;
//   (b) `sources` that was not a list threw, which the transport turned into a JSON-RPC
//       error;
//   (c) `severity`, `outcome`, `at`, `operator`, `agent`, `model`, `usage` and a title
//       under 3 characters were returned unchecked, and the item failed the schema.
// The check is ONE portable function, `pageRememberFault`, which the page tools
// (AGSC-09-16) run as the same bytes; the page already handled (a) and (b).
//
// No clock, no network: the fixture Bundle through the FileSystem port.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const { tools } = require('../../src/distribution/mcp-tools.js');
const pageTools = require('../../src/distribution/page-tools.js');

const schemas = validate.schemas(readSchemas('.'));
const toolset = () => tools(loadBundle(createFileSystem('tests/fixtures/minimal'), { schemas }), {});
const OPERATOR = 'human:someone';

/** Every error-severity schema finding of a synthesized item. */
function schemaFaults(body) {
  return validate.item(body.frontmatter, { schemas }).filter((f) => f.severity !== 'warn');
}

test('(a) a kind named after a prototype member is not a kind', () => {
  // Since AGSC-09-14b was amended, a kind outside the five is AGSC-E203; before, it
  // fell back to a concept.
  for (const kind of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    const r = toolset().call('remember', { body: 'x', kind, operator: OPERATOR, title: 'A Plain Note' });
    assert.equal(r.type, 'error', kind);
    assert.equal(r.body.code, 'AGSC-E203', kind);
  }
});

test('(b) sources that is not a list is not a transport error', () => {
  for (const sources of [5, 'https://example.org/', { resource: 'https://example.org/' }, null]) {
    const r = toolset().call('remember', { body: 'x', kind: 'concept', operator: OPERATOR, sources, title: 'A Plain Note' });
    assert.equal(r.type, 'proposal', JSON.stringify(sources));
    assert.equal(r.body.frontmatter.sources, undefined);
  }
});

test('(c) an argument that would make the item non-conforming is refused with its code', () => {
  const base = { body: 'x', operator: OPERATOR, title: 'A Plain Note' };
  const cases = [
    [{ ...base, kind: 'concept', title: 'T' }, 'AGSC-E204'],
    [{ ...base, kind: 'concept', title: 'x'.repeat(121) }, 'AGSC-E204'],
    [{ ...base, kind: 'concept', title: 'Two\nlines here' }, 'AGSC-E204'],
    [{ ...base, kind: 'concept', title: 42 }, 'AGSC-E204'],
    [{ ...base, kind: 'lesson', severity: 'catastrophic' }, 'AGSC-E203'],
    [{ ...base, actor: 'process:x', at: 'yesterday', kind: 'episode' }, 'AGSC-E204'],
    [{ ...base, actor: 'process:x', at: '2026-01-01T00:00:00Z', kind: 'episode', outcome: 'meh' }, 'AGSC-E203'],
    [{ ...base, kind: 'concept', operator: 'someone' }, 'AGSC-E204'],
    [{ ...base, agent: 'a\nb', kind: 'concept' }, 'AGSC-E204'],
    [{ ...base, kind: 'concept', model: 7 }, 'AGSC-E204'],
    [{ ...base, actor: 'process:x', at: '2026-01-01T00:00:00Z', kind: 'episode', usage: { tokens_in: Infinity } }, 'AGSC-E201'],
    [{ ...base, actor: 'process:x', at: '2026-01-01T00:00:00Z', kind: 'episode', usage: { tokens_in: 1.5 } }, 'AGSC-E201'],
    [{ ...base, actor: 'process:x', at: '2026-01-01T00:00:00Z', kind: 'episode', usage: { cost_usd: 'free' } }, 'AGSC-E201'],
    [{ ...base, actor: 'process:x', at: '2026-01-01T00:00:00Z', kind: 'episode', usage: { estimate: 'yes' } }, 'AGSC-E201'],
  ];
  for (const [args, code] of cases) {
    const r = toolset().call('remember', args);
    assert.equal(r.type, 'error', JSON.stringify(args));
    assert.equal(r.body.code, code, JSON.stringify(args));
  }
});

test('every Proposal remember returns on the local server passes the item schema', () => {
  const calls = [
    { body: 'x', kind: 'concept', operator: OPERATOR, title: 'A Plain Note' },
    { body: 'x', kind: 'task', operator: OPERATOR, title: 'A Task Here', cluster: 'agent-patterns' },
    { body: 'x', kind: 'lesson', operator: OPERATOR, severity: 'warn', title: 'A Lesson Learned' },
    { body: 'x', kind: 'procedure', operator: OPERATOR, title: 'A Procedure' },
    { actor: 'process:x', at: '2026-01-01T00:00:00Z', body: 'x', kind: 'episode', operator: OPERATOR, outcome: 'success', title: 'A Run', usage: { cost_usd: 0.5, estimate: true, model: 'm', tokens_in: 10, tokens_out: 3 } },
  ];
  for (const args of calls) {
    const r = toolset().call('remember', args);
    assert.equal(r.type, 'proposal', JSON.stringify(r.body));
    assert.deepEqual(schemaFaults(r.body), [], JSON.stringify(args));
  }
});

test('the page tools run the same check (AGSC-09-16)', () => {
  assert.equal(typeof pageTools.pageRememberFault, 'function');
  assert.ok(pageTools.PORTABLE.includes('pageRememberFault'), 'the check is emitted into the page');
  assert.deepEqual(pageTools.pageRememberFault({ kind: 'lesson', severity: 'catastrophic', title: 'A Lesson' }, 'lesson').code, 'AGSC-E203');
  assert.equal(pageTools.pageRememberFault({ kind: 'concept', title: 'A Plain Note' }, 'concept'), null);
});
