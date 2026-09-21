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
 * Owner: ENG-5 (WP-12).
 */

const frontmatter = require('../knowledge/frontmatter.js');
const yaml = require('../knowledge/yaml.js');
const slugs = require('../knowledge/slug.js');
const fix = require('../governance/fix.js');
const { serialize, titleFor } = require('../knowledge/adopt.js');
const { compareCodePoint, nfc } = require('../knowledge/unicode.js');
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

  if (out.prov === undefined) {
    out.prov = { operator: String(options.operator), origin: 'imported' };
    findings.push(finding('AGSC-E506',
      `${options.path}: no prov; { origin: imported, operator: ${options.operator} } was synthesized`
      + ' because AGSC-08-01 requires it (AGSC-01-22)',
      { file: options.path, severity: 'warn' }));
  }
  return { findings, frontmatter: out };
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
  FORMAT, RESERVED, TYPE_KEEP_KEY, TYPE_PLURAL,
  isReserved, mapFrontmatter, plan, readDocument,
};
