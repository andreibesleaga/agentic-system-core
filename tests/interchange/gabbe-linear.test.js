'use strict';
// `agsc import --from gabbe` reads the entry headings of `CONTINUITY.md` and the dated
// lines of `PROJECT_STATE.md` in linear steps. Both patterns read a run of blanks and
// then the rest of the line to its end, so a line whose last word was followed by a
// line terminator that `.` does not match was read again from every blank: 32,000
// blanks took about 8 s. A foreign kit is untrusted input.
//
// Steps are counted, not timed (tests/_linear-kit.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const gabbe = require('../../src/interchange/adapters/gabbe.js');
const { MIB, assertLinear, longRuns, texts } = require('../_linear-kit.js');

const OLD = {
  heading: /^###\s+(.+)$/u,
  state: /^(\d{4}-\d{2}-\d{2})(?:[^:\n]{0,60})?:\s+(.+)$/u,
};
const ALPHABET = ['###', '### ', '2026-01-01', ':', ' ', '  ', '\t', 'a', 'b c', '\r', '\u2028', '\u2029', '\u00a0', '-'];

test('the entry heading reader equals the pattern it replaced on a seeded corpus', () => {
  for (const text of texts(20261012, 20000, ALPHABET)) {
    const m = OLD.heading.exec(text);
    assert.equal(gabbe.entryHeading(text), m === null ? null : m[1], JSON.stringify(text));
  }
});

test('the dated state line reader equals the pattern it replaced on a seeded corpus', () => {
  for (const text of texts(20261013, 20000, ALPHABET)) {
    const m = OLD.state.exec(text);
    assert.deepEqual(gabbe.stateEntry(text), m === null ? null : { date: m[1], text: m[2] }, JSON.stringify(text));
  }
});

test('a 1 MiB heading or state line ending in a line terminator is read in linear steps', () => {
  for (const end of ['\r', '\u2028', '\u2029']) {
    assert.equal(assertLinear(`entryHeading, then ${JSON.stringify(end)}`, gabbe.entryHeading,
      `###${' '.repeat(MIB)}a${end}b`), null);
    assert.equal(assertLinear(`stateEntry, then ${JSON.stringify(end)}`, gabbe.stateEntry,
      `2026-01-01:${' '.repeat(MIB)}a${end}b`), null);
  }
  assert.equal(assertLinear('entryHeading, blanks then a word', gabbe.entryHeading, `###${' '.repeat(MIB)}a`), 'a');
});

test('every long run of the alphabet is read in linear steps', () => {
  for (const { label, input } of longRuns(ALPHABET)) {
    assertLinear(`entryHeading, ${label}`, gabbe.entryHeading, input);
    assertLinear(`stateEntry, ${label}`, gabbe.stateEntry, input);
  }
});
