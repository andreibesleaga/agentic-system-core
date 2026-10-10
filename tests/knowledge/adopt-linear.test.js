'use strict';
// AGSC-02-95: `init` collects the relative links and images of every note it adopts,
// and that search is linear in the length of the note. A downloaded folder can hold
// any note, so one long run of `[` must not stall the first run.
//
// Steps are counted, not timed (tests/_linear-kit.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const adopt = require('../../src/knowledge/adopt.js');
const { MIB, assertLinear } = require('../_linear-kit.js');

test('a note that is a 1 MiB run of "[" is searched for links in linear steps', () => {
  const note = `# Note\n\n${'['.repeat(MIB)}`;
  assert.deepEqual(assertLinear('relativeReferences, a run of [', adopt.relativeReferences, note), []);
});

test('runs of half-open links and titles stay linear and keep the real link', () => {
  const half = `${'[a]( '.repeat(Math.floor(MIB / 5))}[b](b.md)`;
  assert.deepEqual(assertLinear('relativeReferences, half-open links', adopt.relativeReferences, half),
    [{ reference: 'b.md', image: false }]);
  const titles = `[a](${'[]('.repeat(Math.floor(MIB / 3))} "${'x'.repeat(MIB)}`;
  assert.deepEqual(assertLinear('relativeReferences, an unclosed title', adopt.relativeReferences, titles), []);
  const image = `![p](p.png "t") ${'!['.repeat(MIB / 2)}`;
  assert.deepEqual(assertLinear('relativeReferences, a run of image openers', adopt.relativeReferences, image),
    [{ reference: 'p.png', image: true }]);
});

test('adopting such a note keeps its body byte for byte', () => {
  const markdown = `# Note\n\n${'['.repeat(MIB)}`;
  const out = adopt.adoptFile({ path: 'note.md', markdown });
  assert.equal(out.path, 'content/concepts/note.md');
  assert.ok(out.output.endsWith(markdown));
});
