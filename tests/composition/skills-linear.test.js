'use strict';
// `agsc skills import` reads the "key: value" lines of a skill pack's frontmatter
// (AGSC-07-19, AGSC-07-22) in linear steps. The pattern it used gave the blanks after a
// key back one at a time when the rest of the line held a line terminator that `.`
// does not match, and read the rest again each time: 32,000 blanks took about 7 s. A
// pack handed to the verb is untrusted input.
//
// Steps are counted, not timed (tests/_linear-kit.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const skills = require('../../src/composition/skills.js');
const { MIB, assertLinear, texts } = require('../_linear-kit.js');

/** The reader as it stood, kept as the reference the scan must equal. */
function oldDeclared(yamlText) {
  const declared = Object.create(null);
  for (const line of yamlText.split('\n')) {
    const pair = /^([a-z][a-z0-9_-]*):\s*(.*)$/u.exec(line);
    if (pair !== null) declared[pair[1]] = pair[2].trim();
  }
  return declared;
}

test('the pack frontmatter reader equals the pattern it replaced on a seeded corpus', () => {
  const alphabet = ['name:', 'license:', ' ', '\t', 'x', ':', '\n', '\r', '\u2028', '\u2029', '\u00a0', 'A'];
  for (const text of texts(20261012, 20000, alphabet)) {
    assert.deepEqual({ ...skills.declaredKeys(text) }, { ...oldDeclared(text) }, JSON.stringify(text));
  }
});

test('a 1 MiB key line whose rest holds a line terminator is skipped in linear steps', () => {
  for (const end of ['\r', '\u2028', '\u2029']) {
    const yaml = `name: x\nlicense:${' '.repeat(MIB)}b${end}c`;
    assert.deepEqual({ ...assertLinear(`declaredKeys, a terminator after ${JSON.stringify(end)}`, skills.declaredKeys, yaml) },
      { name: 'x' });
  }
  const pack = `---\nname: x\ndescription:${' '.repeat(MIB)}e\u2028f\nlicense: MIT\n---\nBody.\n`;
  const read = skills.importPack(pack, { operator: 'human:x' });
  assert.deepEqual([read.path, read.frontmatter.description, read.frontmatter['x-skill-license']],
    ['content/procedures/x.md', '', 'MIT']);
});
