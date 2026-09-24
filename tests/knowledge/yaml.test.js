'use strict';
// AGSC-02-01…04: the failsafe subset and every rejection with its registered code.

const test = require('node:test');
const assert = require('node:assert');
const yaml = require('../../src/knowledge/yaml.js');

const rejects = (text, code, line) => {
  try {
    yaml.parse(text, { lineOffset: 1 });
    assert.fail(`expected ${code} for ${JSON.stringify(text)}`);
  } catch (e) {
    assert.ok(e instanceof yaml.YamlError, `${e.name}: ${e.message}`);
    assert.strictEqual(e.code, code, e.message);
    if (line !== undefined) assert.strictEqual(e.line, line);
    assert.ok(e.col >= 1);
  }
};

test('every scalar is a string (AGSC-02-03, fm-0006)', () => {
  assert.deepStrictEqual(
    yaml.parse('flag: no\nswitch: on\nvoid: ~\nscale: 1e3\nblob: 0x1F\nd: 2026-01-01\n'),
    { flag: 'no', switch: 'on', void: '~', scale: '1e3', blob: '0x1F', d: '2026-01-01' },
  );
});

test('the admitted shapes parse', () => {
  assert.deepStrictEqual(yaml.parse('a:\n  b: 1\n'), { a: { b: '1' } });
  assert.deepStrictEqual(yaml.parse('a:\n  - x\n  - y\n'), { a: ['x', 'y'] });
  assert.deepStrictEqual(yaml.parse('a: [x, y]\n'), { a: ['x', 'y'] });
  assert.deepStrictEqual(yaml.parse('a: "x: y"\n'), { a: 'x: y' });
  assert.deepStrictEqual(yaml.parse("a: 'it''s'\n"), { a: "it's" });
  assert.deepStrictEqual(yaml.parse('a: |\n  one\n  two\n'), { a: 'one\ntwo\n' });
  assert.deepStrictEqual(yaml.parse('a: >\n  one\n  two\n'), { a: 'one two\n' });
  assert.deepStrictEqual(yaml.parse('# just a comment\na: 1\n'), { a: '1' });
  assert.deepStrictEqual(yaml.parse('s:\n  - resource: https://x.example/\n    title: T\n'),
    { s: [{ resource: 'https://x.example/', title: 'T' }] });
  assert.deepStrictEqual(yaml.parse(''), {});
  assert.deepStrictEqual(yaml.parse('   \n'), {});
});

test('anchors and aliases are AGSC-E103 with the right line (fm-0005)', () => {
  rejects('type: concept\ntitle: S\nx: &a 1\ny: *a\n', 'AGSC-E103', 4);
  rejects('y: *a\n', 'AGSC-E103', 2);
  rejects('a: [&x 1]\n', 'AGSC-E103');
});

test('tags and merge keys are AGSC-E104', () => {
  rejects('a: !!int 3\n', 'AGSC-E104');
  rejects('b:\n  <<: 1\n', 'AGSC-E104');
  rejects('a: [!!int 1]\n', 'AGSC-E104');
});

test('flow mappings, complex keys and nested flow collections are AGSC-E105', () => {
  rejects('a: {b: 1}\n', 'AGSC-E105');
  rejects('? [a, b]\n: v\n', 'AGSC-E105');
  rejects('c: [[1, 2]]\n', 'AGSC-E105');
  rejects('c: [{a: 1}]\n', 'AGSC-E105');
});

test('duplicate keys are AGSC-E106 (AGSC-02-02)', () => {
  rejects('a: 1\na: 2\n', 'AGSC-E106', 3);
});

test('a second document is AGSC-E107 (AGSC-02-01)', () => {
  rejects('a: 1\n---\nb: 2\n', 'AGSC-E107');
});

test('an oversized input is refused with AGSC-E904 (AGSC-01-16)', () => {
  const big = `a: ${'x'.repeat(2048)}\n`;
  assert.throws(() => yaml.parse(big, { maxBytes: 64 }), (e) => e.code === 'AGSC-E904');
  assert.strictEqual(yaml.MAX_INPUT_BYTES, 1024 * 1024);
});

test('a prototype-polluting key cannot reach Object.prototype', () => {
  const out = yaml.parse('__proto__:\n  polluted: yes\na: 1\n');
  assert.strictEqual({}.polluted, undefined);
  assert.ok(Object.getOwnPropertyNames(out).includes('__proto__'));
});

test('a construct the library itself rejects maps to AGSC-E105 (AGSC-02-02)', () => {
  rejects('a: 1\n  b: 2\n', 'AGSC-E105');
  rejects('a: "unterminated\n', 'AGSC-E105');
});

// ---------------------------------------------------------------------------
// lens (b/c): AGSC-E106 is now found by this module in one pass with a key
// set per mapping, because the library's `uniqueKeys` option compares every new
// key against every key already in the mapping and is quadratic in the key count
// — and AGSC-01-16 admits a 1 MiB frontmatter block. These cases pin the
// behaviour the change had to preserve exactly.

test('AGSC-E106 is per MAPPING, at the repeated key, at every nesting level', () => {
  // the repeated key, not the first one, carries the position
  rejects('a: 1\nb: 2\na: 3\n', 'AGSC-E106', 4);
  // inside a nested block mapping
  rejects('a: 1\nnested:\n  x: 1\n  x: 2\n', 'AGSC-E106', 5);
  // inside a mapping that is a sequence entry
  rejects('list:\n  - k: 1\n    k: 2\n', 'AGSC-E106', 4);
  // the SAME key in two SIBLING mappings is not a duplicate
  assert.deepStrictEqual(yaml.parse('list:\n  - k: 1\n  - k: 2\n'), { list: [{ k: '1' }, { k: '2' }] });
  assert.deepStrictEqual(yaml.parse('one:\n  k: 1\ntwo:\n  k: 2\n'), { one: { k: '1' }, two: { k: '2' } });
});

test('AGSC-E106 still loses to an earlier fault of another kind (offset order)', () => {
  // the anchor comes first in the source, so AGSC-E103 is what the caller sees
  rejects('a: &x 1\nb: 2\nb: 3\n', 'AGSC-E103');
  // and the duplicate comes first here
  rejects('b: 1\nb: 2\nc: &x 3\n', 'AGSC-E106');
});

test('a mapping with many DISTINCT keys parses and stays within the AGSC-01-16 cap', () => {
  const n = 20000;
  const source = Array.from({ length: n }, (_, i) => `k${i}: ${i}`).join('\n');
  assert.ok(Buffer.byteLength(source) < yaml.MAX_INPUT_BYTES, 'the fixture is inside the cap');
  const parsed = yaml.parse(source);
  assert.strictEqual(Object.keys(parsed).length, n);
  assert.strictEqual(parsed.k19999, '19999');
  // and one repeat anywhere in that mapping is still found
  rejects(`${source}\nk0: again\n`, 'AGSC-E106', n + 2);
});
