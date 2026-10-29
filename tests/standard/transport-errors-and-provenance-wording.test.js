'use strict';
// tests/standard/transport-errors-and-provenance-wording.test.js — clarifications of the
// 1.0.0 text that change no behaviour and no emitted byte, asserted on the plain text of
// the rules (backticks are set aside, and the dated notes are left out where a sentence
// must be gone from the rule itself, so the sentences are read as a person reads them).
//
// 1. The overview's declared scope: the tool server's error reporting as the Model
//    Context Protocol defines it belongs to revision 2025-11-25, the one 1.0 speaks, as
//    well as to 2026-07-28, and the 1.0 transport answers both cases with the tool
//    envelope instead; the list of 1.1 items names a remember call that declares an
//    operator alone, and a stated nesting bound for the frontmatter subset.
// 2. The conformance chapter, the remember tool: a call that declares an operator but
//    neither the agent nor the model, and does not assert a human origin, returns an item
//    that lint refuses under the governance chapter's provenance rule, and the call
//    reports no finding for it at 1.0.
// 3. The canonical-forms chapter: an empty build-instant variable is read as unset.
// 4. The error-code registry: the code for a construct outside the frontmatter subset
//    also names a frontmatter nested deeper than the engine can read or write back.
//
// The test titles name chapters and topics, not rule ids: a rule counts as verified
// only through the conformance cases and unit tests that check its behaviour.
//
// Deterministic: reads files of this repository, nothing else.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const plain = (text) => text.replace(/`/gu, '').replace(/\s+/gu, ' ');
const withoutNotes = (text) => text.replace(/\*\(Amended [\s\S]*?\)\*/gu, '');
const notesOf = (text) => text.match(/\*\(Amended [\s\S]*?\)\*/gu) || [];

/** The text of one rule: from its bold id to the next rule bullet or heading. */
function rule(text, id) {
  const at = text.indexOf(`- **${id}**`);
  assert.ok(at >= 0, `${id} is not in this chapter`);
  const rest = text.slice(at + 1);
  const next = rest.search(/\n- \*\*AGSC-|\n#{1,6} /u);
  return next < 0 ? text.slice(at) : text.slice(at, at + 1 + next);
}

/** The one registry row of a code, as the table has it. */
function registryRow(text, code) {
  const line = text.split('\n').find((l) => l.startsWith(`| \`${code}\` |`));
  assert.ok(line !== undefined, `no registry row for ${code}`);
  return line;
}

const CH00 = read('spec/00-overview.md');
const CH04 = read('spec/04-canonicalization.md');
const CH09 = read('spec/09-conformance.md');

test('the overview, declared scope: the tool error and the unknown tool are reported as revision 2025-11-25 already defines them, and 1.0 answers both with the tool envelope', () => {
  const scope = rule(CH00, 'AGSC-00-20');
  const text = plain(withoutNotes(scope));
  assert.doesNotMatch(text, /the tool server on MCP revision 2026-07-28 — isError on a tool error, a protocol error for an unknown tool/u);
  assert.match(text, /the tool server's error reporting as MCP defines it — isError: true on a tool error and a JSON-RPC error for an unknown tool, both of which the 1\.0 transport answers with the AGSC-09-13a envelope instead — and the tool annotation defaults and server\/discover of MCP revision 2026-07-28, which the node answers beside 2025-11-25 \(AGSC-09-13a, AGSC-09-19, AGSC-11-18\)/u);
  const notes = notesOf(scope).map(plain);
  assert.ok(notes.some((n) => /^\*\(Amended 2026-10-12 for 1\.0\.0: the 1\.1 list attributed isError and the unknown-tool error to MCP revision 2026-07-28, where revision 2025-11-25, the one 1\.0 speaks, already defines both/u.test(n)),
    'the dated note of the day names the misattribution');
});

test('the overview, declared scope: the 1.1 list names a remember call with an operator alone, and a bound on frontmatter nesting', () => {
  const text = plain(withoutNotes(rule(CH00, 'AGSC-00-20')));
  const later = text.slice(text.indexOf('(f) The Bundle, the ledger and the boundary.'), text.indexOf('Capabilities of the reference distribution in 1.1'));
  assert.ok(later.length > 0, 'the list of 1.1 items was not found');
  assert.match(later, /a remember call that declares an operator alone under the default ai-generated origin refused with AGSC-E003 or answered with the two AGSC-E202 of AGSC-08-01 in findings, each on both transports at once \(AGSC-09-14b\)/u);
  assert.match(later, /a bound on frontmatter nesting \(AGSC-02-02\)/u);
});

test('the conformance chapter, the remember tool: an operator alone under the default origin gives an item that lint refuses, and the call reports no finding for it', () => {
  const block = rule(CH09, 'AGSC-09-14b');
  const text = plain(withoutNotes(block));
  assert.match(text, /prov\.origin: ai-generated unless the client asserts human — so a call that declares an operator but neither agent nor model, and does not assert origin: human, returns an item that AGSC-08-01 refuses in lint with AGSC-E202 for each missing member; at 1\.0 the call reports no finding for it, and a client supplies both or asserts origin: human/u);
  const notes = notesOf(block).map(plain);
  assert.ok(notes.some((n) => /^\*\(Amended 2026-10-12 for 1\.0\.0: the item this rule promises conforms to the schema, and the agent\/model condition of AGSC-08-01 is a lint check the schema cannot express/u.test(n)),
    'the dated note of the day explains the gap');
  assert.match(plain(block), /\)\* \[PRD-/u, 'the notes sit before the trace bracket');
});

test('the canonical-forms chapter, the build instant: an empty variable is read as unset', () => {
  const block = rule(CH04, 'AGSC-04-09');
  const text = plain(withoutNotes(block));
  assert.match(text, /A malformed value MUST exit 2 \(AGSC-E603, the configuration class of AGSC-09-08\); the variable MUST NOT be unset for child processes\. An empty value is read as unset\./u);
  const notes = notesOf(block).map(plain);
  assert.ok(notes.some((n) => /^\*\(Amended 2026-10-12 for 1\.0\.0: the reference engine read an empty SOURCE_DATE_EPOCH as unset and no sentence said so\. No behaviour changes\.\)\*$/u.test(n)),
    'the dated note of the day');
});

test('the error-code registry: the subset code also names a frontmatter nested deeper than the engine can read or write back', () => {
  const row = registryRow(CH09, 'AGSC-E105');
  const text = plain(row);
  assert.match(text, /flow mapping or complex key; a frontmatter nested deeper than the engine can read or write back; from 1\.1 the bound is 64 levels \(AGSC-02-02\)/u);
  assert.match(text, /\*\(Amended 2026-10-12 for 1\.0\.0: build, ci, lint --fix and import stopped with an internal error on such a frontmatter where lint had passed it; every verb now reports this code, the one the reader already gave the same input\)\*/u);
  assert.match(text, /\| AGSC-02-02 \| error; a warning when a frontmatter nested deeper than 64 levels can still be read and written back \(AGSC-02-02\) \|$/u, 'the owning rule is unchanged, the severity is an error with the 1.1 warning beside it');
});
