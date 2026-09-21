'use strict';
// AGSC-01-22 — the FOREIGN reader. The old format is not the YAML subset of
// AGSC-02-02: it uses dotted keys and flow sequences, both of which the
// conforming reader refuses with AGSC-E105. Refusing a foreign file for being
// foreign is exactly what AGSC-01-22 forbids, so this module is the
// anti-corruption boundary and these tests are its contract.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const oldsite = require('../../src/interchange/oldsite.js');

const CARDS = path.resolve(__dirname, '..', 'fixtures', 'old-site-10', 'content', 'patterns');
const read = (name) => oldsite.readCard({
  path: `content/patterns/${name}`,
  markdown: fs.readFileSync(path.join(CARDS, name), 'utf8'),
});

test('a whole card reads into a nested record, a body and the key list', () => {
  const card = read('alpha-one.md');
  assert.deepStrictEqual(card.findings, []);
  assert.strictEqual(card.slug, 'alpha-one');
  assert.strictEqual(card.record.title, 'Alpha One');
  assert.strictEqual(card.record.diagram.file, 'alpha-one-old.svg');
  assert.deepStrictEqual(card.record.tags, ['alpha', 'mapping', 'batch-one']);
  assert.deepStrictEqual(card.record.aliases, ['a-one', 'the first']);
  assert.strictEqual(card.record.references[0].url, 'https://example.org/one');
  assert.strictEqual(card.record.references[1].year, '2025');
  assert.strictEqual(card.record.implementations[0].label, 'A reference implementation');
  assert.ok(card.keys.includes('references.0.label'));
  assert.ok(card.body.startsWith('\n## Intent\n'));
  assert.ok(card.body.endsWith('\n'));
});

test('AGSC-02-01: a card with no frontmatter block is AGSC-E101, body preserved', () => {
  const card = oldsite.readCard({ path: 'x.md', markdown: '# Just a heading\n' });
  assert.deepStrictEqual(card.findings.map((f) => f.code), ['AGSC-E101']);
  assert.strictEqual(card.body, '# Just a heading\n');
  assert.deepStrictEqual(Object.keys(card.record), []);
});

test('AGSC-02-01: an unterminated block is AGSC-E102 and nothing is invented', () => {
  const card = read('unterminated.md');
  assert.deepStrictEqual(card.findings.map((f) => f.code), ['AGSC-E102']);
  assert.deepStrictEqual(Object.keys(card.record), []);
});

test('AGSC-01-16: a card over the byte cap is AGSC-E904 and is not parsed', () => {
  const card = oldsite.readCard({ path: 'big.md', markdown: `---\na: b\n---\n${'x'.repeat(oldsite.MAX_BYTES)}` });
  assert.deepStrictEqual(card.findings.map((f) => f.code), ['AGSC-E904']);
  assert.strictEqual(card.body, '');
});

test('AGSC-01-22: a line that is not `key: value` is a WARNING and is skipped', () => {
  const card = oldsite.readCard({ path: 'x.md', markdown: '---\ngood: yes\n- a list item\nalso: fine\n---\nbody\n' });
  // `- a list item` is the third line of the file, counting the opening fence.
  assert.deepStrictEqual(card.findings.map((f) => [f.code, f.severity, f.line]), [['AGSC-E101', 'warn', 3]]);
  assert.strictEqual(card.record.good, 'yes');
  assert.strictEqual(card.record.also, 'fine');
});

test('AGSC-01-14: CRLF, CR and a missing final newline are all normalised', () => {
  const card = oldsite.readCard({ path: 'x.md', markdown: '---\r\na: b\r\n---\r\nline\r\rmore' });
  assert.strictEqual(card.body, 'line\n\nmore\n');
  assert.strictEqual(card.record.a, 'b');
});

test('the record is prototype-free, so a dotted `__proto__` key cannot pollute', () => {
  const card = oldsite.readCard({ path: 'x.md', markdown: '---\n__proto__.polluted: yes\n---\n' });
  assert.strictEqual({}.polluted, undefined);
  assert.strictEqual(Object.getPrototypeOf(card.record), null);
});

test('a Windows path still yields the stem as the slug', () => {
  const card = oldsite.readCard({ path: 'content\\patterns\\win.md', markdown: '---\na: b\n---\n' });
  assert.strictEqual(card.slug, 'win');
  assert.strictEqual(card.path, 'content/patterns/win.md');
});

test('parseValue(): flow sequences, booleans, quoted and plain scalars', () => {
  assert.deepStrictEqual(oldsite.parseValue('[a, b, "c, d"]'), ['a', 'b', 'c, d']);
  assert.deepStrictEqual(oldsite.parseValue('[]'), []);
  assert.strictEqual(oldsite.parseValue('true'), true);
  assert.strictEqual(oldsite.parseValue('false'), false);
  assert.strictEqual(oldsite.parseValue('  plain  '), 'plain');
  assert.strictEqual(oldsite.parseValue('"quoted"'), 'quoted');
  assert.strictEqual(oldsite.parseValue("'single'"), 'single');
  assert.strictEqual(oldsite.parseScalar('"'), '"', 'a lone quote is not a quoted string');
});

test('parseFlowSequence(): a trailing empty entry is dropped, not kept as ""', () => {
  assert.deepStrictEqual(oldsite.parseFlowSequence('[a, ]'), ['a']);
  assert.deepStrictEqual(oldsite.parseFlowSequence("['x']"), ['x']);
});

test('setDotted(): nested objects, arrays and an array of objects', () => {
  const target = Object.create(null);
  oldsite.setDotted(target, ['a', 'b'], '1');
  oldsite.setDotted(target, ['list', '0'], 'first');
  oldsite.setDotted(target, ['list', '1'], 'second');
  oldsite.setDotted(target, ['deep', '0', 'k'], 'v');
  oldsite.setDotted(target, ['deep', '0', 'j'], 'w');
  assert.strictEqual(target.a.b, '1');
  assert.deepStrictEqual(target.list, ['first', 'second']);
  assert.strictEqual(target.deep[0].k, 'v');
  assert.strictEqual(target.deep[0].j, 'w');
  // A scalar already at a path is replaced by the container the dotted key needs.
  oldsite.setDotted(target, ['a'], 'scalar');
  oldsite.setDotted(target, ['a', 'c'], '2');
  assert.strictEqual(target.a.c, '2');
  // A numeric segment inside an array of arrays.
  const nested = Object.create(null);
  oldsite.setDotted(nested, ['m', '0', '0'], 'x');
  assert.deepStrictEqual(nested.m, [['x']]);
});

test('AGSC-01-14: normaliseSource() gives a `.diagram` LF endings and one final LF', () => {
  assert.strictEqual(oldsite.normaliseSource('a\r\nb'), 'a\nb\n');
  assert.strictEqual(oldsite.normaliseSource('a\n\n\n'), 'a\n');
  assert.strictEqual(oldsite.normaliseSource(''), '\n');
});
