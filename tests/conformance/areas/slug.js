'use strict';
// Conformance area `slug` (owner A) — AGSC-01-10 (grammar, 1-64 code points,
// portable pattern) and AGSC-01-11 (unique across the whole Bundle).

const slug = require('../../../src/knowledge/slug.js');
const { checks } = require('./_assert.js');

module.exports.run = (vector) => {
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
};
