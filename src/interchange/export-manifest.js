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
 * What an import finds when it holds the manifest of the folder it reads: one warning
 * for each listed file whose digest differs or that is absent, and one for each of the
 * item count and the items digest that differs.
 *
 * @param {string} text the bytes of `export-manifest.json`.
 * @param {{files:Map<string,(string|null)>, itemIris:(string[]|null)}} found the folder as the
 *   importer reads it: each listed path's text (`null` when absent), and the IRIs of the
 *   items it holds (`null` when the folder states no `base` to form them from).
 * @returns {Array<object>} findings, `AGSC-E506` warnings.
 */
function check(text, found) {
  const stated = parse(text);
  if (stated === null) return [warning('the manifest is not an object with files, item_count and items_digest;'
    + ' nothing in it was checked')];
  const out = [];
  for (const entry of stated.files) {
    const path = String(entry && entry.path);
    const bytes = found.files.get(path);
    if (bytes === undefined || bytes === null) out.push(warning(`${path} is listed and is absent from the folder`));
    else if (contentDigest(bytes) !== entry.content_digest) {
      out.push(warning(`${path} differs from the manifest: its content_digest is not the one the export recorded`));
    }
  }
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

/** The paths a manifest lists, or none when it cannot be read: what an importer must fetch to check it. */
function listedPaths(text) {
  const stated = parse(text);
  return stated === null ? [] : stated.files.map((entry) => String(entry && entry.path));
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

module.exports = { FILE, build, check, contentDigest, irisOfWrites, itemsDigest, listedPaths };
