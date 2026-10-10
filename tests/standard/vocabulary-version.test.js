'use strict';
// Clarifications of the vocabulary's versioning rule (spec/05, AGSC-05-25) and of
// the standards register's OWL 2 RL row (docs/SPEC.md). Each test reads the text and
// checks the sentence that settles an open reading; the file itself is checked by
// tests/ontology/vocabulary-file.test.js. Deterministic: reads files only.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SPEC = read('spec/05-graph.md');
/** The text of one rule: from its bold id to the next rule's bold id. */
const ruleText = (id) => {
  const at = SPEC.indexOf(`**${id}**`);
  assert.ok(at >= 0, `${id} is not in spec/05`);
  const end = SPEC.indexOf('\n- **AGSC-', at + 1);
  return SPEC.slice(at, end < 0 ? undefined : end);
};
/** A rule's text without its dated amendment notes, which quote the old wording. */
const normative = (id) => ruleText(id).replace(/\*\(Amended [^]*?\)\*/gu, '');

test('AGSC-05-25: issued is the date of the first published tagged release', () => {
  const rule = normative('AGSC-05-25');
  assert.ok(rule.includes('the date of the first published tagged release that carried the vocabulary'));
  assert.ok(!rule.includes('the date of the first tagged release'), 'the old wording counts an unpublished tag');
});

test('AGSC-05-25: a changed label, comment or ontology-node value is a change of the file and takes a new vocabulary version', () => {
  const rule = normative('AGSC-05-25');
  assert.ok(rule.includes('A changed annotation is a changed file'));
  assert.ok(rule.includes('takes a new vocabulary version'));
  assert.ok(rule.includes('a specification version that ships no change of the file keeps the vocabulary version'));
});

test('AGSC-05-25: modified is the date of the release that first ships that version of the file', () => {
  assert.ok(normative('AGSC-05-25').includes('`modified` the date of the release that first ships this version of the file'));
});

test('AGSC-05-25: every annotation property and every class of another vocabulary the file uses is declared', () => {
  const rule = normative('AGSC-05-25');
  assert.ok(rule.includes('MUST be declared in the file'));
  assert.ok(rule.includes('`owl:AnnotationProperty`') && rule.includes('`owl:Class`'));
  assert.ok(rule.includes('`AGSC-E203`'));
});

test('AGSC-05-25 carries one dated note for this release', () => {
  const notes = ruleText('AGSC-05-25').match(/\*\(Amended 2026-10-\d\d for 1\.0\.0: [^]*?\)\*/gu) || [];
  assert.ok(notes.some((n) => n.includes('annotation') && n.includes('published') && n.includes('declared')), notes.join('\n'));
});

test('the standards register says the term axioms are OWL 2 RL and the ontology node is outside the datatype map', () => {
  const row = read('docs/SPEC.md').split('\n').find((line) => line.startsWith('| OWL 2 RL |'));
  assert.ok(row, 'docs/SPEC.md has no OWL 2 RL row');
  assert.ok(row.includes('term axioms are OWL 2 RL'));
  assert.ok(row.includes('xsd:date'));
  assert.strictEqual(row.split(' | ').length, 6, 'the register row keeps its six columns');
});
