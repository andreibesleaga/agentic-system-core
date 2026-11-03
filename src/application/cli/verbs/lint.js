'use strict';
// src/application/cli/verbs/lint.js — the `lint` verb (AGSC-09-07, AGSC-09-12).
//
// The lint lane is the whole read path of a Bundle, in one place, so that
// `lint` and `ci` cannot disagree: the parse and schema findings the loader
// already produced, the Bundle root and the configuration (AGSC-01-04,
// AGSC-01-17/18 and the agent lane of AGSC-01-36…38), placement and slug
// uniqueness (AGSC-01-03, AGSC-01-11), the Link graph (AGSC-03) and the four
// N9 lints with the structural lints beside them (`governance/lint.js`,
// AGSC-08-13…17).

const validate = require('../../../knowledge/validate.js');
const domain = require('../../../knowledge/domain.js');
const frontmatter = require('../../../knowledge/frontmatter.js');
const links = require('../../../knowledge/links.js');
const suggest = require('../../../knowledge/suggest.js');
const slug = require('../../../knowledge/slug.js');
const govLint = require('../../../governance/lint.js');
const govFix = require('../../../governance/fix.js');
const portable = require('../../../governance/portable-names.js');
const textFiles = require('../../../governance/text-files.js');
const { checkAgents } = require('../../../governance/agents.js');
const { RANGE_CHECKED_KEYS } = require('../../../boundary/visibility.js');
const federation = require('../../../boundary/federation.js');
const site = require('../../../distribution/site.js');
const { readSchemas } = require('../../../adapters/node-fs.js');
const helpers = require('./_helpers.js');

/**
 * lane(ctx, bundle) -> { findings, lanes }
 * The findings the LOADER already produced (parse and schema faults) are NOT
 * repeated here: `distribution/ci.js` starts its pipeline from them, and one
 * fault must be counted once (AGSC-09-11). `run()` adds them for the standalone
 * verb. `lanes` names every lane that ran AND every lane that could not, so a
 * caller never mistakes an unrunnable check for a green one.
 */
/**
 * The `config` and `root` lanes alone — AGSC-01-17/18, AGSC-01-36…38 and AGSC-01-04
 * — which `build` also runs, so that a configuration or a Bundle root that `lint`
 * rejects is never published by `build` (an `http://` peer written into the
 * discovery document, a root missing `spec_version`).
 */
function configAndRoot(bundle, options = {}) {
  const findings = [];
  const schemas = helpers.schemas();
  // AGSC-01-17/18 + AGSC-01-36…38: the configuration, closed, with the agent
  // lane INJECTED (Knowledge never requires Governance), and AGSC-00-15: the
  // version this tool implements, so another MAJOR is refused (`ownVersion`).
  // AGSC-11-01: the boundary range check runs when the configuration is loaded
  // (`application/config/load.js`), so its keys are not reported twice.
  findings.push(...validate.config(bundle.config || {}, {
    checkAgents, file: 'agsc.config.json', ownVersion: options.ownVersion,
    rangeCheckedElsewhere: RANGE_CHECKED_KEYS, schemas,
  }));
  // AGSC-01-04: the Bundle root. AGSC-01-01 requires `content/` and AGSC-01-04 makes
  // `content/index.md` its root document, so its absence is a fault and not a skipped
  // check: without it a directory with a configuration and no `content/` at all
  // would lint and build clean.
  if (bundle.index) {
    findings.push(...validate.index(bundle.index.frontmatter || {}, {
      file: 'content/index.md', schemas,
    }));
  } else if (!(bundle.findings || []).some((f) => f.file === 'content/index.md')) {
    findings.push(validate.finding('AGSC-E901',
      'content/index.md, the Bundle root, is not there; a Bundle holds content/ with its root document (AGSC-01-01, AGSC-01-04)',
      { file: 'content/index.md' }));
  }
  return findings;
}

/** The site vocabulary of each loaded Bundle, read once: the Bundle record is frozen, so the model never goes stale. */
const MODELS = new WeakMap();

/**
 * AGSC-05-38: the site vocabulary of the Bundle as the checks read it (`domain.js#load`), or
 * `null` for a Bundle that names none, or whose vocabulary does not load (AGSC-E420 says why).
 *
 * @param {object} bundle the loaded Bundle.
 * @returns {object|null}
 */
function siteModel(bundle) {
  if (!bundle.domain || typeof bundle.domain.vocabulary !== 'string') return null;
  if (!MODELS.has(bundle)) MODELS.set(bundle, domain.load(bundle.domain.vocabulary, { contexts: ((bundle.config || {}).domain || {}).contexts }));
  return MODELS.get(bundle);
}

/** The options of `links.resolve` for the Bundle: its assets, and its site vocabulary when it has one. */
function linkOptions(bundle) {
  const model = siteModel(bundle);
  return { assets: bundle.assets, config: bundle.config, ...(model === null ? {} : { domain: model }) };
}

/**
 * AGSC-01-41, AGSC-05-38 and AGSC-02-25: the domain layer's own checks — the faults of the
 * `domain` object the schema cannot see, the rules (a) to (g) over the site vocabulary the
 * loader read, and the domain keys of the items that name no class or context
 * (`AGSC-E418`). `build` runs them too, so what `lint` refuses here is never published. A
 * Bundle with no `domain` object and no item that states a domain key has none.
 *
 * @param {object} bundle the loaded Bundle.
 * @returns {Array<object>} findings.
 */
function domainLayer(bundle) {
  const config = bundle.config || {};
  const object = config.domain || {};
  const findings = [];
  if (bundle.domain !== undefined) {
    findings.push(...domain.configFindings(config, { items: bundle.items || [] }));
    if (typeof bundle.domain.vocabulary === 'string') {
      findings.push(...domain.check(bundle.domain.vocabulary, { contexts: object.contexts, file: object.vocabulary }));
    }
  }
  findings.push(...domain.itemFindings(bundle.items || [], {
    contexts: object.contexts, model: siteModel(bundle), vocabulary: typeof object.vocabulary === 'string',
  }));
  return findings;
}

/**
 * AGSC-11-24: the statements of the crosswalks the typed peers name, each refused one
 * `AGSC-E209` on its file (`federation.js#readCrosswalk`), judged against the Bundle's own base,
 * contexts, items and the terms of its site vocabulary. The schema reports a relationship outside the three (`AGSC-E203`) and a
 * translation layer with no crosswalk (`AGSC-E202`); the loader an absent file (`AGSC-E901`).
 * `build` runs it too. A Bundle with no typed peer that names a crosswalk has none.
 *
 * @param {object} bundle the loaded Bundle.
 * @returns {Array<object>} findings.
 */
function contextMapFindings(bundle) {
  if (bundle.crosswalks === undefined) return [];
  const config = bundle.config || {};
  const items = (bundle.items || []).map((item) => ({ slug: item.slug, type: item.type }));
  const model = siteModel(bundle);
  const options = { base: String((config.site || {}).base || ''), contexts: (config.domain || {}).contexts, items, terms: model === null ? [] : model.terms };
  return [...bundle.crosswalks].flatMap(([file, text]) => federation.readCrosswalk(text, { ...options, file }).findings);
}

/** Whether a ProcessRunner port is wired, so a missing git answer means "no repository". */
function hasRunner(ctx) {
  const proc = ctx.ports && ctx.ports.proc;
  return Boolean(proc && typeof proc.run === 'function');
}

/**
 * AGSC-01-14 over the `.md` files of a Bundle that are not items: `PRIVACY.md` at the
 * root and every page under `site/`. The checks are the ones every item file gets
 * (`knowledge/frontmatter.js#split`): a byte-order mark, CR line endings, a C0 control
 * character, non-NFC text and anything but one final line feed are `AGSC-E108`, and a
 * file over the cap of AGSC-01-16 is `AGSC-E904`. A file the port refuses to read (not
 * UTF-8, a link out of the root) is reported with the port's own code.
 *
 * @param {object} [fsPort] the FileSystem port.
 * @returns {Array<object>} the findings, in file order.
 */
function encodingFindings(fsPort) {
  if (!fsPort || typeof fsPort.exists !== 'function') return [];
  const files = [];
  if (fsPort.exists('PRIVACY.md')) files.push('PRIVACY.md');
  if (fsPort.exists('site')) files.push(...fsPort.walk('site').filter((p) => p.endsWith('.md')));
  const findings = [];
  for (const file of files) {
    let text;
    try {
      text = String(fsPort.readFile(file, 'utf8'));
    } catch (e) {
      findings.push(validate.finding(e && typeof e.code === 'string' && /^AGSC-E\d{3}$/u.test(e.code) ? e.code : 'AGSC-E901',
        String((e && e.message) || e), { file }));
      continue;
    }
    findings.push(...frontmatter.split(text, { file }).errors.filter((f) => f.code === 'AGSC-E108' || f.code === 'AGSC-E904'));
  }
  return findings;
}

/**
 * AGSC-01-40 and AGSC-04-05 (1.1): the warnings for names, paths and characters that
 * only some file systems or I-JSON readers refuse. The files are those the Bundle
 * carries as input: `content/`, `site/`, `PRIVACY.md` and the configuration.
 * `lint`, `ci` and `build` all report them.
 *
 * @param {object} ctx the verb context.
 * @param {object} bundle the loaded Bundle.
 * @returns {Array<object>} warnings, AGSC-E423.
 */
function portableNames(ctx, bundle) {
  const fsPort = ctx.ports && ctx.ports.fs;
  const paths = [];
  if (fsPort && typeof fsPort.exists === 'function') {
    for (const dir of ['content', 'site']) if (fsPort.exists(dir)) paths.push(...fsPort.walk(dir));
    for (const file of ['PRIVACY.md', 'agsc.config.json']) if (fsPort.exists(file)) paths.push(file);
  }
  return [...portable.checkPaths(paths), ...portable.checkBundleText(bundle)];
}

/**
 * AGSC-01-14 (1.1) over the four text files that carry none of its four suffixes: the
 * root `.env`, the authored `.well-known/security.txt`, `LICENSE-CONTENT` and every SVG
 * under `content/attachments/`. A byte-order mark and non-NFC text are warnings; a file
 * that is absent, or that the port cannot decode, is not this check's to report.
 *
 * @param {object} [fsPort] the FileSystem port.
 * @returns {Array<object>} warnings, AGSC-E108.
 */
function textFileFindings(fsPort) {
  if (!fsPort || typeof fsPort.exists !== 'function') return [];
  const files = ['.env', '.well-known/security.txt', 'LICENSE-CONTENT'].filter((file) => fsPort.exists(file));
  if (fsPort.exists('content/attachments')) {
    files.push(...fsPort.walk('content/attachments').filter((file) => file.toLowerCase().endsWith('.svg')));
  }
  const findings = [];
  for (const file of files) {
    try {
      findings.push(...textFiles.check(file, String(fsPort.readFile(file, 'utf8'))));
    } catch (e) {
      // Not decodable or not readable: the loader and the attachment lint report those.
    }
  }
  return findings;
}

function lane(ctx, bundle) {
  const findings = [];
  const lanes = ['parse', 'schema'];

  findings.push(...configAndRoot(bundle, { ownVersion: ctx.specVersion }));
  lanes.push('config');
  lanes.push('root');
  findings.push(...domainLayer(bundle));
  if (bundle.domain !== undefined) lanes.push('domain');
  findings.push(...contextMapFindings(bundle));
  if (bundle.crosswalks !== undefined) lanes.push('context map');

  // AGSC-01-03 placement and AGSC-01-11 uniqueness.
  const base = String(((bundle.config || {}).site || {}).base || '');
  for (const item of bundle.items || []) {
    findings.push(...validate.placement(item.path, item.frontmatter || {}));
    findings.push(...validate.itemIri(item.path, item.frontmatter || {}, base));
  }
  findings.push(...slug.check((bundle.items || []).map((i) => i.slug),
    { files: (bundle.items || []).map((i) => i.path) }));
  lanes.push('placement');

  // AGSC-03: the Link graph, its inverses, its cycles and its body references.
  // AGSC-03-11's asset branch needs the set `loadBundle` listed: without
  // it every body image reference to a real file under `content/assets/` is
  // `AGSC-E310`, which is the one case the branch exists to admit.
  // AGSC-03-27: with a site vocabulary the domain links are read too.
  findings.push(...links.resolve(bundle.items || [], linkOptions(bundle)).errors);
  lanes.push('links');

  // AGSC-08-13…17 and the structural lints. Every file fact is injected.
  const facts = helpers.attachmentFacts(ctx, bundle);
  const tracked = helpers.trackedPaths(ctx);
  const fsPort = ctx.ports && ctx.ports.fs;
  const diagramPaths = fsPort && fsPort.exists('content/diagrams') ? fsPort.walk('content/diagrams') : [];
  findings.push(...govLint.lint(bundle, {
    attachmentBytes: facts.attachmentBytes,
    diagramPaths,
    fileErrors: facts.fileErrors,
    filesPresent: facts.filesPresent,
    presenceChecked: facts.presenceChecked === true,
    sha256: helpers.sha256,
    trackedPaths: tracked === null ? undefined : tracked,
  }));
  lanes.push(tracked === null
    ? `governance (without the tracked-file check of AGSC-01-37: ${hasRunner(ctx) ? 'not a git repository' : 'no ProcessRunner port'})`
    : 'governance');

  // AGSC-01-14 binds `PRIVACY.md` and the pages under `site/` as it binds items: they
  // are `.md` files a Bundle carries as input.
  findings.push(...encodingFindings(fsPort));
  lanes.push('encoding');

  findings.push(...textFileFindings(fsPort));
  findings.push(...portableNames(ctx, bundle));
  lanes.push('portable names');

  // RFC 9116 + PRD-019: the two legal-facing surfaces need a security contact, a
  // privacy notice and an operator that only the publisher can supply. They are
  // checked HERE as well as at the build, so that a publisher learns from `lint`
  // — before anything is written — that the build will refuse to publish an
  // invalid security contact. `distribution/ci.js` tells the build not to repeat
  // them, so one fault is still counted once (AGSC-09-11).
  findings.push(...site.publicationFindings(bundle, ctx.ports).findings);
  lanes.push('publication');

  return { findings: validate.sortFindings(findings), lanes };
}

/**
 * `lint --fix` (AGSC-09-09; AGSC-03-12, AGSC-04-14, AGSC-04-19, AGSC-04-20).
 *
 * The normalisations themselves are `governance/fix.js`'s, computed as data; this
 * function is only the port wiring — it reads each item's authored bytes through the
 * FileSystem port and writes back the files whose bytes would change.
 *
 * **Under `--json` it is a DRY RUN.** A machine-readable invocation reports what
 * WOULD change and writes nothing, because `--json` is the shape a pipeline consumes
 * (AGSC-09-12) and a reporting call that silently rewrites the working tree is the
 * worst kind of surprise. Without `--json` the files are written and each one is
 * named on stderr (AGSC-09-10).
 *
 * The codes: §9.4 registers none for "this file is not normalised". The closest
 * registered rows are used and the missing registration is on the specification
 * items list — `AGSC-E108` ("encoding violation (BOM, CRLF, non-NFC, trailing
 * newline)", AGSC-01-14) where the change is exactly that, and `AGSC-E506`
 * ("normalized a value", a warning) where the frontmatter order or a wikilink moves.
 * Both are warnings, so `--fix` never changes an exit code by itself.
 *
 * @param {object} ctx the verb context.
 * @param {object} bundle the loaded Bundle.
 * @returns {{findings:Array<object>, written:Array<string>}}
 */
function fix(ctx, bundle) {
  const fs = ctx.ports && ctx.ports.fs;
  const dryRun = Boolean(ctx.flags && ctx.flags.json);
  const sources = new Map();
  for (const item of bundle.items || []) {
    try {
      sources.set(String(item.path), String(fs.readFile(String(item.path), 'utf8')));
    } catch (e) {
      // A file the loader saw and the port cannot re-read is the loader's finding,
      // not this lane's; `--fix` simply has nothing to normalise for it.
    }
  }
  const planned = govFix.plan(bundle, {
    itemSchema: readSchemas(helpers.ENGINE_ROOT).item,
    sources,
  });
  const findings = [...planned.findings];
  const written = [];
  for (const file of planned.files) {
    if (!file.changed) continue;
    // AGSC-04-19 assigns a code PER NORMALISATION:
    // AGSC-E108 for the encoding third, AGSC-E506 for every other one. A file that
    // needed both is therefore two findings, each under the code its rule names.
    for (const change of file.changes) {
      findings.push(validate.finding(change === govFix.ENCODING_CHANGE ? 'AGSC-E108' : 'AGSC-E506',
        `${dryRun ? 'lint --fix would normalise' : 'lint --fix normalised'} ${file.path}: `
        + `${change} (AGSC-04-19)`,
        { file: file.path, severity: 'warn' }));
    }
    if (dryRun) continue;
    fs.writeFile(file.path, file.after);
    written.push(file.path);
    helpers.note(ctx, `fixed: ${file.path}`);
  }
  helpers.note(ctx, dryRun
    ? `lane: fix (dry run under --json; ${planned.changed.length} file${planned.changed.length === 1 ? '' : 's'} would change)`
    : `lane: fix (${written.length} file${written.length === 1 ? '' : 's'} written)`);
  return { findings, written };
}

/** Where `lint --suggest` writes (AGSC-05-35): local, never a route, never under `content/`. */
const SUGGESTIONS_FILE = 'dist/suggestions.json';

/**
 * `lint --suggest` (AGSC-05-35): the Links the content suggests, written to
 * `dist/suggestions.json` and nowhere else. The generators are `knowledge/suggest.js`'s;
 * this function is only the wiring: the loaded items in, the content version of the
 * invocation stamped on the file, one file out through the FileSystem port.
 *
 * @param {object} ctx the verb context.
 * @param {object} bundle the loaded Bundle.
 * @returns {Array<object>} the warnings about the content version, if any.
 */
function suggestLinks(ctx, bundle) {
  const derived = helpers.bundleVersionOf(ctx, helpers.gitLog(ctx));
  const text = suggest.file(bundle.items || [], derived.version);
  ctx.ports.fs.mkdirp('dist');
  ctx.ports.fs.writeFile(SUGGESTIONS_FILE, text);
  helpers.note(ctx, `wrote: ${SUGGESTIONS_FILE} sha256:${helpers.sha256(text)}`);
  return derived.findings;
}

function run(ctx) {
  let bundle = helpers.bundleOf(ctx);
  // AGSC-04-19: `--fix` runs FIRST, and the lanes then judge the repaired files, so a
  // fault `--fix` repaired (a missing final LF, CRLF, non-NFC text) is reported once,
  // as the warning of the normalisation, and never also as the error it no longer is.
  const repaired = ctx.verbFlags && ctx.verbFlags.fix === true ? fix(ctx, bundle) : { findings: [], written: [] };
  if (repaired.written.length > 0) bundle = helpers.bundleOf(ctx);
  const result = lane(ctx, bundle);
  for (const name of result.lanes) helpers.note(ctx, `lane: ${name}`);
  const suggested = ctx.verbFlags && ctx.verbFlags.suggest === true ? suggestLinks(ctx, bundle) : [];
  return {
    findings: validate.sortFindings([...(bundle.findings || []), ...result.findings, ...repaired.findings, ...suggested]),
  };
}

module.exports = { name: 'lint', configAndRoot, contextMapFindings, domainLayer, fix, lane, linkOptions, portableNames, run, siteModel, suggestLinks, textFileFindings };
