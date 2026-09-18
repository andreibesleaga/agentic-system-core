'use strict';
// AGSC-08-17 (`clean-room`). Owner: C (WP-10-C).

const test = require('node:test');
const assert = require('node:assert');
const cleanroom = require('../../src/governance/cleanroom.js');

const codes = (findings) => findings.map((f) => f.code);

test('a non-empty refused key is AGSC-E405 and an empty one is not', () => {
  assert.deepStrictEqual(codes(cleanroom.check({ frontmatter: { [cleanroom.REFUSED_KEY]: 'x' } })),
    ['AGSC-E405']);
  assert.deepStrictEqual(cleanroom.check({ frontmatter: { [cleanroom.REFUSED_KEY]: '' } }), []);
  assert.deepStrictEqual(cleanroom.check({ frontmatter: {} }), []);
});

test('each excluded file is AGSC-E405, wherever it sits', () => {
  for (const name of cleanroom.EXCLUDED_FILES) {
    assert.deepStrictEqual(codes(cleanroom.check({ paths: [`content/${name}`] })), ['AGSC-E405'], name);
  }
  assert.deepStrictEqual(cleanroom.check({ paths: ['content/index.md'] }), []);
});

test('a whole-corpus emitter is refused outright', () => {
  assert.deepStrictEqual(codes(cleanroom.check({ emitters: ['pdf'] })), ['AGSC-E405']);
  assert.deepStrictEqual(codes(cleanroom.check({ emitters: ['EPUB'] })), ['AGSC-E405']);
  assert.deepStrictEqual(cleanroom.check({ emitters: ['html', 'jsonld'] }), []);
});

test('a refused framing or reading-order construct is one AGSC-E405, not many', () => {
  const findings = cleanroom.check({ text: `${cleanroom.REFUSED_PHRASES[0]} and ${cleanroom.REFUSED_PHRASES[1]}` });
  assert.deepStrictEqual(codes(findings), ['AGSC-E405']);
});

test('ordinary technical prose passes the clean room', () => {
  assert.deepStrictEqual(cleanroom.check({
    text: 'A Bundle is a folder of Markdown items with frontmatter, compiled to a static site.',
    frontmatter: { type: 'concept' },
    paths: ['content/concepts/a.md'],
    emitters: [],
  }), []);
  assert.deepStrictEqual(cleanroom.check({}), []);
  assert.deepStrictEqual(cleanroom.check(), []);
});
