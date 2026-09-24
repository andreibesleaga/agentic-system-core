'use strict';

/**
 * interchange/own-record — may an import TRUST an own-record it finds in a file?
 *
 * The `skills`, `gabbe` and `cogx` exports carry, per item, a hidden own-record (an
 * `<!-- agsc-item <base64 of the JCS record> -->` line, or a COGX record's
 * `metadata.agsc` member) holding the authored frontmatter and body, so a return
 * import rebuilds the item exactly — its `prov`, its `status`, everything. Anyone can
 * write such a line into a file of their own. An import therefore trusts a
 * record only when BOTH hold:
 *
 *   1. its origin (`bundle`) is this node's own `site.base` or the base of a declared
 *      peer (`peers[]`, AGSC-10-12; a peer entry is the peer's well-known URL); and
 *   2. its version fields agree with themselves: `bundle_version` is a content version
 *      (AGSC-04-25), `bundle_hash` (when present) is a SHA-256 hex digest, `iri` (when
 *      present) lies under the origin, and the file's AGSC-06-15 provenance header
 *      (when present) names the same origin and content version.
 *
 * Anything else is a claim by a stranger: the adapter ignores the record and reads the
 * file as the foreign file it is. This is a consistency check, not a signature — a
 * forger who copies this node's own origin and header still passes it; a signed
 * record is the full answer.
 *
 * PURE: no fs, no clock, no network.
 */

const { canonicalize } = require('../knowledge/jcs.js');
const { isObject } = require('./records.js');

/** The own-record payload of one item, as the base64 of its JCS bytes. */
function encodeRecord(record) {
  return Buffer.from(canonicalize(record), 'utf8').toString('base64');
}

/** The payload of one `agsc-item` line, or `null` when it is not ours. */
function decodeRecord(b64) {
  let value;
  try {
    value = JSON.parse(Buffer.from(String(b64), 'base64').toString('utf8'));
  } catch (e) {
    return null;
  }
  if (!isObject(value) || !isObject(value.frontmatter) || typeof value.body !== 'string'
    || typeof value.slug !== 'string' || typeof value.type !== 'string') return null;
  return value;
}

/** AGSC-04-25's content-version grammar, as the adapters already test it. */
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u;

/** A SHA-256 digest in lower-case hex. */
const DIGEST = /^[0-9a-f]{64}$/u;

/** The suffix of a `peers[]` entry (config.schema.json). */
const WELLKNOWN = '/.well-known/knowledge-linkset';

/** An own-record line, whole, with its line break. */
const RECORD_LINE = /^<!-- agsc-item [^\n]*-->\n?/gmu;

/** `https://x.example`, `https://x.example/`, or its well-known URL → `https://x.example/`; else `null`. */
function baseOf(value) {
  if (typeof value !== 'string') return null;
  let text = value.trim();
  if (text.endsWith(WELLKNOWN)) text = text.slice(0, text.length - WELLKNOWN.length);
  text = text.replace(/\/+$/u, '');
  return text === '' ? null : `${text}/`;
}

/**
 * The origins whose records this import trusts: this node's own base and every
 * declared peer's.
 *
 * @param {{origin?:string, peers?:string[]}} [options]
 * @returns {Set<string>}
 */
function trustedOrigins(options) {
  const out = new Set();
  const opts = options || {};
  const own = baseOf(opts.origin);
  if (own !== null) out.add(own);
  for (const peer of Array.isArray(opts.peers) ? opts.peers : []) {
    const base = baseOf(peer);
    if (base !== null) out.add(base);
  }
  return out;
}

/**
 * The fields of the first AGSC-06-15 provenance header in a text (or in the lines of
 * a COGX manifest's `notes`), or `null` when there is none. A field named twice keeps
 * its first value.
 *
 * @param {string|string[]|null} source
 * @returns {object|null}
 */
function headerOf(source) {
  if (source == null) return null;
  const text = Array.isArray(source) ? source.map(String).join('\n') : String(source);
  const block = /<!-- agsc:provenance\n([\s\S]*?)\n-->/u.exec(text);
  if (block === null) return null;
  const fields = Object.create(null);
  for (const line of block[1].split('\n')) {
    const m = /^([a-z_]+): (.*)$/u.exec(line);
    if (m !== null && fields[m[1]] === undefined) fields[m[1]] = m[2];
  }
  return fields;
}

/**
 * Why a record is NOT trusted, in plain words — or `null` when it is.
 *
 * @param {object} record the decoded own-record (or COGX `agsc` member).
 * @param {Set<string>} origins from `trustedOrigins`.
 * @param {object|null} header from `headerOf` over the file that carries the record.
 * @returns {string|null}
 */
function distrust(record, origins, header) {
  const origin = baseOf(record.bundle);
  if (origin === null) return 'it names no origin';
  if (!origins.has(origin)) {
    const known = [...origins].sort();
    return `it names the origin ${origin}, which is neither this node (${known.length === 0 ? 'no site.base'
      : known.join(', ')}) nor a declared peer (peers[])`;
  }
  if (typeof record.bundle_version !== 'string' || !VERSION.test(record.bundle_version)) {
    return 'its content version is missing or malformed (AGSC-04-25)';
  }
  if (record.bundle_hash !== undefined && (typeof record.bundle_hash !== 'string' || !DIGEST.test(record.bundle_hash))) {
    return 'its fingerprint (bundle_hash) is not a SHA-256 digest';
  }
  if (record.iri !== undefined && (typeof record.iri !== 'string' || !record.iri.startsWith(origin))) {
    return `its item IRI ${JSON.stringify(String(record.iri))} is not under the origin it names`;
  }
  if (header !== null && (baseOf(header.bundle) !== origin || header.bundle_version !== record.bundle_version)) {
    return 'the file\'s provenance header names another origin or content version than the line';
  }
  return null;
}

/** The text with every own-record line removed, so a foreign reading never carries one. */
function stripLines(text) {
  return String(text).replace(RECORD_LINE, '');
}

module.exports = { baseOf, decodeRecord, distrust, encodeRecord, headerOf, stripLines, trustedOrigins };
