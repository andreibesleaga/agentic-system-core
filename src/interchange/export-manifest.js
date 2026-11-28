'use strict';
/**
 * CONTEXT Interchange — the export manifest of AGSC-09-17 (a).
 *
 * WHY. A folder an export wrote travels: it is zipped, mailed, committed, copied to a
 * stick. `export --manifest` adds `export-manifest.json` beside its files so that whoever
 * receives the folder can tell whether what they hold is what the node wrote. `import` of
 * a folder that holds one recomputes what the manifest states and reports a difference as
 * the warning `AGSC-E506`; it imports as it would without a manifest. The check finds
 * damage and accident; it is not a signature, because the manifest travels with the files
 * it describes.
 *
 * THE FILE. One JCS object (AGSC-04-04) and one LF, with exactly the members
 * `bundle_hash`, `bundle_version`, `files`, `item_count`, `items_digest`, `spec_version`.
 * `files` has `{content_digest, path}` for each file of the export except the manifest,
 * by code point of `path`. `content_digest` is the value of a `Content-Digest` field,
 * `sha-256=:<base64>:` (RFC 9530, <https://www.rfc-editor.org/rfc/rfc9530.html>), borrowed
 * for the bytes of a file, so no header is involved; the value is written by the one
 * Structured Fields writer, `knowledge/digest-field.js` (RFC 9651, through a library).
 *
 * WHAT THIS MODULE DOES NOT KNOW. The bundle hash is the SHA-256 of the `graph.nq` of the
 * build, and the item IRIs are those of the published items; the caller (the application
 * layer, which may build) hands both in, because Interchange may not require
 * Distribution. The check does not recompute `bundle_hash` or `bundle_version`: a folder
 * of Markdown holds no graph to hash them from.
 *
 * PURE: no fs, no clock, no network. Hashing is `node:crypto`, which Interchange may use.
 * Requirements: AGSC-09-17, AGSC-01-26, AGSC-04-04; PRD-026.
 */

const { createHash } = require('node:crypto');

const { sha256Field } = require('../knowledge/digest-field.js');
const { canonicalize } = require('../knowledge/jcs.js');
const { bundleIri } = require('../knowledge/nquads.js');
const { compareCodePoint } = require('../knowledge/unicode.js');
const { finding } = require('../knowledge/validate.js');

/** The file `export --manifest` adds to the export root. */
const FILE = 'export-manifest.json';

/** `sha-256=:<base64>:` over the UTF-8 bytes of a file (RFC 9530). */
function contentDigest(text) {
  return sha256Field(String(text));
}

/** The lowercase-hex SHA-256 of the JCS form of the item IRIs in code-point order. */
function itemsDigest(itemIris) {
  const sorted = [...itemIris].sort(compareCodePoint);
  return createHash('sha256').update(canonicalize(sorted), 'utf8').digest('hex');
}

/**
 * The manifest of one export root.
 *
 * @param {Array<{path:string, text:string}>} files every file the export wrote, relative to its root.
 * @param {{bundleHash:string, bundleVersion:string, itemIris:string[], specVersion:string}} facts
 * @returns {string} the bytes of `export-manifest.json`.
 */
function build(files, facts) {
  const listed = files.filter((file) => file.path !== FILE)
    .map((file) => ({ content_digest: contentDigest(file.text), path: file.path }))
    .sort((a, b) => compareCodePoint(a.path, b.path));
  return `${canonicalize({
    bundle_hash: facts.bundleHash,
    bundle_version: facts.bundleVersion,
    files: listed,
    item_count: facts.itemIris.length,
    items_digest: itemsDigest(facts.itemIris),
    spec_version: facts.specVersion,
  })}\n`;
}

/** The warning of this check. */
const warning = (message) => finding('AGSC-E506', `${FILE}: ${message} (AGSC-09-17)`, { file: FILE, severity: 'warn' });

/** At most this many distinct listed files are read and checked; a longer list gets one warning. */
const MAX_LISTED_PATHS = 5000;

/** The most bytes of listed files an import reads and hashes for the check; the rest are not checked. */
const MAX_CHECKED_BYTES = 256 * 1024 * 1024;

/** The value of a listed path that was not read because the total of MAX_CHECKED_BYTES was reached. */
const NOT_CHECKED = Symbol('not checked');

/** The value of a listed path that is in the folder but is no regular file (never opened). */
const NOT_A_FILE = false;

/** The longest path a warning prints; a longer one is cut. */
const MAX_SHOWN = 200;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069\ud800-\udfff]/gu;

/**
 * A listed path as a warning prints it: as it is, unless it holds a control character, a bidirectional
 * control or a lone surrogate (shown as an escape, so a path cannot move the cursor, reorder the line or
 * break the output) or is longer than 200 characters (cut by code point, never inside a pair).
 */
function shown(path) {
  const points = Array.from(path);
  const text = points.length > MAX_SHOWN ? `${points.slice(0, MAX_SHOWN).join('')}...` : path;
  return text.replace(CONTROL, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/**
 * Is a listed path in the normal form an export writes: relative, with `/` between names, and no empty,
 * `.` or `..` name? Another spelling is never read, so one file cannot be listed many times under
 * different spellings.
 */
function normalForm(path) {
  return path !== '' && !path.startsWith('/') && !path.includes('\\')
    && path.split('/').every((name) => name !== '' && name !== '.' && name !== '..');
}

/** The one warning for a manifest that cannot be read as a file of text. */
function unreadable() {
  return [warning('the manifest could not be read as a file of text; nothing in it was checked')];
}

/** The manifest, parsed, or `null` when it does not have the shape of AGSC-09-17 (a). */
function parse(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return null;
  }
  const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);
  const shaped = isObject && Array.isArray(value.files) && Number.isInteger(value.item_count)
    && typeof value.items_digest === 'string';
  return shaped ? value : null;
}

/**
 * The listed files to check: each distinct (path, digest) pair once, in order, at most
 * MAX_LISTED_PATHS paths; the count of entries that name no text path, of paths not in normal form,
 * and of paths left out.
 */
function entriesOf(stated) {
  const entries = [];
  const seen = new Set();
  const paths = new Set();
  let nameless = 0;
  let left = 0;
  let abnormal = 0;
  for (const entry of stated.files) {
    if (entry === null || typeof entry !== 'object' || typeof entry.path !== 'string') {
      nameless += 1;
      continue;
    }
    if (!normalForm(entry.path)) {
      abnormal += 1;
      continue;
    }
    const key = `${entry.path}\u0000${String(entry.content_digest)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!paths.has(entry.path) && paths.size >= MAX_LISTED_PATHS) {
      left += 1;
      continue;
    }
    paths.add(entry.path);
    entries.push(entry);
  }
  return { abnormal, entries, left, nameless };
}

/**
 * What an import finds when it holds the manifest of the folder it reads: one warning
 * for each listed file whose digest differs or that is absent, and one for each of the
 * item count and the items digest that differs.
 *
 * @param {string} text the bytes of `export-manifest.json`.
 * @param {{files:Map<string,(string|null|boolean)>, itemIris:(string[]|null)}} found the folder as the
 *   importer reads it: each listed path's `content_digest` as computed from the file (`null` when absent, `NOT_A_FILE` when it is no regular
 *   file), and the IRIs of the items it holds (`null` when the folder states no `base` to form them
 *   from; left out when the folder is a memory tool's, whose records are not the export's items, so
 *   only the files are checked).
 * @returns {Array<object>} findings, `AGSC-E506` warnings.
 */
function check(text, found) {
  const stated = parse(text);
  if (stated === null) return [warning('the manifest is not an object with files, item_count and items_digest;'
    + ' nothing in it was checked')];
  const out = [];
  const { abnormal, entries, left, nameless } = entriesOf(stated);
  let unchecked = 0;
  for (const entry of entries) {
    const digest = found.files.get(entry.path);
    const name = shown(entry.path);
    if (digest === NOT_CHECKED) unchecked += 1;
    else if (digest === NOT_A_FILE) out.push(warning(`${name} is listed and is not a regular file`));
    else if (digest === undefined || digest === null) out.push(warning(`${name} is listed and is absent from the folder`));
    else if (digest !== entry.content_digest) {
      out.push(warning(`${name} differs from the manifest: its content_digest is not the one the export recorded`));
    }
  }
  if (unchecked > 0) {
    out.push(warning(`the listed files were read up to a total of ${MAX_CHECKED_BYTES / 1048576} MiB; ${unchecked} more ${unchecked === 1 ? 'was' : 'were'} not checked`));
  }
  if (nameless > 0) out.push(warning(`${nameless} listed ${nameless === 1 ? 'entry names' : 'entries name'} no file (a path must be text); not checked`));
  if (abnormal > 0) out.push(warning(`${abnormal} listed ${abnormal === 1 ? 'path is' : 'paths are'} not in normal form and ${abnormal === 1 ? 'was' : 'were'} not checked`));
  if (left > 0) out.push(warning(`only the first ${MAX_LISTED_PATHS} listed files were checked; ${left} more ${left === 1 ? 'was' : 'were'} not`));
  if (found.itemIris === undefined) return out;
  if (found.itemIris === null) {
    out.push(warning('item_count and items_digest were not checked: the folder\'s root document states no base'
      + ' to form the item IRIs from'));
    return out;
  }
  if (found.itemIris.length !== stated.item_count) {
    out.push(warning(`item_count is ${stated.item_count} and the folder holds ${found.itemIris.length} items`));
  }
  if (itemsDigest(found.itemIris) !== stated.items_digest) {
    out.push(warning('items_digest differs: the folder\'s items are not the set the export recorded'));
  }
  return out;
}

/** Is this text the manifest of an export (the shape of AGSC-09-17 (a))? */
function isManifest(text) {
  return parse(text) !== null;
}

/** The distinct paths a manifest lists that `check` will look up (at most MAX_LISTED_PATHS), or none when it cannot be read. */
function listedPaths(text) {
  const stated = parse(text);
  return stated === null ? [] : [...new Set(entriesOf(stated).entries.map((entry) => entry.path))];
}

/**
 * The IRIs of the items an import plan writes (`content/<type-plural>/<slug>.md`), formed
 * from the base the source's root document states (AGSC-05-01).
 *
 * @param {Array<{path:string}>} writes the plan's writes.
 * @param {string|null} base the source's `base`.
 * @returns {string[]|null} `null` when the source states no base.
 */
function irisOfWrites(writes, base) {
  if (base === null || base === undefined) return null;
  return writes.map((write) => /^content\/([^/]+)\/([^/]+)\.md$/u.exec(write.path)).filter((m) => m !== null)
    .map((m) => `${bundleIri(base)}${m[1]}/${m[2]}/`);
}

module.exports = {
  FILE, MAX_CHECKED_BYTES, MAX_LISTED_PATHS, NOT_A_FILE, NOT_CHECKED, build, check, contentDigest, irisOfWrites, isManifest, itemsDigest, listedPaths, unreadable,
};
