'use strict';
// AGSC-02-90…93: adoption is TOTAL, idempotent and byte-preserving.

const test = require('node:test');
const assert = require('node:assert');
const adopt = require('../../src/knowledge/adopt.js');
const validate = require('../../src/knowledge/validate.js');
const { readSchemas } = require('../../src/adapters/node-fs.js');

const S = validate.schemas(readSchemas());
const CONFIG = { bundle: { operator: 'human:andreibesleaga' } };

test('operatorFor resolves the three sources in order (AGSC-02-90)', () => {
  assert.deepStrictEqual(adopt.operatorFor(CONFIG, 'x@y.z'),
    { operator: 'human:andreibesleaga', source: 'config', findings: [] });
  const git = adopt.operatorFor({}, 'Andrei.N+tag@example.org');
  assert.strictEqual(git.operator, 'human:andrei.n-tag');
  assert.deepStrictEqual(git.findings.map((f) => [f.code, f.severity]), [['AGSC-E506', 'warn']]);
  assert.strictEqual(adopt.operatorFor({}, '++@example.org').operator, 'human:unknown');
  assert.strictEqual(adopt.operatorFor({}, null).operator, 'human:unknown');
  assert.strictEqual(adopt.operatorFor(undefined, 'no-at-sign').operator, 'human:unknown');
  assert.strictEqual(adopt.operatorFor({ bundle: {} }, null).findings[0].code, 'AGSC-E506');
});

test('titleFor is total (AGSC-02-90)', () => {
  assert.strictEqual(adopt.titleFor('# Handoff\n', 'x', 'x').title, 'Handoff');
  assert.strictEqual(adopt.titleFor('no heading\n', 'My Notes', 'my-notes').title, 'My Notes');
  const long = adopt.titleFor(`# ${'a'.repeat(200)}\n`, 's', 'slug');
  assert.strictEqual(long.title.length, 120);
  assert.strictEqual(long.findings[0].code, 'AGSC-E506');
  const short = adopt.titleFor('# x\n', 'ab', 'a-longer-slug');
  assert.strictEqual(short.title, 'a-longer-slug');
  assert.strictEqual(short.findings[0].code, 'AGSC-E506');
  assert.strictEqual(adopt.titleFor('# x\n', 'ab', 'a').title, 'note-a');
});

test('AGSC-01-05: README, index and _index are never adopted', () => {
  for (const name of ['README.md', 'readme.md', 'index.md', '_index.md']) {
    const r = adopt.adoptFile({ path: name, markdown: '# x\n' }, { config: CONFIG });
    assert.strictEqual(r.skipped, true, name);
    assert.strictEqual(r.changed, false);
    assert.strictEqual(r.findings[0].code, 'AGSC-E506');
    assert.strictEqual(r.output, '# x\n');
  }
});

test('AGSC-02-93: a file already under content/<type-plural>/ is not moved', () => {
  const r = adopt.adoptFile({ path: 'content/concepts/handoff.md', markdown: '# Handoff\n' }, { config: CONFIG });
  assert.strictEqual(r.path, 'content/concepts/handoff.md');
  assert.strictEqual(r.frontmatter.aliases, undefined, 'no alias: nothing moved');
  assert.strictEqual(r.changed, true);
});

test('AGSC-01-23: colliding slugs take -2, -3, … in discovery order', () => {
  const r = adopt.adopt([
    { path: 'b/notes.md', markdown: '# Beta notes\n' },
    { path: 'a/notes.md', markdown: '# Alpha notes\n' },
    { path: 'c/notes.md', markdown: '# Gamma notes\n' },
  ], { config: CONFIG });
  assert.deepStrictEqual(r.files.map((f) => f.path),
    ['content/concepts/notes.md', 'content/concepts/notes-2.md', 'content/concepts/notes-3.md']);
  assert.deepStrictEqual(r.files.map((f) => f.frontmatter.title), ['Alpha notes', 'Beta notes', 'Gamma notes']);
  assert.ok(r.findings.some((f) => f.code === 'AGSC-E506'));
});

test('AGSC-02-92: what adoption synthesizes always validates, warnings only', () => {
  const r = adopt.adoptFile({ path: 'weird name!.md', markdown: 'no heading at all\n' }, { config: {} });
  const findings = validate.item(r.frontmatter, { schemas: S });
  assert.deepStrictEqual(findings.filter((f) => f.severity === 'error'), []);
  assert.ok(findings.some((f) => f.code === 'AGSC-E408'));
});

test('the emitted YAML is the AGSC-04-19 profile', () => {
  assert.strictEqual(
    adopt.serialize({ type: 'concept', title: 'A: b', aliases: ['x.md'] }),
    '---\ntype: concept\ntitle: "A: b"\naliases:\n  - x.md\n---\n'
  );
});

test('AGSC-02-95: relative body references are found, absolute ones are not', () => {
  const refs = adopt.relativeReferences(
    'see [a](../a.md) and ![i](img/p.png "t") and [x](https://e.org) and [y](#frag) and [m](mailto:a@b.c)'
  );
  assert.deepStrictEqual(refs, [{ reference: '../a.md', image: false }, { reference: 'img/p.png', image: true }]);
  assert.deepStrictEqual(adopt.relativeReferences('nothing here'), []);
});

test('the body is byte-identical after adoption (AGSC-02-90)', () => {
  const body = '# T\n\n\ntrailing blank lines below\n\n\n';
  const r = adopt.adoptFile({ path: 't.md', markdown: body }, { config: CONFIG });
  assert.ok(r.output.endsWith(`\n${body}`));
  assert.strictEqual(r.body, body);
});
