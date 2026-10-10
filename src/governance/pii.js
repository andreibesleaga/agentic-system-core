'use strict';
// src/governance/pii.js — CONTEXT Governance & Provenance.
// The `no-pii` lint of AGSC-08-16: e-mail addresses and telephone numbers
// outside `prov` and `sources[]` are AGSC-E404.
// PURE: no fs, no process, no clock, no network.
//
// `prov` and `sources[]` are exempt by the rule, not by heuristics: the caller
// hands this module the strings that are IN scope (`scan.frontmatterStrings`
// drops those two subtrees), so the exemption is structural and cannot drift.

const { finding } = require('./finding.js');

/**
 * RFC 5322 dot-atom subset, which is what AGSC-08-06 also admits. The pattern states
 * WHAT is an address; `emailSpans` below is HOW the text is searched for one.
 */
const EMAIL = /[A-Za-z0-9._%+!#$&'*/=?^`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+/u;

/** One character of the local part of `EMAIL`. */
const LOCAL_CHAR = /^[A-Za-z0-9._%+!#$&'*/=?^`{|}~-]$/u;
/** The domain of `EMAIL`, matched at one position only (sticky). */
const DOMAIN_AT = /[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+/uy;

/**
 * Every match of `EMAIL` in `text`, left to right and without overlap — exactly what
 * a global search with that pattern finds — in time linear in the text.
 *
 * Searched from each `@` rather than from each position: the local part is the run of
 * local-part characters before it (never reaching back into the previous match, and
 * never across another `@`, which is not one of them), the domain is matched once,
 * at the character after it. Until 2026-10-06 the pattern
 * was tried from every position of a long run of local-part characters, which is
 * quadratic: an item with a run of 200,000 such characters before an address cost 65 s
 * of `agsc lint` (0.9 s after; security-corpus case `pii-email-after-long-run`).
 *
 * @param {string} text
 * @param {{steps:number}} [meter] counts the characters examined (linear-time tests):
 *   the local part read back from each `@` and the run of domain characters after it,
 *   which bounds what the domain pattern reads there.
 * @returns {Array<{start:number, at:number, end:number}>}
 */
function emailSpans(text, meter) {
  const spans = [];
  let floor = 0;
  if (meter !== undefined) meter.steps += text.length + 1;
  for (let at = text.indexOf('@'); at !== -1; at = text.indexOf('@', at + 1)) {
    if (meter !== undefined) meter.steps += domainRun(text, at + 1) - at;
    if (at <= floor || !LOCAL_CHAR.test(text[at - 1])) continue;
    DOMAIN_AT.lastIndex = at + 1;
    const domain = DOMAIN_AT.exec(text);
    if (domain === null) continue;
    let start = at - 1;
    while (start > floor && LOCAL_CHAR.test(text[start - 1])) start -= 1;
    if (meter !== undefined) meter.steps += at - start;
    const end = at + 1 + domain[0].length;
    spans.push({ at, end, start });
    floor = end;
  }
  return spans;
}

/** The end of the run of characters the domain of `EMAIL` is made of, from `from`. */
function domainRun(text, from) {
  let i = from;
  while (i < text.length && /^[A-Za-z0-9.-]$/u.test(text[i])) i += 1;
  return i;
}

/**
 * Telephone numbers, conservatively: an E.164 number, a North-American grouped
 * number, or an international number introduced by `tel:`. A bare run of digits
 * is NOT a telephone number — a version, a port, a byte count and an ISBN all
 * look like one, and AGSC-08-19 forbids claiming more precision than we have.
 */
const PHONE = Object.freeze([
  /\+[1-9]\d{1,3}[ .-]?(?:\(?\d{1,4}\)?[ .-]?){2,4}\d{2,4}/u,
  /\(\d{3}\)\s?\d{3}[ .-]?\d{4}/u,
  /\b\d{3}[.-]\d{3}[.-]\d{4}\b/u,
  /\btel:\+?[\d ().-]{7,}/u,
]);

/** The keys AGSC-08-16 exempts. */
const EXEMPT_KEYS = Object.freeze(new Set(['prov', 'sources']));

/**
 * Scan one in-scope string (AGSC-08-16).
 *
 * @param {{text:string, file?:string, slug?:string, line?:number, where?:string}} input
 * @returns {Array<object>} Findings; never throws.
 */
function check(input = {}) {
  const text = typeof input.text === 'string' ? input.text : '';
  if (text === '') return [];
  const where = input.where ? ` in ${input.where}` : '';
  const base = { file: input.file, slug: input.slug, line: input.line };
  const findings = [];
  if (emailSpans(text).length > 0) {
    findings.push(finding('AGSC-E404',
      `an e-mail address${where}, outside prov and sources[] (AGSC-08-16)`, base));
  }
  if (PHONE.some((p) => p.test(text))) {
    findings.push(finding('AGSC-E404',
      `a telephone number${where}, outside prov and sources[] (AGSC-08-16)`, base));
  }
  return findings;
}

module.exports = { EMAIL, EXEMPT_KEYS, PHONE, check, emailSpans };
