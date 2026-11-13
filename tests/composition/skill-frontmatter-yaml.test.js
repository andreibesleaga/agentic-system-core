'use strict';
// A SKILL.md frontmatter value is a YAML string, whatever the text (AGSC-07-15, AGSC-07-19).
//
// The Harness and the skill packs wrote `description: <text>` unquoted, so a description
// such as `true`, `123` or `a: b` parsed as a boolean, a number or a map, and the file
// was no longer the Agent Skills file it claims to be. From 1.1 such a value is written as
// a double-quoted scalar, and ONLY such a value: a text that already parses to the same
// string keeps its bytes, so every pinned Harness (compose-0027) stays what it was.
//
// `yamlScalar` is a portable function (the Harness runs in a page, where the `yaml`
// package is not), so it decides without a parser; the parser is the oracle here.

const test = require('node:test');
const assert = require('node:assert/strict');
const YAML = require('yaml');
const { compose } = require('../../src/composition/compose.js');
const harness = require('../../src/composition/harness.js');
const skills = require('../../src/composition/skills.js');
const { texts } = require('../_linear-kit');

/** What a standard YAML reader makes of `key: <text>`, as the value it reads. */
function parsed(text) {
  try {
    const doc = YAML.parse(`key: ${text}\n`);
    return doc !== null && typeof doc === 'object' && Object.keys(doc).length === 1 ? doc.key : { notAString: true };
  } catch (e) {
    return { notAString: true };
  }
}

test('yamlScalar quotes exactly the texts that do not parse to themselves as a string', () => {
  const alphabet = ['a', 'b', ' ', ':', '-', '#', '?', '[', ']', '{', '}', ',', '&', '*', '!', '|', '>', '\'', '"',
    '%', '@', '`', '0', '1', '2', '.', 'e', 'E', '+', 'x', 'o', 'true', 'false', 'null', '~', 'inf', 'nan', 'yes', '7'];
  let quoted = 0;
  let plain = 0;
  for (const text of [...texts(21, 12000, alphabet, 8), ...['true', 'True', 'null', '~', '123', '-5', '+1', '1.5', '.5',
    '1e3', '0x1F', '0o17', '.inf', '-.INF', '.nan', 'a: b', 'a:b', 'a #b', 'a#b', '- x', '-x', '? x', '?x', ': x',
    ':x', '[a]', '{a}', 'a, b', '"q"', 'it\'s', 'x"y', '@at', '`tick', '%p', '!tag', '&a', '*a', '|x', '>x', 'end:']]) {
    if (text !== text.trim() || text === '') continue;
    const want = parsed(text);
    const safe = want === text;
    const written = harness.yamlScalar(text);
    assert.equal(written === text, safe, `${JSON.stringify(text)} is ${safe ? '' : 'not '}a plain string`);
    if (!safe) {
      assert.equal(parsed(written), text, `${JSON.stringify(text)} written as ${written}`);
      quoted += 1;
    } else {
      plain += 1;
    }
  }
  assert.ok(quoted > 500 && plain > 500, `the corpus is lopsided: ${quoted} quoted, ${plain} plain`);
  assert.equal(harness.yamlScalar(''), '""');
});

test('yamlScalar quotes a text with leading or trailing white space, so a padded keyword stays a string', () => {
  for (const text of ['true ', 'null ', '123 ', ' x', 'x\t', 'a b ', '1.5\t']) {
    const written = harness.yamlScalar(text);
    assert.notEqual(written, text, JSON.stringify(text));
    assert.equal(parsed(written), text, `${JSON.stringify(text)} written as ${written}`);
  }
});

const SELECTION = [
  { slug: 'true', type: 'procedure', title: 'Truth', description: 'true', body: '## Steps\n\n1. Do.\n' },
  { slug: '123', type: 'procedure', title: 'Number', description: '123', body: '## Steps\n\n1. Do.\n' },
  { slug: 'null', type: 'procedure', title: 'Map', description: 'a: b', body: '## Steps\n\n1. Do.\n' },
  { slug: 'plain-one', type: 'procedure', title: 'Plain', description: 'Keep every credential in the environment.', body: '## Steps\n\n1. Do.\n' },
];

test('a Harness SKILL.md frontmatter parses to the strings it was given', () => {
  const result = compose(SELECTION, SELECTION.map((i) => i.slug));
  const out = harness.emit(result, {
    base: 'https://minimal.example/', instant: '2026-01-01T00:00:00Z', items: SELECTION, licenseProse: 'LicenseRef-AgenticSystemCore-Content-Use-1.0',
    name: 'x', selectionDigest: 'a'.repeat(64), specVersion: '1.1.0',
  });
  const byslug = new Map(out.kinds.skills.map((s) => [s.slug, out.files.get(s.path)]));
  for (const item of SELECTION) {
    const text = byslug.get(item.slug);
    const front = YAML.parse(text.split('\n---\n')[0].slice(4));
    assert.equal(front.name, item.slug, item.slug);
    assert.equal(front.description, item.description, item.slug);
  }
  // A description that is already a string keeps its bytes (compose-0027 pins them).
  assert.match(byslug.get('plain-one'), /\ndescription: Keep every credential in the environment\.\n/u);
  assert.match(byslug.get('true'), /\nname: "true"\ndescription: "true"\n/u);
});

test('a skill pack SKILL.md frontmatter parses to the strings it was given', () => {
  const options = { base: 'https://minimal.example/', generatedAt: '2026-01-01T00:00:00Z', license: 'LicenseRef-AgenticSystemCore-Content-Use-1.0', specVersion: '1.1.0' };
  for (const [slug, description] of [['true', 'true'], ['2026', '12'], ['ok-pack', 'Fine: really'], ['plain', 'Plain words here.']]) {
    const text = skills.packText({ slug, title: 'T', description, type: 'cluster' }, [], options);
    const front = YAML.parse(text.split('\n---\n')[0].slice(4));
    assert.equal(front.name, slug);
    assert.equal(front.description, description);
  }
  assert.match(skills.packText({ slug: 'plain', title: 'T', description: 'Plain words here.', type: 'cluster' }, [], options),
    /\nname: plain\ndescription: Plain words here\.\n/u);
});
