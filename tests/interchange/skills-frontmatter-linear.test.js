'use strict';
// `agsc import --from skills` reads the top-level "key: value" lines of a foreign
// frontmatter block that the failsafe YAML subset refuses (AGSC-01-26a, AGSC-02-02),
// in linear steps. The pattern it used gave the blanks after a key back one at a time
// when the line ended in a carriage return, U+2028 or U+2029, and read the rest of the
// line again each time: one 100 KB line took about 94 s end to end. A foreign skills
// repository is untrusted input.
//
// Steps are counted, not timed (tests/_linear-kit.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const skills = require('../../src/interchange/adapters/skills.js');
const { MIB, assertLinear, texts } = require('../_linear-kit.js');

/** The reader as it stood, kept as the reference the scan must equal. */
function oldFlat(yamlText) {
  const out = Object.create(null);
  for (const line of String(yamlText).split('\n')) {
    const m = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/u.exec(line);
    if (m === null) continue;
    let value = m[2].trim();
    if (/^".*"$/u.test(value)) {
      try { value = JSON.parse(value); } catch (e) { value = value.slice(1, -1); }
    } else if (/^'.*'$/u.test(value)) value = value.slice(1, -1).replace(/''/gu, '\'');
    out[m[1]] = String(value);
  }
  return out;
}

test('the lenient reader equals the pattern it replaced on a seeded corpus', () => {
  const alphabet = ['name:', 'globs:', ' ', '\t', '"', '\'', 'x', '*.ts', '\n', '\r', '\u2028', '\u2029', ':'];
  for (const text of texts(20261012, 20000, alphabet)) {
    assert.deepEqual({ ...skills.flatFrontmatter(text) }, { ...oldFlat(text) }, JSON.stringify(text));
  }
});

test('a 1 MiB key line ending in a line terminator is skipped in linear steps', () => {
  for (const end of ['\r', '\u2028', '\u2029']) {
    const yaml = `name: x\nglobs: *.ts\nlicense:${' '.repeat(MIB)}${end}x\n`;
    const read = assertLinear(`flatFrontmatter, blanks then ${JSON.stringify(end)}`, skills.flatFrontmatter, yaml);
    assert.deepEqual({ ...read }, { globs: '*.ts', name: 'x' });
  }
  const plain = `name:${' '.repeat(MIB)}x\n`;
  assert.deepEqual({ ...assertLinear('flatFrontmatter, blanks then a word', skills.flatFrontmatter, plain) }, { name: 'x' });
});
