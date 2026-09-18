'use strict';
// src/knowledge/slug.js — slug grammar, uniqueness, slugification and collision
// suffixes (AGSC-01-10, AGSC-01-11, AGSC-01-23, AGSC-02-91).
//
// PURE: no fs, no process, no clock, no network.
//
// The grammar is `^[a-z0-9]+(?:-[a-z0-9]+)*$` with a 1-64 CODE POINT bound carried
// by minLength/maxLength, never by a quantifier: it forbids a leading, trailing or
// doubled hyphen by construction and compiles unchanged in RE2, Go and Rust
// (AGSC-01-10, rc.3 blocker B4). The historical lookahead form `(?!.*--)` MUST NOT
// be reintroduced; vector slug-0006 proves the portable form.

const { nfc, codePointLength, compareCodePoint } = require('./unicode.js');

const SLUG_PATTERN = '^[a-z0-9]+(?:-[a-z0-9]+)*$';
const SLUG_RE = new RegExp(SLUG_PATTERN, 'u');
const MIN_LENGTH = 1;
const MAX_LENGTH = 64;

/** AGSC-01-10. Grammar plus the 1-64 code-point bound. */
function isValid(slug) {
  if (typeof slug !== 'string') return false;
  const n = codePointLength(slug);
  if (n < MIN_LENGTH || n > MAX_LENGTH) return false;
  return SLUG_RE.test(slug);
}

function finding(code, message, extra) {
  return Object.assign(
    { code, col: 1, file: '', line: 1, message, severity: 'error' },
    extra || {}
  );
}

/**
 * AGSC-01-10 + AGSC-01-11. Returns AGSC-E204 for every malformed slug and
 * AGSC-E206 for every slug that repeats, in input order.
 */
function check(slugs, options = {}) {
  const files = options.files || [];
  const findings = [];
  const seen = new Map();
  slugs.forEach((slug, i) => {
    const file = files[i] || '';
    if (!isValid(slug)) {
      findings.push(
        finding('AGSC-E204', `slug "${slug}" does not match ${SLUG_PATTERN} within 1-64 code points`, {
          file,
          slug,
        })
      );
      return;
    }
    if (seen.has(slug)) {
      findings.push(
        finding('AGSC-E206', `slug "${slug}" is already used by ${seen.get(slug) || 'another item'}`, {
          file,
          slug,
        })
      );
      return;
    }
    seen.set(slug, file);
  });
  return findings;
}

/**
 * AGSC-02-91 slugifier: NFC, ASCII-lower-cased, every character outside [a-z0-9]
 * replaced by `-`, runs of `-` collapsed, leading and trailing `-` trimmed,
 * clipped to 64 code points and any resulting trailing `-` trimmed; an empty
 * result becomes `note`. A total function: it never throws and never returns an
 * invalid slug.
 */
function slugify(text) {
  const source = nfc(String(text == null ? '' : text)).toLowerCase();
  let out = '';
  for (const ch of source) {
    out += /^[a-z0-9]$/.test(ch) ? ch : '-';
  }
  out = out.replace(/-+/g, '-').replace(/^-+/, '').replace(/-+$/, '');
  if (codePointLength(out) > MAX_LENGTH) {
    out = [...out].slice(0, MAX_LENGTH).join('');
    out = out.replace(/-+$/, '');
  }
  if (out === '') out = 'note';
  return out;
}

/**
 * AGSC-01-23 / AGSC-02-91 collision suffixes: `-2`, `-3`, … in discovery order,
 * re-checking after each suffix. `taken` is a Set (or anything with `.has`).
 * The suffixed slug is clipped back inside the 64-code-point bound.
 */
function dedupe(slug, taken) {
  const has = (s) => (taken && typeof taken.has === 'function' ? taken.has(s) : false);
  if (!has(slug)) return slug;
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    let stem = slug;
    while (codePointLength(stem) + suffix.length > MAX_LENGTH) {
      stem = [...stem].slice(0, -1).join('');
    }
    stem = stem.replace(/-+$/, '');
    const candidate = `${stem}${suffix}`;
    if (!has(candidate)) return candidate;
  }
}

/** The file stem of a repository-relative path, `/` being the separator everywhere. */
function stemOf(filePath) {
  const base = String(filePath).split('/').pop();
  return base.replace(/\.[^.]*$/, '');
}

/**
 * AGSC-01-11: the slug is the file stem. Returns a finding when the stem is not a
 * legal slug, else null. Language variants (`<slug>.<lang>.md`, AGSC-01-13) keep
 * the primary's slug, so the trailing language segment is stripped first.
 */
function pathSlug(filePath) {
  const stem = stemOf(filePath);
  const slug = stem.includes('.') ? stem.slice(0, stem.indexOf('.')) : stem;
  if (!isValid(slug)) {
    return finding('AGSC-E204', `file stem "${stem}" is not a slug`, { file: filePath, slug });
  }
  return null;
}

module.exports = {
  SLUG_PATTERN,
  MIN_LENGTH,
  MAX_LENGTH,
  isValid,
  check,
  slugify,
  dedupe,
  stemOf,
  pathSlug,
  compareCodePoint,
};
