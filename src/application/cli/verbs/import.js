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
const { readSchemas } = require('../../../adapters/node-fs.js');
const interchange = require('../../../interchange/import.js');
const okf = require('../../../interchange/okf.js');
const helpers = require('./_helpers.js');

/** The foreign formats this node reads. AGSC-01-22 names the verb, not a list. */
const FORMATS = Object.freeze([okf.FORMAT, interchange.FORMAT]);

/**
 * `--selection` belongs to the `old-site` adapter and not to the verb: AGSC-01-26a
 * lets an adapter define flags of its own, and which records are imported from a
 * 153-card corpus is a decision a human writes down (project rule 9). An OKF bundle
 * carries no such decision — AGSC-01-22 says its whole content is accepted — so the
 * flag is required for `old-site` alone.
 */
const SELECTION_REQUIRED = Object.freeze([interchange.FORMAT]);

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
 * The Bundle's OWN `agsc.config.json`, as the bytes on disk parse — not the
 * resolved configuration.
 *
 * The resolved one (`ctx.config`) has the AGSC-09-09 precedence applied and may
 * carry values a user file or the environment supplied; writing those back into
 * the repository would move settings the operator never put there. The file the
 * import rewrites is the file it must read.
 *
 * @param {object} ctx
 * @returns {object} `{}` when there is no readable configuration file.
 */
function bundleConfig(ctx) {
  try {
    const parsed = JSON.parse(String(ctx.ports.fs.readFile('agsc.config.json', 'utf8')));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
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
 * The Bundle files an import may never silently destroy: the ITEMS and the assets
 * beside them. `agsc.config.json` and `content/index.md` are the Bundle's own
 * scaffolding, which the `old-site` adapter writes by design (it is what turns an
 * empty directory into a Bundle); a change to either is reported and not refused.
 *
 * @param {string} at a Bundle-relative write path.
 * @returns {boolean}
 */
function isAuthoredItem(at) {
  const rel = String(at).split('\\').join('/');
  return rel.startsWith('content/') && rel !== 'content/index.md';
}

/**
 * What a plan would do to the tree that is already there, WITHOUT touching it.
 *
 * Four outcomes per file, and no fifth: `unchanged` (the file is there and its bytes
 * are exactly what the import would write — AGSC-01-23's idempotence, seen from the
 * tree), `collisions` (an AUTHORED ITEM is there and differs, or cannot be read back
 * for comparison), `overwrites` (a scaffolding file differs) and `fresh` (nothing is
 * there).
 *
 * @param {object} fs the Bundle's FileSystem port.
 * @param {Array<{path:string, text:string}>} writes
 * @returns {{collisions:string[], fresh:string[], overwrites:string[], unchanged:string[]}}
 */
function survey(fs, writes) {
  const collisions = [];
  const fresh = [];
  const overwrites = [];
  const unchanged = [];
  for (const write of writes) {
    let exists = false;
    let current = null;
    try {
      exists = fs.exists(write.path);
      if (exists) current = String(fs.readFile(write.path, 'utf8'));
    } catch (e) {
      // A path the port refuses (AGSC-E902) or a file it cannot decode is NOT a free
      // overwrite: the import cannot prove it would destroy nothing.
      exists = true;
      current = null;
    }
    if (!exists) fresh.push(write.path);
    else if (current === write.text) unchanged.push(write.path);
    else if (isAuthoredItem(write.path)) collisions.push(write.path);
    else overwrites.push(write.path);
  }
  return { collisions, fresh, overwrites, unchanged };
}

/**
 * Apply a plan through the Bundle's own port, writing only what differs.
 *
 * A byte-identical file is NOT rewritten: AGSC-01-23's idempotence is about the
 * tree, and leaving an unchanged file untouched keeps `git status` honest about
 * what an import actually did.
 *
 * FV29-07: AN IMPORT NEVER OVERWRITES THE NODE'S OWN ITEM. Until today the
 * taken-slug set was seeded from the INCOMING set alone, so a foreign bundle naming
 * a slug the operator had authored replaced that file — silently, exit 0, zero
 * findings, recoverable only from git. AGSC-01-22 makes the import tolerant of the
 * foreign side; nothing in AGSC-01-22 or AGSC-01-23 licenses destroying what is
 * already here. So: ANY collision with an authored item means NOTHING is written at
 * all — not the colliding file and not its innocent neighbours, because a
 * half-applied import is worse than none — and the caller reports every collision.
 *
 * `options.replace` is the `--replace` flag of AGSC-01-26a (an adapter "MAY define
 * further flags of its own"), and it is the only way to ask for replacement. Even
 * then the write goes through the BUNDLE'S OWN port, which refuses an absolute path,
 * a path escaping the root and a path that leaves the root through a link
 * (`adapters/node-fs.js#safeJoin`/`#checkReal`, AGSC-E902) — so `--replace` widens
 * what may be overwritten INSIDE the Bundle and nothing else.
 *
 * @param {object} fs the Bundle's FileSystem port.
 * @param {Array<{path:string, text:string}>} writes
 * @param {{replace?:boolean}} [options]
 * @returns {{collisions:string[], errors:Array<object>, overwritten:string[],
 *   refused:boolean, replaced:string[], unchanged:string[], written:string[]}}
 */
function apply(fs, writes, options = {}) {
  const plan = survey(fs, writes);
  const errors = [];
  if (plan.collisions.length > 0 && options.replace !== true) {
    return {
      collisions: plan.collisions, errors, overwritten: [], refused: true,
      replaced: [], unchanged: plan.unchanged, written: [],
    };
  }
  const colliding = new Set(plan.collisions);
  const overwriting = new Set(plan.overwrites);
  const untouched = new Set(plan.unchanged);
  const written = [];
  const replaced = [];
  const overwritten = [];
  for (const write of writes) {
    if (untouched.has(write.path)) continue;
    try {
      fs.writeFile(write.path, write.text);
    } catch (e) {
      // The port's own refusal, reported rather than thrown: a link out of the
      // Bundle root is AGSC-E902 and the file stays as it was.
      errors.push(finding(/^AGSC-E\d{3}$/u.test(String(e && e.code)) ? e.code : 'AGSC-E901',
        `${write.path} could not be written: ${(e && e.message) || 'unknown error'}`,
        { file: write.path, line: 1 }));
      continue;
    }
    if (colliding.has(write.path)) replaced.push(write.path);
    else if (overwriting.has(write.path)) overwritten.push(write.path);
    else written.push(write.path);
  }
  return { collisions: plan.collisions, errors, overwritten, refused: false, replaced, unchanged: plan.unchanged, written };
}

/**
 * The findings an applied (or refused) plan produces: one ERROR per collision when
 * the import refused, one warning per replacement or scaffolding rewrite otherwise.
 * Nothing an import does to a tree is silent.
 *
 * @param {object} applied `apply()`'s result.
 * @returns {Array<object>}
 */
function collisionFindings(applied) {
  const findings = [...(applied.errors || [])];
  if (applied.refused) {
    for (const at of applied.collisions) {
      findings.push(finding('AGSC-E206',
        `${at} already exists in this Bundle with different content, and import never overwrites`
        + ' an item this node already holds (AGSC-01-11, AGSC-01-23). NOTHING was written.'
        + ' Run the import with --dry-run to see the whole plan, rename or remove the item'
        + ' here, or re-run with --replace to let the foreign bundle replace it',
        { file: at, line: 1 }));
    }
    return findings;
  }
  for (const at of applied.replaced || []) {
    findings.push(finding('AGSC-E506',
      `${at} was replaced by the foreign bundle, as --replace asked (AGSC-01-26a)`,
      { file: at, line: 1, severity: 'warn' }));
  }
  // `applied.overwritten` — `agsc.config.json` and `content/index.md` — carries no
  // finding. Seeding those two is what the `old-site` adapter is FOR (it turns a
  // directory with an identity into a Bundle), their content is derived from the
  // configuration already on disk, and a finding here would differ between a first
  // and a second run over unchanged input, which AGSC-01-23 forbids.
  return findings;
}

/**
 * `import --from okf <dir>` (AGSC-01-22). The rules are `interchange/okf.js`'s;
 * this function walks the foreign tree through its own read-only port and applies
 * the plan through the Bundle's port, exactly as the `old-site` lane does.
 *
 * The walk is the whole tree, because OKF fixes no directory structure ("producers
 * organize concepts however makes sense", OKF v0.2 §3). A file that cannot be
 * decoded as text is named and skipped, never fatal (AGSC-01-22).
 *
 * @param {object} ctx
 * @param {string} source the foreign directory.
 * @param {object} identityOptions the target Bundle's identity.
 * @returns {{findings:Array<object>, status?:string}}
 */
function importOkf(ctx, source, identityOptions) {
  const fs = openRoot(ctx, source);
  const findings = [];
  const files = [];
  const paths = typeof fs.walk === 'function' ? fs.walk('.') : [];
  for (const file of paths) {
    if (!String(file).endsWith('.md')) continue;
    try {
      files.push({ path: String(file), text: String(fs.readFile(String(file), 'utf8')) });
    } catch (e) {
      findings.push(finding('AGSC-E901',
        `"${file}" could not be read as text and was skipped (AGSC-01-22)`,
        { file: String(file), line: 1, severity: 'warn' }));
    }
  }
  if (files.length === 0) {
    findings.push(finding('AGSC-E901',
      `the source directory holds no Markdown document (AGSC-01-22)`,
      { file: String(source), line: 1 }));
    return { findings, status: 'fail' };
  }

  // AGSC-01-22 as amended at rc.6 (D113): tolerance has one LIMIT and one RECORD.
  // The limit is checked BEFORE the plan is built, so that a refusal writes nothing
  // and reports the same thing under `--dry-run` — the plan is data, and refusing
  // after building it would still be correct but would make the two paths differ.
  const facts = okf.sourceFacts(files);
  const refusal = okf.versionRefusal(facts.specVersion, {
    allowNewer: (ctx.verbFlags || {})['allow-newer'] === true,
    toolSpecVersion: ctx.specVersion,
  });
  if (refusal !== null) {
    // AGSC-09-08 puts invalid configuration in the usage class: `main.js` maps
    // the AGSC-E004 the refusal carries onto exit 2, wherever it is raised.
    return { findings: [...findings, refusal], status: 'fail' };
  }

  const planned = okf.plan(files, {
    itemSchema: readSchemas(helpers.ENGINE_ROOT).item,
    operator: identityOptions.operator,
    sourceHash: facts.bundleHash,
    sourceVersion: facts.bundleVersion,
  });
  const all = [...findings, ...planned.findings];
  return finish(ctx, all, planned);
}

/**
 * The tail every import lane shares: the collision survey, the dry run that reports
 * exactly what the real run would report, and the totals an operator reads.
 *
 * @param {object} ctx
 * @param {Array<object>} findings the plan's own findings so far.
 * @param {{totals:object, writes:Array<object>}} planned
 * @returns {{findings:Array<object>, status?:string}}
 */
function finish(ctx, findings, planned) {
  const verbFlags = ctx.verbFlags || {};
  const replace = verbFlags.replace === true;
  if (verbFlags['dry-run'] === true) {
    // AGSC-09-09: `--dry-run` "reports the plan and writes nothing" — so it must
    // report the same collisions the real run would refuse on, or it is not a
    // preview of anything.
    const plan = survey(ctx.ports.fs, planned.writes);
    const refused = plan.collisions.length > 0 && !replace;
    const all = [...findings, ...collisionFindings({
      collisions: plan.collisions, errors: [], refused, replaced: replace ? plan.collisions : [],
    })];
    helpers.note(ctx, refused
      ? `import: --dry-run: ${plan.collisions.length} collision(s); NOTHING would be written`
      : `import: --dry-run: ${planned.writes.length - plan.unchanged.length} file(s) would be written`
        + `, ${plan.unchanged.length} unchanged`
        + `${replace && plan.collisions.length > 0 ? `, ${plan.collisions.length} replaced` : ''}`);
    for (const line of totalsLines(planned.totals)) helpers.note(ctx, line);
    return refused ? { findings: all, status: 'fail' } : { findings: all };
  }
  const applied = apply(ctx.ports.fs, planned.writes, { replace });
  const all = [...findings, ...collisionFindings(applied)];
  helpers.note(ctx, applied.refused
    ? `import: ${applied.collisions.length} collision(s); NOTHING was written`
    : `import: ${applied.written.length} written, ${applied.replaced.length} replaced,`
      + ` ${applied.unchanged.length} unchanged`);
  for (const line of totalsLines(planned.totals)) helpers.note(ctx, line);
  // A refusal is the verb's own verdict and is stated as one. Every other finding is
  // the plan's, and the envelope's `status` is derived from the counts as usual
  // (AGSC-09-11), so this function does not re-decide what a mapping finding means.
  return applied.refused || applied.errors.length > 0 ? { findings: all, status: 'fail' } : { findings: all };
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
  if (selectionPath === undefined && SELECTION_REQUIRED.includes(from)) {
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

  if (from === okf.FORMAT) return importOkf(ctx, source, identified.options);

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
    config: bundleConfig(ctx),
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

  return finish(ctx, [...read.findings, ...planned.findings], planned);
}

module.exports = {
  CARDS_DIR,
  DECKS_FILE,
  DIAGRAM_DIR,
  FORMATS,
  SELECTION_REQUIRED,
  SOURCE_TREES,
  apply,
  bundleConfig,
  collisionFindings,
  finish,
  identity,
  importOkf,
  isoDate,
  name: 'import',
  openRoot,
  parseCorrections,
  readOldSite,
  readOutside,
  run,
  survey,
  totalsLines,
};
