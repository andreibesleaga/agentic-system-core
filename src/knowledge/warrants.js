'use strict';
// CONTEXT Knowledge — the warrant of a term: what grounds it, and the kind of ground.
//
// Implements the reading of AGSC-05-40 and AGSC-02-25: the key `warrant` is an object with a
// `source`, a non-empty single-line string (an address where one exists, otherwise a
// citation), and a `type`, one of the three kinds of warrant that ANSI/NISO Z39.19-2005
// (R2010) names for the choice of terms — `literary` (the term is used in the published
// literature of the field), `user` (the people who look for the subject use it) and
// `organisational` (the organisation that keeps the vocabulary requires it; the standard's
// "organizational", in the specification's spelling, so there is no fourth kind).
//
// WHY ONE READER. The graph writer (`nquads.js`: `dcterms:source` and `asc:warrant` on the
// item) and the display of the domain layer (pages, tool answers, the brief: "the item's
// `warrant` as AGSC-05-40 shapes it") must agree on which warrant an item has. Both call
// `warrantOf`, which returns the two members the rule names, or `null`.
//
// WHAT IS NOT HERE. The faults (`AGSC-E512`, and `AGSC-E204` for an empty or multi-line
// source) come from the item schema, `schema/item.schema.json`, through `validate.js`; this
// reader only declines to read what the schema refuses. A member of `warrant` that the rule
// does not name is preserved in the item and never read (AGSC-02-25). A warrant is not an
// entry of `sources[]`, evidence or a review, and it changes none of them (AGSC-05-40).
//
// PURE: a plain item in, a frozen record or `null` out; no fs, no clock, no network.

const { isSingleLine } = require('./unicode.js');

/** AGSC-05-40: the three kinds of warrant of ANSI/NISO Z39.19-2005 (R2010). */
const TYPES = Object.freeze(['literary', 'user', 'organisational']);

/**
 * The warrant of an item, as AGSC-05-40 shapes it: `{source, type}` when the key meets the
 * rule, otherwise `null` (no key, not an object, no source, an empty or multi-line source, or
 * a kind outside the three).
 *
 * @param {object} item  a parsed item
 * @returns {{source: string, type: string}|null}
 */
function warrantOf(item) {
  const warrant = item ? item.warrant : undefined;
  if (warrant === null || typeof warrant !== 'object' || Array.isArray(warrant)) return null;
  const { source, type } = warrant;
  if (typeof source !== 'string' || source === '' || !isSingleLine(source)) return null;
  if (!TYPES.includes(type)) return null;
  return Object.freeze({ source, type });
}

module.exports = { TYPES, warrantOf };
