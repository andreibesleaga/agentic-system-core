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
// AGSC-09-08 assigns to a missing option argument), AGSC-E203 (a `--from` value
// outside the closed set of formats this node reads — AGSC-01-26a, since
// 2026-09-24; AGSC-E002 before), AGSC-E901 (the source
// directory holds none of the records the format declares).

const path = require('node:path');

const { finding } = require('../../../knowledge/validate.js');
const { compareCodePoint } = require('../../../knowledge/unicode.js');
const slugs = require('../../../knowledge/slug.js');
const { ARCHIVE_EXTENSIONS, readSchemas } = require('../../../adapters/node-fs.js');
const interchange = require('../../../interchange/import.js');
const okf = require('../../../interchange/okf.js');
const cogx = require('../../../interchange/adapters/cogx.js');
const gabbe = require('../../../interchange/adapters/gabbe.js');
const { LICENSE_NAME } = require('../../../interchange/licences.js');
const skills = require('../../../interchange/adapters/skills.js');
const board = require('../../../interchange/adapters/board.js');
const loader = require('../../plugin-loader.js');
const helpers = require('./_helpers.js');

/** The foreign formats this node reads. AGSC-01-22 names the verb, not a list. */
const FORMATS = Object.freeze([okf.FORMAT, interchange.FORMAT, cogx.FORMAT, gabbe.FORMAT, skills.FORMAT, board.FORMAT]);

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
    let exists;
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
 * AN IMPORT NEVER OVERWRITES THE NODE'S OWN ITEM. Until today the
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
 * The finding for a foreign file that could not be read. The FileSystem port refuses
 * with the code AGSC-01-16 names — over the input cap (AGSC-E904), an archive
 * (AGSC-E903), a link out of the source root (AGSC-E902), not UTF-8 (AGSC-E108) —
 * and that refusal is an ERROR: an import that silently dropped an oversized record
 * would report success over a partial corpus. Anything else is
 * a file this lane could not decode, skipped with a warning (AGSC-01-22).
 *
 * @param {Error} e
 * @param {string} file
 * @returns {object}
 */
function unreadable(e, file) {
  const code = e && typeof e.code === 'string' && /^AGSC-E\d{3}$/u.test(e.code) ? e.code : null;
  if (code !== null) {
    return finding(code, `"${file}" was refused: ${e.message}; nothing was written (AGSC-01-16)`,
      { file, line: 1 });
  }
  return finding('AGSC-E901', `"${file}" could not be read as text and was skipped (AGSC-01-22)`,
    { file, line: 1, severity: 'warn' });
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
  // AGSC-01-22: the licence files at the source root, which establish the licence of
  // every record that declares none of its own.
  const licenceFiles = Object.create(null);
  for (const file of paths) {
    const name = String(file);
    const bare = name.replace(/^\.\//u, '');
    if (!bare.includes('/') && LICENSE_NAME.test(bare)) {
      try {
        licenceFiles[bare] = String(fs.readFile(name, 'utf8'));
      } catch (e) {
        // an unreadable licence file establishes nothing
      }
    }
    if (!name.endsWith('.md')) continue;
    try {
      files.push({ path: name, text: String(fs.readFile(name, 'utf8')) });
    } catch (e) {
      findings.push(unreadable(e, name));
    }
  }
  if (files.length === 0 && findings.some((f) => f.severity === 'error')) return { findings, status: 'fail' };
  if (files.length === 0) {
    findings.push(finding('AGSC-E901',
      `the source directory holds no Markdown document (AGSC-01-22)`,
      { file: String(source), line: 1 }));
    return { findings, status: 'fail' };
  }

  // AGSC-01-22: tolerance has one LIMIT and one RECORD.
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
    licenceFiles,
    itemSchema: readSchemas(helpers.ENGINE_ROOT).item,
    operator: identityOptions.operator,
    sourceHash: facts.bundleHash,
    sourceVersion: facts.bundleVersion,
  });
  const newer = okf.versionWarning(facts.specVersion, { toolSpecVersion: ctx.specVersion });
  const all = [...findings, ...(newer === null ? [] : [newer]), ...planned.findings];
  return finish(ctx, all, planned);
}

/**
 * `import --from cogx <archive-dir>` (AGSC-01-26a). The rules are
 * `interchange/adapters/cogx.js`'s; this function reads the archive's fixed file
 * names through their own read-only port and hands the plan to the shared tail, so
 * `--dry-run`, the collision survey and `--replace` behave exactly as in the `okf`
 * lane (AGSC-01-23).
 *
 * `permissions.json` is checked for PRESENCE ONLY: its bytes are credentials
 * (COGX's own description), so they are never read into this process.
 *
 * @param {object} ctx
 * @param {string} source the archive directory.
 * @param {object} identityOptions the target Bundle's identity.
 * @returns {{findings:Array<object>, status?:string}}
 */
function importCogx(ctx, source, identityOptions) {
  const fs = openRoot(ctx, source);
  const files = Object.create(null);
  const findings = [];
  for (const name of cogx.ARCHIVE_FILES) {
    try {
      if (!fs.exists(name)) continue;
      files[name] = String(fs.readFile(name, 'utf8'));
    } catch (e) {
      findings.push(unreadable(e, name));
    }
  }
  if (findings.some((f) => f.severity === 'error')) return { findings, status: 'fail' };
  let secret;
  try {
    secret = fs.exists(cogx.PERMISSIONS_FILE) === true;
  } catch (e) {
    secret = true; // a file the port cannot even stat is not proven absent
  }
  if (secret) files[cogx.PERMISSIONS_FILE] = '';
  if (Object.keys(files).length === 0) {
    return {
      findings: [...findings, finding('AGSC-E901',
        `${JSON.stringify(String(source))} holds no COGX archive file (${cogx.ARCHIVE_FILES.join(', ')})`
        + ' (AGSC-01-22)', { file: String(source), line: 1 })],
      status: 'fail',
    };
  }
  const planned = cogx.plan(files, {
    allowNewer: (ctx.verbFlags || {})['allow-newer'] === true,
    itemSchema: readSchemas(helpers.ENGINE_ROOT).item,
    operator: identityOptions.operator,
    ...trustOptions(identityOptions),
    toolSpecVersion: ctx.specVersion,
  });
  if (planned.refused) return { findings: [...findings, ...planned.findings], status: 'fail' };
  return finish(ctx, [...findings, ...planned.findings], planned);
}

/**
 * `import --from gabbe <kit-dir>` (AGSC-01-26a). The rules are
 * `interchange/adapters/gabbe.js`'s; this function reads the kit's `agents/` tree —
 * only the files the adapter names (skills, the memory files, the decision logs and
 * its own exported guides) — through a read-only port rooted at the kit, and hands
 * the plan to the shared tail, so `--dry-run`, the collision survey and `--replace`
 * behave exactly as in every other lane (AGSC-01-23).
 *
 * `--source-version <v>` states the kit's content version, which a GABBE kit does
 * not publish itself (AGSC-01-22 records it as `prov.source_version` on every
 * foreign item); it must match the content-version grammar of AGSC-04-25.
 *
 * @param {object} ctx
 * @param {string} source the kit directory (the one holding `agents/`).
 * @param {object} identityOptions the target Bundle's identity.
 * @returns {{findings:Array<object>, status?:string}}
 */
function importGabbe(ctx, source, identityOptions) {
  const verbFlags = ctx.verbFlags || {};
  const stated = verbFlags['source-version'];
  const bad = sourceVersionRefusal(stated);
  if (bad !== null) return { findings: [bad], status: 'fail' };
  const fs = openRoot(ctx, source);
  const findings = [];
  const files = Object.create(null);
  const paths = typeof fs.walk === 'function' && fs.exists('agents') ? fs.walk('agents') : [];
  for (const file of paths.filter(gabbe.isKitFile)) {
    try {
      files[file] = String(fs.readFile(file, 'utf8'));
    } catch (e) {
      findings.push(unreadable(e, String(file)));
    }
  }
  if (findings.some((f) => f.severity === 'error')) return { findings, status: 'fail' };
  if (Object.keys(files).length === 0) {
    return {
      findings: [...findings, finding('AGSC-E901',
        `${JSON.stringify(String(source))} holds no GABBE kit file (agents/skills/**/*.skill.md,`
        + ' agents/memory/*.md, agents/memory/episodic/**) (AGSC-01-22)', { file: String(source), line: 1 })],
      status: 'fail',
    };
  }
  const planned = gabbe.plan(files, {
    allowNewer: verbFlags['allow-newer'] === true,
    itemSchema: readSchemas(helpers.ENGINE_ROOT).item,
    operator: identityOptions.operator,
    ...trustOptions(identityOptions),
    sourceVersion: stated === undefined ? undefined : String(stated),
    toolSpecVersion: ctx.specVersion,
  });
  if (planned.refused) return { findings: [...findings, ...planned.findings], status: 'fail' };
  return finish(ctx, [...findings, ...planned.findings], planned);
}

/**
 * The origins whose own-record lines an import may trust: this node's
 * `site.base` and its declared `peers[]`.
 *
 * @param {object} identityOptions the target Bundle's identity.
 * @returns {{origin:string, peers:string[]}}
 */
function trustOptions(identityOptions) {
  return { origin: identityOptions.base, peers: identityOptions.peers || [] };
}

/** Directories of a local clone that hold no skill and are never walked. */
const CLONE_SKIP = Object.freeze(['.git', 'node_modules']);

/**
 * Every file of a local clone, clone-relative, in code-point order — `.git/` and
 * `node_modules/` excluded, so a checkout's object store is not listed for nothing.
 *
 * @param {object} fs a FileSystem port rooted at the clone.
 * @returns {string[]}
 */
function cloneFiles(fs) {
  const out = [];
  for (const name of fs.readdir('.')) {
    if (CLONE_SKIP.includes(name)) continue;
    let directory;
    try {
      directory = fs.stat(name).isDirectory();
    } catch (e) {
      directory = false; // a dangling link: listed, and refused if it is ever read
    }
    if (directory) out.push(...fs.walk(name));
    else out.push(name);
  }
  return out.sort(compareCodePoint);
}

/**
 * `import --from skills [--layout <l>] [--list] <clone>` (AGSC-01-26a).
 * The rules are `interchange/adapters/skills.js`'s; this function lists the local
 * clone, reads only the files the adapter names (skills, rules, manifests, licences,
 * the README) through a read-only port rooted at the clone, and hands the plan to the
 * shared tail, so `--dry-run`, the collision survey and `--replace` behave as in every
 * other lane (AGSC-01-23). `--list` prints the catalogue and writes nothing. Nothing
 * is ever fetched: a remote source is named and left alone.
 *
 * @param {object} ctx
 * @param {string} source the local clone.
 * @param {object} identityOptions the target Bundle's identity.
 * @returns {{findings:Array<object>, status?:string}}
 */
function importSkills(ctx, source, identityOptions) {
  const verbFlags = ctx.verbFlags || {};
  const stated = verbFlags['source-version'];
  const bad = sourceVersionRefusal(stated);
  if (bad !== null) return { findings: [bad], status: 'fail' };
  const layout = verbFlags.layout === undefined ? undefined : String(verbFlags.layout);
  if (layout !== undefined && !skills.LAYOUTS.includes(layout)) {
    return {
      findings: [finding('AGSC-E003', `--layout ${JSON.stringify(layout)} is not a layout of the skills adapter;`
        + ` the set is ${skills.LAYOUTS.join(', ')} (AGSC-01-26a)`, { file: '', line: 1 })],
      status: 'fail',
    };
  }
  // `--cluster <slug>`: the Cluster every foreign skill of this import joins.
  const cluster = verbFlags.cluster === undefined ? undefined : String(verbFlags.cluster);
  if (cluster !== undefined && !slugs.isValid(cluster)) {
    return {
      findings: [finding('AGSC-E204', `--cluster ${JSON.stringify(cluster)} is not a slug (AGSC-01-10)`,
        { file: '', line: 1 })],
      status: 'fail',
    };
  }
  const fs = openRoot(ctx, source);
  const findings = [];
  let paths;
  try {
    paths = cloneFiles(fs);
  } catch (e) {
    return {
      findings: [finding('AGSC-E901', `${JSON.stringify(String(source))} is not a directory this import can read`
        + ' (AGSC-01-22)', { file: String(source), line: 1 })],
      status: 'fail',
    };
  }
  const files = Object.create(null);
  for (const file of paths.filter(skills.isRelevant)) {
    try {
      files[file] = String(fs.readFile(file, 'utf8'));
    } catch (e) {
      findings.push(unreadable(e, String(file)));
    }
  }
  if (findings.some((f) => f.severity === 'error')) return { findings, status: 'fail' };
  const options = {
    allowNewer: verbFlags['allow-newer'] === true,
    itemSchema: readSchemas(helpers.ENGINE_ROOT).item,
    operator: identityOptions.operator,
    ...trustOptions(identityOptions),
    sourceVersion: stated === undefined ? undefined : String(stated),
    toolSpecVersion: ctx.specVersion,
  };
  if (verbFlags.list === true) {
    const listed = skills.catalogue({ files, paths }, options);
    for (const line of listed.lines) helpers.note(ctx, line);
    if (listed.entries.length === 0 && listed.links === 0) {
      return {
        findings: [...findings, finding('AGSC-E901', `${JSON.stringify(String(source))} holds no skill, no rule and`
          + ' no link list this adapter reads (AGSC-01-22)', { file: String(source), line: 1 })],
        status: 'fail',
      };
    }
    return { findings };
  }
  const detected = skills.detect(paths);
  const chosen = layout === undefined ? detected[0] : layout;
  if (chosen === undefined) {
    return {
      findings: [...findings, finding('AGSC-E901', `${JSON.stringify(String(source))} holds no skill or rule in any`
        + ` layout this adapter reads (${skills.LAYOUTS.join(', ')}); run with --list to see what it holds`
        + ' (AGSC-01-22)', { file: String(source), line: 1 })],
      status: 'fail',
    };
  }
  helpers.note(ctx, `import: skills layout ${chosen}${layout === undefined ? ' (detected)' : ''}`
    + `${detected.length > 1 ? `; also found: ${detected.filter((l) => l !== chosen).join(', ')}` : ''}`);
  const planned = skills.plan({ files, paths }, { ...options, cluster, layout: chosen });
  if (planned.refused) return { findings: [...findings, ...planned.findings], status: 'fail' };
  return finish(ctx, [...findings, ...planned.findings], planned);
}

/**
 * `import --from board --format <f> <dir>` (AGSC-01-26a; the live board of
 * AGSC-10-13/AGSC-10-16). The rules are `interchange/adapters/board.js`'s; this
 * function lists the directory, reads only the files `--format` names (`.json`,
 * `.csv`, `.md` or `.txt`) through a read-only port rooted at it, tells the plan
 * which clusters the Bundle already holds (a board joins its cluster and never
 * rewrites it), and hands the plan to the shared tail, so `--dry-run`, the collision
 * survey and `--replace` behave as in every other lane (AGSC-01-23). Nothing is
 * fetched: a tracker's export is a file a person or a CI job put there.
 *
 * @param {object} ctx
 * @param {string} source the directory holding the tool's export file(s).
 * @param {object} identityOptions the target Bundle's identity.
 * @returns {{findings:Array<object>, status?:string}}
 */
function importBoard(ctx, source, identityOptions) {
  const verbFlags = ctx.verbFlags || {};
  const stated = verbFlags['source-version'];
  const bad = sourceVersionRefusal(stated);
  if (bad !== null) return { findings: [bad], status: 'fail' };
  const format = verbFlags.format === undefined ? '' : String(verbFlags.format);
  if (!board.FORMAT_NAMES.includes(format)) {
    return {
      findings: [finding('AGSC-E003', `import --from board needs --format <name>, one of`
        + ` ${board.FORMAT_NAMES.join(', ')}${format === '' ? '' : ` (${JSON.stringify(format)} is not one)`}`
        + ' (AGSC-01-26a)', { file: '', line: 1 })],
      status: 'fail',
    };
  }
  const fs = openRoot(ctx, source);
  const findings = [];
  let paths;
  try {
    paths = cloneFiles(fs);
  } catch (e) {
    return {
      findings: [finding('AGSC-E901', `${JSON.stringify(String(source))} is not a directory this import can read`
        + ' (AGSC-01-22)', { file: String(source), line: 1 })],
      status: 'fail',
    };
  }
  const files = Object.create(null);
  for (const file of paths.filter((p) => board.isBoardFile(format, p))) {
    try {
      files[file] = String(fs.readFile(file, 'utf8'));
    } catch (e) {
      findings.push(unreadable(e, String(file)));
    }
  }
  if (findings.some((f) => f.severity === 'error')) return { findings, status: 'fail' };
  if (Object.keys(files).length === 0) {
    return {
      findings: [finding('AGSC-E901', `${JSON.stringify(String(source))} holds no ${format} export file`
        + ` (${board.extensionsOf(format).join(', ')}) (AGSC-01-22)`, { file: String(source), line: 1 })],
      status: 'fail',
    };
  }
  const own = ctx.ports.fs;
  const planned = board.plan(files, {
    allowNewer: verbFlags['allow-newer'] === true,
    format,
    hasCluster: (slug) => own.exists(`content/clusters/${slug}.md`),
    itemSchema: readSchemas(helpers.ENGINE_ROOT).item,
    operator: identityOptions.operator,
    ...trustOptions(identityOptions),
    sourceVersion: stated === undefined ? undefined : String(stated),
    toolSpecVersion: ctx.specVersion,
  });
  if (planned.refused) return { findings: [...findings, ...planned.findings], status: 'fail' };
  if (planned.totals.items === 0) {
    return {
      findings: [...findings, ...planned.findings, finding('AGSC-E901', `${JSON.stringify(String(source))} holds`
        + ` no row this adapter could read as a ${format} task (AGSC-01-22)`, { file: String(source), line: 1 })],
      status: 'fail',
    };
  }
  return finish(ctx, [...findings, ...planned.findings], planned);
}

/**
 * `--source-version <v>` of the adapters that take it (gabbe, skills): a content
 * version per AGSC-04-25, or the finding that refuses it.
 *
 * @param {string|undefined} stated
 * @returns {object|null}
 */
function sourceVersionRefusal(stated) {
  if (stated === undefined || /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u.test(String(stated))) return null;
  return finding('AGSC-E204',
    `--source-version ${JSON.stringify(String(stated))} is not a content version: 1-64 characters from`
    + ' [A-Za-z0-9._+-], beginning with a letter or digit (AGSC-04-25)', { file: '', line: 1 });
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

/**
 * `import --from <path|package>` (AGSC-00-24, AGSC-01-26a): a memory-adapter PLUGIN.
 * The engine reads every file of the source directory through its own read-only
 * port and hands the plugin a detached copy; the plugin's `importFiles(files,
 * context)` hook answers `{documents: [{path, text}], findings?}` — Markdown
 * documents with frontmatter, the shape an OKF bundle has — and the documents go
 * through the OKF lane's mapping and the shared tail. So a plugin's import gets the
 * same provenance (`origin: imported`, this Bundle's operator), the same tolerance
 * and the same collision survey, `--dry-run` and `--replace` as every other lane,
 * and never writes a file itself.
 *
 * @returns {{findings:Array<object>, status?:string}}
 */
function importPlugin(ctx, source, identityOptions, plugin) {
  const fs = openRoot(ctx, source);
  const findings = [];
  const files = [];
  for (const file of typeof fs.walk === 'function' ? fs.walk('.') : []) {
    try {
      files.push({ path: String(file), text: String(fs.readFile(String(file), 'utf8')) });
    } catch (e) {
      findings.push(unreadable(e, String(file)));
    }
  }
  const label = `import --from ${plugin.name}`;
  const called = loader.call(plugin, 'importFiles', [loader.detached(files),
    loader.detached({ specVersion: ctx.specVersion })], label);
  if (called.findings.length > 0) return { findings: [...findings, ...called.findings], status: 'fail' };
  findings.push(...loader.pluginFindings(called.value));
  const documents = (called.value && Array.isArray(called.value.documents) ? called.value.documents : [])
    .filter((d) => d && typeof d.text === 'string' && loader.unsafePath(d.path) === null)
    .map((d) => ({ path: String(d.path), text: d.text }));
  if (documents.length === 0) {
    findings.push(finding('AGSC-E901', `${label}: the plugin produced no document from ${JSON.stringify(String(source))}`
      + ' (AGSC-01-22)', { file: String(source), line: 1 }));
    return { findings, status: 'fail' };
  }
  const planned = okf.plan(documents, {
    itemSchema: readSchemas(helpers.ENGINE_ROOT).item,
    operator: identityOptions.operator,
  });
  return finish(ctx, [...findings, ...planned.findings], planned);
}

function run(ctx) {
  const verbFlags = ctx.verbFlags || {};
  const from = verbFlags.from;
  const selectionPath = verbFlags.selection;
  const source = (ctx.argv || [])[0];
  const findings = [];

  // Not one of this node's own formats: a local path or an installed package,
  // resolved through the memory-adapter registry; a remote one is AGSC-E905. A bare
  // name no package answers is the closed-set refusal it always was.
  let plugin = null;
  if (from !== undefined && !FORMATS.includes(from)) {
    const loaded = loader.load('memory-adapter', from, { flag: 'import --from', root: ctx.root, specVersion: ctx.specVersion });
    if (loaded.plugin !== null) plugin = loaded.plugin;
    else if (!loaded.missing) return { findings: loaded.findings, status: 'fail' };
  }

  if (from === undefined) {
    findings.push(finding('AGSC-E003',
      `import needs --from <format>; this node reads ${FORMATS.join(', ')} (AGSC-01-22)`,
      { file: '', line: 1 }));
  } else if (plugin === null && !FORMATS.includes(from)) {
    // AGSC-01-26a (as stated 2026-09-24): a name no shipped adapter and no installed
    // plugin answers is AGSC-E203, a value outside a closed operator list, exit 1 —
    // the one code for this fault on `export --to` and `import --from` alike. Until
    // then this line said AGSC-E002, the exit-2 code registered for an unknown flag.
    findings.push(finding('AGSC-E203',
      `--from ${JSON.stringify(String(from))} is not a format this node reads;`
      + ` the set is ${FORMATS.join(', ')} (AGSC-01-22, AGSC-01-26a)`, { file: '', line: 1 }));
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

  // AGSC-01-16: an archive is refused, never unpacked and
  // never handed to a directory walk, where it died with an internal ENOTDIR.
  if (ARCHIVE_EXTENSIONS.includes(path.extname(String(source)).toLowerCase())) {
    return {
      findings: [finding('AGSC-E903',
        `${JSON.stringify(String(source))} is an archive; import reads a directory and never unpacks one.`
        + ' Unpack it yourself, look at what it holds, and import the directory (AGSC-01-16)',
        { file: String(source), line: 1 })],
      status: 'fail',
    };
  }

  const identified = identity(ctx.config);
  if (identified.findings.length > 0) return { findings: identified.findings, status: 'fail' };

  if (plugin !== null) return importPlugin(ctx, source, identified.options, plugin);
  if (from === okf.FORMAT) return importOkf(ctx, source, identified.options);
  if (from === cogx.FORMAT) return importCogx(ctx, source, identified.options);
  if (from === gabbe.FORMAT) return importGabbe(ctx, source, identified.options);
  if (from === skills.FORMAT) return importSkills(ctx, source, identified.options);
  if (from === board.FORMAT) return importBoard(ctx, source, identified.options);

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
  FORMATS,
  SELECTION_REQUIRED,
  apply,
  bundleConfig,
  collisionFindings,
  finish,
  identity,
  isoDate,
  name: 'import',
  openRoot,
  parseCorrections,
  readOldSite,
  readOutside,
  run,
  survey,
  totalsLines,
  unreadable,
};
