'use strict';
// The AGSC-06-15 provenance header, written once (AGSC-01-29).
//
// Five surfaces carry this block — `/llms.txt` and `/llms-full.txt`
// (`distribution/llms.js`), a skill pack (`composition/skills.js`), a steer bundle
// (`interchange/steer.js`), the `llm-context` skim view and a Harness file. The
// first four take the block from here; `composition/harness.js` restates it because
// of the AGSC-07-13 portability contract (its copy is compared against this one by
// `tests/knowledge/comment-safe.test.js`).
//
// The `assistance:` line was added at rc.6 on the owner's decision of 2026-09-22:
// AGSC-06-15 makes it a CONSTANT of the specification — never authored, never
// configured, always last in the block, immediately before `-->`.

const { commentSafe, singleLine } = require('./unicode.js');
const { orFromInstant } = require('./content-version.js');

/** AGSC-06-15: the AI-assistance statement, a constant of the specification. */
const ASSISTANCE = 'content may be AI-assisted; each item states its origin in '
  + 'prov.origin and each accepted contribution carries an Assisted-by: trailer';

/**
 * AGSC-06-13a(2): the nine lines of the block, in order.
 *
 * Every interpolated value is single-lined (AGSC-02-24) and comment-safe: a `-->`
 * inside an authored value would close the comment early and put the terms, the
 * version and the build instant outside it.
 *
 * `bundle_version` was added between `spec_version` and `generated_at` at rc.6
 * (D113, AGSC-04-25). The rule admits no absence, so a caller that passes none
 * gets AGSC-04-25's branch 4 derived from the build instant the block already
 * carries — the one honest value a writer with no git history can still state —
 * rather than an empty value outside the grammar.
 *
 * @param {{bundle:*, license:*, terms:*, specVersion:*, bundleVersion?:*, generatedAt:*}} fields
 * @returns {Array<string>}
 */
function provenanceLines(fields) {
  return ['<!-- agsc:provenance',
    `bundle: ${commentSafe(singleLine(fields.bundle))}`,
    `license: ${commentSafe(singleLine(fields.license))}`,
    `terms: ${commentSafe(singleLine(fields.terms))}`,
    `spec_version: ${commentSafe(singleLine(fields.specVersion))}`,
    `bundle_version: ${orFromInstant(fields.bundleVersion, fields.generatedAt)}`,
    `generated_at: ${commentSafe(singleLine(fields.generatedAt))}`,
    `assistance: ${ASSISTANCE}`,
    '-->'];
}

/** The same block as one LF-joined string. */
function provenanceHeader(fields) {
  return provenanceLines(fields).join('\n');
}

module.exports = { ASSISTANCE, provenanceHeader, provenanceLines };
