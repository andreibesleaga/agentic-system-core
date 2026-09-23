'use strict';
// application/bundle.js (ENG-9): a FileSystem-port refusal that carries a registered
// code is a Finding about that one file (AGSC-01-14, AGSC-01-16); an error without one
// is a programming fault and is thrown, never disguised as a domain fact.

const test = require('node:test');
const assert = require('node:assert');

const { loadBundle } = require('../../src/application/bundle.js');

function port(fail) {
  return {
    exists: (p) => ['agsc.config.json', 'content/concepts', 'content/concepts/a.md', 'content/index.md'].includes(p),
    readdir: () => ['a.md'],
    readFile: (p) => {
      if (p === 'agsc.config.json') return '{}';
      throw fail;
    },
    walk: () => [],
  };
}

test('a coded refusal is a Finding, for the item and for content/index.md', () => {
  const refusal = Object.assign(new Error('not valid UTF-8'), { code: 'AGSC-E108' });
  const bundle = loadBundle(port(refusal), {});
  assert.deepStrictEqual(bundle.findings.map((f) => [f.code, f.file]),
    [['AGSC-E108', 'content/concepts/a.md'], ['AGSC-E108', 'content/index.md']]);
  assert.strictEqual(bundle.items.length, 0);
  assert.strictEqual(bundle.index, null);
});

test('an uncoded error is thrown', () => {
  assert.throws(() => loadBundle(port(new Error('EIO')), {}), /EIO/u);
});
