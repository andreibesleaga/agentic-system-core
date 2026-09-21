'use strict';
/**
 * CONTEXT Boundary — the anti-corruption layer for what a stranger may see.
 * Implements AGSC-11-01 (the boundary configuration objects, their ranges and
 * AGSC-E209), AGSC-11-02 (reserved values are read as the most restrictive
 * member of their list), AGSC-11-03 (cross-origin access to every public
 * artefact), AGSC-11-04 (the RFC 6906 profile carried by the media type OR by
 * a `Link: ...; rel="profile"` header, with the same conformance result either
 * way), AGSC-11-05 (the `describedby` Link header on `/`, quoted SHA-256
 * ETags, `no-cache`, and no `immutable` anywhere at 1.0), AGSC-11-20
 * (`visibility`) and AGSC-11-22 (retirement and tombstoned items).
 * Requirements: SO-17a/18a/22a, D71 Q74, D72 CS-10/C6/C15, PRD-057, PRD-062.
 *
 * Boundary is NOT a pure context: it computes over bytes it is given and may
 * use `node:crypto`, but it reaches no network and no clock of its own.
 *
 * DUPLICATION, REPORTED: the header sets below overlap what
 * `distribution/headers.js` (owner E) emits into `_headers` (AGSC-06-17).
 * `tests/arch/context-boundaries.test.js` forbids Boundary from requiring
 * Distribution, so the rule is implemented here — where AGSC-11-03/11-05 live
 * — and Distribution should call `headerSets` rather than restate it. G owns
 * the unification.
 *
 * Security rows of docs/SECURITY-CONSIDERATIONS.md addressed here:
 * "exfiltration through cross-origin reads of a wrongly public restricted
 * node" (AGSC-11-20: the wildcard is dropped from every artefact but the
 * discovery document) and the credentials header that AGSC-11-03 forbids.
 */

const crypto = require('node:crypto');
const federation = require('./federation.js');
const { ACCESS_CLASSES, REL, SURFACE_NAMES } = require('./surfaces.js');

/** AGSC-11-20: the closed `visibility` list, most restrictive last. */
const VISIBILITY_VALUES = Object.freeze(['public', 'restricted']);
/** AGSC-11-14: the closed `agsc-contribute-mode` list. */
const CONTRIBUTE_MODES = Object.freeze(['pr', 'channel', 'form']);

/** AGSC-11-03: the header pair every public artefact carries. */
const CORS_HEADERS = Object.freeze({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'Link, ETag, Content-Type',
});
/** AGSC-11-03: a header that MUST NEVER be sent for a public artefact. */
const FORBIDDEN_HEADERS = Object.freeze(['Access-Control-Allow-Credentials']);
/** AGSC-11-05: the three routes served `no-cache`. */
const NO_CACHE_ROUTES = Object.freeze(['/.well-known/knowledge-linkset', '/now.md', '/ledger.jsonl']);
/** AGSC-06-07 / AGSC-11-04: the profile URI of the discovery document. */
const PROFILE_URI = 'https://w3id.org/agentic-system-core/profile/agentic-knowledge';
/** AGSC-06-25 / AGSC-11-05: the header `/` carries at Level >= 2. */
const DESCRIBEDBY_LINK_HEADER = '</.well-known/knowledge-linkset>; rel="describedby"; type="application/linkset+json"';
/** AGSC-11-04: the profile, carried SECONDARILY as a response header. */
const PROFILE_LINK_HEADER = `<${PROFILE_URI}>; rel="profile"`;
const WELLKNOWN = '/.well-known/knowledge-linkset';
/** AGSC-05-14: a date without a time is that day's midnight, UTC. */
const MIDNIGHT = 'T00:00:00Z';
/** The `asc:` namespace of AGSC-05. */
const ASC = 'https://w3id.org/agentic-system-core/ns#';
const XSD_DATETIME = 'http://www.w3.org/2001/XMLSchema#dateTime';

function finding(code, severity, extra) {
  return Object.freeze(Object.assign({ code, message: '', severity }, extra || {}));
}

/**
 * AGSC-11-02: a 1.x reader meeting a value it does not know MUST NOT fail and
 * MUST read it as the most restrictive member of that list. This governs
 * documents the node did NOT author; its own configuration is validated
 * closed by the schemas (AGSC-E203), which is not this function's job.
 */
function readReserved(list, value) {
  const v = Array.isArray(value) ? value[0] : value;
  switch (list) {
    case 'visibility':
      return VISIBILITY_VALUES.includes(v) ? v : 'restricted';
    case 'agsc-access':
      return ACCESS_CLASSES.includes(v) ? v : 'credential';
    case 'agsc-surface':
      return SURFACE_NAMES.includes(v) || /^x-[a-z0-9]+-[a-z0-9-]+$/u.test(String(v)) ? v : 'not served';
    case 'agsc-contribute-mode':
      return CONTRIBUTE_MODES.includes(v) ? v : 'not contributable';
    default:
      throw new TypeError(`no reserved-value list named ${JSON.stringify(list)}`);
  }
}

/**
 * An HTML page or an artefact? AGSC-11-03 binds every route of AGSC-06-01
 * OTHER than the generated HTML pages, and every HTML route of that rule ends
 * in `/` (the directory routes) or `.html` (`/404.html`).
 */
function isArtefact(route) {
  const path = String(route);
  return !(path.endsWith('/') || path.endsWith('.html'));
}

/** AGSC-11-05: a quoted lowercase-hex SHA-256 (RFC 9110 8.8.3). */
function etag(bytes) {
  const hex = crypto.createHash('sha256').update(bytes === undefined || bytes === null ? '' : bytes).digest('hex');
  return `"${hex}"`;
}

/**
 * headersFor(route, options) -> the response headers this node sends.
 * options: { visibility = 'public', level = 2, bytes }. AGSC-11-03,
 * AGSC-11-05, AGSC-11-20. `Cache-Control: ... immutable` is emitted nowhere
 * at 1.0 because no route of AGSC-06-01 is digest-named.
 */
function headersFor(route, options) {
  const opts = options || {};
  const visibility = readReserved('visibility', opts.visibility === undefined ? 'public' : opts.visibility);
  const level = opts.level === undefined ? 2 : opts.level;
  const headers = {};
  const artefact = isArtefact(route);
  const wildcard = visibility === 'public' ? artefact : route === WELLKNOWN;
  if (wildcard) Object.assign(headers, CORS_HEADERS);
  if (route === '/' && level >= 2) headers.Link = DESCRIBEDBY_LINK_HEADER;
  // AGSC-11-04: the discovery document carries its RFC 6906 profile primarily
  // in the media type and secondarily here; a consumer MUST accept either, so
  // both are emitted and `_headers` carries the same bytes (AGSC-06-17).
  if (route === WELLKNOWN) headers.Link = PROFILE_LINK_HEADER;
  // AGSC-11-05 asks for both, on the same route where both apply: an ETag on
  // every public artefact, and `no-cache` on the three that change every build.
  if (NO_CACHE_ROUTES.includes(route)) headers['Cache-Control'] = 'no-cache';
  if (artefact && opts.bytes !== undefined) headers.ETag = etag(opts.bytes);
  return Object.freeze(headers);
}

/**
 * headerSets({ artefacts, routes, visibility, level }) -> { route: headers }
 * `artefacts` maps a route to its canonical bytes (so an ETag can be
 * computed); `routes` names further routes that carry no bytes here.
 */
function headerSets(options) {
  const opts = options || {};
  const artefacts = opts.artefacts || {};
  const routes = new Set([...(opts.routes || []), ...Object.keys(artefacts)]);
  const out = {};
  for (const route of [...routes].sort()) {
    out[route] = headersFor(route, {
      bytes: Object.prototype.hasOwnProperty.call(artefacts, route) ? artefacts[route] : undefined,
      level: opts.level,
      visibility: opts.visibility,
    });
  }
  return Object.freeze(out);
}

/**
 * visibilityLinks({ visibility, access }) -> { attributes, links }
 * AGSC-11-20. `agsc-visibility` is a one-value target attribute on the
 * anchor's `describedby` link, emitted ONLY when the value is `restricted`; a
 * restricted node carries exactly one `rel#access` link.
 */
function visibilityLinks(options) {
  const opts = options || {};
  const visibility = readReserved('visibility', opts.visibility === undefined ? 'public' : opts.visibility);
  const attributes = {};
  const links = [];
  if (visibility === 'restricted') {
    attributes['agsc-visibility'] = Object.freeze(['restricted']);
    if (typeof opts.access === 'string' && opts.access !== '') {
      links.push(Object.freeze({ href: opts.access, rel: REL.access }));
    }
  }
  return Object.freeze({
    attributes: Object.freeze(attributes),
    links: Object.freeze(links),
    visibility,
    wellknownPublic: true,
    wellknownWildcard: true,
    wildcardAllowed: visibility === 'public',
  });
}

/**
 * profileRecognised(response) -> boolean
 * AGSC-11-04: the profile is carried primarily by the media type's `profile`
 * parameter and secondarily by a `Link: ...; rel="profile"` header; a
 * consumer MUST accept either, and a client that cannot read response headers
 * MUST reach the same conformance result as one that can.
 */
function profileRecognised(response) {
  const r = response || {};
  const contentType = String(r['content-type'] || r.contentType || '');
  const linkHeader = String(r.link || r.Link || '');
  const inMediaType = new RegExp(`profile\\s*=\\s*"?${PROFILE_URI.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}"?`, 'u').test(contentType);
  const inLinkHeader = linkHeader.includes(`<${PROFILE_URI}>`) && /rel\s*=\s*"?profile"?/u.test(linkHeader);
  return inMediaType || inLinkHeader;
}

/** True when the profile is recognised without reading ANY response header. */
function profileRecognisedWithoutHeaders(response) {
  const r = response || {};
  return profileRecognised({ 'content-type': r['content-type'] || r.contentType || '' });
}

/**
 * `federation.max_bytes` — AGSC-11-10(f), added at rc.5. Its bounds are the ones
 * `schema/config.schema.json` declares (`minimum` 65536, `maximum` 268435456,
 * `default` 33554432). It is NOT in `federation.FEDERATION_PARAMS`, because that
 * table is the WALK parameter set whose exact five members vector `bnd-0023`
 * asserts as the effective defaults; `max_bytes` caps an artefact's size and is
 * not one of them. It is range-checked here so that a Bundle carrying the
 * schema's own default is not reported as naming an unknown parameter.
 */
const FEDERATION_MAX_BYTES = Object.freeze({ default: 33554432, max: 268435456, min: 65536 });

/**
 * checkBoundaryConfig(config) -> Finding[]
 * AGSC-11-01: every numeric or enumerated parameter of the boundary chapter
 * lies between the schema minimum and the stated maximum; out of range or
 * malformed is AGSC-E209. Vendor `x-<vendor>-<key>` members are admitted.
 */
function checkBoundaryConfig(config) {
  const c = config || {};
  const findings = [];
  const federationConfig = c.federation;
  if (federationConfig !== undefined) {
    if (federationConfig === null || typeof federationConfig !== 'object' || Array.isArray(federationConfig)) {
      findings.push(finding('AGSC-E209', 'error', { key: 'federation', message: 'federation must be an object of the AGSC-11-06 parameters (AGSC-11-01)' }));
    } else {
      for (const [key, value] of Object.entries(federationConfig)) {
        if (/^x-[a-z0-9]+-/u.test(key)) continue;
        const range = key === 'max_bytes' ? FEDERATION_MAX_BYTES : federation.FEDERATION_PARAMS[key];
        if (range === undefined) {
          findings.push(finding('AGSC-E209', 'error', {
            key: `federation.${key}`,
            message: `federation.${key} is not a parameter of AGSC-11-06 (AGSC-11-01)`,
          }));
        } else if (!Number.isInteger(value) || value < range.min || value > range.max) {
          findings.push(finding('AGSC-E209', 'error', {
            key: `federation.${key}`,
            message: `federation.${key} must be an integer between ${range.min} and ${range.max} (AGSC-11-01)`,
          }));
        }
      }
    }
  }
  if (c.visibility !== undefined && !VISIBILITY_VALUES.includes(c.visibility)) {
    findings.push(finding('AGSC-E209', 'error', { key: 'visibility', message: `visibility must be one of ${VISIBILITY_VALUES.join(', ')} (AGSC-11-01)` }));
  }
  if (c.chunks !== undefined && c.chunks !== null && typeof c.chunks === 'object'
      && c.chunks.max_bytes !== undefined
      && (!Number.isInteger(c.chunks.max_bytes) || c.chunks.max_bytes < 256)) {
    findings.push(finding('AGSC-E209', 'error', { key: 'chunks.max_bytes', message: 'chunks.max_bytes must be an integer of at least 256 (AGSC-11-01)' }));
  }
  return Object.freeze(findings.concat(federation.checkContribute(c), federation.checkRelated(c)));
}

/**
 * retirement(items, options) -> the AGSC-11-22 consequences of `status: retired`.
 * A retired item keeps its page and its canonical IRI, leaves `search.json`,
 * `/chunks.jsonl`, `/llms.txt`, the skill packs and every composition
 * selection, and stays in the graph with `asc:retiredAt`. A Link whose target
 * is retired is the warning AGSC-E411; `supersedes` may name one without
 * warning. The composition half of the rule (AGSC-E802 on a selection naming
 * a retired item) lives in `composition/compose.js`, which owns selections.
 */
const PROV_EXEMPT_KEYS = Object.freeze(['supersedes']);
const LINK_KEYS = Object.freeze(['related', 'broader', 'narrower', 'uses', 'requires', 'excludes',
  'derived-from', 'contradicts', 'supersedes', 'implements', 'verifies', 'covers', 'blocked-by', 'decided-by']);

function retirement(items, options) {
  const opts = options || {};
  const base = opts.base || '/';
  const list = items || [];
  const retired = new Set(list.filter((i) => i.status === 'retired').map((i) => i.slug));
  const findings = [];
  for (const item of list) {
    for (const key of LINK_KEYS) {
      if (PROV_EXEMPT_KEYS.includes(key) || !Array.isArray(item[key])) continue;
      for (const target of item[key]) {
        if (retired.has(String(target).split('#')[0])) {
          findings.push(finding('AGSC-E411', 'warn', { key, message: `${key} names ${target}, which is retired (AGSC-11-22)`, slug: item.slug, target }));
        }
      }
    }
  }
  const quads = [];
  for (const item of list) {
    if (!retired.has(item.slug)) continue;
    const stamp = retiredAt(item);
    if (stamp === null) continue;
    const iri = `${String(base).replace(/\/+$/u, '/')}${plural(item.type)}/${item.slug}/`;
    quads.push(`<${iri}> <${ASC}retiredAt> "${stamp}"^^<${XSD_DATETIME}> <${base}> .`);
  }
  return Object.freeze({
    excludedFrom: Object.freeze(['search.json', '/chunks.jsonl', '/llms.txt', '/skills/', 'composition']),
    findings: Object.freeze(findings),
    pagesKept: Object.freeze([...retired].sort()),
    quads: Object.freeze(quads.sort()),
    retired: Object.freeze([...retired].sort()),
  });
}

/** AGSC-11-22 + AGSC-05-14: `modified`, else `date`, else omitted; midnight convention. */
function retiredAt(item) {
  const value = item.modified !== undefined ? item.modified : item.date;
  if (typeof value !== 'string' || value === '') return null;
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value + MIDNIGHT : value;
}

function plural(type) {
  const t = typeof type === 'string' && type !== '' ? type : 'concept';
  return t === 'cluster' ? 'clusters' : `${t}s`;
}

module.exports = {
  CONTRIBUTE_MODES,
  CORS_HEADERS,
  DESCRIBEDBY_LINK_HEADER,
  FEDERATION_MAX_BYTES,
  FORBIDDEN_HEADERS,
  LINK_KEYS,
  NO_CACHE_ROUTES,
  PROFILE_LINK_HEADER,
  PROFILE_URI,
  VISIBILITY_VALUES,
  WELLKNOWN,
  checkBoundaryConfig,
  etag,
  headerSets,
  headersFor,
  isArtefact,
  profileRecognised,
  profileRecognisedWithoutHeaders,
  readReserved,
  retiredAt,
  retirement,
  visibilityLinks,
};
