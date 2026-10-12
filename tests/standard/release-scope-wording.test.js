'use strict';
// tests/standard/release-scope-wording.test.js — clarifications of the 1.0.0 text that
// change no behaviour and no emitted byte, asserted on the plain text of the rules
// (backticks are set aside, and the dated notes are left out where a sentence must be
// gone from the rule itself, so the sentences are read as a person reads them).
//
// 1. The surfaces chapter: the AI-assistance statement stays a constant, byte for byte,
//    and the rule no longer says that the optional line of the governance chapter makes
//    its second clause true; rewording the constant is listed for 1.1.
// 2. The boundary chapter: the NAT64, Teredo and 6to4 prefixes are refused whole, as all
//    three implementations refuse them.
// 3. The governance chapter: the commits a node with an auto channel signs are the
//    commits the auto-merge clause checks.
// 4. The bundle chapter: a root base that differs from the configured site base is not
//    reported at 1.0; reporting it is listed for 1.1.
// 5. The conformance chapter: a configuration value that breaks its key's schema is a
//    finding with exit 1; the exit-2 class of invalid configuration is a name the tool
//    does not know, a version it does not implement, a run or trace invocation while
//    run.enabled is false, and a malformed SOURCE_DATE_EPOCH.
// 6. The overview's "This version" note and the specification orientation name the
//    normative references section and both exceptions of the vector-immutability rule.
// 7. The governance chapter: a lane of kind process, which declares no model, names its
//    kind as the model of the items it writes, as the reference engine writes it.
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

/** The text of one rule: from its bold id to the next rule bullet or heading. */
function rule(text, id) {
  const at = text.indexOf(`- **${id}**`);
  assert.ok(at >= 0, `${id} is not in this chapter`);
  const rest = text.slice(at + 1);
  const next = rest.search(/\n- \*\*AGSC-|\n#{1,6} /u);
  return next < 0 ? text.slice(at) : text.slice(at, at + 1 + next);
}

const CH00 = read('spec/00-overview.md');
const SCOPE = plain(rule(CH00, 'AGSC-00-20'));

test('the surfaces chapter: the AI-assistance statement is a constant kept verbatim, and no rule is said to make its second clause true', () => {
  const block = rule(read('spec/06-surfaces.md'), 'AGSC-06-15');
  const text = plain(withoutNotes(block));
  assert.ok(text.includes('the constant line assistance: content may be AI-assisted; each item states its origin in prov.origin and each accepted contribution carries an Assisted-by: trailer,'),
    'the constant line changed: every 1.x node and checker pin its bytes');
  assert.doesNotMatch(text, /AGSC-08-07 are the rules that make true/u);
  assert.match(text, /AGSC-02-07 makes its first clause true; its second clause names the optional line of AGSC-08-07, which an accepted contribution carries when its contributor writes one/u);
  assert.match(text, /kept verbatim at 1\.x/u);
  assert.match(plain(block), /\(Amended 2026-10-12 for 1\.0\.0: /u);
  assert.match(SCOPE, /the AI-assistance statement of AGSC-06-15 reworded/u);
});

test('the boundary chapter: the NAT64, Teredo and 6to4 prefixes are refused whole', () => {
  const block = rule(read('spec/11-boundary.md'), 'AGSC-11-08');
  const text = plain(withoutNotes(block));
  assert.match(text, /64:ff9b::\/96 and 64:ff9b:1::\/48 \(NAT64, refused whole\)/u);
  assert.match(text, /2001::\/32 \(Teredo, refused whole\)/u);
  assert.match(text, /2002::\/16 \(6to4, refused whole\)/u);
  assert.doesNotMatch(text, /checked as the embedded IPv4/u);
  assert.match(plain(block), /\(Amended 2026-10-12 for 1\.0\.0: the NAT64, Teredo and 6to4 prefixes/u);
});

test('the governance chapter: on a node with an auto channel, the commits that carry a trailer are the commits the auto-merge clause checks', () => {
  const block = rule(read('spec/08-governance.md'), 'AGSC-08-06');
  const text = plain(withoutNotes(block));
  assert.match(text, /every commit that AGSC-08-26\(g\) checks still carries one of its three trailers/u);
  assert.doesNotMatch(text, /every commit of the content branch still carries/u);
  assert.match(plain(block), /\(Amended 2026-10-12 for 1\.0\.0: /u);
});

test('the bundle chapter: a root base that differs from the site base is not reported at 1.0, and reporting it is planned for 1.1', () => {
  const block = rule(read('spec/01-bundle.md'), 'AGSC-01-04');
  const text = plain(withoutNotes(block));
  assert.match(text, /it MUST equal site\.base/u, 'the requirement itself stays');
  assert.doesNotMatch(text, /a mismatch is AGSC-E204/u);
  assert.match(text, /a 1\.0 writer forms every IRI from site\.base/u);
  assert.match(plain(block), /\(Amended 2026-10-12 for 1\.0\.0: a 1\.0 writer forms every IRI from site\.base; reporting a root base that differs from site\.base as AGSC-E204 is planned for 1\.1 \(AGSC-00-20\)\.\)/u);
  assert.match(SCOPE, /a root base that differs from site\.base reported as AGSC-E204 \(AGSC-01-04\)/u);
  const registry = read('spec/09-conformance.md').split('\n').find((l) => l.startsWith('| `AGSC-E204` |'));
  assert.ok(registry, 'the registry has no AGSC-E204 row');
  const rules = registry.split('|')[3];
  assert.doesNotMatch(rules, /AGSC-01-04/u, 'the AGSC-E204 row still names a rule that does not raise it at 1.0');
});

test('the conformance chapter, exit codes: a configuration value that breaks its key\'s schema is a finding with exit 1', () => {
  const block = rule(read('spec/09-conformance.md'), 'AGSC-09-08');
  const text = plain(withoutNotes(block));
  assert.match(text, /Invalid configuration is a configuration the tool cannot run against: a configuration name it does not know or that is reserved to a later version, a spec_version MAJOR it does not implement, or a run or trace invocation while run\.enabled is false \(AGSC-E004, whose registry row lists every case\); and a malformed SOURCE_DATE_EPOCH \(AGSC-E603\)\./u);
  assert.doesNotMatch(text, /or a spec_version MAJOR it does not implement \(AGSC-E004\)/u, 'the definition still stops at two cases');
  assert.match(text, /A configuration value that breaks its key's schema is a finding \(AGSC-E204 for a pattern or length bound, or the more specific code of the precedence in §9\.4\) and exits 1, as does a configuration file that is not well-formed JSON\./u);
  const notes = plain(block).match(/\(Amended 2026-10-12 for 1\.0\.0: [^]*?\)\*/gu) ?? [];
  assert.strictEqual(notes.length, 1, 'the rule carries one note of this day, amended in place');
  assert.match(notes[0], /they are the faults of AGSC-E004, run and trace while run\.enabled is false among them, and the malformed SOURCE_DATE_EPOCH of AGSC-E603;/u);
  assert.match(notes[0], /No behaviour changes\.\)\*$/u);
});

test('the conformance chapter, exit codes: every case the registry row of the configuration code lists is invalid configuration', () => {
  const row = read('spec/09-conformance.md').split('\n').find((l) => l.startsWith('| `AGSC-E004` |'));
  assert.ok(row, 'the registry has no AGSC-E004 row');
  const cases = plain(row.split('|')[2]);
  assert.match(cases, /a name reserved to a later version/u);
  assert.match(cases, /a source whose declared spec_version MAJOR an import does not implement \(AGSC-01-22\)/u);
  assert.match(cases, /a Bundle whose own spec_version MAJOR the writer does not implement/u);
  assert.match(cases, /an invocation of run or trace while run\.enabled is false/u);
  assert.match(row, /error, exit 2 \|$/u);
});

test('the governance chapter, agent lanes: a lane of kind process names its kind as the model of the items it writes', () => {
  const block = rule(read('spec/08-governance.md'), 'AGSC-08-28');
  const text = plain(withoutNotes(block));
  const b = text.slice(text.indexOf('(b) '), text.indexOf('(c) '));
  assert.match(b, /prov\{origin: ai-generated, agent: <name>, model: <entry\.model>, operator: <entry\.operator>\}/u);
  assert.match(b, /for a lane of kind: process, which declares no model \(AGSC-01-36\) and calls none, the model value is its kind, process, so that the item still names a model as AGSC-08-01 requires/u);
  assert.doesNotMatch(b, /\b(MUST|SHALL|SHOULD|REQUIRED|RECOMMENDED|OPTIONAL)\b[^;]*kind, process/u, 'the clarification adds no requirement keyword');
  assert.match(plain(block), /\(Amended 2026-10-12 for 1\.0\.0: \(b\) did not say which model a lane of kind process names; it names its kind, as the reference engine writes it\. No behaviour changes\.\)\* \[/u, 'the note stands at the end of the rule, before its trace bracket');
});

test('the overview chapter, declared scope: the other items decided for 1.1 are listed', () => {
  for (const item of [
    /a board export naming the type of each target of a blocked-by or decided-by Link/u,
    /the round trip of AGSC-06-32 for a graph of one node/u,
    /an HTML block counted once rather than once per tag \(AGSC-02-20\)/u,
    /no AGSC-E407 for prose quoted inside the content fence of a skill pack \(AGSC-07-15\)/u,
  ]) assert.match(SCOPE, item);
  assert.match(SCOPE, /\(Amended 2026-10-12 for 1\.0\.0: /u);
});

test('the overview chapter, "This version": it names the normative references section and both exceptions of the vector rule', () => {
  const note = plain(CH00.split('\n').find((l) => l.startsWith('> **This version.**')));
  assert.match(note, /It adds one section, §0\.7, which lists the documents the rules already cite normatively, and adds, renumbers and removes no rule/u);
  assert.doesNotMatch(note, /adds no section/u);
  assert.match(note, /a released vector is withdrawn and replaced rather than edited, except the specification-version string it carries and its rule member, re-pointed when the rule it named is retired into another \(AGSC-00-16\)/u);
});

test('the specification orientation: what 1.0.0 contains names §0.7, and a released vector keeps both exceptions', () => {
  const para = plain(read('docs/SPEC.md').split('\n').find((l) => l.startsWith('**What `1.0.0` contains.**')));
  assert.match(para, /the normative references of §0\.7/u);
  assert.match(para, /A released vector is never edited, except the specification-version string it carries, which a release updates in place, and its rule, re-pointed when the rule it named is retired into another \(AGSC-00-16\); one that no longer states the rules is republished withdrawn and MAY carry superseded_by \(AGSC-09-04\)\./u);
});
