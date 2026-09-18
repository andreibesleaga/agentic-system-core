'use strict';
// CONTEXT Distribution (Emission) — Surface: the response-header sets.
// Implements AGSC-06-17 (the `_headers` content types and the `_redirects` alias),
// AGSC-06-04 (both files are GENERATED, never hand-maintained), AGSC-11-03 (the
// CORS set every public artefact carries, and the credentials header none carries),
// AGSC-11-04/05 (the profile link, the `describedby` header on `/`, the quoted
// SHA-256 `ETag` and the three `no-cache` routes) and AGSC-11-20 (a `restricted`
// node applies the wildcard to the discovery document alone).
//
// UNIFIED AT INTEGRATION (WP-10-G, 2026-09-18): AGSC-11-03 and AGSC-11-05 are
// the BOUNDARY chapter's rules and are implemented once, in
// `boundary/visibility.js` — the anti-corruption layer that owns them. This
// module no longer restates them: it imports the CORS pair, the `no-cache`
// route list and the `describedby` Link header from there and turns them into
// the bytes of `_headers` (AGSC-06-04/06-17), which is all Distribution owns.
// `tests/arch/headers-unified.test.js` proves BYTE equality between what this
// file writes and what `visibility.headersFor()` answers for the same route.
// Pure function of its input.

const {
  WELLKNOWN_PATH, WELLKNOWN_ALIAS, MEDIA_TYPE, PROFILE,
} = require('./discovery.js');
const visibility = require('../boundary/visibility.js');

/** AGSC-11-03: the CORS pair, on every public artefact. Credentials: never. */
const CORS = Object.freeze(Object.entries(visibility.CORS_HEADERS).map((pair) => Object.freeze(pair)));

/**
 * AGSC-11-03: every artefact of AGSC-06-01 other than an HTML page (V7-12). Glob
 * patterns are the `_headers` syntax of the static host, matched left to right.
 */
const PUBLIC_ARTEFACTS = Object.freeze([
  WELLKNOWN_PATH,
  '/graph.jsonld', '/graph.ttl', '/graph.nq',
  '/ns/*',
  '/llms.txt', '/llms-full.txt',
  '/chunks.jsonl', '/chunks-*.jsonl',
  '/ledger.jsonl',
  '/search.json', '/search-*.json',
  '/pages/*.md', '/pages/*.jsonld',
  '/skills/*',
  '/now.md',
  '/boards/*',
  '/attachments/*',
  '/graph/fragments/*',
]);

/** AGSC-11-05: the routes whose representation changes on every build. */
const NO_CACHE = visibility.NO_CACHE_ROUTES;

/** AGSC-06-17 + AGSC-06-05: the content types and the `default-src 'none'` policy. */
const CONTENT_TYPES = Object.freeze([
  [WELLKNOWN_PATH, `${MEDIA_TYPE}; profile="${PROFILE}"`],
  ['/.well-known/tdmrep.json', 'application/json; charset=utf-8'],
  ['/.well-known/security.txt', 'text/plain; charset=utf-8'],
  ['/graph.jsonld', 'application/ld+json; charset=utf-8'],
  ['/graph.ttl', 'text/turtle; charset=utf-8'],
  ['/graph.nq', 'application/n-quads; charset=utf-8'],
  ['/chunks.jsonl', 'application/jsonl'],
  ['/chunks-*.jsonl', 'application/jsonl'],
  ['/ledger.jsonl', 'application/jsonl'],
  ['/search.json', 'application/json; charset=utf-8'],
  ['/search-*.json', 'application/json; charset=utf-8'],
  ['/boards/*', 'application/json; charset=utf-8'],
  ['/llms.txt', 'text/plain; charset=utf-8'],
  ['/llms-full.txt', 'text/plain; charset=utf-8'],
  // AGSC-06-17: the GFM variant parameter, on the per-item Markdown views.
  ['/pages/*.md', 'text/markdown; charset=utf-8; variant=GFM'],
  ['/pages/*.jsonld', 'application/ld+json; charset=utf-8'],
  // AGSC-06-22's NOW view is Markdown like `/pages/*.md`, and AGSC-11-05 makes it
  // one of the three routes whose representation changes on every build.
  ['/now.md', 'text/markdown; charset=utf-8; variant=GFM'],
  ['/ns/*.ttl', 'text/turtle; charset=utf-8'],
  ['/ns/*.jsonld', 'application/ld+json; charset=utf-8'],
  ['/ns/*.rdf', 'application/rdf+xml; charset=utf-8'],
  ['/ns/*.nt', 'application/n-triples; charset=utf-8'],
]);

/** AGSC-06-05 / AGSC-06-17: no third-party origin, no cookie, no beacon. */
const SECURITY_POLICY = "default-src 'none'; script-src 'self'; style-src 'self'; "
  + "img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const SITE_WIDE = Object.freeze([
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Content-Security-Policy', SECURITY_POLICY],
  ['Permissions-Policy', 'interest-cohort=()'],
]);

/** AGSC-11-05: the ETag of an artefact — its lowercase-hex SHA-256, in quotes. */
function etag(hex) {
  return `"${String(hex)}"`;
}

/**
 * The header sets, as data, so that F's boundary handlers can assert them without
 * parsing text.
 *
 * @param {{visibility?:string}} [config] `agsc.config.json`.
 * @returns {Array<{route:string, headers:Array<[string,string]>}>}
 */
function headerSets(config = {}) {
  const restricted = config.visibility === 'restricted';
  const sets = [{ route: '/*', headers: [...SITE_WIDE] }];
  // AGSC-11-05: the discovery link as a response header, on the Bundle IRI.
  sets.push({
    route: '/',
    headers: [['Link', visibility.DESCRIBEDBY_LINK_HEADER]],
  });
  // AGSC-11-20: a restricted node serves the discovery document publicly and
  // applies the wildcard to NOTHING else.
  for (const route of (restricted ? [WELLKNOWN_PATH] : PUBLIC_ARTEFACTS)) {
    sets.push({ route, headers: CORS.map(([k, v]) => [k, v]) });
  }
  for (const [route, type] of CONTENT_TYPES) {
    const headers = [['Content-Type', type]];
    if (route === WELLKNOWN_PATH) {
      // AGSC-11-04: the profile, primarily on the media type and secondarily as a
      // header; a consumer MUST accept either.
      headers.push(['Link', visibility.PROFILE_LINK_HEADER]);
    }
    if (NO_CACHE.includes(route)) headers.push(['Cache-Control', 'no-cache']);
    sets.push({ route, headers });
  }
  return sets;
}

/** `_headers`, generated (AGSC-06-04). */
function headersFile(config = {}) {
  const blocks = headerSets(config).map(({ route, headers }) => [
    route, ...headers.map(([k, v]) => `  ${k}: ${v}`),
  ].join('\n'));
  return `# Generated by agsc build — never hand-edited (AGSC-06-04).\n${blocks.join('\n\n')}\n`;
}

/**
 * `_redirects`, generated (AGSC-06-04, AGSC-06-17). The 0.0.x discovery alias is
 * present until the last 0.0.x consumer is retired (D60); a renamed or superseded
 * slug adds one entry per `aliases[]` value.
 *
 * @param {Array<{from:string, to:string, status?:number}>} [renames]
 * @returns {string}
 */
function redirectsFile(renames = []) {
  const lines = [
    '# Generated by agsc build — never hand-edited (AGSC-06-04).',
    '# The 0.0.x discovery path (D60, AGSC-06-17).',
    `${WELLKNOWN_ALIAS} ${WELLKNOWN_PATH} 301`,
  ];
  for (const r of renames) lines.push(`${r.from} ${r.to} ${r.status == null ? 301 : r.status}`);
  return `${lines.join('\n')}\n`;
}

module.exports = {
  headerSets,
  headersFile,
  redirectsFile,
  etag,
  CORS,
  NO_CACHE,
  PUBLIC_ARTEFACTS,
  CONTENT_TYPES,
  SECURITY_POLICY,
  SITE_WIDE,
};
