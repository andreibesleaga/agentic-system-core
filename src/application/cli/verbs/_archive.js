'use strict';
// src/application/cli/verbs/_archive.js — the `--zip` wiring shared by `compose`,
// `skills` and `export` (owner decision D111, owner rule R100).
//
// APPLICATION LAYER. Every byte of the archive is `composition/archive.js`'s, which
// is pure and is the same source text the `/compose/` page runs (AGSC-07-13); the
// only things decided here are the three things a pure context may not know — where
// the archive is written, what the Bundle's content version is (AGSC-04-25, derived
// once per invocation by `_helpers.js#buildOptions`) and the SHA-256 of the result
// (AGSC-05-29: the engine hashes through `node:crypto`, no pure context may).
//
// The archive is written BESIDE the directory it packages and never inside it:
// AGSC-07-12 closes the Harness at seven file kinds "and no others", and an archive
// is a packaging of those files rather than one of them. It is an output only — the
// FileSystem port refuses to READ an archive (`AGSC-E903`, AGSC-01-16), which is why
// nothing in this engine ever reads one back.

const archive = require('../../../composition/archive.js');
const { orFromInstant } = require('../../../knowledge/content-version.js');
const helpers = require('./_helpers.js');

/**
 * Write one archive over `files`, beside `stem`, and note its SHA-256.
 *
 * @param {object} ctx the verb context (ports, flags, stderr).
 * @param {object} options
 * @param {string} options.stem the directory the files were written into, without a
 *   trailing slash — `dist/harness/<name>`, `dist/skills`, `dist/export/steer`.
 * @param {*} options.files a `Map` of path → text, or an array of `{path, text}`.
 * @param {string} options.instant the AGSC-04-09 build instant.
 * @param {string} [options.bundleVersion] the AGSC-04-25 content version; derived
 *   from the instant alone when the caller holds none.
 * @returns {{findings: Array<object>, path: (string|null), sha256: (string|null)}}
 */
function writeArchive(ctx, options) {
  const settings = options || {};
  const built = archive.archiveBytes(settings.files, { instant: settings.instant });
  if (built.violations.length > 0) {
    return { findings: built.violations, path: null, sha256: null };
  }
  const at = archive.archiveName(settings.stem,
    orFromInstant(settings.bundleVersion, settings.instant));
  const bytes = Buffer.from(built.bytes);
  ctx.ports.fs.writeFile(at, bytes);
  const digest = helpers.sha256(bytes);
  helpers.note(ctx, `wrote: ${at} sha256:${digest} (${built.entries.length} entries, stored,`
    + ' timestamps fixed at the build instant — built by the archive module the /compose/'
    + ' page runs, so the page and the command cannot differ, AGSC-07-13)');
  return { findings: [], path: at, sha256: digest };
}

/**
 * The content version this invocation derived, or `undefined` — read defensively,
 * because `buildOptions` reaches the ProcessRunner port for the git-log file and a
 * verb that never builds should not fail over a missing one.
 *
 * @param {object} ctx
 * @returns {string|undefined}
 */
function bundleVersionOf(ctx) {
  try {
    return helpers.buildOptions(ctx).bundleVersion;
  } catch (e) {
    return undefined;
  }
}

module.exports = { bundleVersionOf, writeArchive };
