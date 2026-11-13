'use strict';
// src/governance/text-files.js — CONTEXT Governance & Provenance.
// PURE: no fs, no process, no clock, no network; the caller reads the file.
//
// AGSC-01-14 (1.1): `.env` (AGSC-01-37), the authored `.well-known/security.txt` (AGSC-06-36),
// `LICENSE-CONTENT` (AGSC-06-18) and an SVG attachment (AGSC-02-98) carry none of the four suffixes
// the rule binds, and each follows its own format: its line endings and final line feed are not checked
// (RFC 9116 admits CRLF in security.txt, and an SVG attachment keeps its authored bytes). From 1.1 a
// byte-order mark at the start, and text that is not NFC-normalised, are the warning `AGSC-E108`, and
// no file is refused (AGSC-00-14).

const { finding } = require('./finding.js');

/**
 * @param {string} file the Bundle-relative path, for the finding.
 * @param {string} text the decoded text of the file.
 * @returns {Array<object>} Findings, all warnings.
 */
function check(file, text) {
  const out = [];
  const warn = (message) => out.push(finding('AGSC-E108', `${file}: ${message} (AGSC-01-14)`, { file, path: file, severity: 'warn' }));
  if (text.charCodeAt(0) === 0xfeff) warn('the file begins with a byte-order mark');
  if (text !== text.normalize('NFC')) warn('the text is not NFC-normalised');
  return out;
}

module.exports = { check };
