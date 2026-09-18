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
    { flag: 'no', switch: 'on', void: '~', scale: '1e3', blob: '0x1F', d: '2026-01-01' }
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
