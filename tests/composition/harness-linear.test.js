'use strict';
// AGSC-07-15's check that a Harness file carries no `allowed-tools` key runs in linear
// steps, in the CLI and on the compose page. The pattern it used started at every line
// feed and read the blanks after it, so a run of line feeds before any other character
// took quadratic time (100,000 line feeds took about 18 s). The scan is a portable
// function of this module.
//
// Steps are counted, not timed (tests/_linear-kit.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../../src/composition/harness.js');
const { MIB, assertLinear, longRuns, texts } = require('../_linear-kit.js');

const ALPHABET = ['allowed-tools', 'allowed-tools:', ':', '\n', '\r', ' ', '\t', '\u2028', '\u00a0', 'a', '-', 'x\n'];
const OLD = /(^|\n)\s*allowed-tools\s*:/u;

test('the allowed-tools scan equals the pattern it replaced on a seeded corpus', () => {
  let found = 0;
  for (const text of texts(20261012, 20000, ALPHABET)) {
    const expected = OLD.test(text);
    assert.equal(harness.allowedToolsKey(text), expected, JSON.stringify(text));
    if (expected) found += 1;
  }
  assert.ok(found > 200, `the generated texts exercise the key (${found})`);
});

test('a Harness file of a 1 MiB run of line feeds is checked in linear steps', () => {
  const files = (text) => [['decisions/0001-x.md', text]];
  const run = `${'\n'.repeat(MIB)}x`;
  assert.deepEqual(assertLinear('executableViolations, a run of line feeds',
    (t, m) => harness.executableViolations(files(t), m), run), []);
  const key = `${'\n'.repeat(MIB)}allowed-tools: Bash\n`;
  assert.deepEqual(assertLinear('executableViolations, a run then the key',
    (t, m) => harness.executableViolations(files(t), m), key).map((v) => v.message),
  ['decisions/0001-x.md carries an allowed-tools key (AGSC-07-15)']);
});

test('every long run of the alphabet is checked in linear steps', () => {
  for (const { label, input } of longRuns(ALPHABET)) assertLinear(`allowedToolsKey, ${label}`, harness.allowedToolsKey, input);
});
