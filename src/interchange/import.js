'use strict';
// src/interchange/import.js — CONTEXT Interchange, the `import --from old-site`
// use case (AGSC-01-22, AGSC-01-23; M3-T01…T08, T16…T19).
//
// One old site in, one conforming Bundle out: a write PLAN, not a write. The
// plan is a list of `{path, text}` pairs in code-point path order, so the caller
// (`application/cli/verbs/import.js`) is the only thing that touches a file and
// AGSC-01-23's determinism is a property of this function rather than of the
// order a directory happened to be read in.
//
// WHAT AGSC-01-23 REQUIRES, AND HOW IT IS MET.
//   * deterministic — every ordering below is code-point, every instant is
//     injected (`options.date`), nothing reads a clock or a filesystem;
//   * idempotent — the plan is a total function of its inputs, so a second run
//     over unchanged input produces the same bytes and creates no duplicate
//     item. `tests/interchange/import-idempotence.test.js` proves both halves.
//   * colliding slugs are suffixed `-2`, `-3`, … in DISCOVERY ORDER, which is
//     the order of the selection file.
//
// PURE: no fs, no process, no clock, no network.

const { finding, sortFindings } = require('../knowledge/validate.js');
const slugs = require('../knowledge/slug.js');
const { serialize } = require('../knowledge/adopt.js');
const diagrams = require('../knowledge/diagrams.js');
const cleanroom = require('../governance/cleanroom.js');
const clustersModule = require('./clusters.js');
const mapping = require('./mapping.js');
const oldsite = require('./oldsite.js');
const selectionModule = require('./selection.js');
const statusModule = require('./status.js');

/** The one foreign format this verb reads, and the value of `--from`. */
const FORMAT = 'old-site';

/**
 * The clean-room GUARD of AGSC-08-17, as a class rule rather than a card list:
 * a card whose substance also appears in a third-party work the operator is
 * party to is imported as `draft`, and a draft reaches no published surface
 * (AGSC-06-30). It is cleared by a human, deck by deck. The selection file's
 * `class` column is what names the class.
 */
const DRAFT_CLASSES = Object.freeze(['B+W']);

/** AGSC-02-98: the two attachment files every imported diagram produces. */
const SVG_MEDIA_TYPE = 'image/svg+xml';
const DSL_MEDIA_TYPE = 'text/plain';

/** The three files AGSC-08-17 excludes from every Bundle. */
const EXCLUDED_FILES = cleanroom.EXCLUDED_FILES;

/** Code-point order over strings — the one ordering this module uses. */
const byCodePoint = (a, b) => {
  const left = [...a];
  const right = [...b];
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    const d = left[i].codePointAt(0) - right[i].codePointAt(0);
    if (d !== 0) return d;
  }
  return left.length - right.length;
};

/** JSON the way the Bundle's own fixtures are written: sorted keys, two spaces. */
function jsonBytes(value) {
  const sort = (node) => {
    if (Array.isArray(node)) return node.map(sort);
    if (node === null || typeof node !== 'object') return node;
    const out = {};
    for (const key of Object.keys(node).sort()) out[key] = sort(node[key]);
    return out;
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

/** An item file: the AGSC-04-19 frontmatter block, then the body. */
function itemFile(frontmatter, body) {
  const text = `${serialize(frontmatter)}${body.startsWith('\n') ? '' : '\n'}${body}`;
  return `${text.replace(/\n+$/u, '')}\n`;
}

/**
 * The accessible text an attachment needs (AGSC-02-98: `alt` is REQUIRED and
 * non-empty). The SVG takes the card's own `diagram.alt`; the DSL source takes a
 * sentence derived from it, because a reader who opens the source is looking at
 * the same picture in another form.
 */
function altFor(kind, title, alt) {
  if (kind === 'svg') return alt;
  return `The diagram source for ${title}, in the text DSL the SVG is compiled from: ${alt}`;
}

/**
 * Plan an import of the old site.
 *
 * @param {object} input
 * @param {Array<{path:string, markdown:string}>} input.cards every
 *   `content/patterns/*.md` of the old site, in any order.
 * @param {object} input.diagramSources slug -> `.diagram` text.
 * @param {Array<object>} input.decks the old `decks.json` list.
 * @param {string} input.selection the selection TSV's bytes.
 * @param {string[]} [input.paths] every path the import was pointed at, for the
 *   AGSC-08-17 exclusion check.
 * @param {object} [input.recitations] slug -> `{promote:[url], add:[reference]}`,
 *   the source-integrity corrections, supplied as DATA so that no card list
 *   lives in the engine.
 * @param {object} options
 * @param {string} options.operator the AGSC-08-01 actor (`human:<id>`).
 * @param {string} options.date the AGSC-02-06 date of the import.
 * @param {string} options.specVersion
 * @param {string} options.bundleId
 * @param {string} options.base `site.base`, an absolute https URL.
 * @param {string} options.title `site.title`.
 * @param {string} [options.tagline]
 * @param {string} [options.licenseProse]
 * @param {string} [options.licenseSchema]
 * @param {string[]} [options.peers]
 * @param {string[]} [options.draftClasses] default DRAFT_CLASSES.
 * @returns {{writes:Array<{path:string, text:string}>, totals:object,
 *            findings:Array<object>, dropped:object, excisions:Array<object>,
 *            items:Array<object>}}
 */
function plan(input, options) {
  const findings = [];
  const draftClasses = options.draftClasses === undefined ? DRAFT_CLASSES : options.draftClasses;
  const licenseProse = options.licenseProse === undefined
    ? 'LicenseRef-AgenticSystemCore-Content-Use-1.0' : options.licenseProse;
  const prov = Object.freeze({ origin: 'imported', operator: options.operator });
  const recitations = input.recitations || Object.create(null);

  // AGSC-08-17: the three excluded files never enter, whatever the selection says.
  findings.push(...cleanroom.check({ paths: input.paths || [] }));

  // ------------------------------------------------------------ the selection
  const parsedSelection = selectionModule.parse(input.selection, { file: options.selectionFile });
  findings.push(...parsedSelection.findings);

  const byOldSlug = new Map();
  for (const file of input.cards || []) {
    const card = oldsite.readCard(file);
    findings.push(...card.findings);
    byOldSlug.set(card.slug, card);
  }

  // The imported set, and AGSC-01-23's collision suffixes in discovery order.
  const taken = new Set();
  const chosen = [];
  for (const row of parsedSelection.chosen) {
    const card = byOldSlug.get(row.slug);
    if (card === undefined) {
      findings.push(finding('AGSC-E901',
        `the selection chooses "${row.slug}" and the source holds no such card (AGSC-01-22)`,
        { file: options.selectionFile, line: row.line, slug: row.slug }));
      continue;
    }
    const slug = slugs.dedupe(slugs.isValid(row.slug) ? row.slug : slugs.slugify(row.slug), taken);
    if (slug !== row.slug) {
      findings.push(finding('AGSC-E206',
        `slug "${row.slug}" collided and became "${slug}" in discovery order (AGSC-01-23)`,
        { file: `content/concepts/${slug}.md`, line: 1, slug, severity: 'warn' }));
    }
    chosen.push({ row, card, slug });
  }
  const inSet = new Set(chosen.map((c) => c.slug));

  // ----------------------------------------------------------------- the items
  const writes = [];
  const items = [];
  const excisions = [];
  const droppedRelated = [];
  const droppedBodyLinks = [];
  const releaseKeys = [];
  const deckOf = [];
  const allTags = new Set();
  let diagramCount = 0;
  let attachmentCount = 0;

  for (const { row, card, slug } of chosen) {
    const classValue = row.class === undefined ? '' : row.class;
    const statusOverride = draftClasses.includes(classValue) ? 'draft' : undefined;
    const recite = Object.prototype.hasOwnProperty.call(recitations, slug) ? recitations[slug] : {};

    // The diagram first: its `alt` is the fallback the mapper needs, and the
    // compiled bytes are what AGSC-02-98 checks.
    const rawSource = input.diagramSources && input.diagramSources[card.slug];
    let compiled = null;
    let source = null;
    if (typeof rawSource === 'string') {
      source = oldsite.normaliseSource(rawSource);
      compiled = diagrams.compile(source, {
        slug,
        file: `content/diagrams/${slug}.diagram`,
        label: typeof card.record.title === 'string' ? card.record.title : undefined,
      });
      findings.push(...compiled.findings);
    } else {
      findings.push(finding('AGSC-E901',
        `no diagram source for "${card.slug}" (AGSC-01-07)`,
        { file: `content/diagrams/${slug}.diagram`, line: 1, slug, severity: 'warn' }));
    }

    const mapped = mapping.mapCard({ ...card, slug }, {
      inSet,
      prov,
      statusOverride,
      addSources: recite.add,
      promoteSources: recite.promote,
      diagramAlt: source === null ? undefined : diagrams.altFrom(source, { slug }),
    });
    findings.push(...mapped.findings);
    excisions.push(...mapped.excisions.map((e) => ({ slug, ...e })));
    for (const value of mapped.dropped.related) droppedRelated.push({ slug, value });
    for (const value of mapped.dropped.bodyLinks) droppedBodyLinks.push({ slug, value });
    for (const key of mapped.releaseKeys) releaseKeys.push(key);
    for (const tag of mapped.frontmatter.tags || []) allTags.add(tag);
    if (typeof card.record.deck === 'string') deckOf.push({ slug, deck: card.record.deck });

    // AGSC-02-98 + R59: the picture and the source it is compiled from, both
    // named in `attachments[]` so that neither is an orphan (AGSC-E414) and both
    // are served at `/attachments/<slug>/<file>` (AGSC-06-01).
    if (compiled !== null && compiled.svg !== null) {
      const alt = (mapped.frontmatter.diagram && mapped.frontmatter.diagram.alt)
        || diagrams.altFrom(source, { slug });
      mapped.frontmatter.attachments = [
        { file: `${slug}.svg`, media_type: SVG_MEDIA_TYPE, alt: altFor('svg', mapped.frontmatter.title, alt) },
        { file: `${slug}.diagram`, media_type: DSL_MEDIA_TYPE, alt: altFor('dsl', mapped.frontmatter.title, alt) },
      ];
      writes.push({ path: `content/diagrams/${slug}.diagram`, text: source });
      writes.push({ path: `content/attachments/${slug}/${slug}.svg`, text: compiled.svg });
      writes.push({ path: `content/attachments/${slug}/${slug}.diagram`, text: source });
      diagramCount += 1;
      attachmentCount += 2;
    } else if (mapped.frontmatter.diagram !== undefined) {
      // No picture, so no `diagram` key: AGSC-02-13 makes `diagram.file` the
      // compiled SVG, and naming one that does not exist would be a false claim.
      delete mapped.frontmatter.diagram;
    }

    const frontmatter = mapping.ordered(mapped.frontmatter);
    writes.push({ path: mapped.path, text: itemFile(frontmatter, mapped.body) });
    items.push({ slug, path: mapped.path, frontmatter, body: mapped.body, class: classValue });
  }

  // -------------------------------------------------------------- the clusters
  const built = clustersModule.build(input.decks, {
    members: clustersModule.membership(deckOf),
    prov,
    date: options.date,
  });
  findings.push(...built.findings);
  for (const cluster of built.clusters) {
    writes.push({ path: cluster.path, text: itemFile(cluster.frontmatter, cluster.body) });
  }

  // ------------------------------------------------- the Bundle's own two files
  const releases = statusModule.switchboard(releaseKeys);
  const config = {
    bundle: {
      id: options.bundleId,
      license_prose: licenseProse,
      license_schema: options.licenseSchema === undefined ? 'CC0-1.0' : options.licenseSchema,
      operator: options.operator,
    },
    build: { feed: true, out: 'www' },
    site: { base: options.base, title: options.title },
    spec_version: options.specVersion,
    tags: { allowed: [...allTags].sort(byCodePoint) },
  };
  if (options.tagline !== undefined) config.site.tagline = options.tagline;
  if (Object.keys(releases).length > 0) config.releases = releases;
  if (Array.isArray(options.peers) && options.peers.length > 0) {
    config.peers = [...options.peers].sort(byCodePoint);
  }
  writes.push({ path: 'agsc.config.json', text: jsonBytes(config) });

  const published = items.filter((i) => i.frontmatter.status !== 'draft').length;
  const indexFrontmatter = {
    spec_version: options.specVersion,
    okf_version: '0.2',
    title: options.title,
    description: `${items.length} agentic-system design patterns, imported as concept items with their`
      + ' diagrams, sources and provenance.',
    base: options.base,
    lang: 'en',
    license: licenseProse,
    prov: { origin: 'imported', operator: options.operator },
  };
  writes.push({
    path: 'content/index.md',
    text: itemFile(indexFrontmatter, indexBody(options, items.length, built.clusters.length, published)),
  });

  writes.sort((a, b) => byCodePoint(a.path, b.path));

  return {
    dropped: { bodyLinks: droppedBodyLinks, related: droppedRelated },
    excisions,
    findings: sortFindings(findings),
    items,
    totals: {
      attachments: attachmentCount,
      cards_read: byOldSlug.size,
      chosen: chosen.length,
      clusters: built.clusters.length,
      deferred: parsedSelection.rows.filter((r) => r.decision === 'DEFER').length,
      diagrams: diagramCount,
      draft: items.length - published,
      dropped_body_links: droppedBodyLinks.length,
      dropped_related: droppedRelated.length,
      excisions: excisions.length,
      excluded: parsedSelection.rows.filter((r) => r.decision === 'EXCLUDE').length,
      files: writes.length,
      items: items.length,
      release_keys: Object.keys(releases).length,
      stable: published,
      tags_allowed: config.tags.allowed.length,
    },
  };
}

/** `content/index.md`'s body — prose only, no reading order (AGSC-06-03). */
function indexBody(options, itemCount, clusterCount, published) {
  return `\n# ${options.title}\n\n`
    + `This Bundle is a catalogue of ${itemCount} design patterns for agentic systems: what each one is`
    + ' for, the forces it answers, how it is put together, and what it costs. Every card carries its'
    + ' own sources and a diagram whose text source travels beside it.\n\n'
    + `${published} of the ${itemCount} are published; the rest are drafts, held back until a person has`
    + ' read them against their sources. Drafts appear on no published surface.\n\n'
    + `The cards are grouped into ${clusterCount} clusters. Nothing here is a reading order: a catalogue`
    + ' is entered wherever the reader has a problem.\n';
}

module.exports = {
  DRAFT_CLASSES,
  DSL_MEDIA_TYPE,
  EXCLUDED_FILES,
  FORMAT,
  SVG_MEDIA_TYPE,
  altFor,
  byCodePoint,
  indexBody,
  itemFile,
  jsonBytes,
  plan,
};
