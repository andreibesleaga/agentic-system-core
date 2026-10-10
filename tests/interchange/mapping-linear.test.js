'use strict';
// AGSC-03-02 on import: the old site's body links `[label](/patterns/<slug>/)` are
// found by a scan that is linear in the length of the body. An imported card body has
// no size cap, and the pattern this scan replaced tried every `[` and read to the end
// of the body from each one, so one long run of `[` stalled the import (100,000
// characters took about 30 s).
//
// Steps are counted, not timed (tests/_linear-kit.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const mapping = require('../../src/interchange/mapping.js');
const { MIB, assertLinear } = require('../_linear-kit.js');

test('a 1 MiB run of "[" holds no link and is scanned in linear steps', () => {
  assert.deepEqual(assertLinear('patternLinks, a run of [', mapping.patternLinks, '['.repeat(MIB), 4), []);
});

test('a run of "[" then a real link: the link is found from the first "["', () => {
  const body = `${'['.repeat(MIB)}x](/patterns/alpha-one/)`;
  const found = assertLinear('patternLinks, a run of [ then a link', mapping.patternLinks, body, 4);
  assert.equal(found.length, 1);
  assert.equal(found[0].index, 0);
  assert.equal(found[0].end, body.length);
  assert.equal(found[0].target, 'alpha-one');
  assert.equal(found[0].label.length, MIB);
});

test('many labels that close on one "]" and almost-links are scanned in linear steps', () => {
  const shapes = [
    `${'[a'.repeat(MIB / 2)}](/patterns/`,
    '[a](/patterns/'.repeat(MIB / 14),
    `[a](/patterns/${'b'.repeat(MIB)}`,
    '](/patterns/a/'.repeat(MIB / 14),
    '[]'.repeat(MIB / 2),
  ];
  for (const body of shapes) assertLinear('patternLinks, near misses', mapping.patternLinks, body, 4);
});

test('the body rewrite keeps a hostile body as it was and de-links nothing', () => {
  const body = `${'['.repeat(MIB)}\n`;
  const result = mapping.rewriteBodyLinks(body, new Set(['alpha-one']));
  assert.equal(result.body, body);
  assert.deepEqual(result.rewritten, []);
  assert.deepEqual(result.delinked, []);
});
