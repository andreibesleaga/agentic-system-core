'use strict';
// CONTEXT Knowledge — the RFC 9530 digest value, one writer for every place that states one.
//
// WHAT. `sha-256=:<base64>:` is the value of a `Content-Digest` or `Repr-Digest` field of
// RFC 9530 (<https://www.rfc-editor.org/rfc/rfc9530.html>): a Structured Fields Dictionary
// (RFC 9651, <https://www.rfc-editor.org/rfc/rfc9651.html>) with one member, the algorithm
// token `sha-256`, whose value is a Byte Sequence — the hash in the standard base64 alphabet
// with `=` padding, between colons. The engine writes that value in four places: the
// `digest` of a discovery-document link (AGSC-06-08), the `agsc-chunk-set` commitment of the
// chunks surface (AGSC-06-44), the `content_digest` member of a chunk line (AGSC-06-29) and the
// `content_digest` of each file of the export manifest (AGSC-09-17 (a)).
//
// WHY A LIBRARY. The Dictionary is written by `structured-headers` (the RFC 9651 / RFC 8941
// implementation, pinned exactly) rather than by a template string, so that the key, the
// Byte Sequence and the base64 alphabet are RFC 9651's serialisation and not a copy of it:
// no serializer is hand-written where a maintained library writes the format. The SHA-256 is
// node:crypto's. `tools/validate-wellknown` keeps its own two lines for the same value: it is a
// standalone checker with no dependency (AGSC-09-90).
//
// PURE: no fs, no clock, no network; `node:crypto` hashes, as AGSC-04-03 allows.

const { createHash } = require('node:crypto');
const { serializeDictionary } = require('structured-headers');

/**
 * The RFC 9530 value `sha-256=:<base64>:` over some bytes.
 *
 * @param {string|Buffer} bytes a string is hashed as its UTF-8 bytes.
 * @returns {string}
 */
function sha256Field(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes), 'utf8');
  return serializeDictionary({ 'sha-256': createHash('sha256').update(buffer).digest() });
}

module.exports = { sha256Field };
