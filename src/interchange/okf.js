'use strict';
/**
 * CONTEXT Interchange — the foreign reader of AGSC-01-22: `import --from okf`.
 *
 * AGSC-01-22 is written about exactly this format: "Import of a foreign **OKF v0.2
 * bundle** MUST accept unknown `type` values (mapped to `concept` with a warning),
 * unknown keys, missing optional fields, missing `index.md` and broken links. A
 * broken internal link is a Gate failure for the Bundle's own build but MUST NOT
 * reject an import." AGSC-10-09 adds the other direction: an export that follows
 * AGSC-01-26…29 is one "the reference engine (or any Level-1 reader) imports …
 * losslessly", which makes `export --okf` → `import --from okf` a round trip a
 * test can assert, and `tests/interchange/okf-roundtrip.test.js` asserts it item by
 * item and byte for byte.
 *
 * THE FORMAT, AS READ FROM ITS PRIMARY SOURCE on 2026-09-21
 * (<https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md>):
 *   * "A bundle is a directory tree of markdown files. The directory structure is
 *     independent of the domain: producers organize concepts however makes sense for
 *     the knowledge being captured." — so the reader walks the tree and does not
 *     require `content/<type-plural>/`.
 *   * `type` is "the only always-required field"; `title`, `description`, `resource`
 *     and `tags` are RECOMMENDED; `sources`, `generated`, `verified`, `status` and
 *     `stale_after` are the optional families.
 *   * "Bundles MAY declare the version they target with `okf_version: \"0.2\"` in a
 *     bundle-root `index.md` frontmatter block (the only place frontmatter is
 *     permitted in an `index.md`)."
 *   * "An `index.md` file MAY appear in any directory… Index files contain no
 *     frontmatter, with one exception: a bundle-root `index.md` MAY carry an
 *     `okf_version` key."
 *   * "A `log.md` file MAY appear at any level of the hierarchy…"
 * `index.md`, `log.md`, `_index.md` and `README.md` are therefore never items
 * (AGSC-01-05 says the same of the last two).
 *
 * WHAT IS PRESERVED. Every frontmatter key the foreign file carries is written out
 * again: the ones AGSC-02 knows under their own names, the `x-` vendor namespace
 * verbatim (AGSC-02-05a), and everything else as an unknown key, which AGSC-02-05
 * requires to be preserved and warned about rather than dropped. Only two keys are
 * ever rewritten, and each records what it did:
 *   * a `type` outside AGSC-00-04's six becomes `concept` and the original is kept
 *     as `x-okf-type` — the rule's own instruction, with the vendor namespace used
 *     so that nothing is lost (`AGSC-E506`, a warning);
 *   * `prov` is synthesized when absent (`origin: imported`, the target Bundle's
 *     `bundle.operator`), because AGSC-08-01 requires it and an item without one
 *     could not be linted (`AGSC-E506`).
 *
 * TOLERANCE. A file whose frontmatter this engine's failsafe YAML reader refuses
 * (AGSC-02-02 rejects anchors, aliases, tags, merge keys and flow mappings, none of
 * which OKF forbids) is NOT refused: it is imported with a synthesized frontmatter
 * and its body intact, and the reason is reported. Refusing a foreign file for
 * being foreign is the one thing AGSC-01-22 forbids.
 *
 * DETERMINISM (AGSC-01-23). Input is sorted by path, code-point; colliding slugs
 * take `-2`, `-3`, … in that order; nothing reads a clock or a directory listing.
 *
 * PURE: no fs, no clock, no network. Requirements: PRD-021, PRD-026.
 *
 */

const frontmatter = require('../knowledge/frontmatter.js');
const yaml = require('../knowledge/yaml.js');
const licences = require('./licences.js');
const slugs = require('../knowledge/slug.js');
const fix = require('../governance/fix.js');
const { serialize, titleFor } = require('../knowledge/adopt.js');
const { compareCodePoint, nfc } = require('../knowledge/unicode.js');
const { neutraliseSingleLine } = require('./mapping.js');
const { finding } = require('../knowledge/validate.js');

/** The name this adapter answers to on `import --from <name>`. */
const FORMAT = 'okf';

/** AGSC-00-04: the six item types, and the folder each lands in (AGSC-01-03). */
const TYPE_PLURAL = Object.freeze({
  cluster: 'clusters',
  concept: 'concepts',
  episode: 'episodes',
  gate: 'gates',
  lesson: 'lessons',
  procedure: 'procedures',
});

/** Files the format reserves, which are never items (OKF §8, §9; AGSC-01-05). */
const RESERVED = Object.freeze(['index.md', 'log.md', '_index.md', 'README.md']);

/** The key an unmapped foreign `type` is preserved under (AGSC-02-05a). */
const TYPE_KEEP_KEY = 'x-okf-type';

/**
 * AGSC-03-19 / AGSC-03-20: foreign link names are MAPPED on import, never added to
 * the vocabulary. The combiner's `oneOf` (pairwise `excludes`) is a structure over
 * a selection, not a frontmatter key, and has no entry here.
 */
const FOREIGN_LINK_NAMES = Object.freeze({
  'alternative-to': 'excludes',
  blockedBy: 'blocked-by',
  'composed-of': 'uses',
  'conflicts-with': 'excludes',
  decidedBy: 'decided-by',
  mitigates: 'related',
  recommends: 'uses',
  refines: 'narrower',
  tests: 'verifies',
  'traces-to': 'covers',
});

/** Is this path one of the format's reserved documents? */
function isReserved(path) {
  const name = String(path).split('/').pop();
  return RESERVED.includes(name);
}

/**
 * The frontmatter of one foreign document, tolerantly.
 *
 * @param {string} text the file's bytes.
 * @returns {{body:string, frontmatter:object, reason:(string|null)}}
 */
function readDocument(text) {
  const source = String(text == null ? '' : text);
  const split = frontmatter.split(source);
  if (split.hasFrontmatter !== true) {
    return { body: source, frontmatter: Object.create(null), reason: 'no frontmatter block' };
  }
  try {
    const value = yaml.parse(split.yamlText);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return { body: split.body, frontmatter: Object.create(null), reason: 'the frontmatter block is not a mapping' };
    }
    const out = Object.create(null);
    for (const [key, v] of Object.entries(value)) out[key] = v;
    return { body: split.body, frontmatter: out, reason: null };
  } catch (e) {
    return {
      body: split.body,
      frontmatter: Object.create(null),
      reason: `the frontmatter is outside the YAML subset AGSC-02-02 reads (${(e && e.message) || 'parse error'})`,
    };
  }
}

/**
 * The AGSC frontmatter of one foreign document.
 *
 * @param {object} raw the foreign frontmatter.
 * @param {object} options `{body, operator, path, slug, stem}`.
 * @returns {{frontmatter:object, findings:Array<object>}}
 */
function mapFrontmatter(raw, options) {
  const findings = [];
  const out = Object.create(null);
  for (const [key, value] of Object.entries(raw)) out[key] = value;

  const declared = out.type === undefined ? '' : String(out.type);
  if (TYPE_PLURAL[declared] === undefined) {
    if (declared !== '' && out[TYPE_KEEP_KEY] === undefined) out[TYPE_KEEP_KEY] = declared;
    out.type = 'concept';
    findings.push(finding('AGSC-E506',
      declared === ''
        ? `${options.path}: the document declares no type; it was imported as a concept (AGSC-01-22)`
        : `${options.path}: the foreign type ${JSON.stringify(declared)} is not one of AGSC-00-04's six;`
          + ` it was imported as a concept and kept as ${TYPE_KEEP_KEY} (AGSC-01-22, AGSC-02-05a)`,
      { file: options.path, severity: 'warn' }));
  }

  // AGSC-03-19 / AGSC-03-20: each foreign link name becomes its Link key, values
  // appended to what the key already holds, in order and without repetition.
  for (const [foreign, key] of Object.entries(FOREIGN_LINK_NAMES)) {
    if (out[foreign] === undefined) continue;
    const values = Array.isArray(out[foreign]) ? out[foreign] : [out[foreign]];
    const merged = Array.isArray(out[key]) ? [...out[key]] : (out[key] === undefined ? [] : [out[key]]);
    for (const value of values) if (!merged.includes(value)) merged.push(value);
    out[key] = merged;
    delete out[foreign];
    findings.push(finding('AGSC-E506',
      `${options.path}: the foreign link name ${JSON.stringify(foreign)} was mapped to ${JSON.stringify(key)}`
      + ' (AGSC-03-19, AGSC-03-20)',
      { file: options.path, severity: 'warn' }));
  }

  if (out.title === undefined || String(out.title).trim() === '') {
    // AGSC-02-90's own synthesis: the body's first heading, else the file stem, else
    // the slug, clipped to the 3-120 code-point bound of AGSC-02-24.
    const derived = titleFor(String(options.body == null ? '' : options.body),
      options.stem, options.slug);
    out.title = derived.title;
    findings.push(...derived.findings.map((one) => ({ ...one, file: options.path })));
    findings.push(finding('AGSC-E506',
      `${options.path}: no title; one was synthesized from the document (AGSC-02-90)`,
      { file: options.path, severity: 'warn' }));
  }

  // AGSC-02-12 with AGSC-01-22: a concept carries `kind`; a document MAPPED to
  // `concept` (its own type unknown or absent) that declares none gets
  // the adoption default of AGSC-02-90, so the import passes this node's own lint.
  const mapped = TYPE_PLURAL[declared] === undefined;
  if (mapped && (out.kind === undefined || out.kind === null || String(out.kind) === '')) {
    out.kind = 'explainer';
    findings.push(finding('AGSC-E506',
      `${options.path}: no kind; it was imported with kind: explainer, the adoption default (AGSC-02-90, AGSC-01-22)`,
      { file: options.path, severity: 'warn' }));
  }

  // AGSC-01-22: a record whose licence the importer cannot establish as
  // permitting publication is written `status: draft`, so it is never published
  // (AGSC-06-30). The record's own `license` decides when it declares one; else the
  // source's (its root index.md, its root licence file).
  const own = out.license === undefined ? null : licences.established(out.license);
  const allowed = own === null ? options.sourceLicence === true : own;
  if (!allowed && out.status !== 'draft') {
    out.status = 'draft';
    findings.push(finding('AGSC-E506',
      `${options.path}: its licence could not be established as permitting publication`
      + `${out.license === undefined ? ' (no license key, and none at the source root)' : ` (${JSON.stringify(String(out.license))})`};`
      + ' it was imported as status: draft and is never published until a person with the right to publish it'
      + ' changes the status (AGSC-01-22, AGSC-06-30)',
      { file: options.path, severity: 'warn' }));
  }

  if (out.prov === undefined) {
    out.prov = { operator: String(options.operator), origin: 'imported' };
    findings.push(finding('AGSC-E506',
      `${options.path}: no prov; { origin: imported, operator: ${options.operator} } was synthesized`
      + ' because AGSC-08-01 requires it (AGSC-01-22)',
      { file: options.path, severity: 'warn' }));
  }

  // AGSC-01-22's RECORD: every item an import writes names the exact
  // state it was taken from. Both members are written by `import` alone and each is
  // omitted when the source publishes neither — never invented, never carried over
  // from an earlier import of a different source.
  if (out.prov !== null && typeof out.prov === 'object' && !Array.isArray(out.prov)) {
    const record = { ...out.prov };
    delete record.source_hash;
    delete record.source_version;
    if (options.sourceVersion != null && String(options.sourceVersion) !== '') {
      record.source_version = String(options.sourceVersion);
    }
    if (options.sourceHash != null && String(options.sourceHash) !== '') {
      record.source_hash = String(options.sourceHash);
    }
    out.prov = record;
  }

  // / AGSC-02-24: a foreign single-line value may carry a control character
  // or a line separator, and the serializer wrote it back as a YAML escape that
  // parses to the same code point — so `import` produced a file its own `lint`
  // refused, while reporting a pass. Neutralised here, and the substitution is
  // reported, because AGSC-01-22's tolerance never means a silent change.
  const clean = neutraliseSingleLine(out);
  if (clean.substituted.length > 0) {
    findings.push(finding('AGSC-E506',
      `${options.path}: a control character or line separator in the single-line value(s)`
      + ` ${clean.substituted.join(', ')} was replaced by a space, because AGSC-02-24 forbids it`
      + ' and the imported file must pass this node\'s own lint (AGSC-01-22)',
      { file: options.path, severity: 'warn' }));
  }
  return { findings, frontmatter: clean.frontmatter };
}

// ------------------------------------------- AGSC-01-22

/**
 * AGSC-01-22: whether the SOURCE states a licence that permits publication — its
 * root index.md `license`, else a licence file at its root (`LICENSE`, `COPYING`,
 * `LICENSE-CONTENT`, handed in as `{name: text}`).
 */
function sourceLicenceOf(files, licenceFiles) {
  // The shallowest index.md is the source root's (as `sourceFacts` reads it).
  const root = (Array.isArray(files) ? files : [])
    .filter((file) => /(^|\/)index\.md$/u.test(String(file.path).replace(/^\.\//u, '')))
    .sort((a, b) => String(a.path).split('/').length - String(b.path).split('/').length)[0];
  if (root !== undefined) {
    const declared = readDocument(root.text).frontmatter.license;
    if (declared !== undefined) return licences.established(declared) === true;
  }
  return Object.entries(licenceFiles || {}).some(([, text]) => licences.establishedText(String(text)));
}

/**
 * The three facts a source Bundle publishes about itself, read from its
 * bundle-root `index.md` — the only `index.md` OKF permits frontmatter in, and the
 * document `export --markdown`/`--okf` writes `spec_version` and `bundle_version`
 * into (AGSC-01-26). A source that publishes none of them yields three `null`s and
 * nothing is invented: a value nobody published cannot be recorded as if somebody
 * had.
 *
 * @param {Array<{path:string, text:string}>} files the foreign tree.
 * @returns {{specVersion:string|null, bundleVersion:string|null, bundleHash:string|null}}
 */
function sourceFacts(files) {
  const none = { bundleHash: null, bundleVersion: null, specVersion: null };
  const roots = (Array.isArray(files) ? files : [])
    .filter((file) => /(^|\/)index\.md$/u.test(String(file.path)))
    .sort((a, b) => String(a.path).split('/').length - String(b.path).split('/').length);
  if (roots.length === 0) return none;
  const read = readDocument(roots[0].text);
  const fm = read.frontmatter || {};
  const pick = (key) => (fm[key] === undefined || String(fm[key]) === '' ? null : String(fm[key]));
  return { bundleHash: pick('bundle_hash'), bundleVersion: pick('bundle_version'), specVersion: pick('spec_version') };
}

/** The MAJOR and MINOR of a SemVer-shaped version string, or `null`. */
function majorMinor(version) {
  const m = /^(\d+)\.(\d+)\./u.exec(String(version == null ? '' : version));
  return m === null ? null : { major: Number(m[1]), minor: Number(m[2]) };
}

/**
 * AGSC-01-22's LIMIT: a source whose declared `spec_version` has a MAJOR this tool
 * does not implement is refused with `AGSC-E004`, before any file is written,
 * unless the caller passed the adapter's own `--allow-newer`. A source of the
 * tool's MAJOR and a newer MINOR is NOT refused: it is imported, with the warning
 * `versionWarning` returns, and every construct the tool does not know is handled
 * as AGSC-00-21 lists.
 *
 * A source that declares nothing, or declares something this reader cannot parse
 * as SemVer, is NOT refused — AGSC-01-22's tolerance covers a missing optional
 * field, and refusing for the absence of a declaration would refuse every OKF
 * bundle in the world.
 *
 * @param {string|null} sourceVersion the source's declared `spec_version`.
 * @param {{toolSpecVersion:string, allowNewer?:boolean}} options
 * @returns {object|null} the finding, or `null` when the import may proceed.
 */
function versionRefusal(sourceVersion, options) {
  const opts = options || {};
  if (opts.allowNewer === true) return null;
  const source = majorMinor(sourceVersion);
  const tool = majorMinor(opts.toolSpecVersion);
  if (source === null || tool === null) return null;
  if (source.major === tool.major) return null;
  return finding('AGSC-E004',
    `the source declares spec_version ${JSON.stringify(String(sourceVersion))}, whose MAJOR this tool`
    + ` does not implement (it implements ${JSON.stringify(String(opts.toolSpecVersion))}); nothing was`
    + ' written. Reading another MAJOR is a guess, so the choice is the operator\'s: pass --allow-newer'
    + ' to take it (AGSC-01-22)',
    { file: 'content/index.md', severity: 'error' });
}

/**
 * AGSC-01-22: a source of the tool's MAJOR and a newer MINOR is imported with the
 * warning `AGSC-E506` naming the newer version; a construct of that MINOR the tool
 * does not know is ignored and preserved as AGSC-00-21 lists.
 *
 * @param {string|null} sourceVersion the source's declared `spec_version`.
 * @param {{toolSpecVersion:string}} options
 * @returns {object|null} the warning, or `null`.
 */
function versionWarning(sourceVersion, options) {
  const opts = options || {};
  const source = majorMinor(sourceVersion);
  const tool = majorMinor(opts.toolSpecVersion);
  if (source === null || tool === null || source.major !== tool.major || source.minor <= tool.minor) return null;
  return finding('AGSC-E506',
    `the source declares spec_version ${JSON.stringify(String(sourceVersion))}, a newer MINOR than this`
    + ` tool's ${JSON.stringify(String(opts.toolSpecVersion))}; it is imported, and what that MINOR adds`
    + ' is ignored and preserved as AGSC-00-21 lists (AGSC-01-22)',
    { file: 'content/index.md', severity: 'warn' });
}

/**
 * The AGSC-01-22 warnings of a set of declared versions: one per distinct newer
 * MINOR, at the first place it is declared, so that a hundred records of one
 * source say it once.
 *
 * @param {Array<{version:(string|null), file?:string, line?:number}>} entries
 * @param {{toolSpecVersion:string}} options
 * @returns {Array<object>}
 */
function versionWarnings(entries, options) {
  const seen = new Set();
  const out = [];
  for (const entry of entries || []) {
    const warning = versionWarning(entry.version == null ? null : String(entry.version), options);
    if (warning === null || seen.has(String(entry.version))) continue;
    seen.add(String(entry.version));
    out.push({ ...warning, ...(entry.file === undefined ? {} : { file: entry.file }),
      ...(entry.line === undefined ? {} : { line: entry.line }) });
  }
  return out;
}

/**
 * The import plan: what would be written, in code-point path order.
 *
 * @param {Array<{path:string, text:string}>} files every file of the foreign tree.
 * @param {object} options
 * @param {string} options.operator `bundle.operator` of the TARGET Bundle (AGSC-08-01).
 * @param {object} options.itemSchema the raw `schema/item.schema.json` object, so the
 *   written bytes are the lint-normalized ones (AGSC-04-19) and a second import of
 *   the same tree is a no-op (AGSC-01-23).
 * @param {string|null} [options.sourceVersion] the source's content version, written
 *   onto every item as `prov.source_version` (AGSC-01-22, AGSC-08-01).
 * @param {string|null} [options.sourceHash] the source's bundle hash, written onto
 *   every item as `prov.source_hash`.
 * @returns {{findings:Array<object>, totals:object, writes:Array<{path:string, text:string}>}}
 */
function plan(files, options) {
  const opts = options || {};
  const documents = (Array.isArray(files) ? files : [])
    .filter((file) => String(file.path).endsWith('.md') && !isReserved(file.path))
    .sort((a, b) => compareCodePoint(String(a.path), String(b.path)));

  const findings = [];
  const writes = [];
  const taken = new Set();
  const totals = { items: 0, unreadable_frontmatter: 0 };
  const sourceLicence = sourceLicenceOf(files, opts.licenceFiles);

  for (const file of documents) {
    const path = String(file.path);
    const read = readDocument(file.text);
    if (read.reason !== null) {
      totals.unreadable_frontmatter += 1;
      findings.push(finding('AGSC-E506',
        `${path}: ${read.reason}; the body was imported and the frontmatter synthesized (AGSC-01-22)`,
        { file: path, severity: 'warn' }));
    }

    const base = path.split('/').pop().replace(/\.md$/u, '');
    // AGSC-02-91's slugifier is TOTAL — it answers `note` for a file name that
    // carries nothing usable — so a foreign document can never be dropped for its
    // name, which is what AGSC-01-22's tolerance requires.
    const candidate = slugs.isValid(base) ? base : slugs.slugify(base);
    const slug = slugs.dedupe(candidate, taken);
    taken.add(slug);

    const mapped = mapFrontmatter(read.frontmatter, {
      body: read.body,
      operator: opts.operator === undefined ? 'human:unknown' : opts.operator,
      path,
      slug,
      sourceHash: opts.sourceHash,
      sourceLicence,
      sourceVersion: opts.sourceVersion,
      stem: base,
    });
    findings.push(...mapped.findings);

    const target = `content/${TYPE_PLURAL[String(mapped.frontmatter.type)]}/${slug}.md`;
    const ordered = fix.orderKeys(mapped.frontmatter,
      fix.declaredOrder(opts.itemSchema, String(mapped.frontmatter.type)),
      opts.itemSchema, String(mapped.frontmatter.type), null);
    const text = fix.normaliseText(`${serialize(fix.quoteTemporal(ordered))}${nfc(read.body)}`);
    writes.push({ path: target, text });
    totals.items += 1;
  }

  writes.sort((a, b) => compareCodePoint(a.path, b.path));
  return { findings, totals, writes };
}

module.exports = {
  FOREIGN_LINK_NAMES,
  FORMAT, RESERVED, TYPE_PLURAL,
  isReserved, majorMinor, mapFrontmatter, plan, readDocument, sourceFacts, versionRefusal,
  versionWarning, versionWarnings,
};
