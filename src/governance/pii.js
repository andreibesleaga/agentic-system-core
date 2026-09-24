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

/** RFC 5322 dot-atom subset, which is what AGSC-08-06 also admits. */
const EMAIL = /[A-Za-z0-9._%+!#$&'*/=?^`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+/u;

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
  if (EMAIL.test(text)) {
    findings.push(finding('AGSC-E404',
      `an e-mail address${where}, outside prov and sources[] (AGSC-08-16)`, base));
  }
  if (PHONE.some((p) => p.test(text))) {
    findings.push(finding('AGSC-E404',
      `a telephone number${where}, outside prov and sources[] (AGSC-08-16)`, base));
  }
  return findings;
}

module.exports = { EMAIL, PHONE, EXEMPT_KEYS, check };
