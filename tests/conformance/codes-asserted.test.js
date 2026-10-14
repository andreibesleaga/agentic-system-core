'use strict';
// Every registered error code is either asserted by a case or explained (AGSC-09-15,
// AGSC-09-04). A code is asserted when the `expected` object of a case that is not
// withdrawn names it; every other code of the §9.4 registry must be named in the
// registry's paragraph "Codes no case asserts", with its reason. A code that paragraph
// calls not testable by a case must indeed be asserted by none, so the two never
// contradict each other.
//
// Deterministic: reads the specification and the case files of this repository.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const CH09 = fs.readFileSync(path.join(ROOT, 'spec', '09-conformance.md'), 'utf8');
const VECTORS = path.join(ROOT, 'tests', 'vectors');
const CODE = /AGSC-E\d{3}/gu;

/** The codes the §9.4 table registers, one per row. */
function registered() {
  return [...CH09.matchAll(/^\| `(AGSC-E\d{3})` \|/gmu)].map((m) => m[1]).sort();
}

/** The codes the `expected` object of a case that is not withdrawn names. */
function asserted() {
  const out = new Set();
  for (const area of fs.readdirSync(VECTORS, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const file of fs.readdirSync(path.join(VECTORS, area.name)).filter((f) => f.endsWith('.json'))) {
      const vector = JSON.parse(fs.readFileSync(path.join(VECTORS, area.name, file), 'utf8'));
      if (vector.level === 'withdrawn') continue;
      for (const code of JSON.stringify(vector.expected).match(CODE) || []) out.add(code);
    }
  }
  return out;
}

/** The paragraph "Codes no case asserts", and its part "Not testable by a case at 1.0". */
function notes() {
  const start = CH09.indexOf('**Codes no case asserts.**');
  assert.notStrictEqual(start, -1, 'the registry has no paragraph "Codes no case asserts"');
  const paragraph = CH09.slice(start, CH09.indexOf('\n', start));
  const untestable = paragraph.slice(paragraph.indexOf('Not testable by a case at 1.0:'));
  return { named: new Set(paragraph.match(CODE)), untestable: new Set(untestable.match(CODE)) };
}

test('every registered code is asserted by a case or named with its reason', () => {
  const have = asserted();
  const { named } = notes();
  const unexplained = registered().filter((code) => !have.has(code) && !named.has(code));
  assert.deepStrictEqual(unexplained, [], `codes no case asserts and the registry does not explain: ${unexplained.join(', ')}`);
});

test('the paragraph names registered codes only, and none it calls untestable is asserted', () => {
  const codes = new Set(registered());
  const have = asserted();
  const { named, untestable } = notes();
  assert.deepStrictEqual([...named].filter((code) => !codes.has(code)), []);
  assert.deepStrictEqual([...untestable].filter((code) => have.has(code)), []);
});
