'use strict';
// tests/knowledge/diagram-golden.test.js — the byte-stable goldens of AGSC-04-01
// and the `--check` staleness mode of AGSC-04-02, over fifteen diagrams of
// different shapes (M3-T12).
//
// The fixture pairs live in `tests/fixtures/diagrams/`: `<slug>.diagram` is the
// source, `<slug>.svg` is what it MUST compile to. Fourteen are authored sources
// taken from the corpus this engine imports; the fifteenth is synthetic and
// carries the four constructs the authored corpus never uses (`canvas`, `bar`,
// an uncaptioned `region`, a `path` with an arrowhead).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const diagrams = require('../../src/knowledge/diagrams.js');
const { svgViolations } = require('../../src/governance/lint.js');

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'diagrams');

/** The fixture slugs, read from disk so a new pair is covered without an edit. */
const SLUGS = fs.readdirSync(FIXTURES)
  .filter((f) => f.endsWith('.diagram'))
  .map((f) => f.slice(0, -'.diagram'.length))
  .sort();

const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

test('the golden set covers at least twelve diagrams of different shapes', () => {
  assert.ok(SLUGS.length >= 12, `${SLUGS.length} golden pairs`);
  const statementsUsed = new Set();
  for (const slug of SLUGS) {
    for (const line of diagrams.statements(read(`${slug}.diagram`))) {
      statementsUsed.add(line.text.split(' ')[0]);
      if (line.text.includes('via=')) statementsUsed.add('via');
      if (line.text.includes(' both')) statementsUsed.add('both');
      if (line.text.includes(' dashed')) statementsUsed.add('dashed');
      if (line.text.includes(' thick')) statementsUsed.add('thick');
      if (line.text.includes(' acc')) statementsUsed.add('acc');
    }
  }
  // Every statement of the DSL, plus every modifier, is exercised by the set.
  for (const name of [...diagrams.STATEMENTS, 'via', 'both', 'dashed', 'thick', 'acc']) {
    assert.ok(statementsUsed.has(name), `no golden exercises "${name}"`);
  }
});

for (const slug of SLUGS) {
  test(`${slug}: the source compiles to its golden SVG, byte for byte`, () => {
    const source = read(`${slug}.diagram`);
    const expected = read(`${slug}.svg`);
    const compiled = diagrams.compile(source, { slug, file: `content/diagrams/${slug}.diagram` });
    assert.deepEqual(compiled.findings, []);
    assert.equal(compiled.svg, expected);
  });

  test(`${slug}: check() reports it in sync, and stale after one byte changes`, () => {
    const source = read(`${slug}.diagram`);
    const expected = read(`${slug}.svg`);
    assert.equal(diagrams.check(source, expected, { slug }).stale, false);
    assert.equal(diagrams.check(source, expected.replace('rx="6"', 'rx="7"'), { slug }).stale,
      expected.includes('rx="6"'));
  });

  test(`${slug}: the golden SVG is inside the AGSC-02-98 allow-list`, () => {
    assert.deepEqual(svgViolations(read(`${slug}.svg`)), []);
  });

  test(`${slug}: compiling twice gives the same bytes (AGSC-04-01)`, () => {
    const source = read(`${slug}.diagram`);
    assert.equal(diagrams.compile(source, { slug }).svg, diagrams.compile(source, { slug }).svg);
  });
}

test('every golden source and SVG meets AGSC-01-14: no BOM, no CR, one trailing LF', () => {
  let read_files = 0;
  for (const name of fs.readdirSync(FIXTURES)) {
    const bytes = fs.readFileSync(path.join(FIXTURES, name));
    read_files += 1;
    assert.equal(bytes.includes(0xef) && bytes[0] === 0xef, false, `${name} carries a BOM`);
    assert.equal(bytes.includes(0x0d), false, `${name} carries a CR`);
    assert.equal(bytes[bytes.length - 1], 0x0a, `${name} does not end with one LF`);
    assert.notEqual(bytes[bytes.length - 2], 0x0a, `${name} ends with two LF`);
  }
  assert.equal(read_files, SLUGS.length * 2, `read ${read_files} fixture files`);
});

test('no golden SVG carries a colour literal, so both schemes read it', () => {
  for (const slug of SLUGS) {
    const svg = read(`${slug}.svg`);
    // `url(#a2a-arrow)` names the slug's marker, not a colour: a fragment reference is skipped.
    assert.equal(/(?<!url\()#[0-9a-fA-F]{3}\b|rgb\(|hsl\(|fill="(?!none|currentColor)/u.test(svg), false, slug);
  }
});
