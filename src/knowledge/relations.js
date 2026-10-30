'use strict';
// src/knowledge/relations.js — CONTEXT Knowledge, the relation table of AGSC-03-01.
//
// The ONE place the engine keeps the fourteen Link keys and what is known about each:
// inverse, symmetric, RDF property, combiner, transitive reading, self-link, expected
// target kinds and plain meaning. The server-side readers (links, chunks, nquads,
// visibility, federation) take their lists from here. The page scripts ship their own
// source text and are checked against this table by `tests/knowledge/relations.test.js`.
//
// PURE: data and derivations only; no fs, no process, no clock, no network, no require.
// A row is a fact of the specification, frozen at 1.1.0 (`spec/03-links.md`, §3.1); the
// test reads the specification table and compares it cell by cell.
//
// Column notes:
//   property / inverseProperty  a curie over the prefixes of `nquads.js#PREFIXES`
//   combiner   none | advisory | soft | hard | mutex | warn-both | hide-superseded
//   selfLink   what an item gets that names itself (AGSC-03-23): `warning`, or `cycle` (an error)
//   targets    the Expected target kinds cell (AGSC-03-25), as data:
//              { any } | { sameFamily } | { sameType } | { type, kinds? } | { oneOf: [...] };
//              `lessonTarget` adds the narrower cell that binds when the item is a lesson

// Self-link readings (AGSC-03-23). The finding codes stay with the code that raises them:
// a cycle is AGSC-E302 / AGSC-E303 in `links.js`, a warning is raised where the check lives.
const WARN_SELF = 'warning';
const CYCLE_SELF = 'cycle';

const ANY = Object.freeze({ any: true });
const concept = (...kinds) => Object.freeze({ type: 'concept', kinds: Object.freeze(kinds) });

/** One row. `symmetric` rows have no separate inverse property: the property runs both ways. */
function row(key, inverse, property, inverseProperty, fields) {
  const symmetric = inverse === key;
  return Object.freeze({
    key,
    inverse,
    symmetric,
    property,
    inverseProperty: symmetric ? undefined : inverseProperty,
    ...fields,
  });
}

/** AGSC-03-01, §3.1 table: the nine core keys, then the five Mode-2 keys. */
const RELATIONS = Object.freeze([
  row('related', 'related', 'skos:related', undefined, { combiner: 'advisory', transitive: false,
    selfLink: WARN_SELF, targets: ANY,
    meaning: 'The two items are connected in meaning, and neither depends on the other.' }),
  row('broader', 'narrower', 'skos:broader', 'skos:narrower', { combiner: 'none', transitive: true,
    selfLink: CYCLE_SELF, targets: Object.freeze({ sameFamily: true }),
    meaning: 'The target is a wider subject that this item falls under.' }),
  row('narrower', 'broader', 'skos:narrower', 'skos:broader', { combiner: 'none', transitive: true,
    selfLink: CYCLE_SELF, targets: Object.freeze({ sameFamily: true }),
    meaning: 'The target is a more specific subject that falls under this item.' }),
  row('uses', 'used-by', 'asc:uses', 'asc:usedBy', { combiner: 'soft', transitive: false,
    selfLink: WARN_SELF, targets: ANY,
    meaning: 'This item draws on the target and can still be used when the target is absent.' }),
  row('requires', 'required-by', 'dcterms:requires', 'dcterms:isRequiredBy', { combiner: 'hard',
    transitive: true, selfLink: CYCLE_SELF, targets: ANY,
    meaning: 'This item cannot be used without the target, so choosing this item also takes the target.' }),
  row('excludes', 'excludes', 'asc:excludes', undefined, { combiner: 'mutex', transitive: false,
    selfLink: WARN_SELF, targets: ANY,
    meaning: 'This item and the target cannot be used together.' }),
  row('derived-from', 'derivation-of', 'prov:wasDerivedFrom', undefined, { combiner: 'none',
    transitive: true, selfLink: WARN_SELF,
    targets: Object.freeze({ any: true, lessonTarget: Object.freeze({ type: 'episode' }) }),
    meaning: 'This item was produced from the target, which is its origin.' }),
  row('contradicts', 'contradicts', 'asc:contradicts', undefined, { combiner: 'warn-both',
    transitive: false, selfLink: WARN_SELF, targets: ANY,
    meaning: 'This item and the target make claims that cannot both be true.' }),
  row('supersedes', 'superseded-by', 'dcterms:replaces', 'dcterms:isReplacedBy', {
    combiner: 'hide-superseded', transitive: true, selfLink: WARN_SELF,
    targets: Object.freeze({ sameType: true }),
    meaning: 'This item replaces the target, which stays published but is no longer the one to use.' }),
  row('implements', 'implemented-by', 'asc:implements', 'asc:implementedBy', { combiner: 'none',
    transitive: false, selfLink: WARN_SELF, targets: concept('spec', 'pattern', 'architecture'),
    meaning: 'This item puts the target into practice, as code or a procedure puts a specification into practice.' }),
  row('verifies', 'verified-by', 'asc:verifies', 'asc:isVerifiedBy', { combiner: 'none',
    transitive: false, selfLink: WARN_SELF,
    targets: Object.freeze({ oneOf: Object.freeze([concept('spec', 'task'),
      Object.freeze({ type: 'procedure' }), Object.freeze({ type: 'gate' })]) }),
    meaning: 'This item checks that the target holds.' }),
  row('covers', 'covered-by', 'asc:covers', 'asc:coveredBy', { combiner: 'none', transitive: false,
    selfLink: WARN_SELF, targets: ANY,
    meaning: 'This item covers the target, as a test or a document covers a requirement.' }),
  row('blocked-by', 'blocks', 'asc:blockedBy', 'asc:blocks', { combiner: 'none', transitive: true,
    selfLink: WARN_SELF, targets: concept('task'),
    meaning: 'This item cannot go ahead until the target is resolved.' }),
  row('decided-by', 'decides', 'asc:decidedBy', 'asc:decides', { combiner: 'none',
    transitive: false, selfLink: WARN_SELF, targets: concept('decision'),
    meaning: 'The target is the decision record that settled this item.' }),
]);

/** AGSC-03-01: the nine core keys, in the order the specification lists them. */
const CORE_KEYS = Object.freeze(RELATIONS.slice(0, 9).map((r) => r.key));
/** AGSC-03-01: the five Mode-2 keys (combiner `none`, AGSC-03-18). */
const MODE2_KEYS = Object.freeze(RELATIONS.slice(9).map((r) => r.key));
/** AGSC-03-01: exactly fourteen. No fifteenth key exists at spec_version 1.x. */
const LINK_KEYS = Object.freeze(RELATIONS.map((r) => r.key));

/** AGSC-03-02, §3.1 table: authored key -> computed inverse name. */
const INVERSE = Object.freeze(Object.fromEntries(RELATIONS.map((r) => [r.key, r.inverse])));

/** AGSC-03-05: materialised in both directions even when one side authored it. */
const SYMMETRIC = Object.freeze(new Set(RELATIONS.filter((r) => r.symmetric).map((r) => r.key)));

/**
 * AGSC-03-04: the names that are computed and MUST NOT be authored. `narrower` is NOT
 * one of them — it is an authorable key whose inverse is `broader` (AGSC-03-06).
 */
const COMPUTED_KEYS = Object.freeze(new Set(RELATIONS
  .filter((r) => !r.symmetric && !LINK_KEYS.includes(r.inverse)).map((r) => r.inverse)));

module.exports = { RELATIONS, CORE_KEYS, MODE2_KEYS, LINK_KEYS, INVERSE, SYMMETRIC, COMPUTED_KEYS };
