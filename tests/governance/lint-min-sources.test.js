'use strict';
// verifies AGSC-08-31
// AGSC-08-31 — `lint.min_sources`: a published pattern, taxonomy, explainer or principle
// concept with fewer than N counted sources is the warning AGSC-E417. A counted source is a
// distinct `sources[].resource` that is not the IRI of an ai-generated item of the Bundle.
// The whole-Bundle case is the vector lint-0051; this file pins the edges around it.

const test = require('node:test');
const assert = require('node:assert');
const lint = require('../../src/governance/lint.js');

const BASE = 'https://n.example/';
const human = { origin: 'human', operator: 'human:tester' };
const robot = { origin: 'ai-generated', operator: 'human:tester', model: 'm', agent: 'a' };
const sources = (...resources) => resources.map((resource) => ({ resource }));
const note = (slug, extra = {}) => ({
  slug, type: 'concept', kind: 'explainer', title: slug, prov: human, ...extra,
});
const config = (n) => ({ site: { base: BASE }, lint: { min_sources: n } });
const slugsOf = (findings) => findings.map((f) => f.slug);

test('AGSC-08-31: the check is off at 0 and when the key is absent', () => {
  const items = [note('a')];
  assert.deepStrictEqual(lint.checkMinimumSources(items, config(0)), []);
  assert.deepStrictEqual(lint.checkMinimumSources(items, { site: { base: BASE } }), []);
  assert.deepStrictEqual(lint.checkMinimumSources(items, {}), []);
});

test('AGSC-08-31: fewer than N distinct sources is one AGSC-E417 warning on the item', () => {
  const items = [note('none'), note('one', { sources: sources('https://e.example/1') }),
    note('twice-one', { sources: sources('https://e.example/1', 'https://e.example/1') }),
    note('two', { sources: sources('https://e.example/1', 'https://e.example/2') })];
  const findings = lint.checkMinimumSources(items, config(2));
  assert.deepStrictEqual(slugsOf(findings), ['none', 'one', 'twice-one']);
  assert.ok(findings.every((f) => f.code === 'AGSC-E417' && f.severity === 'warn' && f.file === `content/concepts/${f.slug}.md`));
  assert.match(findings[0].message, /2/u);
});

test('AGSC-08-31: only the four kinds are checked, and only concepts', () => {
  const kinds = ['pattern', 'taxonomy', 'explainer', 'principle', 'term', 'guide'];
  const items = kinds.map((kind) => note(kind, { kind }));
  assert.deepStrictEqual(slugsOf(lint.checkMinimumSources(items, config(1))), ['explainer', 'pattern', 'principle', 'taxonomy']);
  assert.deepStrictEqual(lint.checkMinimumSources([note('l', { type: 'lesson', kind: undefined })], config(1)), []);
});

test('AGSC-08-31: a source that is the IRI of an ai-generated item of the Bundle does not count', () => {
  const ai = note('ai-note', { kind: 'term', prov: robot });
  const human2 = note('human-note', { kind: 'term' });
  const grounded = note('g', { sources: sources('https://e.example/1', `${BASE}concepts/ai-note/`) });
  const fine = note('f', { sources: sources('https://e.example/1', `${BASE}concepts/human-note/`) });
  assert.deepStrictEqual(slugsOf(lint.checkMinimumSources([ai, human2, grounded, fine], config(2))), ['g']);
});

test('AGSC-08-31: an item held back is not published, so it is not checked', () => {
  const draft = note('d', { status: 'draft' });
  assert.deepStrictEqual(lint.checkMinimumSources([draft], config(1)), []);
});

test('AGSC-08-31: the lint entry point raises it', () => {
  const codes = lint.lint({ items: [note('a')], config: config(1) }).map((f) => f.code);
  assert.ok(codes.includes('AGSC-E417'));
});
