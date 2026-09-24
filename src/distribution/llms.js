'use strict';
// CONTEXT Distribution (Emission) — Surface: the agent-facing text files.
// Implements AGSC-06-13 (what `/llms.txt` is), AGSC-06-13a (its exact byte layout
// and that of `/llms-full.txt`), AGSC-06-14 (every published item is reachable),
// AGSC-06-15 (the provenance header and the `text agsc-content` fence) and the
// exclusions of AGSC-06-30 / AGSC-11-22.
//
// The layout is a profile of llms.txt v2: the H1 comes FIRST, which is that
// convention's one required element; everything after it is pinned here because the
// convention fixes no grammar and two conforming writers must emit identical bytes.
//
// Pure function of its input; `site.js` writes the bytes. Vectors disc-0006, disc-0007.

const { compareCodePoint, singleLine } = require('../knowledge/unicode.js');
const { provenanceHeader } = require('../knowledge/provenance-header.js');
const { TYPE_PLURAL, TERMS, EXCLUDED_STATUS, termsFor } = require('../knowledge/chunks.js');

/** AGSC-01-18: the default of `bundle.license_prose`. */
const DEFAULT_LICENSE = TERMS;

/** AGSC-05-01: `<site.base>/<type-plural>/<slug>/`, trailing slash included. */
function iriOf(base, item) {
  if (item.iri != null && item.iri !== '') return String(item.iri);
  const plural = TYPE_PLURAL[item.type] || TYPE_PLURAL.concept;
  return `${String(base).replace(/\/+$/u, '')}/${plural}/${item.slug}/`;
}

/** AGSC-06-30: the published set — drafts and retired items appear in neither file. */
function isPublished(item) {
  return !EXCLUDED_STATUS.includes(item.status) && item.type !== 'cluster';
}

/** AGSC-06-13a(4): an item belongs to its PRIMARY cluster, the first of `clusters[]`. */
function primaryCluster(item) {
  const clusters = Array.isArray(item.clusters) ? item.clusters : [];
  return clusters.length > 0 ? String(clusters[0]) : null;
}

/**
 * AGSC-06-15 / AGSC-06-13a(2): the provenance header, an HTML comment block.
 * `license` names the licence of the prose; `terms` names the Content Use Terms
 * every export carries (AGSC-06-18) — two members with two meanings even when
 * their strings coincide.
 */
function provenance({ base, license, terms, specVersion, bundleVersion, generatedAt }) {
  // AGSC-02-24: the header is a fixed number of lines — SEVEN
  // until rc.6, EIGHT since AGSC-06-15 added `assistance:` — and a value may not add
  // one. `license` is authored (`bundle.license_prose`) and `base` reaches here from
  // configuration, so both are neutralised — defence in depth behind the schema
  // `pattern`, for the Bundle that never passed validation.
  return provenanceHeader({ bundle: base, bundleVersion, generatedAt, license, specVersion, terms });
}

/**
 * The section blocks of AGSC-06-13a(4) and the item order `/llms-full.txt` repeats.
 * Sections are ordered by cluster slug; a cluster with no primary member emits no
 * section; every published item no LISTED section carries goes in a final
 * section titled `Other` — an item with no `clusters[]`, and (since rc.5, vector
 * `disc-0008`) an item whose primary cluster is not among `bundle.clusters[]`.
 * A `cluster` item is never a listed ENTRY: it IS a section (`isPublished` above).
 */
function sectionBlocks(bundle) {
  const base = bundle.base;
  const items = (bundle.items || []).filter(isPublished);
  const clusters = [...(bundle.clusters || [])]
    .sort((a, b) => compareCodePoint(String(a.slug), String(b.slug)));
  const bySlug = (a, b) => compareCodePoint(String(a.slug), String(b.slug));
  // AGSC-06-13a(4): ONE line per item. Title and description are authored, so both
  // are neutralised here (AGSC-02-24, rc.5): a line break in either forged
  // a `## ` heading and a second link entry into this file.
  const line = (it) => `- [${singleLine(it.title)}](${iriOf(base, it)}): `
    + `${singleLine(it.description == null || it.description === '' ? it.title : it.description)}`;

  const blocks = [];
  const order = [];
  for (const cluster of clusters) {
    const members = items.filter((it) => primaryCluster(it) === String(cluster.slug)).sort(bySlug);
    if (members.length === 0) continue;
    blocks.push(`## ${singleLine(cluster.title)}\n\n${members.map(line).join('\n')}`);
    order.push(...members);
  }
  // AGSC-06-14: "every published item MUST be reachable from /llms.txt, directly or
  // through a listed cluster section". `Other` therefore carries every published item
  // no LISTED section carries — an item with no `clusters[]`, and an item whose
  // primary cluster is not among `bundle.clusters[]`. Until rc.5 only the first of
  // the two reached it, so an item clustered under an unlisted slug appeared in no
  // section at all and the discovery surface silently lost it (vector `disc-0008`).
  const placed = new Set(order);
  const loose = items.filter((it) => !placed.has(it)).sort(bySlug);
  if (loose.length > 0) {
    blocks.push(`## Other\n\n${loose.map(line).join('\n')}`);
    order.push(...loose);
  }
  return { blocks, order };
}

/**
 * Normalise the two shapes a caller may hold: the vector's flat object and the
 * loaded Bundle of `site.js`.
 */
function settle(bundle, options) {
  return {
    base: bundle.base,
    title: bundle.title,
    description: bundle.description == null ? '' : String(bundle.description),
    license: bundle.license_prose == null ? DEFAULT_LICENSE : bundle.license_prose,
    terms: options.terms == null ? termsFor(bundle.license_prose) : options.terms,
    specVersion: options.specVersion,
    bundleVersion: options.bundleVersion,
    generatedAt: options.generatedAt,
    clusters: bundle.clusters || [],
    items: bundle.items || [],
  };
}

/**
 * `/llms.txt` (AGSC-06-13a blocks 1–4), UTF-8, LF, one trailing LF.
 *
 * @param {object} bundle `{base, title, description, license_prose, clusters[], items[]}`.
 * @param {{generatedAt:string, specVersion:string, bundleVersion?:string, terms?:string}} options
 * @returns {string}
 */
function llmsTxt(bundle, options = {}) {
  const b = settle(bundle, options);
  const head = [
    `# ${singleLine(b.title)}`,
    provenance(b),
    // Block (3): the description on a SINGLE line, newlines replaced by one space.
    // The Bundle root's `description` is the one authored string AGSC-02-24 exempts
    // from the single-line bound, exactly because this block collapses it; the
    // neutraliser then removes the remaining separators the collapse does not see
    // (U+0085, U+2028, U+2029 and the other C0 controls) —.
    `> ${singleLine(b.description.replace(/\s*\n\s*/gu, ' '))}`,
  ];
  const { blocks } = sectionBlocks(b);
  return `${[...head, ...blocks].join('\n\n')}\n`;
}

/**
 * `/llms-full.txt`: identical through block (4), then one three-part block per item
 * in the same order — the H2 title, the `agsc:item` comment, and the body fenced as
 * ```` ```text agsc-content ```` so prose is presented as data, never instruction
 * (AGSC-06-15, N9).
 *
 * @param {object} bundle
 * @param {{generatedAt:string, specVersion:string, bundleVersion?:string, terms?:string}} options
 * @returns {string}
 */
function llmsFullTxt(bundle, options = {}) {
  const b = settle(bundle, options);
  const { order } = sectionBlocks(b);
  const bodies = order.map((it) => {
    const body = String(it.body == null ? '' : it.body).replace(/\n*$/u, '\n');
    return `\n## ${singleLine(it.title)}\n<!-- agsc:item ${singleLine(iriOf(b.base, it))} -->\n\`\`\`text agsc-content\n${body}\`\`\`\n`;
  });
  return llmsTxt(bundle, options) + bodies.join('');
}

module.exports = {
  llmsTxt,
  llmsFullTxt,
  provenance,
  sectionBlocks,
  primaryCluster,
  isPublished,
  iriOf,
};
