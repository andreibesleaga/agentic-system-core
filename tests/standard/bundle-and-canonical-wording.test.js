'use strict';
// The clarifications of spec/01 (the Bundle) and spec/04 (canonicalisation and
// determinism) amended for 1.0.0, checked against the specification text. Each is a
// clarification with no output change of its own; the two defect fixes it states
// (an index.md inside a type folder, a variant file with no primary) are proved by
// cases bundle-0009 and bundle-0010 and by the reader's own tests, and the content
// version's branch-3 fallback by tests/knowledge/content-version.test.js.
// Every assertion reads plain words, so the text may be reworded freely around them.
// The test titles name no rule id on purpose: a wording check verifies no behaviour,
// so it must not count as one in the rule-coverage matrix (tools/rule-coverage).
// Deterministic: it reads files only.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** The text of one rule of one chapter: from its bold id to the next rule or heading. */
function ruleText(file, id) {
  const text = read(`spec/${file}`);
  const at = text.indexOf(`- **${id}**`);
  assert.ok(at >= 0, `${id} is not in spec/${file}`);
  const rest = text.slice(at + 1);
  const ends = [rest.indexOf('\n- **AGSC-'), rest.indexOf('\n## ')].filter((i) => i >= 0);
  return rest.slice(0, ends.length > 0 ? Math.min(...ends) : undefined);
}
const r01 = (id) => ruleText('01-bundle.md', id);
const r04 = (id) => ruleText('04-canonicalization.md', id);
const NOTE = 'Amended 2026-10-10 for 1.0.0';

test('Bundle rules, folder notes: an index.md in a folder under content/ is not an item, like README.md and _index.md', () => {
  const t = r01('AGSC-01-05');
  assert.match(t, /MUST NOT read an `index\.md`, a `README\.md` or an `_index\.md`/u);
  assert.match(t, /Bundle root document/u);
  assert.ok(t.includes(NOTE), t);
});

test('Bundle rules, slug grammar: the grammar settles case-insensitive collisions; device names and long paths are named', () => {
  const t = r01('AGSC-01-10');
  assert.match(t, /case-insensitive file system/u);
  assert.match(t, /`con`/u);
  assert.match(t, /From 1\.1 AGSC-01-40 reports each of them as a warning; none is refused/u);
  assert.ok(t.includes(NOTE), t);
});

test('Bundle rules, language variants: at 1.0 a variant file whose primary is absent is AGSC-E204, and the default language is stated', () => {
  const t = r01('AGSC-01-13');
  assert.match(t, /primary is absent/u);
  assert.match(t, /AGSC-E204/u);
  assert.match(t, /no `lang` key/u);
  assert.match(t, /`i18n\.default`, and `en` when/u);
  assert.ok(t.includes(NOTE), t);
});

test('Bundle rules, encoding: the other text inputs are named, and what binds them', () => {
  const t = r01('AGSC-01-14');
  for (const name of ['.env', 'security.txt', 'PRIVACY.md', 'LICENSE-CONTENT', 'SVG']) {
    assert.ok(t.includes(name), `${name} is not named`);
  }
  assert.match(t, /RFC 9116 §2\.2/u);
  assert.ok(t.includes(NOTE), t);
});

test('Bundle rules, configuration, digests and channels: each rule says which code reports its fault', () => {
  const t17 = r01('AGSC-01-17');
  assert.match(t17, /AGSC-E901/u);
  assert.match(t17, /AGSC-E004/u);
  assert.match(r01('AGSC-01-29'), /AGSC-E202/u);
  assert.match(r01('AGSC-01-30'), /AGSC-E203/u);
  for (const id of ['AGSC-01-17', 'AGSC-01-29', 'AGSC-01-30']) assert.ok(r01(id).includes(NOTE), id);
});

test('canonical forms, JSON artefacts: the six artefacts are examples, and every emitted JSON artefact is bound', () => {
  const t = r04('AGSC-04-04');
  assert.match(t, /not the whole list/u);
  for (const name of ['chunks.jsonl', '/boards/', '/skills/index.json', 'harness.jsonld']) {
    assert.ok(t.includes(name), `${name} is not named`);
  }
  assert.ok(t.includes(NOTE), t);
});

test('canonical forms, JCS: strings per RFC 8785 section 3.2.2.2; producing against re-serialising; the LF; noncharacters', () => {
  const t = r04('AGSC-04-05');
  assert.match(t, /RFC 8785 §3\.2\.2\.2/u);
  assert.match(t, /RFC 8785 §3\.1/u);
  assert.match(t, /re-canonicalises/u);
  assert.match(t, /noncharacter/u);
  assert.match(t, /line feed/u);
  assert.ok(t.includes(NOTE), t);
});

test('canonical forms, sort keys: cluster members sort by slug; a member never carries the cluster key order', () => {
  const t = r04('AGSC-04-13');
  assert.ok(!t.includes('`(order, slug)`'), t);
  assert.match(t, /cluster members by slug/u);
  assert.ok(t.includes(NOTE), t);
});

test('canonical forms, reproducibility: the inputs are the Bundle root, the configuration as resolved, the instant and the git-log file', () => {
  const t = r04('AGSC-04-18');
  assert.ok(!t.includes('four inputs in all'), t);
  for (const name of ['Bundle root', 'as resolved', 'LICENSE-CONTENT', 'PRIVACY.md', 'security.txt', 'site/*.md', 'git-log file']) {
    assert.ok(t.includes(name), `${name} is not named`);
  }
  assert.ok(t.includes(NOTE), t);
});

test('canonical forms, content version: an unusable earlier tag is skipped, and an over-long result takes branch 3', () => {
  const t = r04('AGSC-04-25');
  assert.match(t, /an earlier element/u);
  assert.match(t, /longer than the grammar's 64 characters/u);
  assert.match(t, /takes branch 3/u);
  assert.ok(t.includes(NOTE), t);
});
