'use strict';
/**
 * CONTEXT Interchange — the byte-preserving folder exports of AGSC-01-26:
 * `export --markdown` and `export --okf`.
 *
 * AGSC-01-26 in full: both flags "MUST emit the lint-normalized Bundle itself —
 * one `.md` file per item, frontmatter first, body bytes unchanged — and MUST be
 * **lossless**: every authored frontmatter key, including unknown keys preserved
 * under AGSC-02-05, MUST appear in the output. The result MUST open as a plain
 * folder of Markdown in any editor or vault tool without a plugin. `--okf`
 * additionally writes `content/index.md` with `okf_version` and the OKF-reserved
 * `log.md`, whose content is one line `- <slug>: <modified, else date, else the
 * empty string>` per item in slug order (an empty file when the Bundle has no
 * item). Because these outputs are byte-preserving, the Content Use Terms travel
 * **beside** them, not inside them: `index.md` carries `license` and the export
 * root carries a `LICENSE-CONTENT` file (AGSC-01-29)."
 *
 * THE LINT-NORMALIZED BUNDLE IS NOT RE-DERIVED HERE. "Lint-normalized" is
 * defined by exactly one module — `governance/fix.js`, the `lint --fix` of
 * AGSC-04-19 — so this export calls it. A second normaliser would be a second
 * definition of the same bytes, and the two would drift. The consequence the
 * report asked to be read carefully is therefore settled by construction:
 * `export --markdown` on a Bundle that `lint --fix` has already normalised is a
 * byte-identical copy of its `content/` tree, and on a Bundle that has not been
 * normalised it emits the bytes `lint --fix` would have written. "Body bytes
 * unchanged" is read against the lint-normalized Bundle, which is what the
 * rule's own first clause names, and not against the authored file: AGSC-04-19
 * itself rewrites a resolved wikilink in a body (AGSC-03-12), so the two clauses
 * can only both be true in that reading.
 *
 * LOSSLESSNESS is a property of `fix.js#orderKeys`, which re-emits every parsed
 * key — declared keys in schema order, unknown keys (AGSC-02-05) after them in
 * code-point order. Nothing here filters a key. It is proved over a Bundle
 * carrying unknown keys by `tests/interchange/export-bundle.test.js`.
 *
 * THE PUBLISHED SET. Only published items are exported — `status` not `draft`
 * and not `retired`, and not held back by the `releases` switchboard (AGSC-06-30,
 * AGSC-11-22, AGSC-01-20). Every other export of this engine already emits that
 * set and nothing else, and an export is a copy that leaves the node. AGSC-01-26
 * says "the Bundle itself" and names no exclusion, so the reading is recorded as
 * a specification item rather than assumed to be the rule's intent.
 *
 * `log.md` LOCATION. AGSC-01-26 names the file and not its directory. OKF v0.2
 * §9 says "A `log.md` file MAY appear at any level of the hierarchy to record the
 * history of changes to that scope" and §8 puts the bundle-root `index.md` — the
 * only place OKF permits frontmatter — at the bundle root; AGSC-01-04 makes
 * `content/index.md` this format's Bundle root document, so the OKF bundle root of
 * an AGSC export is its `content/` directory and `log.md` is written beside the
 * index it belongs to. Recorded as. (OKF v0.2 read 2026-09-21 from
 * <https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md>.)
 *
 * OKF's OWN `log.md` GRAMMAR IS NOT THIS ONE. OKF §9 states "The format is a flat
 * list of date-grouped entries, newest first" and "Date headings MUST use ISO 8601
 * `YYYY-MM-DD` form", while AGSC-01-26 pins one line `- <slug>: <date>` per item in
 * slug order. The specification is the truth here (a determinism requirement: the
 * AGSC form is a pure function of the item set), and the divergence from the format
 * the flag is named after is recorded as.
 *
 * PURE: no fs, no clock, no network. The caller supplies the authored bytes, the
 * `LICENSE-CONTENT` text and the compiled item schema.
 *
 * Rules: AGSC-01-26, AGSC-01-29, AGSC-04-19, AGSC-06-30, AGSC-01-04, AGSC-01-20.
 * Requirements: PRD-026 ←.
 *
 */

const fix = require('../governance/fix.js');
const chunks = require('../knowledge/chunks.js');
const frontmatter = require('../knowledge/frontmatter.js');
const yaml = require('../knowledge/yaml.js');
const { compareCodePoint } = require('../knowledge/unicode.js');
const { finding } = require('../knowledge/validate.js');

/** AGSC-01-26: the file the export root carries, so the terms travel beside the prose. */
const LICENSE_FILE = 'LICENSE-CONTENT';

/** AGSC-01-04: the Bundle root document, which is also the OKF bundle-root `index.md`. */
const INDEX_FILE = 'content/index.md';

/** AGSC-01-26: the OKF-reserved log, beside the index it describes. */
const LOG_FILE = 'content/log.md';

/** `schema/bundle.schema.json`'s declared key order, for the re-emitted index. */
const INDEX_KEY_ORDER = Object.freeze(['spec_version', 'bundle_version', 'okf_version',
  'title', 'description', 'base', 'lang', 'license', 'prov']);

/**
 * AGSC-06-30 over a LOADED item (`{frontmatter}`), not a flattened one.
 *
 * @param {object} item
 * @param {object} [releases] the `releases` switchboard of AGSC-01-20.
 * @returns {boolean}
 */
function published(item, releases) {
  const fm = (item && item.frontmatter) || {};
  return chunks.isPublished({ release: fm.release, status: fm.status }, releases);
}

/**
 * The `content/index.md` of the export.
 *
 * The Bundle root document is not an item (AGSC-01-04), so `fix.js#fixItem` — whose
 * key order comes from `schema/item.schema.json` — does not apply to it, and this
 * export is byte-preserving, so the authored bytes are kept and only AGSC-04-19's
 * three text normalisations are applied. AGSC-01-26 obliges two keys to be
 * PRESENT — `license` always, `okf_version` under `--okf` (AGSC-01-04 already
 * requires the latter; the export supplies it when a Bundle predates that rule
 * rather than emitting an OKF bundle that declares no version). A key that is
 * missing is APPENDED to the existing block as one line rather than triggering a
 * re-serialisation of the whole document: re-emitting a document this engine did
 * not author moves bytes it was asked to preserve, and it loses the authored
 * quoting of a value such as `okf_version: "0.2"`, which the failsafe subset reads
 * as the string `0.2` and a YAML 1.1 reader would read as a float.
 *
 * A Bundle with no `content/index.md` gets one: a root document is what makes the
 * result "a plain folder of Markdown" a reader can open (AGSC-01-04, AGSC-01-26).
 *
 * @param {string} source the authored bytes of `content/index.md`, `''` when absent.
 * @param {object} options `{okf, licenseProse, bundleVersion, generatedAt}`.
 * @returns {{text:string, findings:Array<object>}}
 */
function indexFile(source, options) {
  const findings = [];
  const text = fix.normaliseText(String(source == null ? '' : source));
  const split = frontmatter.split(text);
  let block = split.hasFrontmatter === true ? String(split.yamlText).replace(/\n*$/u, '') : '';
  const body = split.hasFrontmatter === true ? String(split.body) : text.replace(/^\s*$/u, '');

  let parsed = Object.create(null);
  if (block !== '') {
    try {
      const value = yaml.parse(block);
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) parsed = value;
    } catch (e) {
      // A root document this engine cannot read is the loader's finding, not this
      // one's; the export then appends the obliged keys to the block as authored.
    }
  }

  const append = (key, value, why) => {
    block = block === '' ? `${key}: "${value}"` : `${block}\n${key}: "${value}"`;
    findings.push(finding('AGSC-E506',
      `${INDEX_FILE}: the export added "${key}: ${value}" — ${why}`,
      { file: INDEX_FILE, severity: 'warn' }));
  };
  if (parsed.license === undefined) {
    append('license', String(options.licenseProse),
      'AGSC-01-26 requires the index of a byte-preserving export to carry it, because the'
      + ' Content Use Terms travel beside the prose and not inside it');
  }
  if (options.okf === true && parsed.okf_version === undefined) {
    append('okf_version', '0.2', 'AGSC-01-26 requires --okf to write it');
  }
  // AGSC-01-26 as amended at rc.6: `bundle_version` is the ONE derived key of
  // an otherwise byte-preserving export, so it is WRITTEN, not preserved. Adding it
  // is not a normalisation and is not reported; overwriting a different value that
  // was in the authored document is, because a byte the export was asked to
  // preserve did move. A caller that hands in no content version writes none: the
  // value is DERIVED BY THE BUILD (AGSC-04-25) and this module formats it.
  const derived = options.bundleVersion == null ? '' : String(options.bundleVersion);
  if (derived === '') {
    // nothing to state
  } else if (parsed.bundle_version === undefined) {
    block = block === '' ? `bundle_version: "${derived}"` : `${block}\nbundle_version: "${derived}"`;
  } else if (String(parsed.bundle_version) !== derived) {
    block = block.split('\n')
      .filter((line) => !/^bundle_version\s*:/u.test(line))
      .concat(`bundle_version: "${derived}"`)
      .join('\n');
    findings.push(finding('AGSC-E506',
      `${INDEX_FILE}: bundle_version was replaced with the derived content version`
      + ` "${derived}" — AGSC-01-26 makes it the one derived key of this export`,
      { file: INDEX_FILE, severity: 'warn' }));
  }

  return { findings, text: fix.normaliseText(`---\n${block}\n---\n${body}`) };
}

/**
 * AGSC-01-26's `log.md`: one line `- <slug>: <modified, else date, else the empty
 * string>` per item in slug order; an empty file when the Bundle has no item.
 *
 * @param {Array<object>} items the exported (published) items, any order.
 * @returns {string}
 */
function logFile(items) {
  const lines = (items || [])
    .map((item) => {
      const fm = item.frontmatter || {};
      const when = fm.modified == null ? (fm.date == null ? '' : fm.date) : fm.modified;
      return { line: `- ${item.slug}: ${String(when)}`, slug: String(item.slug) };
    })
    .sort((a, b) => compareCodePoint(a.slug, b.slug))
    .map((entry) => entry.line);
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

/**
 * The whole export, as data.
 *
 * @param {object} bundle the loaded Bundle.
 * @param {object} options
 * @param {boolean} [options.okf] emit the OKF additions (`content/index.md`'s
 *   `okf_version` and `content/log.md`).
 * @param {object} options.itemSchema the raw `schema/item.schema.json` object.
 * @param {Map<string,string>|object} options.sources path → the item's authored bytes.
 * @param {string} options.licenseProse `bundle.license_prose` (AGSC-01-18).
 * @param {string} [options.indexSource] the authored bytes of `content/index.md`.
 * @param {string} [options.bundleVersion] the AGSC-04-25 content version (AGSC-01-26).
 * @param {string} [options.generatedAt] the build instant, for the branch-4 fallback.
 * @param {string|null} [options.licenseContent] the bytes of the Bundle's own
 *   `LICENSE-CONTENT`; `null` when the Bundle root carries none.
 * @returns {{files:Array<{path:string, text:string}>, findings:Array<object>,
 *   withheld:Array<string>}}
 */
function plan(bundle, options) {
  const opts = options || {};
  const releases = (bundle && bundle.config && bundle.config.releases) || undefined;
  const all = (bundle && bundle.items) || [];
  const items = all.filter((item) => published(item, releases));
  const withheld = all.filter((item) => !published(item, releases))
    .map((item) => String(item.slug)).sort(compareCodePoint);

  const findings = [];
  const files = [];

  // The items, as `lint --fix` would leave them. The plan is computed over the
  // WHOLE Bundle and filtered afterwards: AGSC-03-12's wikilink rewriting resolves
  // against every slug in the Bundle, so restricting the input first would rewrite
  // a link to a withheld item differently from the way `lint --fix` rewrites it,
  // and the export would no longer be "the lint-normalized Bundle itself".
  const exported = new Set(items.map((item) => String(item.path)));
  const normalised = fix.plan(bundle, {
    itemSchema: opts.itemSchema,
    sources: opts.sources,
  });
  findings.push(...normalised.findings.filter((f) => exported.has(String(f.file))));
  for (const file of normalised.files) {
    if (exported.has(String(file.path))) files.push({ path: file.path, text: file.after });
  }

  const index = indexFile(opts.indexSource === undefined ? '' : opts.indexSource, {
    bundleVersion: opts.bundleVersion,
    generatedAt: opts.generatedAt,
    licenseProse: opts.licenseProse === undefined
      ? chunks.TERMS : String(opts.licenseProse),
    okf: opts.okf === true,
  });
  findings.push(...index.findings);
  files.push({ path: INDEX_FILE, text: index.text });

  if (opts.okf === true) files.push({ path: LOG_FILE, text: logFile(items) });

  if (typeof opts.licenseContent === 'string' && opts.licenseContent !== '') {
    files.push({ path: LICENSE_FILE, text: opts.licenseContent });
  } else {
    findings.push(finding('AGSC-E901',
      `the Bundle root carries no ${LICENSE_FILE}, so the export cannot carry the Content Use`
      + ' Terms beside its prose (AGSC-01-26, AGSC-06-18)',
      { file: LICENSE_FILE, severity: 'error' }));
  }

  files.sort((a, b) => compareCodePoint(a.path, b.path));
  return { files, findings, withheld };
}

module.exports = {
  INDEX_FILE, INDEX_KEY_ORDER, LICENSE_FILE, LOG_FILE,
  indexFile, logFile, plan, published,
};
