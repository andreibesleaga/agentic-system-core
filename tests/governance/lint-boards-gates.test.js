'use strict';
// Three lint checks the 1.0 text left to a later MINOR (verification findings F5, m4).
// A 1.0 Bundle that carried any of the three was valid, so each is a warning (AGSC-00-14):
//   AGSC-02-18  a gate whose checks[] differ from what its level implies: AGSC-E203;
//   AGSC-03-07  a cycle in blocked-by: AGSC-E302, as the cycle in requires is;
//   AGSC-02-19  a clusters[] entry that names no cluster: AGSC-E301.

const test = require('node:test');
const assert = require('node:assert');
const lint = require('../../src/governance/lint.js');

function item({ slug, type = 'concept', ...rest }) {
  return { body: '', frontmatter: { title: slug, type, ...rest }, path: `content/${type}s/${slug}.md`, slug, type };
}
const gate = (slug, level, checks) => item({ checks, level, slug, type: 'gate' });
const found = (findings) => findings.map((f) => [f.code, f.severity, f.slug]);

test('AGSC-02-18: a gate whose checks[] differ from its level is the warning AGSC-E203', () => {
  const bad = lint.checkGates([gate('merge', 'L2', ['schema', 'links', 'review'])]);
  assert.deepStrictEqual(found(bad), [['AGSC-E203', 'warn', 'merge']]);
  assert.match(bad[0].message, /merge.*checks\[links, review, schema\].*L2 implies.*AGSC-02-18/u);
  assert.strictEqual(bad[0].file, 'content/gates/merge.md');
});

test('AGSC-02-18: the full set in any order, no checks[] at all, and other items report nothing', () => {
  const ok = [
    gate('a', 'L1', ['links', 'schema']),
    gate('b', 'L2', ['review', 'determinism', 'provenance', 'links', 'schema']),
    gate('c', 'L2', undefined),
    item({ slug: 'plain' }),
  ];
  assert.deepStrictEqual(lint.checkGates(ok), []);
});

test('AGSC-02-18: an unknown level is left to the schema, which refuses it', () => {
  assert.deepStrictEqual(lint.checkGates([gate('x', 'L3', ['schema'])]), []);
});

test('AGSC-03-07: a cycle in blocked-by is one warning AGSC-E302 that names the cycle', () => {
  const tasks = [
    item({ 'blocked-by': ['b'], kind: 'task', slug: 'a' }),
    item({ 'blocked-by': ['c#top'], kind: 'task', slug: 'b' }),
    item({ 'blocked-by': ['a'], kind: 'task', slug: 'c' }),
    item({ 'blocked-by': ['a'], kind: 'task', slug: 'd' }),
  ];
  const out = lint.checkBoards(tasks);
  assert.deepStrictEqual(found(out), [['AGSC-E302', 'warn', 'a']]);
  assert.match(out[0].message, /cycle in "blocked-by": a -> b -> c \(AGSC-03-07\)/u);
});

test('AGSC-03-07: a chain without a loop, and a target outside the Bundle, report nothing here', () => {
  const tasks = [
    item({ 'blocked-by': ['b', 'elsewhere'], kind: 'task', slug: 'a' }),
    item({ kind: 'task', slug: 'b' }),
  ];
  assert.deepStrictEqual(lint.checkBoards(tasks), []);
});

test('AGSC-02-19: a clusters[] entry that names no cluster is a warning AGSC-E301 for each entry', () => {
  const items = [
    item({ slug: 'board', type: 'cluster' }),
    item({ clusters: ['board', 'nowhere', 'a-concept'], slug: 't' }),
    item({ slug: 'a-concept' }),
    item({ clusters: 'also-missing', slug: 'u' }),
  ];
  const out = lint.checkBoards(items);
  assert.deepStrictEqual(found(out), [['AGSC-E301', 'warn', 't'], ['AGSC-E301', 'warn', 't'], ['AGSC-E301', 'warn', 'u']]);
  assert.match(out[0].message, /clusters\[\] entry "nowhere" names no cluster of this Bundle \(AGSC-02-19\)/u);
  assert.match(out[1].message, /"a-concept"/u);
  assert.strictEqual(out[0].key, 'clusters');
});

test('the lint aggregate carries all three', () => {
  const items = [gate('g', 'L1', ['schema']), item({ clusters: ['x'], slug: 't' })];
  const all = lint.lint({ items }).filter((f) => ['AGSC-E203', 'AGSC-E301'].includes(f.code));
  assert.deepStrictEqual(all.map((f) => [f.code, f.severity]), [['AGSC-E301', 'warn'], ['AGSC-E203', 'warn']]);
});
