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
 *
 * Both overlapping classes are held: `B+W` (the substance is public AND also in
 * the third-party work) and `B` (the substance is in that work and nowhere else),
 * which is the stronger case of the same rule. `B` was previously kept out of the
 * Bundle altogether; holding it back as a draft keeps the catalogue complete on
 * disk while the guard — a draft is emitted on no public surface — is unchanged.
 */
const DRAFT_CLASSES = Object.freeze(['B', 'B+W']);

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

/**
 * A deep copy of plain JSON data, so that `plan()` stays pure over an input the
 * caller keeps using (`structuredClone` is not available on every runtime this
 * engine targets, and the input here is JSON by construction).
 *
 * @param {*} value
 * @returns {*} `{}` for anything that is not a plain object.
 */
function clone(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value));
}

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
 * @param {object} [input.corrections] slug -> `{title?, status?, promote?:[url],
 *   add?:[reference]}` — the per-card corrections a human decided (a re-sourced
 *   citation, a renamed title, a card held back), supplied as DATA so that no
 *   card list lives in the engine. Every member is optional and every one is
 *   reported in `applied` so that the import states what a human changed.
 * @param {object} [input.config] the Bundle's CURRENT `agsc.config.json`, parsed.
 *   Every member this import does not compute is carried through unchanged, so a
 *   re-import never deletes a contribution channel, an author or a vendor
 *   extension the operator authored. Absent means an empty object (a fresh seed).
 * @param {object} [input.statusByClass] selection `class` -> AGSC-02-23 `status`:
 *   the editorial state a whole class is imported at, stated once. The
 *   clean-room `draftClasses` guard is applied first and is never overridden.
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
/**
 * The caller's `status` decision for one selection row, as a pure function of the
 * three inputs that can hold a record BACK — and of nothing else, so that the
 * pre-pass that builds the published set and the mapping loop cannot disagree
 *
 *
 * `draft` wins over all three, because every one of them is a reason to hold a
 * record back and none is a licence to release one:
 *   * the clean-room class of AGSC-08-17 (`draftClasses`) — always applied;
 *   * a per-record correction a human made (an unverifiable citation, say);
 *   * the caller's class-to-status table, which is how a corpus whose own `status`
 *     values are a different editorial state is re-stated once instead of record by
 *     record.
 * With none of them the result is `undefined` and the record keeps the status the
 * corpus gave it (`interchange/status.js`).
 *
 * @param {{slug:string, class?:string}} row one selection row.
 * @param {object} corrections the `--corrections` map, by slug.
 * @param {{draftClasses:string[], statusByClass:object}} tables
 * @returns {string|undefined}
 */
function statusOverrideFor(row, corrections, tables) {
  const slug = row.slug;
  const classValue = row.class === undefined ? '' : row.class;
  const correct = Object.prototype.hasOwnProperty.call(corrections, slug)
    ? (corrections[slug] || {}) : {};
  if (tables.draftClasses.includes(classValue) || correct.status === 'draft') return 'draft';
  if (correct.status !== undefined) return correct.status;
  return Object.prototype.hasOwnProperty.call(tables.statusByClass, classValue)
    ? tables.statusByClass[classValue] : undefined;
}

function plan(input, options) {
  const findings = [];
  const draftClasses = options.draftClasses === undefined ? DRAFT_CLASSES : options.draftClasses;
  const licenseProse = options.licenseProse === undefined
    ? 'LicenseRef-AgenticSystemCore-Content-Use-1.0' : options.licenseProse;
  const prov = Object.freeze({ origin: 'imported', operator: options.operator });
  const corrections = input.corrections || Object.create(null);
  const statusByClass = input.statusByClass || Object.create(null);
  const correctionsApplied = [];

  // AGSC-08-17: the three excluded files never enter, whatever the selection
  // says. That one of them EXISTS in the corpus being read is not a defect of
  // this Bundle — the corpus is not the Bundle — so it is stated as a warning,
  // with the evidence that it was seen and not copied. The rule itself is
  // checked against the PLAN, below, where a violation would be real.
  for (const path of [...new Set(input.paths || [])].sort(byCodePoint)) {
    const name = path.slice(path.lastIndexOf('/') + 1);
    if (!EXCLUDED_FILES.includes(name)) continue;
    findings.push(finding('AGSC-E405',
      `"${path}" is present in the source corpus and was NOT copied (AGSC-08-17)`,
      { file: path, line: 1, severity: 'warn' }));
  }

  // ------------------------------------------------------------ the selection
  const parsedSelection = selectionModule.parse(input.selection, { file: options.selectionFile });
  findings.push(...parsedSelection.findings);

  const byOldSlug = new Map();
  for (const file of input.cards || []) {
    // A `rewrite` correction is applied to the record's own BYTES, before it is
    // read: one exact-string substitution per pair, so that a citation's title
    // and the sentence that uses it are corrected by one mechanism and the whole
    // Bundle stays reproducible from the corpus plus this file. A pair whose
    // `from` is not present is a STALE correction and is reported, never ignored.
    const { slug: oldSlug } = oldsite.slugOf(file.path);
    const pairs = Object.prototype.hasOwnProperty.call(corrections, oldSlug)
      ? ((corrections[oldSlug] || {}).rewrite || []) : [];
    let markdown = String(file.markdown === undefined ? '' : file.markdown);
    for (const pair of pairs) {
      const from = String((pair || [])[0]);
      const to = String((pair || [])[1]);
      if (!markdown.includes(from)) {
        findings.push(finding('AGSC-E901',
          `the rewrite correction ${JSON.stringify(from)} matches nothing in "${file.path}" (AGSC-01-22)`,
          { file: String(file.path), line: 1, slug: oldSlug }));
        continue;
      }
      markdown = markdown.split(from).join(to);
      correctionsApplied.push({ member: 'rewrite', slug: oldSlug });
    }
    const card = oldsite.readCard({ ...file, markdown });
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
    // `slug.dedupe` does not mutate the set it is given, so the set is grown HERE.
    // Without this, two rows whose slugs collide would both take the same path and
    // the second file would silently overwrite the first.
    taken.add(slug);
    if (slug !== row.slug) {
      findings.push(finding('AGSC-E206',
        `slug "${row.slug}" collided and became "${slug}" in discovery order (AGSC-01-23)`,
        { file: `content/concepts/${slug}.md`, line: 1, slug, severity: 'warn' }));
    }
    chosen.push({ row, card, slug });
  }
  const inSet = new Set(chosen.map((c) => c.slug));

  // the PUBLISHED subset, decided BEFORE any body is rewritten.
  // A body link may only point at a card that will have a route (AGSC-06-01), and a
  // held-back card has none (AGSC-06-30) — so the status decision of every chosen
  // record has to be known before the first record's body is mapped. It is the same
  // decision the loop below applies, lifted into a pure pass over `chosen`, so the
  // two cannot disagree: `statusFor` is called once here and once there with the
  // same inputs and `status.js` is pure.
  const statusOf = new Map(chosen.map(({ row, card, slug }) => [slug,
    statusModule.status(card.record === undefined ? undefined : card.record.status, {
      file: `content/concepts/${slug}.md`,
      override: statusOverrideFor(row, corrections, { draftClasses, statusByClass }),
      slug,
    }).status]));
  const publishedSet = new Set([...statusOf.entries()]
    .filter(([, value]) => value !== 'draft' && value !== 'retired')
    .map(([slug]) => slug));

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
    const correct = Object.prototype.hasOwnProperty.call(corrections, slug)
      ? (corrections[slug] || {}) : {};
    const statusOverride = statusOverrideFor(row, corrections, { draftClasses, statusByClass });
    for (const key of ['title', 'status', 'promote', 'add']) {
      if (correct[key] !== undefined) correctionsApplied.push({ member: key, slug });
    }

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
      publishedSet,
      statusOverride,
      addSources: correct.add,
      promoteSources: correct.promote,
      title: correct.title,
      diagramAlt: source === null ? undefined : diagrams.altFrom(source, { slug }),
    });
    findings.push(...mapped.findings);
    excisions.push(...mapped.excisions.map((e) => ({ slug, ...e })));
    for (const value of mapped.dropped.related) droppedRelated.push({ slug, value });
    for (const value of mapped.dropped.bodyLinks) droppedBodyLinks.push({ slug, value });
    for (const key of mapped.releaseKeys) releaseKeys.push(key);
    for (const tag of mapped.frontmatter.tags || []) allTags.add(tag);
    if (typeof card.record.deck === 'string') deckOf.push({ slug, deck: card.record.deck });

    // AGSC-02-98: the picture and the source it is compiled from, both
    // named in `attachments[]` so that neither is an orphan (AGSC-E414) and both
    // are served at `/attachments/<slug>/<file>` (AGSC-06-01).
    if (compiled !== null && compiled.svg !== null) {
      // AGSC-01-07 is explicit: the DSL source is committed at
      // `content/diagrams/<slug>.diagram` and **a compiled `.svg` MUST NOT be
      // committed** — it is produced into the build output. So the default
      // import writes the SOURCE ONLY, and `diagram.file` (AGSC-02-13) names the
      // SVG the emitter is to produce from it.
      writes.push({ path: `content/diagrams/${slug}.diagram`, text: source });
      diagramCount += 1;
      // AGSC-02-98 admits the same picture as an ATTACHMENT, with its DSL source
      // beside it — a Bundle that must carry the rendered bytes in the
      // repository, for a reader who never runs the build. The two rules pull in
      // opposite directions, so the choice is the operator's and not this
      // module's: `attachDiagrams` is off unless a caller asks for it.
      if (options.attachDiagrams === true) {
        const alt = (mapped.frontmatter.diagram && mapped.frontmatter.diagram.alt)
          || diagrams.altFrom(source, { slug });
        mapped.frontmatter.attachments = [
          { file: `${slug}.svg`, media_type: SVG_MEDIA_TYPE, alt: altFor('svg', mapped.frontmatter.title, alt) },
          { file: `${slug}.diagram`, media_type: DSL_MEDIA_TYPE, alt: altFor('dsl', mapped.frontmatter.title, alt) },
        ];
        writes.push({ path: `content/attachments/${slug}/${slug}.svg`, text: compiled.svg });
        writes.push({ path: `content/attachments/${slug}/${slug}.diagram`, text: source });
        attachmentCount += 2;
      }
    } else if (mapped.frontmatter.diagram !== undefined) {
      // No picture, so no `diagram` key: AGSC-02-13 makes `diagram.file` the
      // compiled SVG, and naming one that does not exist would be a false claim.
      delete mapped.frontmatter.diagram;
    }

    const frontmatter = mapping.ordered(mapped.frontmatter);
    writes.push({ path: mapped.path, text: itemFile(frontmatter, mapped.body) });
    items.push({
      slug, path: mapped.path, frontmatter, body: mapped.body,
      class: row.class === undefined ? '' : row.class,
    });
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
  // The configuration this import WRITES is the one already on disk, with the
  // members this import computes replaced and nothing else touched. Seeding the
  // file is what the `old-site` adapter is for, but a Bundle that already exists
  // carries members no import can derive — a contribution channel, an author, a
  // lint budget, a vendor `x-` extension — and rewriting the file from a template
  // silently DELETED them. What is computed here is written; the rest is kept.
  const releases = statusModule.switchboard(releaseKeys);
  const existing = clone(input.config);
  const config = { ...existing };
  config.bundle = {
    ...(existing.bundle === undefined ? {} : existing.bundle),
    id: options.bundleId,
    license_prose: licenseProse,
    license_schema: options.licenseSchema === undefined ? 'CC0-1.0' : options.licenseSchema,
    operator: options.operator,
  };
  // AGSC-01-18: `build.feed` is a RESERVED name of 1.1 and is `AGSC-E004` here,
  // because no 1.0 rule pins the bytes of `/feed.xml`. `out` is the whole of
  // `build` an importer may write — an operator's own `out` is kept, every other
  // member of `build` goes.
  const existingOut = existing.build === undefined ? undefined : existing.build.out;
  config.build = { out: typeof existingOut === 'string' && existingOut !== '' ? existingOut : 'www' };
  config.site = {
    ...(existing.site === undefined ? {} : existing.site),
    base: options.base,
    title: options.title,
  };
  config.spec_version = options.specVersion;
  config.tags = {
    ...(existing.tags === undefined ? {} : existing.tags),
    allowed: [...allTags].sort(byCodePoint),
  };
  if (options.tagline !== undefined) config.site.tagline = options.tagline;
  if (Object.keys(releases).length > 0) config.releases = releases;
  else delete config.releases;
  if (Array.isArray(options.peers) && options.peers.length > 0) {
    config.peers = [...options.peers].sort(byCodePoint);
  } else delete config.peers;
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

  // AGSC-08-17 against the plan: if this import ever proposed to write one of the
  // excluded files, that is an error about the Bundle it is building.
  findings.push(...cleanroom.check({ paths: writes.map((w) => w.path) }));

  return {
    corrections: correctionsApplied,
    dropped: { bodyLinks: droppedBodyLinks, related: droppedRelated },
    excisions,
    findings: sortFindings(findings),
    items,
    totals: {
      attachments: attachmentCount,
      cards_read: byOldSlug.size,
      chosen: chosen.length,
      clusters: built.clusters.length,
      corrections: correctionsApplied.length,
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
    writes,
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
  clone,
  indexBody,
  itemFile,
  jsonBytes,
  plan,
};
