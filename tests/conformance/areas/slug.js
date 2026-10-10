'use strict';
// Conformance area `slug` — AGSC-01-10 (grammar, 1-64 code points,
// portable pattern), AGSC-01-11 (unique across the whole Bundle) and the
// slugifier of AGSC-02-91 (NFC, then only A-Z lower-cased).

const slug = require('../../../src/knowledge/slug.js');
const { checks } = require('./_assert.js');
const { guarded } = require('./_expected-reads.js');

/**
 * The regular-expression features outside the subset RE2, Go `regexp`, Rust `regex`
 * and PCRE2 share (tests/vectors/README.md, porting notes), each with the form that
 * gives it away in a pattern's source.
 */
const NON_PORTABLE_FEATURES = Object.freeze([
  ['lookahead', /\(\?[=!]/u],
  ['lookbehind', /\(\?<[=!]/u],
  ['backreference', /\\[1-9]|\\k</u],
  ['named group', /\(\?<[A-Za-z]/u],
  ['atomic group', /\(\?>/u],
  ['possessive quantifier', /[*+?}]\+/u],
  ['unicode escape', /\\u/u],
  ['property escape', /\\[pP]\{/u],
]);

/** The non-portable features one pattern source uses, by name. */
function featuresUsed(source) {
  return NON_PORTABLE_FEATURES.filter(([, re]) => re.test(source)).map(([name]) => name);
}

// The handler is guarded (`_expected-reads.js`): a pass that left a member of
// `expected` unread is a fail.
module.exports.run = guarded((vector) => {
  const { input, expected } = vector;
  const list = [];

  // slug-0006: the pattern itself is the subject.
  if (Array.isArray(input.candidates)) {
    const valid = input.candidates.filter((c) => slug.isValid(c));
    const invalid = input.candidates.filter((c) => !slug.isValid(c));
    list.push(['valid', JSON.stringify(valid) === JSON.stringify(expected.valid), JSON.stringify(valid)]);
    list.push(['invalid', JSON.stringify(invalid) === JSON.stringify(expected.invalid), JSON.stringify(invalid)]);
    if (expected.pattern !== undefined) {
      list.push(['pattern', slug.SLUG_PATTERN === expected.pattern, slug.SLUG_PATTERN]);
    }
    if (expected.lookahead === false) {
      list.push(['no-lookahead', !/\(\?[=!]/u.test(slug.SLUG_PATTERN), slug.SLUG_PATTERN]);
    }
    if (Array.isArray(expected.engine_features_used)) {
      const used = featuresUsed(slug.SLUG_PATTERN);
      list.push(['engine features used', JSON.stringify(used) === JSON.stringify(expected.engine_features_used),
        JSON.stringify(used)]);
    }
    return checks(list);
  }

  // slug-0004: uniqueness over a list of paths.
  if (Array.isArray(input.paths)) {
    const stems = input.paths.map((p) => slug.stemOf(p));
    const findings = slug.check(stems, { files: input.paths });
    list.push(['error', findings.length > 0 && findings[0].code === expected.error,
      JSON.stringify(findings.map((f) => f.code))]);
    return checks(list);
  }

  // slug-0007: the slugifier of AGSC-02-91 over a list of file stems.
  if (Array.isArray(input.texts)) {
    const got = input.texts.map((text) => slug.slugify(text));
    list.push(['slugs', Array.isArray(expected.slugs) && JSON.stringify(got) === JSON.stringify(expected.slugs),
      JSON.stringify(got)]);
    return checks(list);
  }

  const candidates = Array.isArray(input.slugs) ? input.slugs : [input.slug];
  const findings = slug.check(candidates);
  if (Array.isArray(expected.valid)) {
    const valid = candidates.map((s) => slug.isValid(s));
    list.push(['valid', JSON.stringify(valid) === JSON.stringify(expected.valid), JSON.stringify(valid)]);
  }
  if (typeof expected.error === 'string') {
    list.push(['error', findings.length > 0 && findings[0].code === expected.error,
      JSON.stringify(findings.map((f) => f.code))]);
  }
  return checks(list);
});
