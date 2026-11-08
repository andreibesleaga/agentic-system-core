'use strict';
// CONTEXT Distribution (Emission) — Surface: the response-header sets.
// Implements AGSC-06-17 (the `_headers` content types and the `_redirects` alias),
// AGSC-06-04 (both files are GENERATED, never hand-maintained), AGSC-11-03 (the
// CORS set every public artefact carries, and the credentials header none carries),
// AGSC-11-04/05 (the profile link, the `describedby` header on `/`, the quoted
// SHA-256 `ETag` and the three `no-cache` routes), AGSC-06-06 (the versioned copies
// under `/ns/<major>.<minor>.<patch>/` are immutable), AGSC-06-39 (the one policy of
// `/query/` and the files under it, which admits the page's WebAssembly engine) and AGSC-11-20 (a `restricted`
// node applies the wildcard to the discovery document alone, and the profile detaches
// the wildcard that the host adds by default) and AGSC-06-40 (the FAIR Signposting links of the
// home page, in the one `Link` field of the block of `/`, after the `describedby` value of
// AGSC-11-05; the blocks of the agent card and the two catalogue files when the build writes them,
// AGSC-06-34, AGSC-06-42; and the block of the tabular chunk index, AGSC-06-37). No block carries
// `Content-Digest`, and none a static `Repr-Digest`, because the reference host compresses what it
// serves and the bytes of a coded response are not those of the file (AGSC-09-17 (b), AGSC-06-17).
//
// AGSC-11-03 and AGSC-11-05 are the BOUNDARY chapter's rules and are implemented
// once, in `boundary/visibility.js` — the anti-corruption layer that owns them. This
// module does not restate them: it imports the CORS pair, the `no-cache`
// route list and the `describedby` Link header from there and turns them into
// the bytes of `_headers` (AGSC-06-04/06-17), which is all Distribution owns.
// `tests/arch/headers-unified.test.js` proves BYTE equality between what this
// file writes and what `visibility.headersFor()` answers for the same route.
// Pure function of its input.

const {
  WELLKNOWN_PATH, WELLKNOWN_ALIAS, MEDIA_TYPE, PROFILE,
} = require('./discovery.js');
const visibility = require('../boundary/visibility.js');
const federation = require('../boundary/federation.js');
const { A2A_CARD_ROUTE } = require('../boundary/surfaces.js');
const { licenseUrl } = require('../knowledge/chunks.js');
const { singleLine } = require('../knowledge/unicode.js');
const { withoutTrailingSlashes } = require('../shared/trailing.js');
const aiCatalog = require('./ai-catalog.js');

/** AGSC-11-03: the CORS pair, on every public artefact. Credentials: never. */
const CORS = Object.freeze(Object.entries(visibility.CORS_HEADERS).map((pair) => Object.freeze(pair)));

/**
 * AGSC-11-03: every artefact of AGSC-06-01 other than an HTML page. Glob
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

/**
 * AGSC-06-34, AGSC-06-42, AGSC-06-37: the files a build writes only on a condition — the well-known
 * files on a switch, the tabular chunk index by the size of the published set — and the content
 * type each is served with (`text/toon` is the provisional media type the TOON specification
 * names). Each is a public artefact (AGSC-11-03), so its block
 * exists only where the build wrote the file and no other node's `_headers` changes.
 */
const OPT_IN_FILES = Object.freeze([
  // The Agent Card is a JSON document (AGSC-06-34), served as JSON like /.well-known/ard.json.
  [A2A_CARD_ROUTE, 'application/json'],
  [aiCatalog.ARD_PATH, aiCatalog.ARD_MEDIA_TYPE],
  [aiCatalog.AI_CATALOG_PATH, aiCatalog.AI_CATALOG_MEDIA_TYPE],
  ['/chunks-index.toon', 'text/toon; charset=utf-8'],
]);

/**
 * AGSC-07-19, AGSC-06-17: the JSON files under `/skills/`, typed as the discovery document declares
 * `/skills/index.json` (its `rel#skills` link). The pattern names `.json` alone, because a `_headers`
 * splat matches every character and `/skills/*` would also type the HTML page and the SKILL.md files.
 * The block exists only where the build wrote the index, so a node with no skills keeps its `_headers`.
 */
const SKILLS_INDEX = '/skills/index.json';
const SKILLS_JSON = Object.freeze(['/skills/*.json', 'application/json; charset=utf-8']);

/** AGSC-06-40: the files an `item` link names, in order, with the type each is served with. */
const SIGNPOSTED_ITEMS = Object.freeze([
  ['/graph.nq', 'application/n-quads'],
  ['/graph.ttl', 'text/turtle'],
  ['/chunks.jsonl', 'application/jsonl'],
]);

/**
 * RFC 8288 §3: one link value, every parameter quoted, as the `describedby` value of AGSC-11-05 is
 * written (vector bnd-0033 pins that quoting, which `http-link-header`'s writer does not produce,
 * so the tests read these values with that library and this writer stays). A configured URL that
 * holds `<`, `>` or `"`, which no URI may hold, has them percent-encoded so it cannot end the value.
 */
function linkValue({ href, rel, type }) {
  const target = String(href).replace(/[<>"]/gu, (c) => encodeURIComponent(c));
  return `<${target}>; rel="${rel}"${type === undefined ? '' : `; type="${type}"`}`;
}

/**
 * AGSC-06-40: the typed links FAIR Signposting Level 1 asks of a landing page, as data, after the
 * `describedby` link of AGSC-11-05 — `cite-as` (the first `related[]` `cite-as` in `href` order, else
 * the Bundle IRI), the two `type` links, `describedby` for `/graph.jsonld`, an `item` for each graph
 * file and the chunks the node serves (none on a `restricted` node), `license` (the licence URL of
 * AGSC-06-44, when the node has one) and `linkset`. Targets on the node are root-relative; `cite-as`
 * and `license` are absolute. Only a node that writes a home page sends them: a Level-0 publisher
 * writes none (AGSC-10-02) and keeps the one link of 1.0.
 *
 * @param {object} config `agsc.config.json`.
 * @param {Array<string>} routes the routes the build emits.
 * @returns {Array<{href:string, rel:string, type?:string}>}
 */
function homeLinks(config = {}, routes = []) {
  const emitted = new Set(routes);
  const out = [{ href: WELLKNOWN_PATH, rel: 'describedby', type: MEDIA_TYPE }];
  if (!emitted.has('/index.html')) return out;
  const base = withoutTrailingSlashes(String((config.site || {}).base || ''));
  const citeAs = (federation.relatedLinks(config).links['cite-as'] || [])[0];
  out.push({ href: citeAs === undefined ? `${base}/` : citeAs.href, rel: 'cite-as' },
    { href: 'https://schema.org/Dataset', rel: 'type' }, { href: 'https://schema.org/AboutPage', rel: 'type' });
  if (emitted.has('/graph.jsonld')) out.push({ href: '/graph.jsonld', rel: 'describedby', type: 'application/ld+json' });
  if (config.visibility !== 'restricted') {
    for (const [route, type] of SIGNPOSTED_ITEMS) if (emitted.has(route)) out.push({ href: route, rel: 'item', type });
  }
  const license = licenseUrl(config, { legal: emitted.has('/legal/index.html') });
  if (license !== null) out.push({ href: license, rel: 'license' });
  out.push({ href: WELLKNOWN_PATH, rel: 'linkset', type: MEDIA_TYPE });
  return out;
}

/** AGSC-06-40, AGSC-11-05: the one `Link` field of `/`, its first value the 1.0 `describedby` value. */
function homeLinkField(config, routes) {
  const [, ...signposts] = homeLinks(config, routes);
  return [visibility.DESCRIBEDBY_LINK_HEADER, ...signposts.map(linkValue)].join(', ');
}

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
  // Only the JSON exports: `/boards/<cluster-slug>/` is the HTML human view (AGSC-06-01),
  // and a `_headers` splat matches every character, so `/boards/*` would serve it as JSON.
  ['/boards/*.json', 'application/json; charset=utf-8'],
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

/**
 * AGSC-06-39: the policy of `/query/` and the files under it. The page's engine is compiled
 * to WebAssembly, which a browser compiles only where `script-src` admits
 * `'wasm-unsafe-eval'`; that one source is added and nothing else is loosened.
 */
const QUERY_SECURITY_POLICY = SECURITY_POLICY.replace("script-src 'self';", "script-src 'self' 'wasm-unsafe-eval';");
/** The page that, with an engine compiled to WebAssembly under it, gives `/query/*` its block. */
const QUERY_PAGE = '/query/index.html';
/** Whether a route is a WebAssembly file of the query page's engine. */
const queryWasm = (route) => String(route).startsWith('/query/') && String(route).endsWith('.wasm');

const SITE_WIDE = Object.freeze([
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Content-Security-Policy', SECURITY_POLICY],
  ['Permissions-Policy', 'interest-cohort=()'],
]);

/**
 * AGSC-06-06: a version directory is `/ns/<major>.<minor>.<patch>/`, nothing else
 * (the pre-release copy `/ns/1.0.0-draft.1/` is served without the directive).
 */
const VERSION_DIRECTORY = /^\/ns\/(\d+\.\d+\.\d+)\//u;
/** AGSC-06-06: the one `Cache-Control` value of a versioned copy. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

/** The version directories among the routes a build emits, in code-point order. */
function versionDirectories(routes) {
  const found = new Set();
  for (const route of routes) {
    const match = VERSION_DIRECTORY.exec(String(route));
    if (match !== null) found.add(match[1]);
  }
  return [...found].sort();
}

/** AGSC-11-05: the ETag of an artefact — its lowercase-hex SHA-256, in quotes. */
function etag(hex) {
  return `"${String(hex)}"`;
}

/**
 * The header sets, as data, so that F's boundary handlers can assert them without
 * parsing text.
 *
 * @param {{visibility?:string}} [config] `agsc.config.json`.
 * @param {Array<string>} [routes] the routes the build emits; each version directory
 *   among them gets the immutable `Cache-Control` of AGSC-06-06, and `/query/index.html`
 *   with a `.wasm` file under `/query/` among them gives `/query/*` the policy of AGSC-06-39.
 * @returns {Array<{route:string, headers:Array<[string,string]>}>}
 */
function headerSets(config = {}, routes = []) {
  const restricted = config.visibility === 'restricted';
  // AGSC-06-17 (as amended): ONE set per address pattern, in the order the patterns
  // first occur. The reference host serves only one of two blocks written for the
  // same pattern, so the CORS pair and the content type of an address written as two
  // blocks would lose the CORS one.
  const byRoute = new Map();
  const add = (route, headers) => {
    if (!byRoute.has(route)) byRoute.set(route, []);
    byRoute.get(route).push(...headers);
  };
  add('/*', SITE_WIDE);
  // AGSC-06-17, AGSC-11-20: a host that adds the wildcard by default is told to drop it;
  // the discovery document's own block, which follows, attaches it again.
  if (restricted) add('/*', [['!', 'Access-Control-Allow-Origin']]);
  // AGSC-11-05: the discovery link as a response header, on the Bundle IRI; AGSC-06-40 adds the
  // Signposting links to the same field, so the block of `/` stays one block (AGSC-06-17).
  add('/', [['Link', homeLinkField(config, routes)]]);
  // AGSC-11-20: a restricted node serves the discovery document publicly and
  // applies the wildcard to NOTHING else.
  for (const route of (restricted ? [WELLKNOWN_PATH] : PUBLIC_ARTEFACTS)) add(route, CORS);
  for (const [route, type] of CONTENT_TYPES) {
    const headers = [['Content-Type', type]];
    if (route === WELLKNOWN_PATH) {
      // AGSC-11-04: the profile, primarily on the media type and secondarily as a
      // header; a consumer MUST accept either.
      headers.push(['Link', visibility.PROFILE_LINK_HEADER]);
    }
    if (NO_CACHE.includes(route)) headers.push(['Cache-Control', 'no-cache']);
    add(route, headers);
  }
  // AGSC-06-34, AGSC-06-42, AGSC-06-37: the files written on a condition, public artefacts, where the build wrote them.
  for (const [route, type] of OPT_IN_FILES.filter(([one]) => routes.includes(one))) {
    add(route, [...(restricted ? [] : CORS), ['Content-Type', type]]);
  }
  // AGSC-07-19: the skills index, served as the type the discovery document declares for it.
  if (routes.includes(SKILLS_INDEX)) add(SKILLS_JSON[0], [['Content-Type', SKILLS_JSON[1]]]);
  // AGSC-06-06: the versioned copies never change; no other address of `/ns/` gets the value.
  for (const version of versionDirectories(routes)) add(`/ns/${version}/*`, [['Cache-Control', IMMUTABLE]]);
  // AGSC-06-39, AGSC-06-17: one policy on `/query/` and the files under it. The host joins
  // the values of two rules that set the same header, and two policies are both enforced,
  // so the block detaches the site-wide policy before it sets its own. The rule admits
  // 'wasm-unsafe-eval' for an engine compiled to WebAssembly only, so a page without one
  // keeps the site-wide policy and gets no block.
  if (routes.includes(QUERY_PAGE) && routes.some(queryWasm)) add('/query/*', [['!', 'Content-Security-Policy'], ['Content-Security-Policy', QUERY_SECURITY_POLICY]]);
  return [...byRoute].map(([route, headers]) => ({ route, headers: headers.map(([k, v]) => [k, v]) }));
}

/** `_headers`, generated (AGSC-06-04). */
function headersFile(config = {}, routes = []) {
  // A detach line is `! Name` (AGSC-06-17); every other line is `Name: value`.
  const line = ([k, v]) => (k === '!' ? `  ! ${singleLine(v)}` : `  ${singleLine(k)}: ${singleLine(v)}`);
  const blocks = headerSets(config, routes).map(({ route, headers }) => [
    singleLine(route), ...headers.map(line),
  ].join('\n'));
  return `# Generated by agsc build — never hand-edited (AGSC-06-04).\n${blocks.join('\n\n')}\n`;
}

/**
 * `_redirects`, generated (AGSC-06-04, AGSC-06-17). The legacy discovery alias
 * (AGSC-06-17, a SHOULD) is present; a renamed or superseded
 * slug adds one entry per `aliases[]` value.
 *
 * @param {Array<{from:string, to:string, status?:number}>} [renames]
 * @returns {string}
 */
function redirectsFile(renames = []) {
  const lines = [
    '# Generated by agsc build — never hand-edited (AGSC-06-04).',
    '# The 0.0.x discovery path (AGSC-06-17).',
    `${WELLKNOWN_ALIAS} ${WELLKNOWN_PATH} 301`,
  ];
  // AGSC-02-24: `_redirects` is one rule per LINE. `from` and `to`
  // are derived from slugs, which AGSC-01-10 already bounds, but the file is a
  // line-oriented surface and a writer neutralises what it puts on a line.
  for (const r of renames) lines.push(`${singleLine(r.from)} ${singleLine(r.to)} ${r.status == null ? 301 : r.status}`);
  return `${lines.join('\n')}\n`;
}

module.exports = {
  headerSets,
  homeLinks,
  homeLinkField,
  headersFile,
  redirectsFile,
  etag,
  CORS,
  NO_CACHE,
  PUBLIC_ARTEFACTS,
  SECURITY_POLICY,
  QUERY_SECURITY_POLICY,
  IMMUTABLE,
};
