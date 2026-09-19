'use strict';
// src/interchange/clusters.js — CONTEXT Interchange.
//
// The old site's DECKS become Clusters (M3-T08): one `type: cluster` item per
// deck, `order` and `family` carried over, membership authored ON THE ITEM
// (`clusters[]`) and never on the cluster file (AGSC-02-19).
//
// SKOS integrity, which is why this is its own module rather than three lines of
// the mapper:
//   * AGSC-05-19 — `broader` on a cluster is a NESTING statement exported as
//     `<parent> skos:member <child>`; `skos:broader` on a Collection is
//     forbidden, because its domain and range are `skos:Concept`, disjoint with
//     `skos:Collection`.
//   * AGSC-05-20 — a Collection MUST NOT appear in any semantic relation. So a
//     cluster emitted here carries NO `related`, `narrower`, `uses` or any other
//     Link key: the only relation it may carry is `broader`, as nesting.
//   * AGSC-03-08 — at most one `broader`, and the mono-parent tree at most three
//     levels (family > deck > sub-deck).
//
// The FAMILY is carried as the scalar `family` key the cluster branch of
// `schema/item.schema.json` declares, not as a further cluster item: a family
// cluster would need a 40–200-code-point `description` (AGSC-02-24) that no
// source supplies, and inventing prose is worse than using the key the schema
// already has for exactly this.
//
// PURE: no fs, no process, no clock, no network.

const { finding } = require('../knowledge/validate.js');
const slugs = require('../knowledge/slug.js');
const { codePointLength } = require('../knowledge/unicode.js');

/** AGSC-02-24: the `description` bound on a cluster. */
const DESCRIPTION_MIN = 40;
const DESCRIPTION_MAX = 200;

/** The cluster frontmatter key order of AGSC-04-19 (top-level, then the branch). */
const KEY_ORDER = Object.freeze(['type', 'title', 'description', 'date', 'prov',
  'broader', 'order', 'family']);

/**
 * A deck's tagline becomes the cluster's `description`. AGSC-02-24 wants 40–200
 * code points; a tagline shorter than that is EXTENDED with the deck's own name
 * rather than invented, and one longer is reported, never silently cut.
 *
 * @param {{name:string, tagline:string}} deck
 * @param {{file?:string, slug?:string}} [options]
 * @returns {{description:string, findings:Array<object>}}
 */
function describe(deck, options = {}) {
  const at = { file: options.file, slug: options.slug, line: 1 };
  const findings = [];
  const tagline = typeof deck.tagline === 'string' ? deck.tagline.trim() : '';
  const name = typeof deck.name === 'string' ? deck.name.trim() : '';
  let description = tagline;
  if (codePointLength(description) < DESCRIPTION_MIN) {
    description = `${name}${name === '' || tagline === '' ? '' : ' — '}${tagline}`.trim();
  }
  if (codePointLength(description) < DESCRIPTION_MIN) {
    findings.push(finding('AGSC-E408',
      `cluster description is ${codePointLength(description)} code points, under the AGSC-02-24 minimum of ${DESCRIPTION_MIN}`,
      { ...at, severity: 'warn' }));
  }
  if (codePointLength(description) > DESCRIPTION_MAX) {
    findings.push(finding('AGSC-E204',
      `cluster description is ${codePointLength(description)} code points, over the AGSC-02-24 maximum of ${DESCRIPTION_MAX}`,
      at));
  }
  return { description, findings };
}

/** Frontmatter in the AGSC-04-19 key order, absent keys omitted. */
function ordered(frontmatter) {
  const out = {};
  for (const key of KEY_ORDER) if (frontmatter[key] !== undefined) out[key] = frontmatter[key];
  for (const key of Object.keys(frontmatter).sort()) {
    if (out[key] === undefined) out[key] = frontmatter[key];
  }
  return out;
}

/**
 * Build one cluster item per deck that at least one imported card belongs to.
 *
 * @param {Array<object>} decks the old `decks.json` list: `{id, name, tagline, order, family}`.
 * @param {{members:Map<string,string[]>, prov:object, date:string,
 *          nest?:boolean}} options `members` maps a deck id to the slugs that
 *   name it, so an empty deck produces no cluster (AGSC-03-10: a cluster nobody
 *   names is an orphan warning for ever).
 * @returns {{clusters:Array<object>, findings:Array<object>, skipped:string[]}}
 *   each cluster is `{slug, path, frontmatter, body}`.
 */
function build(decks, options = {}) {
  const members = options.members instanceof Map ? options.members : new Map();
  const findings = [];
  const clusters = [];
  const skipped = [];

  for (const deck of Array.isArray(decks) ? decks : []) {
    const id = typeof deck.id === 'string' ? deck.id : '';
    if (id === '') continue;
    const slug = slugs.isValid(id) ? id : slugs.slugify(id);
    const holders = members.get(id) || [];
    if (holders.length === 0) {
      skipped.push(slug);
      continue;
    }
    const path = `content/clusters/${slug}.md`;
    if (!slugs.isValid(slug)) {
      findings.push(finding('AGSC-E204',
        `deck id "${id}" does not reach a valid slug (AGSC-01-10)`, { file: path, slug, line: 1 }));
      continue;
    }
    const described = describe(deck, { file: path, slug });
    findings.push(...described.findings);

    const frontmatter = {
      type: 'cluster',
      title: typeof deck.name === 'string' && deck.name !== '' ? deck.name : slug,
      description: described.description,
      date: options.date,
      prov: options.prov,
    };
    if (Number.isInteger(deck.order)) frontmatter.order = deck.order;
    else if (typeof deck.order === 'string' && /^[0-9]+$/u.test(deck.order)) {
      frontmatter.order = Number(deck.order);
    }
    if (typeof deck.family === 'string' && deck.family !== '') frontmatter.family = deck.family;

    // AGSC-05-20: a Collection carries no semantic relation. The body is prose
    // only — one heading and the tagline — so nothing here becomes a Link.
    const body = `\n# ${frontmatter.title}\n\n${described.description}\n\n`
      + `${holders.length} imported ${holders.length === 1 ? 'item names' : 'items name'} this cluster.\n`;

    clusters.push({ slug, path, frontmatter: ordered(frontmatter), body });
  }

  clusters.sort((a, b) => (a.slug < b.slug ? -1 : (a.slug > b.slug ? 1 : 0)));
  return { clusters, findings, skipped };
}

/**
 * The membership map: which deck each imported card names. AGSC-02-19 puts
 * membership on the item, so this is derived FROM the items, never authored.
 *
 * @param {Array<{slug:string, deck:string}>} cards
 * @returns {Map<string, string[]>} deck id -> slugs, each list in code-point order.
 */
function membership(cards) {
  const map = new Map();
  for (const card of Array.isArray(cards) ? cards : []) {
    const deck = typeof card.deck === 'string' ? card.deck : '';
    if (deck === '') continue;
    if (!map.has(deck)) map.set(deck, []);
    map.get(deck).push(card.slug);
  }
  for (const list of map.values()) list.sort((a, b) => (a < b ? -1 : (a > b ? 1 : 0)));
  return map;
}

module.exports = { DESCRIPTION_MAX, DESCRIPTION_MIN, KEY_ORDER, build, describe, membership, ordered };
