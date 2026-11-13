'use strict';
// src/shared/article.js — SHARED KERNEL (DDD): the indefinite article of a word that a
// message names at run time (a type, a kind, a format), so that no message reads
// "a episode" or "a asana export".
//
// The rule is by the first LETTER, which is right for every word the engine names: its
// item types (concept, procedure, gate, lesson, episode, proposal, cluster, ...), its
// kinds and the board and skill formats. It does not attempt English sounds such as
// "an hour" or "a unit".
//
// PURE: no fs, no process, no clock, no network, no require of any context.

/** `word` with "a" or "an" before it. */
function withArticle(word) {
  const text = String(word);
  return `${/^[aeiou]/iu.test(text) ? 'an' : 'a'} ${text}`;
}

module.exports = { withArticle };
