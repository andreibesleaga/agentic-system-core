'use strict';
// I-129 (m8): a message that names a type with "a" read "a episode". `withArticle`
// puts "a" or "an" before a word by its first letter, and the messages that name a
// type, a kind or a format use it.
//
// Deterministic: strings in, strings out.

const test = require('node:test');
const assert = require('node:assert/strict');
const { withArticle } = require('../../src/shared/article.js');
const lint = require('../../src/governance/lint.js');

test('withArticle: "an" before a vowel letter, "a" before anything else', () => {
  assert.equal(withArticle('episode'), 'an episode');
  assert.equal(withArticle('concept'), 'a concept');
  assert.equal(withArticle('asana'), 'an asana');
  assert.equal(withArticle('Obsidian'), 'an Obsidian');
  assert.equal(withArticle('github'), 'a github');
  assert.equal(withArticle(''), 'a ');
});

test('lint: the missing-section warning of an episode says "an episode"', () => {
  const item = { path: 'content/episodes/e.md', slug: 'e', type: 'episode', body: 'text\n',
    frontmatter: { type: 'episode', title: 'An episode', prov: { origin: 'human', operator: 'human:x' } } };
  const found = lint.checkSections(item);
  assert.ok(found.length > 0);
  assert.match(found[0].message, /^an episode body has no/u);
});
