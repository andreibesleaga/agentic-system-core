'use strict';
// tests/standard/registry-notes-wording.test.js — two clarifications of the conformance chapter (spec/09-conformance.md)
// that change no behaviour, asserted on the plain text of the chapter (backticks are
// set aside, so the sentences are read as a person reads them).
//
// 1. The output contract names a malformed SOURCE_DATE_EPOCH among the faults answered
//    with exit 2 before a verb is resolved, as the reference engine answers it (the
//    command-line case for a malformed epoch pins the exit and the code).
// 2. The error-code registry names each code that no case asserts, with its reason;
//    `tests/conformance/codes-asserted.test.js` checks the list against the cases.
//
// The test titles name chapters and topics, not rule ids: a rule counts as verified
// only through the conformance cases and unit tests that check its behaviour.
//
// Deterministic: reads two files of this repository, nothing else.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const CH09 = fs.readFileSync(path.join(ROOT, 'spec', '09-conformance.md'), 'utf8');
const plain = (text) => text.replace(/`/gu, '');

/** The text of one rule: from its bold id to the next rule bullet or heading. */
function rule(text, id) {
  const at = text.indexOf(`- **${id}**`);
  assert.ok(at >= 0, `${id} is not in this chapter`);
  const rest = text.slice(at + 1);
  const next = rest.search(/\n- \*\*AGSC-|\n#{1,6} /u);
  return next < 0 ? text.slice(at) : text.slice(at, at + 1 + next);
}

test('the conformance chapter, output contract: a malformed build epoch is answered before a verb is resolved', () => {
  const text = plain(rule(CH09, 'AGSC-09-10'));
  assert.match(text, /exit 2 is reached before a verb is resolved \(an unknown verb or an unknown flag, AGSC-E001\/AGSC-E002: there is no verb to name in verb; and a malformed SOURCE_DATE_EPOCH, AGSC-E603, which is read before the verb is resolved\)/u);
  assert.match(text, /\(Amended 2026-10-10 for 1\.0\.0: a malformed SOURCE_DATE_EPOCH is named among the faults answered before a verb is resolved/u);
});

test('the conformance chapter, error-code registry: the codes no case asserts are named with their reasons', () => {
  const text = plain(CH09);
  assert.match(text, /\*\*Codes no case asserts\.\*\* Each registered code is asserted by at least one case of tests\/vectors\/, or is named in this paragraph with the reason no case asserts it at 1\.0\./u);
  for (const heading of ['Reserved and never raised:', 'Not raised from authored input at 1.0:', 'Not testable by a case at 1.0:']) {
    assert.ok(text.includes(heading), `the paragraph has no "${heading}" part`);
  }
});
