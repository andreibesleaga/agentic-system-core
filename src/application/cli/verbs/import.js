'use strict';
// src/application/cli/verbs/import.js — `import` (AGSC-09-07), the Interchange
// use case of AGSC-01-22/01-23: one foreign corpus in, one conforming Bundle
// out.
//
//   agsc import --from old-site --selection <file.tsv> [--dry-run] <source-dir>
//
// APPLICATION LAYER: it owns no rule. Every decision is `src/interchange/`'s
// (the field mapping, the clean-room rewrite, the clusters, the diagram
// compilation) and this module only wires the two FileSystem ports, applies the
// plan and reports.
//
// TWO PORTS, ON PURPOSE. A Bundle-rooted port may not reach outside its own root
// (AGSC-E902, `adapters/node-fs.js#checkReal`), and the corpus being imported is
// by definition outside the Bundle. So the source directory and the selection
// file are read through SEPARATE, read-only adapter instances rooted at their
// own directories — the same shape `bin/agsc.js` already uses for the user
// configuration. Writes go through the Bundle's own port and nowhere else.
//
// DETERMINISM (AGSC-01-23). Nothing here reads a clock: the import date is
// derived from the injected Clock port, which is `SOURCE_DATE_EPOCH`
// (AGSC-04-09). Nothing here reads a directory in filesystem order: the port's
// `walk`/`readdir` are code-point ordered (AGSC-01-15) and `interchange/import.js`
// re-sorts the plan anyway. A second run over unchanged inputs therefore writes
// the same bytes — `tests/interchange/import-verb.test.js` proves it.
//
// Codes: AGSC-E003 (a missing or unusable invocation argument — the code
// AGSC-09-08 assigns to a missing option argument), AGSC-E002 (a `--from` value
// outside the closed set of formats this node reads), AGSC-E901 (the source
// directory holds none of the records the format declares).

const path = require('node:path');

const { finding } = require('../../../knowledge/validate.js');
const interchange = require('../../../interchange/import.js');
const helpers = require('./_helpers.js');

/** The foreign formats this node reads. AGSC-01-22 names the verb, not a list. */
const FORMATS = Object.freeze([interchange.FORMAT]);

/** Where the old-site format keeps each kind of record. */
const CARDS_DIR = 'content/patterns';
const DECKS_FILE = 'content/decks.json';
const DIAGRAM_DIR = 'diagrams/src';

/**
 * The two trees the format defines. The walk is restricted to them so that a
 * corpus which also holds a build output, a checkout or a package tree is not
 * read byte by byte for nothing — and so that the AGSC-08-17 exclusion check
 * sees the authored content, which is where the three excluded files live.
 */
const SOURCE_TREES = Object.freeze(['content', 'diagrams']);

/**
 * A read-only FileSystem port rooted at `dir`.
 *
 * `ctx.openRoot` is the seam a test injects; with none, the real Node adapter
 * is used, resolved against the Bundle root so a relative argument means what
 * the operator typed at the shell.
 *
 * @param {object} ctx
 * @param {string} dir
 * @returns {object} a FileSystem port (src/ports/filesystem.js).
 */
function openRoot(ctx, dir) {
  if (typeof ctx.openRoot === 'function') return ctx.openRoot(dir);
  // eslint-disable-next-line global-require
  const { createFileSystem } = require('../../../adapters/node-fs.js');
  return createFileSystem(path.resolve(ctx.root || '.', dir));
}

/**
 * The text of one file OUTSIDE the Bundle, through its own rooted port.
 *
 * @param {object} ctx
 * @param {string} file a path relative to the working directory, or absolute.
 * @returns {string}
 */
function readOutside(ctx, file) {
  const at = String(file);
  return String(openRoot(ctx, path.dirname(at)).readFile(path.basename(at), 'utf8'));
}

/**
 * The corrections file: the decisions a human made about this corpus, as DATA.
 *
 * ```json
 * { "status_by_class": { "W": "stable" },
 *   "records": { "<slug>": { "title": "…", "status": "draft",
 *                            "promote": ["https://…"], "add": [{ "url": "https://…" }] } } }
 * ```
 *
 * A member whose name begins with `_` is a note for the human who maintains the
 * file and is ignored here, so the file can say WHY each entry exists next to the
 * entry itself. Anything else is passed through untouched: this function reshapes,
 * it does not validate — `interchange/import.js` owns what a correction may say.
 *
 * @param {string} text the file's bytes.
 * @returns {{records:object, statusByClass:object}}
 */
function parseCorrections(text) {
  const parsed = JSON.parse(text);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('the corrections file must be a JSON object');
  }
  const records = Object.create(null);
  for (const [slug, value] of Object.entries(parsed.records || {})) {
    if (slug.startsWith('_')) continue;
    const entry = Object.create(null);
    for (const [member, member_value] of Object.entries(value || {})) {
      if (member.startsWith('_')) continue;
      entry[member] = member_value;
    }
    records[slug] = entry;
  }
  const statusByClass = Object.create(null);
  for (const [name, value] of Object.entries(parsed.status_by_class || {})) {
    if (name.startsWith('_')) continue;
    statusByClass[name] = value;
  }
  return { records, statusByClass };
}

/**
 * AGSC-02-06's date for this import, from the injected clock and nothing else.
 *
 * @param {number} epochSeconds
 * @returns {string} `YYYY-MM-DD`.
 */
function isoDate(epochSeconds) {
  const seconds = Number.isFinite(epochSeconds) ? Math.trunc(epochSeconds) : 0;
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

/**
 * Read one old-site corpus into the shape `interchange/import.js#plan` wants.
 *
 * Tolerance is the rule (AGSC-01-22): an absent optional file is an empty list,
 * never a refusal. A file that cannot be decoded is skipped and named.
 *
 * @param {object} fs a FileSystem port rooted at the corpus.
 * @returns {{cards:Array<object>, decks:Array<object>, diagramSources:object,
 *            paths:string[], findings:Array<object>}}
 */
function readOldSite(fs) {
  const findings = [];
  const cards = [];
  const diagramSources = Object.create(null);
  let decks = [];

  const paths = typeof fs.walk === 'function'
    ? SOURCE_TREES.flatMap((tree) => fs.walk(tree))
    : [];

  for (const file of paths) {
    if (file.startsWith(`${CARDS_DIR}/`) && file.endsWith('.md')) {
      try {
        cards.push({ path: file, markdown: String(fs.readFile(file, 'utf8')) });
      } catch (e) {
        findings.push(finding('AGSC-E901',
          `"${file}" could not be read as text and was skipped (AGSC-01-22)`,
          { file, line: 1, severity: 'warn' }));
      }
      continue;
    }
    if (file.startsWith(`${DIAGRAM_DIR}/`) && file.endsWith('.diagram')) {
      const slug = file.slice(DIAGRAM_DIR.length + 1, -'.diagram'.length);
      try {
        diagramSources[slug] = String(fs.readFile(file, 'utf8'));
      } catch (e) {
        findings.push(finding('AGSC-E901',
          `"${file}" could not be read as text and was skipped (AGSC-01-07)`,
          { file, line: 1, severity: 'warn' }));
      }
    }
  }

  if (typeof fs.exists === 'function' && fs.exists(DECKS_FILE)) {
    try {
      const parsed = JSON.parse(String(fs.readFile(DECKS_FILE, 'utf8')));
      decks = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      findings.push(finding('AGSC-E901',
        `"${DECKS_FILE}" is not a JSON array; no cluster was derived (AGSC-02-19)`,
        { file: DECKS_FILE, line: 1, severity: 'warn' }));
    }
  }

  if (cards.length === 0) {
    findings.push(finding('AGSC-E901',
      `the source directory holds no "${CARDS_DIR}/*.md" record (AGSC-01-22)`,
      { file: CARDS_DIR, line: 1 }));
  }

  return { cards, decks, diagramSources, findings, paths };
}

/**
 * The Bundle identity the plan needs, taken from the target Bundle's own
 * `agsc.config.json` (already resolved by `application/config/load.js` with the
 * AGSC-09-09 precedence applied). `import` fills a Bundle; it does not invent
 * one, so a missing `site.base` or `bundle.id` is an invocation error and not a
 * default this module chooses.
 *
 * @param {object} config the resolved configuration.
 * @returns {{options:object, findings:Array<object>}}
 */
function identity(config) {
  const findings = [];
  const bundle = (config && config.bundle) || {};
  const site = (config && config.site) || {};
  const need = (value, what, where) => {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    findings.push(finding('AGSC-E003',
      `import needs ${what} in agsc.config.json (${where}); seed the file, then import into it`,
      { file: 'agsc.config.json', line: 1 }));
    return undefined;
  };

  const options = {
    base: need(site.base, '`site.base`', 'AGSC-01-19'),
    bundleId: need(bundle.id, '`bundle.id`', 'AGSC-01-17'),
    operator: need(bundle.operator, '`bundle.operator`', 'AGSC-08-01'),
    title: need(site.title, '`site.title`', 'AGSC-01-18'),
  };
  if (typeof bundle.license_prose === 'string') options.licenseProse = bundle.license_prose;
  if (typeof bundle.license_schema === 'string') options.licenseSchema = bundle.license_schema;
  if (typeof site.tagline === 'string' && site.tagline !== '') options.tagline = site.tagline;
  if (Array.isArray(config && config.peers)) options.peers = config.peers.map((p) => String(p));
  return { findings, options };
}

/**
 * Apply a plan through the Bundle's own port, writing only what differs.
 *
 * A byte-identical file is NOT rewritten: AGSC-01-23's idempotence is about the
 * tree, and leaving an unchanged file untouched keeps `git status` honest about
 * what an import actually did.
 *
 * @param {object} fs the Bundle's FileSystem port.
 * @param {Array<{path:string, text:string}>} writes
 * @returns {{written:string[], unchanged:string[]}}
 */
function apply(fs, writes) {
  const written = [];
  const unchanged = [];
  for (const write of writes) {
    let current = null;
    try {
      if (fs.exists(write.path)) current = String(fs.readFile(write.path, 'utf8'));
    } catch (e) {
      current = null;
    }
    if (current === write.text) {
      unchanged.push(write.path);
      continue;
    }
    fs.writeFile(write.path, write.text);
    written.push(write.path);
  }
  return { unchanged, written };
}

/** The totals line a human reads on stderr; the envelope carries the findings. */
function totalsLines(totals) {
  return Object.keys(totals).sort().map((key) => `import: ${key}: ${totals[key]}`);
}

function run(ctx) {
  const verbFlags = ctx.verbFlags || {};
  const from = verbFlags.from;
  const selectionPath = verbFlags.selection;
  const source = (ctx.argv || [])[0];
  const findings = [];

  if (from === undefined) {
    findings.push(finding('AGSC-E003',
      `import needs --from <format>; this node reads ${FORMATS.join(', ')} (AGSC-01-22)`,
      { file: '', line: 1 }));
  } else if (!FORMATS.includes(from)) {
    findings.push(finding('AGSC-E002',
      `--from ${JSON.stringify(String(from))} is not a format this node reads;`
      + ` the set is ${FORMATS.join(', ')} (AGSC-01-22)`, { file: '', line: 1 }));
  }
  if (selectionPath === undefined) {
    findings.push(finding('AGSC-E003',
      'import needs --selection <file.tsv>: which records are imported, and with which status,'
      + ' is content and never a list inside the engine (AGSC-01-22)', { file: '', line: 1 }));
  }
  if (source === undefined) {
    findings.push(finding('AGSC-E003',
      'import needs the source directory as its one positional argument (AGSC-01-22)',
      { file: '', line: 1 }));
  }
  if (findings.length > 0) return { findings, status: 'fail' };

  const identified = identity(ctx.config);
  if (identified.findings.length > 0) return { findings: identified.findings, status: 'fail' };

  let selectionText;
  try {
    selectionText = readOutside(ctx, selectionPath);
  } catch (e) {
    return {
      findings: [finding('AGSC-E003',
        `the selection file ${JSON.stringify(String(selectionPath))} could not be read:`
        + ` ${e && e.message} (AGSC-01-22)`, { file: String(selectionPath), line: 1 })],
      status: 'fail',
    };
  }

  let decisions = {};
  if (verbFlags.corrections !== undefined) {
    try {
      decisions = parseCorrections(readOutside(ctx, verbFlags.corrections));
    } catch (e) {
      return {
        findings: [finding('AGSC-E003',
          `the corrections file ${JSON.stringify(String(verbFlags.corrections))} could not be read`
          + ` as JSON: ${e && e.message} (AGSC-01-22)`,
          { file: String(verbFlags.corrections), line: 1 })],
        status: 'fail',
      };
    }
  }

  const read = readOldSite(openRoot(ctx, source));
  if (read.cards.length === 0) return { findings: read.findings, status: 'fail' };

  const planned = interchange.plan({
    cards: read.cards,
    decks: read.decks,
    diagramSources: read.diagramSources,
    corrections: decisions.records,
    paths: read.paths,
    selection: selectionText,
    statusByClass: decisions.statusByClass,
  }, {
    ...identified.options,
    attachDiagrams: verbFlags['attach-diagrams'] === true,
    date: isoDate(ctx.ports && ctx.ports.clock ? ctx.ports.clock.now() : 0),
    selectionFile: String(selectionPath),
    specVersion: ctx.specVersion,
  });

  const all = [...read.findings, ...planned.findings];
  if (verbFlags['dry-run'] === true) {
    helpers.note(ctx, `import: --dry-run: ${planned.writes.length} file(s) would be written`);
    for (const line of totalsLines(planned.totals)) helpers.note(ctx, line);
    return { findings: all };
  }

  const applied = apply(ctx.ports.fs, planned.writes);
  helpers.note(ctx, `import: ${applied.written.length} written, ${applied.unchanged.length} unchanged`);
  for (const line of totalsLines(planned.totals)) helpers.note(ctx, line);
  return { findings: all };
}

module.exports = {
  CARDS_DIR,
  DECKS_FILE,
  DIAGRAM_DIR,
  FORMATS,
  SOURCE_TREES,
  apply,
  identity,
  isoDate,
  name: 'import',
  openRoot,
  parseCorrections,
  readOldSite,
  readOutside,
  run,
  totalsLines,
};
