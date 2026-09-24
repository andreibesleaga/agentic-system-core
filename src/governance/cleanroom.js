'use strict';
// src/governance/cleanroom.js — CONTEXT Governance & Provenance.
// The `clean-room` lint of AGSC-08-17 (NFR-12, clean-room W1–W12, Article XIII).
// PURE: no fs, no process, no clock, no network.
//
// Code: AGSC-E405.
//
// NOTE ON THE VOCABULARY IN THIS FILE. AGSC-08-17 is a rule ABOUT certain words:
// it requires a conforming tool to REFUSE the framing they carry. A detector must
// therefore name what it detects, exactly as the specification text does. The
// literals below are a deny-list, never framing of this project's own artefacts,
// and they are the only place in the engine where they appear.

const { finding } = require('./finding.js');

/** AGSC-08-17: the three files a Bundle MUST exclude. */
const EXCLUDED_FILES = Object.freeze(['endorsements.json', 'book.md', 'start-here.json']);

/** AGSC-08-17: the frontmatter key that MUST be empty on import. */
const REFUSED_KEY = 'bookRef';

/** AGSC-08-17: the framing and reading-order constructs the lint refuses. */
const REFUSED_PHRASES = Object.freeze([
  'companion to the book',
  'companion site',
  'companion repository',
  'the book',
  'this book',
  'book companion',
  'chapter 1',
  'in chapter',
  'reading order',
  'read the chapters in order',
  'start here, then read',
  'table of contents of the book',
]);

/**
 * AGSC-08-17 as amended at rc.6: a reference to a numbered division of a work — the
 * case-folded `chapter` or `chapters`, whitespace, then decimal digits or a Roman
 * numeral — is refused as a PATTERN, not as the literal `chapter 1`, which caught
 * "chapter 1" and "chapter 10"…"chapter 19" and missed every other number.
 */
const NUMBERED_DIVISION = /\bchapters?\s+(?:[0-9]+|[ivxlcdm]+)\b/u;

/** AGSC-08-17: a whole-corpus emitter is forbidden outright. */
const REFUSED_EMITTERS = Object.freeze(['pdf', 'epub', 'mobi']);

function last(pathLike) {
  const s = String(pathLike);
  const i = s.lastIndexOf('/');
  return i < 0 ? s : s.slice(i + 1);
}

/**
 * Clean-room check over one item, one file list or one emitter list (AGSC-08-17).
 *
 * @param {{text?:string, frontmatter?:object, paths?:string[], emitters?:string[],
 *          file?:string, slug?:string, line?:number}} input
 * @returns {Array<object>} Findings; never throws.
 */
function check(input = {}) {
  const base = { file: input.file, slug: input.slug, line: input.line };
  const findings = [];

  const fm = input.frontmatter;
  if (fm && typeof fm === 'object'
      && Object.prototype.hasOwnProperty.call(fm, REFUSED_KEY)
      && fm[REFUSED_KEY] !== '' && fm[REFUSED_KEY] != null) {
    findings.push(finding('AGSC-E405',
      `a non-empty "${REFUSED_KEY}" is refused on import (AGSC-08-17)`,
      { ...base, key: REFUSED_KEY }));
  }

  for (const p of input.paths || []) {
    if (!EXCLUDED_FILES.includes(last(p))) continue;
    findings.push(finding('AGSC-E405',
      `"${last(p)}" is excluded from every Bundle (AGSC-08-17)`, { ...base, path: p, file: p }));
  }

  for (const emitter of input.emitters || []) {
    if (!REFUSED_EMITTERS.includes(String(emitter).toLowerCase())) continue;
    findings.push(finding('AGSC-E405',
      `a whole-corpus "${emitter}" emitter is forbidden (AGSC-08-17)`, base));
  }

  const text = typeof input.text === 'string' ? input.text : '';
  if (text !== '') {
    const haystack = text.replace(/[A-Z]/gu, (c) => c.toLowerCase());
    if (REFUSED_PHRASES.some((phrase) => haystack.includes(phrase)) || NUMBERED_DIVISION.test(haystack)) {
      findings.push(finding('AGSC-E405',
        'prose carries a framing or reading-order construct the clean room refuses (AGSC-08-17)',
        base));
    }
  }

  return findings;
}

module.exports = { EXCLUDED_FILES, NUMBERED_DIVISION, REFUSED_KEY, REFUSED_PHRASES, REFUSED_EMITTERS, check };
