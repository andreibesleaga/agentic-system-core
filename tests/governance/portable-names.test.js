'use strict';
// AGSC-01-40 and AGSC-04-05 (1.1): names and paths that only some file systems refuse,
// and Unicode noncharacters in authored text, are the warning AGSC-E423 and nothing is
// refused. The conformance cases bundle-0013..0015 and bundle-0021 pin the main paths;
// these tests pin the edges the cases leave out (case (d), the superscript names, the
// bound itself, a noncharacter at the end of a plane).

const test = require('node:test');
const assert = require('node:assert/strict');

const portable = require('../../src/governance/portable-names.js');

const codes = (findings) => findings.map((f) => `${f.code}:${f.severity}:${f.file}`);

test('AGSC-01-40(a): a device name before the first dot is one warning, a near miss none', () => {
  const hit = portable.checkPaths(['content/concepts/con.md', 'content/concepts/CON.md', 'content/aux/x.md',
    'content/concepts/com9.md', 'content/concepts/lpt¹.md', 'content/concepts/nul.tar.gz']);
  assert.deepEqual(codes(hit), [
    'AGSC-E423:warn:content/concepts/con.md', 'AGSC-E423:warn:content/concepts/CON.md',
    'AGSC-E423:warn:content/aux/x.md', 'AGSC-E423:warn:content/concepts/com9.md',
    'AGSC-E423:warn:content/concepts/lpt¹.md', 'AGSC-E423:warn:content/concepts/nul.tar.gz']);
  const miss = portable.checkPaths(['content/concepts/console.md', 'content/concepts/com10.md',
    'content/concepts/com0.md', 'content/concepts/xcon.md']);
  assert.deepEqual(miss, []);
});

test('AGSC-01-40(b): case-only collisions under attachments and assets are reported on all but the first', () => {
  const found = portable.checkPaths(['content/assets/b.txt', 'content/assets/B.txt', 'content/assets/Photo.txt',
    'content/assets/photo.txt', 'content/assets/PHOTO.txt']);
  assert.deepEqual(found.map((f) => f.file).sort(), ['content/assets/Photo.txt', 'content/assets/b.txt',
    'content/assets/photo.txt'].sort());
  // Outside attachments and assets the same two names are not compared.
  assert.deepEqual(portable.checkPaths(['content/concepts/a.md', 'content/concepts/A.md']), []);
  // Canonically equivalent spellings collide too (NFC).
  assert.equal(portable.checkPaths(['content/assets/é.png', 'content/assets/é.png']).length, 1);
});

test('AGSC-01-40(c): the bound is 200 code points, counted in code points and not in UTF-16 units', () => {
  const at200 = `content/assets/${'x'.repeat(185)}`;
  assert.equal(at200.length, 200);
  assert.deepEqual(portable.checkPaths([at200]), []);
  assert.equal(portable.checkPaths([`${at200}x`]).length, 1);
  // 100 astral characters are 200 UTF-16 units but 100 code points.
  assert.deepEqual(portable.checkPaths([`content/assets/${'\u{1d11e}'.repeat(100)}`]), []);
});

test('AGSC-01-40(d): a trailing space or period and a reserved character are warnings', () => {
  for (const name of ['a.', 'a ', 'a<b', 'a>b', 'a:b', 'a"b', 'a|b', 'a?b', 'a*b']) {
    assert.equal(portable.checkPaths([`content/assets/${name}`]).length, 1, name);
  }
  // A directory segment counts too; a dot inside a name does not.
  assert.equal(portable.checkPaths(['content/assets/dir./a.txt']).length, 1);
  assert.deepEqual(portable.checkPaths(['content/assets/a.b.txt']), []);
});

test('AGSC-01-40: one file is one warning even when several parts of the rule apply', () => {
  const found = portable.checkPaths(['content/concepts/con?.md', 'content/aux/nul.']);
  assert.equal(found.length, 2);
  assert.ok(found.every((f) => f.severity === 'warn' && f.code === 'AGSC-E423'));
});

test('AGSC-04-05: the first noncharacter of a text, the whole range, and the end of every plane', () => {
  assert.equal(portable.firstNoncharacter('plain text'), -1);
  assert.equal(portable.firstNoncharacter('a﷐'), 1);
  assert.equal(portable.firstNoncharacter('﷯'), 0);
  assert.equal(portable.firstNoncharacter('﷏ﷰ'), -1);
  assert.equal(portable.firstNoncharacter('￾'), 0);
  assert.equal(portable.firstNoncharacter('x￿'), 1);
  assert.equal(portable.firstNoncharacter('\u{1fffe}'), 0);
  assert.equal(portable.firstNoncharacter('\u{10ffff}'), 0);
  assert.equal(portable.firstNoncharacter('\u{10fffd}'), -1);
  assert.equal(portable.firstNoncharacter('\u{20000}'), -1);
});

test('AGSC-04-05: checkStrings names the file and where, and walks member names as well as values', () => {
  const found = portable.checkStrings('content/concepts/a.md', [
    { path: 'body', text: 'fine' }, { path: 'frontmatter /title', text: 'bad﷐' },
    { path: 'frontmatter member name', text: '￿key' }]);
  assert.deepEqual(codes(found), ['AGSC-E423:warn:content/concepts/a.md', 'AGSC-E423:warn:content/concepts/a.md']);
  assert.match(found[0].message, /frontmatter \/title/u);
  assert.deepEqual(portable.keyedStrings({ 'k﷐': ['v', { n: 'w' }] }, 'cfg').map((s) => s.text).sort(),
    ['k﷐', 'n', 'v', 'w'].sort());
});
