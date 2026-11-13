'use strict';
// src/knowledge/questions.js — CONTEXT Knowledge, the ten questions of the graph.
// Implements AGSC-05-34 (competency questions, AGSC-05-13).
//
// PURE: no fs, no process, no clock, no network. Each question is a function of the items
// of the published projection (AGSC-06-30), the subject, and for questions 4 and 9 a
// selection and an instant. The answer has the shape of the table in the rule; every list
// is sorted by code point, has no repeats, and never holds the subject. The SPARQL text of
// the same questions (`docs/ontology-questions.json`) is informative: the engine does not run it.

const { compareCodePoint } = require('./unicode.js');
const links = require('./links.js');

const sorted = (values) => [...new Set(values)].sort(compareCodePoint);
const frontmatter = (item) => (item.frontmatter && typeof item.frontmatter === 'object' ? item.frontmatter : item);
const listOf = (item, key) => {
  const value = frontmatter(item)[key];
  return Array.isArray(value) ? value : [];
};
const typeOf = (item) => (item.type != null ? item.type : frontmatter(item).type);

const INSTANT = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})?)?$/u;

/** Days since 1970-01-01 of a proleptic Gregorian date (no clock, no Date: this context is pure). */
function daysFromCivil(year, month, day) {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
}

/** Milliseconds since the epoch of an ISO date or date-time (a date is its midnight, UTC), or NaN. */
function instantOf(value) {
  const m = INSTANT.exec(String(value));
  if (m === null) return NaN;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map((v) => Number(v || 0));
  const offset = m[8] && m[8] !== 'Z' ? (m[8][0] === '-' ? -1 : 1) * (Number(m[8].slice(1, 3)) * 60 + Number(m[8].slice(-2))) : 0;
  const fraction = m[7] ? Number(`0.${m[7]}`) * 1000 : 0;
  return ((daysFromCivil(year, month, day) * 24 + hour) * 60 + minute - offset) * 60000 + second * 1000 + fraction;
}
const slugOf = (item) => (item.slug != null ? item.slug : frontmatter(item).slug);

/** The targets of the edges of one key, from `source`: authored and computed alike. */
function neighbours(edges, key) {
  const adjacency = new Map();
  for (const e of edges.filter((x) => x.key === key)) {
    if (!adjacency.has(e.source)) adjacency.set(e.source, []);
    adjacency.get(e.source).push(e.target);
  }
  return adjacency;
}

/** The items reached from `start` by one or more steps of `adjacency`, never `start` itself. */
function reach(adjacency, start) {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    for (const next of adjacency.get(queue.shift()) || []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  seen.delete(start);
  return sorted(seen);
}

const reachedBy = (items, subject, key) => reach(neighbours(links.resolve(items).edges, key), subject);

/** 1. If I choose X, what else must I take? */
const mustTake = (items, subject) => reachedBy(items, subject, 'requires');

/** 2. What can never go with X? The symmetric edge runs both ways (AGSC-03-05). */
const neverWith = (items, subject) =>
  sorted((neighbours(links.resolve(items).edges, 'excludes').get(subject) || []).filter((s) => s !== subject));

/** 3. What replaced X, directly or through a chain? */
const replacedBy = (items, subject) => reachedBy(items, subject, 'superseded-by');

/** 4. What does X need that nobody in my selection provides? (AGSC-07-23: X provides its own.) */
function missingPorts(items, subject, selection = []) {
  const provided = new Set();
  for (const item of items.filter((i) => [subject, ...selection].includes(slugOf(i)))) {
    for (const name of listOf(item, 'produces')) provided.add(name);
  }
  const subjectItem = items.find((i) => slugOf(i) === subject);
  return sorted((subjectItem ? listOf(subjectItem, 'consumes') : []).filter((name) => !provided.has(name)));
}

/** 5. What verifies X, and what does X verify? */
function verification(items, subject) {
  const adjacent = (key) => sorted(neighbours(links.resolve(items).edges, key).get(subject) || []);
  return { verified_by: adjacent('verified-by'), verifies: adjacent('verifies') };
}

/** 6. What blocks task T, directly or through a chain? */
const blockers = (items, subject) => reachedBy(items, subject, 'blocked-by');

/** 7. Where did lesson L come from? */
function lineage(items, subject) {
  const origin = reachedBy(items, subject, 'derived-from');
  const episodes = new Set(items.filter((i) => typeOf(i) === 'episode').map(slugOf));
  return { episodes: origin.filter((slug) => episodes.has(slug)), lineage: origin };
}

/** 8. Which items sit under cluster C and its sub-clusters? Nesting is `broader` of a cluster (AGSC-05-19). */
function underCluster(items, subject) {
  const clusters = new Set(items.filter((i) => typeOf(i) === 'cluster').map(slugOf));
  const children = new Map();
  for (const e of links.resolve(items).edges.filter((x) => x.key === 'broader' && clusters.has(x.source))) {
    if (!children.has(e.target)) children.set(e.target, []);
    children.get(e.target).push(e.source);
  }
  const below = reach(children, subject);
  const inside = new Set([subject, ...below]);
  return {
    clusters: below,
    items: sorted(items.filter((i) => !clusters.has(slugOf(i)) && listOf(i, 'clusters').some((c) => inside.has(c))).map(slugOf)),
  };
}

/** AGSC-02-11: stale means `stale_after` is earlier than the instant; both are read as instants (a date is its midnight, UTC). */
function isStale(staleAfter, at) {
  if (staleAfter == null) return false;
  const a = instantOf(staleAfter);
  const b = instantOf(at);
  return Number.isNaN(a) || Number.isNaN(b) ? String(staleAfter) < String(at) : a < b;
}

/** 9. Which of my selected items are stale, draft or deprecated? Stale is a comparison (AGSC-02-11). */
function unhealthy(items, selection = [], at) {
  const bySlug = new Map(items.map((i) => [slugOf(i), frontmatter(i)]));
  const reasonsOf = (fm) => ['deprecated', 'draft', 'retired']
    .filter((status) => fm.status === status)
    .concat(isStale(fm.stale_after, at) ? ['stale'] : []);
  return sorted(selection).filter((slug) => bySlug.has(slug))
    .map((slug) => ({ reasons: reasonsOf(bySlug.get(slug)), slug }))
    .filter((entry) => entry.reasons.length > 0);
}

/** 10. Which sources back X, and which other items share them? */
function sourcesAndSharers(items, subject) {
  const resourcesOf = (item) => listOf(item, 'sources').map((s) => (s && s.resource)).filter((r) => typeof r === 'string');
  const subjectItem = items.find((i) => slugOf(i) === subject);
  const sources = sorted(subjectItem ? resourcesOf(subjectItem) : []);
  const others = items.filter((i) => slugOf(i) !== subject);
  const shared = sources
    .map((resource) => ({ items: sorted(others.filter((i) => resourcesOf(i).includes(resource)).map(slugOf)), resource }))
    .filter((entry) => entry.items.length > 0);
  return { shared, sources };
}

/**
 * Question `number` of AGSC-05-34, by its number in the table.
 *
 * @param {number} number 1 to 10
 * @param {object[]} items the items of the published projection
 * @param {{subject?: string, selection?: string[], at?: string}} [args]
 */
function answer(number, items, { subject, selection = [], at } = {}) {
  switch (number) {
    case 1: return mustTake(items, subject);
    case 2: return neverWith(items, subject);
    case 3: return replacedBy(items, subject);
    case 4: return missingPorts(items, subject, selection);
    case 5: return verification(items, subject);
    case 6: return blockers(items, subject);
    case 7: return lineage(items, subject);
    case 8: return underCluster(items, subject);
    case 9: return unhealthy(items, selection, at);
    case 10: return sourcesAndSharers(items, subject);
    default: throw new RangeError(`AGSC-05-34: there are ten questions, numbered 1 to 10, not ${number}`);
  }
}

module.exports = {
  answer, blockers, lineage, missingPorts, mustTake, neverWith, replacedBy, sourcesAndSharers,
  underCluster, unhealthy, verification,
};
