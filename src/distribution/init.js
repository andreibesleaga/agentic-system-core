'use strict';
// CONTEXT Distribution (Emission) — the adoption use case, `agsc init`.
// Implements AGSC-02-90…93 through `knowledge/adopt.js` (which owns the synthesis),
// AGSC-02-94 (the synthesized `agsc.config.json` and `content/index.md`, every value
// schema-valid by construction) and AGSC-02-95 (the `AGSC-E507` warnings and the
// asset copies that close the gap flattening opens), plus the `.gitignore` and
// `.env.example` of AGSC-01-37.
//
// Adoption NEVER errors (AGSC-02-92): every finding this module adds is a warning,
// so `ci` on a folder of bare notes exits 0 offline — the second step of PRD-053's
// three-command promise.
//
// `plan()` is a pure function of the file list; `run()` is the thin shell that
// applies the plan through the FileSystem port. Vectors: adopt-0004, adopt-0005.

const adopt = require('../knowledge/adopt.js');
const { finding } = require('../knowledge/validate.js');
const { slugify } = require('../knowledge/slug.js');
const { compareCodePoint } = require('../knowledge/unicode.js');
const { instantFromEpoch } = require('../governance/ledger.js');

/** AGSC-02-94(a): the development placeholder AGSC-01-19 and the schema admit. */
const PLACEHOLDER_BASE = 'http://localhost/';
/** AGSC-01-19: the default of `build.out`. */
const DEFAULT_OUT = 'www/';
/** AGSC-01-04: the OKF version `content/index.md` declares. */
const OKF_VERSION = '0.2';
/** AGSC-02-95: where a referenced local file is copied, byte for byte. */
const ASSETS_PREFIX = 'content/assets/';
/**
 * The six crawler tokens the reference node names in `site.tdm_crawlers[]`. The
 * default prose licence adopts the Content Use Terms, and a node that publishes a
 * TDM reservation with an empty list fails its own build (`AGSC-E202`), so `init`
 * writes the reference list and says so; an operator who wants no reservation edits
 * one line.
 */
const REFERENCE_TDM_CRAWLERS = Object.freeze([
  'Applebot-Extended', 'CCBot', 'ClaudeBot', 'GPTBot', 'Google-Extended', 'meta-externalagent',
]);

/**
 * Normalise a repository-relative path, resolving `.` and `..`. Returns null when
 * the result escapes the adoption root — the path-traversal guard of AGSC-01-16 /
 * AGSC-01-35, applied before any path is used.
 * @param {string} p
 * @returns {string|null}
 */
function normalizePath(p) {
  const out = [];
  for (const segment of String(p).split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join('/');
}

/** The directory part of a repository-relative path, `''` at the root. */
function dirnameOf(p) {
  const at = String(p).lastIndexOf('/');
  return at === -1 ? '' : String(p).slice(0, at);
}

/** Resolve a body reference against a containing directory. */
function resolveFrom(dir, reference) {
  const target = String(reference).split('#')[0].split('?')[0];
  if (target === '') return null;
  return normalizePath(dir === '' ? target : `${dir}/${target}`);
}

/**
 * AGSC-02-94(a): the synthesized `agsc.config.json`, schema-valid by construction.
 * `site.base` is the placeholder, warned as `AGSC-E506`; `bundle.id` is the
 * directory name through the AGSC-02-91 slug rule; `bundle.operator` is the
 * resolved actor of AGSC-02-90; `site.title` is the title of `content/index.md`.
 */
function synthesizeConfig({ directory, title, operator, specVersion, tdmCrawlers }) {
  const site = { base: PLACEHOLDER_BASE, title };
  if (Array.isArray(tdmCrawlers) && tdmCrawlers.length > 0) site.tdm_crawlers = [...tdmCrawlers];
  return {
    build: { out: DEFAULT_OUT },
    bundle: { id: slugify(String(directory)), operator },
    site,
    spec_version: specVersion,
  };
}

/**
 * AGSC-02-94(b): the synthesized `content/index.md` frontmatter. The description is
 * ≥ 40 code points by construction, so the AGSC-01-04 bound always holds. With no
 * date (the build instant defaulted, `AGSC-E606`) the sentence carries none: a
 * 1970 date baked into authored content would be a false statement.
 */
function synthesizeIndex({ title, count, date, specVersion }) {
  return {
    base: PLACEHOLDER_BASE,
    description: date
      ? `Adopted from ${count} Markdown files by agsc init on ${date}.`
      : `Adopted from ${count} Markdown files by agsc init.`,
    okf_version: OKF_VERSION,
    spec_version: specVersion,
    title,
  };
}

/** The AGSC-04-19 emitted form of a Bundle index file. */
function indexMarkdown(frontmatter) {
  return `${adopt.serialize(frontmatter)}\n# ${frontmatter.title}\n\n${frontmatter.description}\n`;
}

/** AGSC-01-37: the two files every adopted Bundle gets, so no credential is tracked. */
function credentialFiles() {
  return [
    {
      path: '.gitignore',
      text: '# AGSC-01-37: a credential is never tracked.\n.env\n.env.*\n!.env.example\nwww/\ndist/\nnode_modules/\n',
    },
    {
      path: '.env.example',
      text: '# AGSC-01-37: only AGSC_* names are honoured, and a credential never becomes\n'
        + '# a configuration key. Copy to .env and fill in; .env is git-ignored.\n'
        + 'AGSC_MODEL_API_KEY=\nAGSC_MODEL_BASE_URL=\n',
    },
  ];
}

/**
 * Plan an adoption: what `init` would write, and every warning it would report.
 *
 * @param {Array<{path:string, markdown?:string, binary?:boolean}>} files everything
 *   under the adoption root, in any order.
 * @param {object} options
 * @param {string} options.directory the adoption root's own directory name.
 * @param {string} options.specVersion
 * @param {number} options.epoch `SOURCE_DATE_EPOCH`, for the index description date.
 * @param {boolean} [options.instantDefaulted] true when the instant fell to 0
 *   (`AGSC-E606`): the index description then names no date.
 * @param {Array<string>} [options.tdmCrawlers] the crawler tokens written to
 *   `site.tdm_crawlers[]`; none by default.
 * @param {string|null} [options.gitUserEmail]
 * @param {object} [options.existing] `{path: contents}` — files already present, which
 *   AGSC-02-94 never overwrites.
 * @returns {{writes:Array<object>, copies:Array<{from:string,to:string}>,
 *   config:(object|null), indexFrontmatter:(object|null), items:Array<object>,
 *   findings:Array<object>}}
 */
function plan(files, options = {}) {
  const existing = options.existing || {};
  const has = (p) => Object.prototype.hasOwnProperty.call(existing, p)
    || files.some((f) => f.path === p);
  // Never adopted: the build output, the generated `dist/` and the copies
  // AGSC-02-95 made under content/assets/ — adopting them a second time would
  // move a generated file or an asset copy over an item (AGSC-02-91, AGSC-01-23).
  const out = `${String((options.config && options.config.build && options.config.build.out) || DEFAULT_OUT).replace(/\/+$/u, '')}/`;
  const generated = (p) => p.startsWith(out) || p.startsWith('dist/') || p.startsWith(ASSETS_PREFIX);
  const all = [...(files || [])]
    .sort((a, b) => compareCodePoint(String(a.path), String(b.path)));
  const markdown = all.filter((f) => f.markdown != null && String(f.path).endsWith('.md') && !generated(String(f.path)));
  const paths = new Set(all.map((f) => String(f.path)));

  const adopted = adopt.adopt(markdown, {
    config: options.config, gitUserEmail: options.gitUserEmail,
  });
  const findings = [...adopted.findings];
  const writes = [];
  const copies = [];
  const items = [];
  // AGSC-02-95: a reference is checked against where the files are AFTER the move —
  // every adopted note that moves takes its new path and leaves its old one — so two
  // notes that link to each other and move together still resolve.
  const after = new Set(paths);
  for (let i = 0; i < adopted.files.length; i += 1) {
    const result = adopted.files[i];
    if (result.skipped || !result.changed || result.path === String(markdown[i].path)) continue;
    after.delete(String(markdown[i].path));
    after.add(result.path);
  }

  // `adopt.adopt()` orders by the same code-point path sort `markdown` already
  // carries, so index i of its result is index i of the source (AGSC-01-15).
  for (let i = 0; i < adopted.files.length; i += 1) {
    const result = adopted.files[i];
    const source = markdown[i];
    if (result.skipped || !result.changed) continue;
    writes.push({ path: result.path, text: result.output, from: String(source.path) });
    if (result.frontmatter !== null) {
      items.push({
        ...result.frontmatter,
        slug: result.path.replace(/^.*\//u, '').replace(/\.md$/u, ''),
        path: result.path,
        body: result.body,
      });
    }

    // AGSC-02-95: after the relocation, every relative reference that no longer
    // resolves is a WARNING naming the original path, the new path and the
    // reference; the referenced file is copied, and body bytes are never rewritten.
    if (result.path === String(source.path)) continue;
    const fromDir = dirnameOf(String(source.path));
    const toDir = dirnameOf(result.path);
    for (const { reference } of adopt.relativeReferences(source.markdown)) {
      const originalTarget = resolveFrom(fromDir, reference);
      // A path resolving OUTSIDE the adoption root is left alone and NOT reported.
      if (originalTarget === null) continue;
      const newTarget = resolveFrom(toDir, reference);
      if (newTarget !== null && after.has(newTarget)) continue; // still resolves
      findings.push({
        ...finding('AGSC-E507',
          `the reference "${reference}" of ${source.path} no longer resolves from ${result.path} (AGSC-02-95)`,
          { file: result.path, severity: 'warn' }),
        new: result.path,
        original: String(source.path),
        reference,
      });
      if (paths.has(originalTarget)) {
        copies.push({ from: originalTarget, to: `${ASSETS_PREFIX}${originalTarget}` });
      }
    }
  }

  // AGSC-02-94: existing files are NEVER overwritten.
  const title = adopt.titleFor('', String(options.directory), slugify(String(options.directory))).title;
  const operator = adopt.operatorFor(options.config, options.gitUserEmail);
  let config = null;
  let indexFrontmatter = null;
  if (!has('agsc.config.json')) {
    config = synthesizeConfig({
      directory: options.directory,
      title,
      operator: operator.operator,
      specVersion: options.specVersion,
      tdmCrawlers: options.tdmCrawlers,
    });
    writes.push({ path: 'agsc.config.json', text: `${JSON.stringify(config, null, 2)}\n`, value: config });
    findings.push(finding('AGSC-E506',
      `site.base was set to the development placeholder ${PLACEHOLDER_BASE}; set a real base before publishing (AGSC-02-94)`,
      { file: 'agsc.config.json', severity: 'warn' }));
  }
  if (!has('content/index.md')) {
    indexFrontmatter = synthesizeIndex({
      title,
      count: markdown.length,
      date: options.instantDefaulted ? null : instantFromEpoch(options.epoch).slice(0, 10),
      specVersion: options.specVersion,
    });
    writes.push({ path: 'content/index.md', text: indexMarkdown(indexFrontmatter), value: indexFrontmatter });
  }
  for (const file of credentialFiles()) if (!has(file.path)) writes.push(file);

  return { writes, copies, config, indexFrontmatter, items, findings };
}

/**
 * Apply a plan through the FileSystem port. The port is injected; this module never
 * requires an adapter (the hexagonal rule).
 *
 * @param {object} ports `{fs}` with the AGSC FileSystem interface.
 * @param {ReturnType<plan>} planned
 * @returns {{written:Array<string>, findings:Array<object>}}
 */
function run(ports, planned) {
  const fs = ports.fs;
  const written = [];
  // AGSC-02-95 copies the ORIGINAL bytes; a referenced file may itself be an
  // adopted Markdown file that the writes below move away, so read every copy
  // source first (reading it after the move threw ENOENT).
  const copyBytes = planned.copies.map((copy) => fs.readFile(copy.from, null));
  for (const write of planned.writes) {
    fs.mkdirp(dirnameOf(write.path));
    fs.writeFile(write.path, write.text);
    written.push(write.path);
    // AGSC-02-93: the adopted file is MOVED, so the source is removed once written.
    if (write.from != null && write.from !== write.path && fs.exists(write.from)) fs.remove(write.from);
  }
  planned.copies.forEach((copy, i) => {
    fs.mkdirp(dirnameOf(copy.to));
    fs.writeFile(copy.to, copyBytes[i]);
    written.push(copy.to);
  });
  return { written, findings: planned.findings };
}

module.exports = {
  plan,
  run,
  synthesizeIndex,
  normalizePath,
  resolveFrom,
  PLACEHOLDER_BASE,
  DEFAULT_OUT,
  REFERENCE_TDM_CRAWLERS,
};
