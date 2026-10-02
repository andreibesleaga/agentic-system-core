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
const links = require('../../../knowledge/links.js');
const slug = require('../../../knowledge/slug.js');
const govLint = require('../../../governance/lint.js');
const govFix = require('../../../governance/fix.js');
const { checkAgents } = require('../../../governance/agents.js');
const { RANGE_CHECKED_KEYS } = require('../../../boundary/visibility.js');
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
  // AGSC-01-04: the Bundle root.
  if (bundle.index) {
    findings.push(...validate.index(bundle.index.frontmatter || {}, {
      file: 'content/index.md', schemas,
    }));
  }
  return findings;
}

function lane(ctx, bundle) {
  const findings = [];
  const lanes = ['parse', 'schema'];

  findings.push(...configAndRoot(bundle, { ownVersion: ctx.specVersion }));
  lanes.push('config');
  lanes.push('root');

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
  findings.push(...links.resolve(bundle.items || [], {
    assets: bundle.assets, config: bundle.config,
  }).errors);
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
    ? 'governance (without the tracked-file check of AGSC-01-37: no ProcessRunner port)'
    : 'governance');

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

function run(ctx) {
  let bundle = helpers.bundleOf(ctx);
  // AGSC-04-19: `--fix` runs FIRST, and the lanes then judge the repaired files, so a
  // fault `--fix` repaired (a missing final LF, CRLF, non-NFC text) is reported once,
  // as the warning of the normalisation, and never also as the error it no longer is.
  const repaired = ctx.verbFlags && ctx.verbFlags.fix === true ? fix(ctx, bundle) : { findings: [], written: [] };
  if (repaired.written.length > 0) bundle = helpers.bundleOf(ctx);
  const result = lane(ctx, bundle);
  for (const name of result.lanes) helpers.note(ctx, `lane: ${name}`);
  return {
    findings: validate.sortFindings([...(bundle.findings || []), ...result.findings, ...repaired.findings]),
  };
}

module.exports = { name: 'lint', configAndRoot, fix, lane, run };
