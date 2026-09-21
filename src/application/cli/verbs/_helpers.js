'use strict';
// src/application/cli/verbs/_helpers.js — the shared wiring of the sixteen
// verbs of AGSC-09-07. APPLICATION LAYER: it orchestrates across contexts and
// owns no domain rule; every rule it reaches for lives in the context that
// states it. Owner: B; rewired at integration (WP-10-G, 2026-09-18) when the
// interim `AGSC-PENDING` marker and the `tryRequire` probes were removed —
// every module they probed for now exists.

const path = require('node:path');
const { createHash } = require('node:crypto');

const { readOntology, readSchemas } = require('../../../adapters/node-fs.js');
const validate = require('../../../knowledge/validate.js');
const turtle = require('../../../knowledge/turtle.js');
const { loadBundle } = require('../../bundle.js');

/**
 * The engine's own root — where `schema/`, `ontology/` and `tests/vectors/`
 * ship. It is NOT the Bundle root: a Bundle-rooted FileSystem port may not
 * reach outside its own root (AGSC-E902), and the schemas are the engine's.
 */
const ENGINE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

/** The separator `git ls-files -z` writes between paths. */
const NUL = String.fromCharCode(0);

let compiledSchemas = null;
let vocabulary = null;

/** The three compiled schemas, read once through the adapter (AGSC-00-09). */
function schemas() {
  if (compiledSchemas === null) compiledSchemas = validate.schemas(readSchemas(ENGINE_ROOT));
  return compiledSchemas;
}

/**
 * The vocabulary, read once through the adapter exactly as the schemas are
 * (AGSC-06-32, AGSC-05-09, AGSC-05-25). `ontology/` ships in the package (the
 * `files` member of `package.json`), so it is present wherever `schema/` is.
 *
 * WHY IT IS HERE: `distribution/site.js` generates `/ns/context.jsonld` from these
 * terms and compacts every JSON-LD view against it, but Distribution never reads a
 * file and `knowledge/` never reads one either — so the application layer is the
 * only place that can hand the vocabulary to the build. Until 2026-09-21 no caller
 * did, and every built context carried 0 of the 52 `asc:` term definitions.
 *
 * @returns {{terms: Array<object>, version: string|null}}
 */
function ontology() {
  if (vocabulary === null) {
    const text = readOntology(ENGINE_ROOT);
    vocabulary = Object.freeze({
      terms: Object.freeze(turtle.ontologyTerms(text)),
      version: turtle.ontologyVersion(text),
    });
  }
  return vocabulary;
}

/** The loaded Bundle of AGSC-01-01…01-04, from the verb's port bag. */
function bundleOf(ctx) {
  return loadBundle(ctx.ports, { schemas: schemas() });
}

/** AGSC-05-29: the engine hashes through `node:crypto`; no pure context may. */
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * The emission options every build-shaped verb passes to `distribution/`.
 * `--level` selects the emission Level of AGSC-10-02/10-04; the default is 2,
 * the Level this engine emits when nothing says otherwise. `ontologyTerms` and
 * `ontologyVersion` carry the vocabulary into the build (AGSC-06-32, AGSC-05-09).
 */
function buildOptions(ctx, extra) {
  const raw = ctx.verbFlags && ctx.verbFlags.level;
  const level = raw === undefined ? undefined : Number(raw);
  return {
    level: Number.isInteger(level) ? level : undefined,
    ontologyTerms: ontology().terms,
    ontologyVersion: ontology().version,
    specVersion: ctx.specVersion,
    version: ctx.version,
    ...(extra || {}),
  };
}

/**
 * AGSC-01-34 / AGSC-08-13: the bytes of every text-media attachment an item
 * names, so that the lint lane scans what will enter the chunk export, and
 * `{path: present}` so the absence checks can run. Read through the port; a
 * file that is absent is simply absent, and `governance/lint.js` reports it.
 */
function attachmentFacts(ctx, bundle) {
  const fs = ctx.ports && ctx.ports.fs;
  const attachmentBytes = Object.create(null);
  const filesPresent = Object.create(null);
  if (!fs || typeof fs.exists !== 'function') return { attachmentBytes, filesPresent };
  for (const item of bundle.items || []) {
    const list = (item.frontmatter && item.frontmatter.attachments) || [];
    for (const attachment of Array.isArray(list) ? list : []) {
      if (!attachment || typeof attachment.file !== 'string') continue;
      const at = `content/attachments/${item.slug}/${attachment.file}`;
      let exists = false;
      try {
        exists = fs.exists(at);
      } catch (e) {
        exists = false;
      }
      filesPresent[at] = exists;
      if (!exists) continue;
      try {
        attachmentBytes[at] = String(fs.readFile(at, 'utf8'));
      } catch (e) {
        // Not decodable as text: the size and safety checks of AGSC-01-34 and
        // AGSC-02-98 read it through `filesPresent`, never through its bytes.
      }
    }
  }
  return { attachmentBytes, filesPresent };
}

/**
 * AGSC-01-37 / AGSC-08-15: the paths git tracks, so that a tracked `.env` is
 * `AGSC-E403`. "Tracked" is a git fact, so it arrives through the
 * ProcessRunner port; with no runner the lane cannot run and the caller names
 * it in `lanes` rather than reporting a false green.
 */
function trackedPaths(ctx) {
  const proc = ctx.ports && ctx.ports.proc;
  if (!proc || typeof proc.run !== 'function') return null;
  let result;
  try {
    result = proc.run('git', ['ls-files', '-z']);
  } catch (e) {
    return null;
  }
  if (!result || result.code !== 0 || typeof result.stdout !== 'string') return null;
  return result.stdout.split(NUL).filter((p) => p !== '');
}

/**
 * The honest answer of a verb AGSC-09-07 names but this milestone does not
 * implement: exit 1 with exactly one finding that cites the rule, never a
 * silent success and never an invented code.
 *
 * `AGSC-E001` is the code AGSC-09-94 itself prescribes when a verb the
 * specification names is not offered by the running node; §9.4 registers no
 * code for "recognised but not implemented", which is an OPEN QUESTION for
 * 1.0.0. The exit code is 1, not 2: nothing about the invocation was wrong.
 */
function notImplemented(verb, rule, why) {
  return {
    status: 'fail',
    findings: [{
      code: 'AGSC-E001',
      message: `${verb} is named by ${rule} but is not implemented at this milestone: ${why}`
        + ' — no conformance Level is claimed before 1.0.0 (AGSC-10-05)',
      severity: 'error',
    }],
  };
}

/**
 * AGSC-09-09/AGSC-09-10: a diagnostic note on stderr — which lanes ran, which
 * routes were skipped. `--quiet` silences it; it is never data, so it never
 * reaches stdout.
 */
function note(ctx, text) {
  if (ctx.flags && ctx.flags.quiet) return;
  if (ctx.stderr && typeof ctx.stderr.write === 'function') ctx.stderr.write(`${text}\n`);
}

module.exports = {
  ENGINE_ROOT,
  note,
  attachmentFacts,
  bundleOf,
  buildOptions,
  notImplemented,
  ontology,
  schemas,
  sha256,
  trackedPaths,
};
