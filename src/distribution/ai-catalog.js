'use strict';
// CONTEXT Distribution (Emission) — Surface: the two AI-catalogue files, opt-in.
// Implements AGSC-06-42 (`/.well-known/ard.json` and `/.well-known/ai-catalog.json`, written only
// when `discovery.ai_catalog` is `true`; one entry for the discovery document and, when the node
// publishes one, one for the agent card; each entry carries the SHA-256 of the exact bytes served at
// its `url`) with AGSC-06-07 (these two are catalogue entries that point at the one discovery
// document, not discovery files of their own) and AGSC-01-18 (the switch, default `false`).
//
// Both formats are PROPOSALS, not standards, and neither suffix is in the IANA registry of
// well-known URIs: the Agentic Resource Discovery manifest, version 0.91, status "Proposal", dated
// 26 August 2026, and the AI Catalog draft, `specVersion` "1.0", both read 2026-10-29. No library
// writes either format (none is published on npm under either project; checked 7 Nov 2026), so
// the entries are plain data here and the bytes are the engine's one JCS writer (AGSC-04-05).
// A reader of this specification never needs either file.
//
// Pure function of its input; `well-known.js` hands in the bytes of the two files it points at.

const { createHash } = require('node:crypto');
const { canonicalize } = require('../knowledge/jcs.js');
const { compareCodePoint } = require('../knowledge/unicode.js');
const { finding } = require('../knowledge/validate.js');
const { A2A_CARD_MEDIA_TYPE, A2A_CARD_ROUTE } = require('../boundary/surfaces.js');
const discovery = require('./discovery.js');

const ARD_PATH = '/.well-known/ard.json';
const AI_CATALOG_PATH = '/.well-known/ai-catalog.json';
/** AGSC-06-42: the media types the two files are served with. */
const ARD_MEDIA_TYPE = 'application/json';
const AI_CATALOG_MEDIA_TYPE = 'application/ai-catalog+json';
/** AGSC-06-42: the `specVersion` of the AI Catalog draft. */
const AI_CATALOG_SPEC_VERSION = '1.0';

/** AGSC-06-42: `sha256:` and the lowercase hexadecimal SHA-256 of the served bytes. */
function hexDigest(bytes) {
  return `sha256:${createHash('sha256').update(Buffer.from(String(bytes), 'utf8')).digest('hex')}`;
}

/**
 * AGSC-06-42: the host name of `site.base`, lower case and without a port, when it is a fully
 * qualified domain name (at least one `.`, not an IP literal, not under `.local`); else null.
 * The URL parser writes every IPv4 form as four decimals and an IPv6 literal in brackets.
 */
function domainName(base) {
  let host;
  try { host = new URL(String(base)).hostname.toLowerCase(); } catch { return null; }
  const bare = host.replace(/\.$/u, '');
  if (!bare.includes('.') || host.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/u.test(bare) || /\.local$/u.test(bare)) return null;
  return host;
}

/** One entry, its digest written the way the format names it. */
function entry(fields, digestMember) {
  const out = {
    displayName: fields.displayName, identifier: fields.identifier, type: fields.type, url: fields.url,
  };
  if (typeof fields.description === 'string' && fields.description !== '') out.description = fields.description;
  // AGSC-06-42: `digest` in the AI Catalog draft's form; ARD defines no digest member on an entry.
  if (digestMember === 'digest') out.digest = fields.digest;
  else out.metadata = { digest: fields.digest };
  return out;
}

/**
 * The two catalogue files of AGSC-06-42.
 *
 * @param {{config:object, description?:string, discoveryBytes:string, cardBytes?:string|null}} input
 *   `discoveryBytes` and `cardBytes` are the exact bytes served at the two entries' `url`.
 * @returns {{files: Map<string,string>, findings: Array<object>}} no file when the switch is off,
 *   and none when a finding refuses it.
 */
function catalogueFiles(input) {
  const config = input.config || {};
  const files = new Map();
  if (((config.discovery || {}).ai_catalog) !== true) return { files, findings: [] };
  const site = config.site || {};
  const host = domainName(site.base);
  const id = (config.bundle || {}).id;
  const refuse = (code, message) => ({ files, findings: [finding(code, message, { file: 'agsc.config.json' })] });
  if (host === null) {
    return refuse('AGSC-E209', `discovery.ai_catalog is true, but the host of site.base ${JSON.stringify(String(site.base))}`
      + ' is not a fully qualified domain name, which a urn:air identifier needs; no catalogue file is written (AGSC-06-42)');
  }
  if (typeof id !== 'string' || id === '') {
    return refuse('AGSC-E202', 'discovery.ai_catalog is true, but bundle.id is not set; no catalogue file is written (AGSC-06-42)');
  }
  const common = { description: input.description, displayName: site.title };
  const listed = [{
    ...common,
    digest: hexDigest(input.discoveryBytes),
    identifier: `urn:air:${host}:knowledge:${id}`,
    type: `${discovery.MEDIA_TYPE}; profile="${discovery.PROFILE}"`,
    url: discovery.href(site.base, discovery.WELLKNOWN_PATH),
  }];
  if (typeof input.cardBytes === 'string') {
    listed.push({
      ...common, digest: hexDigest(input.cardBytes), identifier: `urn:air:${host}:a2a:${id}`, type: A2A_CARD_MEDIA_TYPE,
      url: discovery.href(site.base, A2A_CARD_ROUTE),
    });
  }
  listed.sort((a, b) => compareCodePoint(a.identifier, b.identifier));
  // AGSC-06-42: `representativeQueries` is never written; it would have to be invented.
  files.set(ARD_PATH, `${canonicalize({ entries: listed.map((one) => entry(one, 'metadata')) })}\n`);
  files.set(AI_CATALOG_PATH, `${canonicalize({ entries: listed.map((one) => entry(one, 'digest')), specVersion: AI_CATALOG_SPEC_VERSION })}\n`);
  return { files, findings: [] };
}

module.exports = {
  catalogueFiles, domainName, AI_CATALOG_MEDIA_TYPE, AI_CATALOG_PATH, ARD_MEDIA_TYPE, ARD_PATH,
};
