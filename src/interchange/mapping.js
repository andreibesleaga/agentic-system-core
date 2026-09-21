'use strict';
// src/interchange/mapping.js — CONTEXT Interchange.
//
// The field mapping table old -> new (M3-T03): EVERY key of the foreign card is
// accounted for — mapped, renamed, folded into another key, moved into the
// vendor namespace, or explicitly dropped with a reason. Nothing is lost in
// silence, which is what AGSC-01-22's tolerance means in practice.
//
// | old                        | new                                    | rule |
// |----------------------------|----------------------------------------|------|
// | (absent)                   | `type: concept`                        | AGSC-01-03 |
// | `kind`                     | `kind` verbatim                        | AGSC-02-12 |
// | `title`                    | `title`                                | §2.2 |
// | `summary`                  | `description`                          | AGSC-02-24 |
// | `status`                   | `status`, mapped (`published`->`stable`)| AGSC-02-23 |
// | `release`                  | `release`                              | AGSC-01-20 |
// | `tags`                     | `tags` minus `batch-*`                 | AGSC-01-20/21 |
// | `aliases`                  | `aliases`                              | §2.2 |
// | `deck`                     | `clusters[]`, key deleted              | AGSC-02-19 |
// | `subdeck`                  | `x-oldsite-subdeck` (vendor, verbatim) | AGSC-02-05a |
// | `dateAdded` / `dateUpdated`| `date` / `modified`                    | AGSC-02-06 |
// | `references.<n>.*`         | `sources[]`                            | AGSC-02-10 |
// | `related`                  | `related`, filtered to the imported set| AGSC-03-02, AGSC-11-12 |
// | `evidence` `maturity` `mapping` `domains` `modality` `deployment` `implementations` | verbatim | AGSC-02-12 |
// | `signatureElements`        | `signature_elements` + `signature: true`| AGSC-02-12 |
// | `owaspIds`                 | `x-oldsite-owasp-ids` (see below)      | AGSC-02-05a |
// | `diagram.{file,alt,caption}`| `diagram{}`                           | AGSC-02-13 |
// | `id`                       | `id` (equals the slug, AGSC-01-11)     | AGSC-01-11 |
// | (absent)                   | `prov{origin: imported, operator}`     | AGSC-08-01 |
// | (absent)                   | `attachments[]` (the SVG + its source) | AGSC-02-98, R59 |
//
// `owaspIds` does NOT become `owasp_ids`. The schema pins that key to
// `^LLM[0-9]{2}:[0-9]{4}$` and the old values are the 2025 OWASP **Agentic**
// ids (`ASI01`…`ASI10`) and bare `LLM01`-style ids with no year, so mapping them
// would be `AGSC-E204` on eighteen cards. They are preserved verbatim in the
// `x-` namespace of AGSC-02-05a, which is kept byte-for-byte and never warned,
// and the schema gap is REPORTED, not worked around.
//
// PURE: no fs, no process, no clock, no network.

const { finding } = require('../knowledge/validate.js');
const { codePointLength } = require('../knowledge/unicode.js');
const slugs = require('../knowledge/slug.js');
const sourcesModule = require('./sources.js');
const statusModule = require('./status.js');
const cleanroomRewrite = require('./cleanroom-rewrite.js');

/** AGSC-04-19: the top-level `properties` order of `schema/item.schema.json`. */
const TOP_ORDER = Object.freeze(['type', 'title', 'description', 'status', 'release', 'tags',
  'aliases', 'clusters', 'lang', 'date', 'modified', 'sources', 'prov', 'generated', 'verified',
  'stale_after', 'id', 'iri', 'spec_version', 'related', 'broader', 'narrower', 'uses', 'requires',
  'excludes', 'derived-from', 'contradicts', 'supersedes', 'implements', 'verifies', 'covers',
  'blocked-by', 'decided-by', 'attachments']);

/** AGSC-04-19: then the matching `oneOf` branch's order — `concept`. */
const CONCEPT_ORDER = Object.freeze(['kind', 'evidence', 'maturity', 'mapping', 'signature',
  'signature_elements', 'owasp_ids', 'domains', 'modality', 'deployment', 'implementations',
  'diagram', 'produces', 'consumes', 'task_state', 'verdict_digest']);

/** AGSC-02-24: the `description` bound, in Unicode code points. */
const DESCRIPTION_MIN = 40;
const DESCRIPTION_MAX = 200;

/** The old keys this mapper consumes; anything else is reported as unaccounted. */
const KNOWN_OLD_KEYS = Object.freeze(['id', 'title', 'kind', 'deck', 'subdeck', 'aliases',
  'evidence', 'maturity', 'mapping', 'references', 'summary', 'tags', 'related', 'status',
  'release', 'dateAdded', 'dateUpdated', 'diagram', 'signatureElements', 'owaspIds',
  'domains', 'modality', 'deployment', 'implementations']);

/** The vendor namespace of AGSC-02-05a; `x-<vendor>-<key>`, preserved verbatim. */
const VENDOR_PREFIX = 'x-oldsite-';

/** The old body's internal link shape: `/patterns/<slug>/`. */
const OLD_LINK = /\]\(\/patterns\/([a-z0-9][a-z0-9-]*)\/\)/gu;

/** Frontmatter in the AGSC-04-19 key order; unknown keys last, code-point order. */
function ordered(frontmatter) {
  const out = {};
  for (const key of TOP_ORDER) if (frontmatter[key] !== undefined) out[key] = frontmatter[key];
  for (const key of CONCEPT_ORDER) if (frontmatter[key] !== undefined) out[key] = frontmatter[key];
  for (const key of Object.keys(frontmatter).sort()) {
    if (out[key] === undefined && frontmatter[key] !== undefined) out[key] = frontmatter[key];
  }
  return out;
}

/**
 * Rewrite the old body's internal links (M3-T07, AGSC-03-11, AGSC-01-35).
 *
 * `/patterns/<slug>/` begins with a slash, which AGSC-01-35 refuses outright
 * (`AGSC-E902`), so every one of them must go.
 *
 * A target that is in the imported set AND PUBLISHED becomes
 * `../concepts/<slug>.md`, which is the normal form of AGSC-03-12 — "wikilinks …
 * MUST be normalized by `lint --fix` to relative Markdown links
 * `[alias](../<type-plural>/<slug>.md#anchor)`" — and the form AGSC-03-11 resolves
 * from `content/concepts/`. Anything else is DE-LINKED: the link text stays, the
 * link goes. It is never rewritten to an absolute URL, because AGSC-11-12 makes
 * cross-node reference a citation in `sources[]` and nothing else.
 *
 * "Anything else" gained a second member at rc.5 (FV28-04): a card that IS in the
 * selection but is HELD BACK. A draft item is published on no surface (AGSC-06-30)
 * and has no route (AGSC-06-01), so a published page linking one ships a link that
 * 404s — which is exactly what the patterns node shipped, 36 times. A selected card
 * is therefore not a link target unless it is also published, and every de-linked
 * target is recorded in the import status report so the operator sees the list.
 *
 * Until rc.5 the rewritten form was the BARE SLUG. That form resolves in the Bundle
 * (AGSC-03-11 as amended, R-04) but renders on the page as `<a href="<slug>">`,
 * which a browser resolves against the page's own route — `/concepts/a/<slug>` —
 * and which no build emits. The normal form is not enough on its own either: the
 * writer maps a resolved body reference onto the item's route
 * (`distribution/site.js#bodyHrefResolver`), because the Bundle geometry and the
 * route geometry are different. The two changes are one fix.
 *
 * @param {string} body
 * @param {Set<string>} inSet the imported slugs.
 * @param {{file?:string, slug?:string, publishedSet?:Set<string>}} [options]
 *   `publishedSet` is the subset of `inSet` that will be published; when it is
 *   absent every selected slug counts as published (a caller that holds nothing
 *   back).
 * @returns {{body:string, rewritten:string[], delinked:string[], findings:Array<object>}}
 */
function rewriteBodyLinks(body, inSet, options = {}) {
  const rewritten = [];
  const delinked = [];
  const published = options.publishedSet === undefined ? inSet : options.publishedSet;
  const text = String(body === undefined ? '' : body);
  const out = text.replace(/\[([^\]]*)\]\(\/patterns\/([a-z0-9][a-z0-9-]*)\/\)/gu,
    (whole, label, target) => {
      if (inSet.has(target) && published.has(target)) {
        rewritten.push(target);
        return `[${label}](../concepts/${target}.md)`;
      }
      delinked.push(target);
      return label;
    });
  const findings = delinked.length === 0 ? [] : [finding('AGSC-E301',
    `${delinked.length} body reference(s) leave the PUBLISHED imported set and were de-linked,`
    + ` not rewritten as URLs (AGSC-03-02, AGSC-11-12, AGSC-06-30):`
    + ` ${[...new Set(delinked)].sort().join(', ')}`,
    { file: options.file, slug: options.slug, line: 1, severity: 'warn' })];
  return { body: out, rewritten, delinked, findings };
}

/**
 * Filter a Link array to the imported set (AGSC-03-02, AGSC-11-12).
 *
 * A value naming an item this Bundle does not hold is `AGSC-E301` at lint, and
 * turning it into a URL would be `AGSC-E311` and would make the file invalid. So
 * it is DROPPED and reported — the only two honest options the rules leave.
 *
 * @param {Array<string>} values
 * @param {Set<string>} inSet
 * @param {{file?:string, slug?:string, key?:string}} [options]
 * @returns {{values:string[], dropped:string[], findings:Array<object>}}
 */
function filterLinks(values, inSet, options = {}) {
  const key = options.key === undefined ? 'related' : options.key;
  const kept = [];
  const dropped = [];
  for (const raw of Array.isArray(values) ? values : []) {
    const value = String(raw).trim();
    if (value === '') continue;
    if (!slugs.isValid(value)) {
      dropped.push(value);
      continue;
    }
    if (!inSet.has(value)) {
      dropped.push(value);
      continue;
    }
    // AGSC-04-14 keeps author order; a duplicate is still a duplicate.
    if (!kept.includes(value) && value !== options.slug) kept.push(value);
  }
  const findings = dropped.length === 0 ? [] : [finding('AGSC-E301',
    `${dropped.length} "${key}" value(s) name no imported item and were dropped, never rewritten as a URL`
    + ` (AGSC-03-02, AGSC-11-12): ${[...new Set(dropped)].sort().join(', ')}`,
    { file: options.file, slug: options.slug, line: 1, severity: 'warn' })];
  return { values: kept, dropped, findings };
}

/**
 * Map one old card to one conforming `concept` item.
 *
 * @param {{slug:string, path:string, record:object, body:string, keys:string[]}} card
 *   as `oldsite.js#readCard` returns it.
 * @param {object} options
 * @param {Set<string>} options.inSet the imported slugs, for link filtering.
 * @param {object} options.prov `{origin, operator}` (AGSC-08-01).
 * @param {string} [options.statusOverride] the caller's `status` decision.
 * @param {Set<string>} [options.publishedSet] the subset of `inSet` that is published;
 *   a body link to a selected-but-held-back card is de-linked (FV28-04).
 * @param {string} [options.title] the caller's `title` correction, if any.
 * @param {string} [options.license] the attachment licence default.
 * @param {Array<object>} [options.addSources] entries appended to `sources[]`.
 * @param {string[]} [options.promoteSources] resource URLs to move to the front.
 * @param {string} [options.diagramAlt] a fallback `alt` when the card has none.
 * @returns {{slug:string, path:string, frontmatter:object, body:string,
 *            excisions:Array<object>, dropped:object, findings:Array<object>}}
 */
function mapCard(card, options) {
  const slug = card.slug;
  const path = `content/concepts/${slug}.md`;
  const at = { file: path, slug, line: 1 };
  const findings = [];
  const record = card.record || Object.create(null);
  const get = (key) => (Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined);

  // ---------------------------------------------------------------- clean room
  const cleaned = cleanroomRewrite.rewrite(card.body, { file: path, slug });
  findings.push(...cleaned.findings);

  // ------------------------------------------------------------- body rewrites
  const links = rewriteBodyLinks(cleaned.body, options.inSet,
    { file: path, publishedSet: options.publishedSet, slug });
  findings.push(...links.findings);

  // ------------------------------------------------------------------- scalars
  const frontmatter = { type: 'concept' };
  // A caller may CORRECT the title (a coined name re-sourced to a public one);
  // it is data the caller supplies, never a rename this module decides.
  const corrected = typeof options.title === 'string' ? options.title.trim() : '';
  const title = corrected !== '' ? corrected
    : (typeof get('title') === 'string' ? get('title').trim() : '');
  if (title === '') findings.push(finding('AGSC-E202', 'title is missing (AGSC-02-07)', at));
  else frontmatter.title = title;

  const summary = typeof get('summary') === 'string' ? get('summary').trim() : '';
  if (summary !== '') {
    frontmatter.description = summary;
    const length = codePointLength(summary);
    if (length < DESCRIPTION_MIN || length > DESCRIPTION_MAX) {
      findings.push(finding('AGSC-E204',
        `description is ${length} code points, outside AGSC-02-24's ${DESCRIPTION_MIN}–${DESCRIPTION_MAX}`, at));
    }
  } else findings.push(finding('AGSC-E408', 'no summary to become description (AGSC-02-21)', { ...at, severity: 'warn' }));

  const mappedStatus = statusModule.status(get('status'), { file: path, slug, override: options.statusOverride });
  findings.push(...mappedStatus.findings);
  frontmatter.status = mappedStatus.status;

  const release = typeof get('release') === 'string' ? get('release').trim() : '';
  const mappedTags = statusModule.tags(get('tags'), { file: path, slug });
  findings.push(...mappedTags.findings);
  const releaseKeys = [];
  if (release !== '') {
    frontmatter.release = release;
    releaseKeys.push(release);
  }
  if (release === '' && mappedTags.releases.length > 0) {
    // AGSC-01-20 admits ONE `release` key per item; the first `batch-*` tag is
    // the switch and the rest are reported, never silently merged.
    frontmatter.release = mappedTags.releases[0];
    releaseKeys.push(mappedTags.releases[0]);
  }
  // Every switch the card names reaches the switchboard, whether or not it became
  // THIS item's one `release` key — a key absent from `releases` leaves its items
  // published, so silence here would publish a batch nobody turned on.
  for (const extra of mappedTags.releases) {
    if (!releaseKeys.includes(extra)) releaseKeys.push(extra);
  }
  if (mappedTags.tags.length > 0) frontmatter.tags = mappedTags.tags;

  const aliases = (Array.isArray(get('aliases')) ? get('aliases') : [])
    .map((a) => String(a).trim()).filter((a) => a !== '');
  if (aliases.length > 0) frontmatter.aliases = aliases;

  // AGSC-02-19: membership is authored on the item.
  const deck = typeof get('deck') === 'string' ? get('deck').trim() : '';
  if (deck !== '') frontmatter.clusters = [deck];
  else findings.push(finding('AGSC-E305', 'the card names no deck, so it joins no cluster (AGSC-03-10)',
    { ...at, severity: 'warn' }));

  const date = typeof get('dateAdded') === 'string' ? get('dateAdded').trim() : '';
  if (date !== '') frontmatter.date = date;
  const modified = typeof get('dateUpdated') === 'string' ? get('dateUpdated').trim() : '';
  if (modified !== '') frontmatter.modified = modified;

  // ------------------------------------------------------------------- sources
  const mappedSources = sourcesModule.map(sourcesModule.referenceList(record), {
    file: path,
    slug,
    add: options.addSources,
    promote: options.promoteSources,
  });
  findings.push(...mappedSources.findings);
  if (mappedSources.sources.length > 0) frontmatter.sources = mappedSources.sources;
  else findings.push(finding('AGSC-E202', 'no source survived the mapping (AGSC-02-10)', at));

  frontmatter.prov = options.prov;

  // AGSC-01-11: the slug is the file stem AND the value of `id` when present.
  const id = typeof get('id') === 'string' ? get('id').trim() : '';
  if (id !== '') {
    if (id === slug) frontmatter.id = id;
    else {
      findings.push(finding('AGSC-E206',
        `id "${id}" differs from the file stem "${slug}"; the stem wins (AGSC-01-11)`, at));
      frontmatter.id = slug;
    }
  }

  const relatedResult = filterLinks(get('related'), options.inSet, { file: path, slug, key: 'related' });
  findings.push(...relatedResult.findings);
  if (relatedResult.values.length > 0) frontmatter.related = relatedResult.values;

  // -------------------------------------------------------- the concept branch
  const kind = typeof get('kind') === 'string' ? get('kind').trim() : '';
  frontmatter.kind = kind === '' ? 'explainer' : kind;
  if (kind === '') {
    findings.push(finding('AGSC-E202',
      'no kind on the card; imported as explainer (AGSC-02-12)', { ...at, severity: 'warn' }));
  }
  for (const key of ['evidence', 'maturity', 'mapping']) {
    const value = get(key);
    if (typeof value === 'string' && value !== '') frontmatter[key] = value;
  }
  for (const key of ['domains', 'modality', 'deployment']) {
    const value = get(key);
    if (Array.isArray(value) && value.length > 0) frontmatter[key] = value.map((v) => String(v));
  }
  const implementations = get('implementations');
  if (Array.isArray(implementations) && implementations.length > 0) {
    const list = implementations
      .filter((i) => i && typeof i === 'object' && typeof i.label === 'string' && typeof i.url === 'string')
      .map((i) => ({ label: i.label, url: i.url }));
    if (list.length > 0) frontmatter.implementations = list;
  }
  const signatureElements = get('signatureElements');
  const elements = Array.isArray(signatureElements)
    ? signatureElements.map((s) => String(s)).filter((s) => s !== '')
    : (typeof signatureElements === 'string' && signatureElements !== '' ? [signatureElements] : []);
  if (elements.length > 0) {
    // AGSC-02-03: the emitted YAML is the FAILSAFE subset, where every scalar is
    // a string; `signature` is typed `boolean` by the schema and is restored by
    // `knowledge/validate.js#applyTypes` on the way back in. Writing a JavaScript
    // boolean here would make the emitter throw, not the file wrong.
    frontmatter.signature = 'true';
    frontmatter.signature_elements = elements;
  }

  // AGSC-02-13: `diagram.file` is `<slug>.svg`, compiled from the source.
  const diagram = get('diagram');
  if (diagram && typeof diagram === 'object') {
    const alt = typeof diagram.alt === 'string' && diagram.alt.trim() !== ''
      ? diagram.alt.trim()
      : String(options.diagramAlt === undefined ? `${slug} diagram` : options.diagramAlt);
    frontmatter.diagram = { file: `${slug}.svg`, alt };
    if (typeof diagram.caption === 'string' && diagram.caption.trim() !== '') {
      frontmatter.diagram.caption = diagram.caption.trim();
    }
    if (typeof diagram.file === 'string' && diagram.file !== `${slug}.svg`) {
      findings.push(finding('AGSC-E204',
        `diagram.file "${diagram.file}" was rewritten to "${slug}.svg" (AGSC-02-13)`,
        { ...at, severity: 'warn' }));
    }
  }

  // ------------------------------------------- the vendor namespace, verbatim
  const subdeck = get('subdeck');
  if (typeof subdeck === 'string' && subdeck.trim() !== '') {
    frontmatter[`${VENDOR_PREFIX}subdeck`] = subdeck.trim();
  }
  const owasp = get('owaspIds');
  if (Array.isArray(owasp) && owasp.length > 0) {
    frontmatter[`${VENDOR_PREFIX}owasp-ids`] = owasp.map((v) => String(v));
  }

  // -------------------------------------------------- unaccounted foreign keys
  const unaccounted = [];
  for (const key of Object.keys(record)) {
    if (KNOWN_OLD_KEYS.includes(key)) continue;
    unaccounted.push(key);
    // AGSC-02-05a's grammar is `x-<vendor>-<key>` in lowercase, so the foreign
    // name is LOWERCASED FIRST: folding case after the substitution would turn
    // every capital into a hyphen and lose the letter (`inventedKey` became
    // `invented-ey`).
    frontmatter[`${VENDOR_PREFIX}${key.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '')}`]
      = record[key];
  }
  if (unaccounted.length > 0) {
    findings.push(finding('AGSC-E207',
      `foreign key(s) ${unaccounted.sort().join(', ')} preserved in the ${VENDOR_PREFIX}* namespace (AGSC-02-05a)`,
      { ...at, severity: 'warn' }));
  }

  return {
    slug,
    path,
    frontmatter: ordered(frontmatter),
    body: links.body,
    excisions: cleaned.excisions,
    dropped: { related: relatedResult.dropped, bodyLinks: links.delinked },
    releaseKeys,
    findings,
  };
}

module.exports = {
  CONCEPT_ORDER,
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  KNOWN_OLD_KEYS,
  OLD_LINK,
  TOP_ORDER,
  VENDOR_PREFIX,
  filterLinks,
  mapCard,
  ordered,
  rewriteBodyLinks,
};
