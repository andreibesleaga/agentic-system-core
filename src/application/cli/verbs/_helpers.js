'use strict';
// src/application/cli/verbs/_helpers.js — the shared wiring of the sixteen
// verbs of AGSC-09-07. APPLICATION LAYER: it orchestrates across contexts and
// owns no domain rule; every rule it reaches for lives in the context that
// states it.

const path = require('node:path');
const { createHash } = require('node:crypto');

const { readOntology, readSchemas } = require('../../../adapters/node-fs.js');
const validate = require('../../../knowledge/validate.js');
const links = require('../../../knowledge/links.js');
const ledger = require('../../../governance/ledger.js');
const contentVersion = require('../../../knowledge/content-version.js');
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
/**
 * The three separators the git-log read uses: ASCII RS before each record, US
 * between fields, GS after the message, where git's `--name-only` list begins.
 */
const RS = String.fromCharCode(30);
const US = String.fromCharCode(31);
const GS = String.fromCharCode(29);
/**
 * AGSC-08-20b's own field set, asked for in one process and with no shell:
 * the commit, its parents, the COMMITTER time in whole seconds (never a rendered
 * local time, which would depend on the host's zone), the ref decorations the tag
 * names are read from, and the whole message the trailers are parsed out of —
 * followed by the paths the commit changed, which `--name-only` prints after it.
 */
const GIT_LOG_FORMAT = `--format=${RS}%H${US}%P${US}%ct${US}%D${US}%B${GS}`;
/**
 * The reference production of AGSC-08-20b, extended shape: first-parent, oldest
 * first, and `--name-only` for `files[]`. `core.quotepath=off` keeps a non-ASCII
 * path as its UTF-8 bytes instead of a quoted octal escape; `--no-renames` lists a
 * rename as both of its paths whatever the user's `diff.renames` says; and
 * `--diff-merges=first-parent` states what `--first-parent` implies for a merge,
 * so that no configuration can change the list.
 */
const GIT_LOG_ARGS = Object.freeze(['-c', 'core.quotepath=off', 'log', '--first-parent', '--reverse',
  '--no-renames', '--name-only', '--diff-merges=first-parent', GIT_LOG_FORMAT, 'HEAD']);

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
  const log = gitLog(ctx);
  const derived = bundleVersionOf(ctx, log);
  const tree = log === undefined ? undefined : contentTree(ctx);
  return {
    bundleVersion: derived.version,
    bundleVersionFindings: derived.findings,
    ...(tree === undefined ? {} : { contentTree: tree }),
    gitLog: log,
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
 * `{path: byteLength}` for every attachment that is present, so the absence
 * (AGSC-E413) and cap (AGSC-E904) checks of `governance/lint.js` can run — that
 * function reads BYTE LENGTHS, and until this map carried booleans, so neither
 * check could ever fire through the CLI. A file the FileSystem port REFUSES — over
 * the input cap, an archive, reached through a link out of the root (AGSC-01-16,
 * AGSC-01-35) — is recorded in `fileErrors` with the port's own registered code
 * never reported as absent. A name outside the path grammar is not
 * read at all: `governance/lint.js` reports it as AGSC-E902.
 */
function attachmentFacts(ctx, bundle) {
  const fs = ctx.ports && ctx.ports.fs;
  const attachmentBytes = Object.create(null);
  const filesPresent = Object.create(null);
  const fileErrors = Object.create(null);
  if (!fs || typeof fs.exists !== 'function') return { attachmentBytes, fileErrors, filesPresent };
  const refused = (e) => (e && typeof e.code === 'string' && /^AGSC-E\d{3}$/u.test(e.code)
    ? { code: e.code, message: String(e.message) } : null);
  for (const item of bundle.items || []) {
    const list = (item.frontmatter && item.frontmatter.attachments) || [];
    for (const attachment of Array.isArray(list) ? list : []) {
      if (!attachment || typeof attachment.file !== 'string') continue;
      const dir = `content/attachments/${item.slug}`;
      if (links.pathGrammarError(attachment.file, dir) !== null) continue;
      const at = `${dir}/${attachment.file}`;
      let exists = false;
      try {
        exists = fs.exists(at);
        // `exists` answers false for a path the port refuses; a refusal is not an
        // absence, so the refusal is asked for explicitly.
        if (!exists && typeof fs.stat === 'function') fs.stat(at);
      } catch (e) {
        const why = refused(e);
        if (why !== null) fileErrors[at] = why;
        exists = false;
      }
      if (!exists) continue;
      let bytes;
      try {
        bytes = fs.readFile(at, null);
      } catch (e) {
        const why = refused(e);
        if (why !== null) fileErrors[at] = why;
        continue;
      }
      filesPresent[at] = bytes.length;
      try {
        attachmentBytes[at] = String(fs.readFile(at, 'utf8'));
      } catch (e) {
        // Not decodable as text: the size and safety checks of AGSC-01-34 and
        // AGSC-02-98 read it through `filesPresent`, never through its bytes.
      }
    }
  }
  return { attachmentBytes, fileErrors, filesPresent, presenceChecked: true };
}

/**
 * AGSC-08-20b: the git-log file — the first-parent chain of the content branch,
 * oldest first — read through the ProcessRunner port in ONE process and handed to
 * `governance/ledger.js#produce`, which is the rule's implementation. It is the
 * input of the derived ledger (AGSC-08-20a) and of the content version
 * (AGSC-04-25), so it is read once per invocation and passed down as data.
 *
 * `undefined` when there is no runner, no git, no repository, no commit or
 * anything the reader cannot parse — never a guess, never a partial chain. The
 * content version then takes AGSC-04-25's branch 4, which is exactly the drop-in
 * case AGSC-04-09 already names.
 *
 * @param {object} ctx the verb context.
 * @returns {Array<object>|undefined}
 */
function gitLog(ctx) {
  const proc = ctx.ports && ctx.ports.proc;
  if (!proc || typeof proc.run !== 'function') return undefined;
  let result;
  try {
    result = proc.run('git', GIT_LOG_ARGS.slice());
  } catch (e) {
    return undefined;
  }
  if (!result || result.code !== 0 || typeof result.stdout !== 'string') return undefined;
  const commits = [];
  for (const record of result.stdout.split(RS)) {
    const text = record.replace(/^\n+/u, '');
    if (text === '') continue;
    const [sha, parents, seconds, decorations, rest] = text.split(US);
    if (!/^[0-9a-f]{40,64}$/u.test(String(sha)) || !/^[0-9]+$/u.test(String(seconds))) return undefined;
    // The message ends at GS; what follows is the `--name-only` list, one path per
    // line. A record with no GS (a producer that did not ask for the list) carries
    // no `files[]`, which AGSC-08-20b allows and a reader reports as not run.
    const body = rest === undefined ? '' : rest;
    const cut = body.indexOf(GS);
    const message = cut === -1 ? body : body.slice(0, cut);
    const commit = {
      committer_timestamp: ledger.instantFromEpoch(Number(seconds)),
      message,
      parents: String(parents) === '' ? [] : String(parents).split(' '),
      sha: String(sha),
      // `%D` is `HEAD -> main, tag: v1.4.0, origin/main`; `produce` keeps the
      // greatest `v*` of whatever it is given (AGSC-08-20b).
      tags: String(decorations === undefined ? '' : decorations).split(',')
        .map((one) => one.trim())
        .filter((one) => one.startsWith('tag: '))
        .map((one) => one.slice(5)),
    };
    if (cut !== -1) {
      commit.files = body.slice(cut + 1).split('\n').filter((line) => line !== '');
    }
    const author = ledger.authorOf(ledger.parseTrailers(message));
    if (author !== null) commit.author = author;
    commits.push(commit);
  }
  return ledger.produce(commits);
}

/**
 * AGSC-08-20a: the git tree hash of the Bundle's committed `content/`, the `ref` of
 * the ledger's trailing build entry. `HEAD:./content` is resolved against the
 * Bundle root, so a Bundle kept in a subdirectory of its repository names its own
 * tree. `undefined` when there is no runner, no repository or no committed
 * `content/`: the build then publishes no ledger and says why.
 *
 * @param {object} ctx the verb context.
 * @returns {string|undefined}
 */
function contentTree(ctx) {
  const proc = ctx.ports && ctx.ports.proc;
  if (!proc || typeof proc.run !== 'function') return undefined;
  let result;
  try {
    result = proc.run('git', ['rev-parse', '--verify', '--quiet', 'HEAD:./content']);
  } catch (e) {
    return undefined;
  }
  if (!result || result.code !== 0 || typeof result.stdout !== 'string') return undefined;
  const tree = result.stdout.trim();
  return /^[0-9a-f]{40,64}$/u.test(tree) ? tree : undefined;
}

/**
 * AGSC-04-25: the content version of this invocation, derived once from the two
 * inputs the build already has. The findings (an `AGSC-E506` for a git tag that
 * cannot be a content version) are returned beside it, because a warning about a
 * derived build fact belongs to the verbs that emit.
 *
 * @param {object} ctx the verb context.
 * @param {Array<object>|undefined} log the git-log file of `gitLog(ctx)`.
 * @returns {{version:string, findings:Array<object>}}
 */
function bundleVersionOf(ctx, log) {
  const clock = ctx.ports && ctx.ports.clock;
  const instant = clock === undefined || clock === null ? ''
    : (typeof clock.iso === 'function' ? clock.iso() : ledger.instantFromEpoch(clock.now()));
  const { version, findings } = contentVersion.bundleVersion({ buildInstant: instant, gitLog: log });
  return { findings, version };
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
  bundleVersionOf,
  buildOptions,
  contentTree,
  gitLog,
  notImplemented,
  ontology,
  schemas,
  sha256,
  trackedPaths,
};
