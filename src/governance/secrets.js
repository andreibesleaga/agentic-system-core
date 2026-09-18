'use strict';
// src/governance/secrets.js — CONTEXT Governance & Provenance.
// The `no-secrets` lint of AGSC-08-15, plus the tracked-`.env` case of
// AGSC-01-37. Owner: C (WP-10-C). PURE: no fs, no process, no clock, no network.
//
// Code: AGSC-E403 for every hit. A credential-shaped string is an error, never a
// warning: the cost of a false negative is a leaked key, the cost of a false
// positive is one line of prose rewritten.
//
// `TRACKED_ENV_CODE` is defined here rather than imported from
// `application/config/env.js` (which exports the same constant) because
// Governance may not require the application layer — the context map allows
// governance -> knowledge | governance | ports and nothing else. The duplication
// is one string literal and is noted in the package report.

const { finding } = require('./finding.js');

/** AGSC-01-37: a tracked `.env` is AGSC-E403 whatever it holds. */
const TRACKED_ENV_CODE = 'AGSC-E403';

/**
 * Credential shapes, as literal-prefix or fixed-width patterns. Every regular
 * expression is linear-time: no nested quantifier, no backreference.
 * Sources are the providers' own published token formats; the list is
 * deliberately prefix-anchored so that ordinary prose cannot match it.
 */
const SHAPES = Object.freeze([
  ['private-key block', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/u],
  ['OpenSSH private key', /-----BEGIN OPENSSH PRIVATE KEY-----/u],
  ['PGP private key', /-----BEGIN PGP PRIVATE KEY BLOCK-----/u],
  ['OpenAI-style token', /\bsk-[A-Za-z0-9_-]{20,}/u],
  ['Anthropic token', /\bsk-ant-[A-Za-z0-9_-]{16,}/u],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/u],
  ['GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{20,}/u],
  ['GitLab token', /\bglpat-[A-Za-z0-9_-]{20,}/u],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/u],
  ['AWS access-key id', /\bAKIA[0-9A-Z]{16}\b/u],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/u],
  ['npm token', /\bnpm_[A-Za-z0-9]{36}\b/u],
]);

/**
 * AGSC-08-15's third shape: a `password:` / `api_key:` style assignment with a
 * non-placeholder value. The value must be at least eight characters and must
 * not be one of the conventional placeholders, so that documentation that shows
 * the SHAPE of a configuration key does not become an error.
 */
const ASSIGNMENT = /\b(passwords?|passwd|api[_-]?keys?|secrets?|access[_-]?tokens?|auth[_-]?tokens?|private[_-]?keys?|client[_-]?secrets?)\s*[:=]\s*["']?([^\s"']{8,})/giu;
const PLACEHOLDERS = Object.freeze(new Set(['changeme', 'your-key-here', 'redacted',
  'placeholder', 'xxxxxxxx', '<value>', '...', 'null', 'undefined', 'example',
  'not-a-secret', 'see-the-environment']));

function isPlaceholder(value) {
  const v = value.toLowerCase();
  if (PLACEHOLDERS.has(v)) return true;
  if (v.startsWith('<') || v.startsWith('${') || v.startsWith('$env')) return true;
  if (/^[*x.]+$/u.test(v)) return true;
  // `AGSC_MODEL_API_KEY` and friends name an environment variable, never a value.
  return /^agsc_[a-z0-9_]+$/u.test(v);
}

/**
 * Scan one string for credential shapes (AGSC-08-15).
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
  for (const [label, pattern] of SHAPES) {
    if (!pattern.test(text)) continue;
    findings.push(finding('AGSC-E403', `a ${label}${where} (AGSC-08-15)`, base));
  }
  ASSIGNMENT.lastIndex = 0;
  for (;;) {
    const m = ASSIGNMENT.exec(text);
    if (m === null) break;
    if (isPlaceholder(m[2])) continue;
    findings.push(finding('AGSC-E403',
      `a credential assignment "${m[1]}"${where} — the value is never printed (AGSC-08-15)`, base));
  }
  return findings;
}

/**
 * AGSC-01-37: a `.env` present on the content branch is AGSC-E403.
 *
 * @param {Iterable<string>} trackedPaths the git-tracked paths, from the
 *   ProcessRunner port (`git ls-files`) or supplied directly by a test.
 * @returns {Array<object>} Findings; empty when `.env` is not tracked.
 */
function checkTracked(trackedPaths) {
  const paths = Array.from(trackedPaths || []);
  const hit = paths.find((p) => p === '.env' || p.endsWith('/.env'));
  if (hit === undefined) return [];
  return [finding(TRACKED_ENV_CODE,
    'the environment file is tracked on the content branch; no Bundle file may hold a secret (AGSC-01-37, AGSC-08-15)',
    { file: hit, path: hit })];
}

module.exports = { TRACKED_ENV_CODE, SHAPES, check, checkTracked, isPlaceholder };
