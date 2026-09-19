'use strict';
// src/interchange/cleanroom-rewrite.js — CONTEXT Interchange.
//
// The MECHANICAL half of AGSC-08-17 on import: the clean-room lint refuses a
// framing or reading-order construct, and this module removes the smallest span
// of prose that carries one, so that a card whose SUBSTANCE is clean does not
// have to be dropped for a clause that cites a third-party work by chapter
// number.
//
// It is RULE-DRIVEN, never card-driven: the deny-list is
// `governance/cleanroom.js#REFUSED_PHRASES`, the same list the lint applies, so
// the engine carries no list of cards and no list of sentences. What it removes,
// it reports — one record per excision, with the exact removed text, so a human
// reviewing the import sees every word the machine deleted.
//
// The unit of removal is the CLAUSE, not the sentence: an excision that took the
// whole sentence would also delete the independent evidence a compound sentence
// carries beside the refused clause. When a sentence has no clause structure the
// whole sentence goes.
//
// PURE: no fs, no process, no clock, no network.
//
// Codes: AGSC-E405 — reported when a phrase SURVIVES the rewrite, which is the
// case the caller must answer by holding the card back (AGSC-08-17).

const { finding } = require('../knowledge/validate.js');
const cleanroom = require('../governance/cleanroom.js');

/** Clause separators, longest first so `, and ` wins over `, `. */
const CLAUSE_SEPARATORS = Object.freeze([', and ', '; ', ': ']);

/**
 * Abbreviations whose full stop does not end a sentence. Closed and short on
 * purpose: a longer list would be a guess, and every card this runs over is read
 * by a human before publication.
 */
const ABBREVIATIONS = Object.freeze(['al', 'e.g', 'i.e', 'vs', 'cf', 'etc', 'Fig', 'No', 'Dr', 'Mr', 'Ms', 'St']);

/** Sentence terminators. */
const TERMINATORS = Object.freeze(['.', '!', '?']);

/** Characters that may follow a terminator and still belong to the sentence. */
const TRAILERS = Object.freeze(['"', "'", ')', ']', '”', '’']);

const isSpace = (ch) => ch === ' ' || ch === '\n' || ch === '\t';

/** The word immediately before `index`, used against ABBREVIATIONS. */
function wordBefore(text, index) {
  let start = index;
  while (start > 0 && /[A-Za-z.]/u.test(text[start - 1])) start -= 1;
  return text.slice(start, index);
}

/** True when `i` is a sentence-ending terminator (not an abbreviation's stop). */
function endsSentence(text, i) {
  if (!TERMINATORS.includes(text[i])) return false;
  let j = i + 1;
  while (j < text.length && TRAILERS.includes(text[j])) j += 1;
  if (j < text.length && !isSpace(text[j])) return false;
  if (text[i] !== '.') return true;
  return !ABBREVIATIONS.includes(wordBefore(text, i));
}

/**
 * The span of the sentence containing `index`, including its terminator and the
 * whitespace that follows it.
 *
 * @param {string} text
 * @param {number} index
 * @returns {{start:number, end:number}}
 */
function sentenceSpan(text, index) {
  let start = 0;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (!endsSentence(text, i)) continue;
    let j = i + 1;
    while (j < text.length && TRAILERS.includes(text[j])) j += 1;
    while (j < text.length && isSpace(text[j])) j += 1;
    if (j <= index) {
      start = j;
      break;
    }
  }
  let end = text.length;
  for (let i = index; i < text.length; i += 1) {
    if (!endsSentence(text, i)) continue;
    let j = i + 1;
    while (j < text.length && TRAILERS.includes(text[j])) j += 1;
    while (j < text.length && isSpace(text[j])) j += 1;
    end = j;
    break;
  }
  return { start, end };
}

/**
 * Split a sentence into clauses at CLAUSE_SEPARATORS.
 *
 * @param {string} sentence
 * @returns {Array<{text:string, start:number, end:number, separatorBefore:string,
 *                  separatorAfter:string}>}
 */
function clauses(sentence) {
  const out = [];
  let cursor = 0;
  let before = '';
  for (let i = 0; i < sentence.length; i += 1) {
    const separator = CLAUSE_SEPARATORS.find((s) => sentence.startsWith(s, i));
    if (separator === undefined) continue;
    out.push({ text: sentence.slice(cursor, i), start: cursor, end: i, separatorBefore: before, separatorAfter: separator });
    before = separator;
    i += separator.length - 1;
    cursor = i + 1;
  }
  out.push({ text: sentence.slice(cursor), start: cursor, end: sentence.length, separatorBefore: before, separatorAfter: '' });
  return out;
}

/** The trailing terminator plus whitespace of a sentence, e.g. `". "`. */
function tailOf(sentence) {
  const match = /([.!?]["')\]”’]*\s*)$/u.exec(sentence);
  return match === null ? '. ' : match[1];
}

/**
 * Join two halves across an excision, repairing ONLY what the cut created: a
 * doubled space, or a space now sitting before punctuation. Nothing else in the
 * prose is touched — four of the hundred cards carry a legitimate `" ."` (an
 * ellipsis, and the path `.github/…`), and a global tidy would corrupt them.
 *
 * @param {string} left
 * @param {string} right
 * @returns {string}
 */
function seam(left, right) {
  if (left === '' || right === '') return `${left}${right}`;
  const last = left[left.length - 1];
  const first = right[0];
  if (last === ' ' && first === ' ') return `${left}${right.slice(1)}`;
  if (last === ' ' && '.,;:!?'.includes(first)) return `${left.slice(0, -1)}${right}`;
  return `${left}${right}`;
}

/**
 * Remove the smallest span of `text` that carries `phrase` — the clause when the
 * sentence has clauses, the whole sentence otherwise.
 *
 * @param {string} text
 * @param {string} phrase already lowercase.
 * @returns {{text:string, removed:string}|null} `null` when the phrase is absent.
 */
function removeOne(text, phrase) {
  const index = text.toLowerCase().indexOf(phrase);
  if (index < 0) return null;
  const { start, end } = sentenceSpan(text, index);
  const sentence = text.slice(start, end);
  const parts = clauses(sentence);
  const local = index - start;
  const hit = parts.findIndex((p) => local >= p.start && local < p.end);

  if (parts.length > 1 && hit >= 0) {
    const part = parts[hit];
    const isLast = hit === parts.length - 1;
    if (isLast) {
      const kept = sentence.slice(0, part.start - part.separatorBefore.length);
      const removed = sentence.slice(part.start - part.separatorBefore.length);
      const rebuilt = seam(`${text.slice(0, start)}${kept}`, tailOf(removed));
      return { text: seam(rebuilt, text.slice(end)), removed };
    }
    const removed = sentence.slice(part.start, part.end + part.separatorAfter.length);
    const rebuilt = seam(`${text.slice(0, start)}${sentence.slice(0, part.start)}`,
      sentence.slice(part.end + part.separatorAfter.length));
    return { text: seam(rebuilt, text.slice(end)), removed };
  }

  return { text: seam(text.slice(0, start), text.slice(end)), removed: sentence };
}

/**
 * Rewrite a body so that no refused phrase survives (AGSC-08-17).
 *
 * @param {string} body
 * @param {{file?:string, slug?:string, phrases?:string[]}} [options]
 * @returns {{body:string, excisions:Array<{phrase:string, removed:string}>,
 *            surviving:string[], findings:Array<object>}}
 */
function rewrite(body, options = {}) {
  const phrases = options.phrases || cleanroom.REFUSED_PHRASES;
  const excisions = [];
  let text = String(body === undefined ? '' : body);
  // Each pass removes at most one span per phrase; the loop is bounded by the
  // number of spans, and every iteration strictly shortens the text.
  for (let guard = 0; guard < 64; guard += 1) {
    let changed = false;
    for (const phrase of phrases) {
      const result = removeOne(text, phrase);
      if (result === null) continue;
      text = result.text;
      excisions.push({ phrase, removed: result.removed });
      changed = true;
      break;
    }
    if (!changed) break;
  }

  const lower = text.toLowerCase();
  const surviving = phrases.filter((p) => lower.includes(p));
  const findings = surviving.map((phrase) => finding('AGSC-E405',
    `a refused construct survives the mechanical rewrite of "${phrase}"; the card is held back (AGSC-08-17)`,
    { file: options.file, slug: options.slug, line: 1 }));

  return { body: text, excisions, findings, surviving };
}

module.exports = {
  ABBREVIATIONS,
  CLAUSE_SEPARATORS,
  TERMINATORS,
  clauses,
  endsSentence,
  removeOne,
  rewrite,
  seam,
  sentenceSpan,
  tailOf,
  wordBefore,
};
