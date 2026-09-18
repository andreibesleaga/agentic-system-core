'use strict';
// CONTEXT Distribution (Emission) — the build use case.
// Implements AGSC-06-01 (the route set), AGSC-06-02/04 (the machine views and the
// generated `_headers`, `_redirects` and `/404.html`), AGSC-06-16/21 (the index and
// its shards), AGSC-06-19 (`sitemap.xml`), AGSC-06-18 (the three licence dialects),
// AGSC-06-26…31 (the chunk export), AGSC-08-20 (the ledger written ONLY into the
// build output), AGSC-10-13 (the boards) and AGSC-04-01/02/04/07/09 (determinism:
// LF, NFC, JCS, `SOURCE_DATE_EPOCH`, byte-identical rebuilds).
//
// Distribution READS the other contexts' results and ADDS NOTHING to the content.
// Everything that reaches a file does so through the injected FileSystem port, and
// the build instant through the Clock port — this module never imports an adapter.
//
// Two collaborators may be REPLACED through `options` — `options.render` (the
// Markdown renderer) and `options.graph` (the RDF views) — because a port in
// another language substitutes its own; the defaults are this engine's
// `knowledge/markdown.js` (WP-10-C) and `knowledge/jsonld.js` / `nquads.js` /
// `turtle.js` (WP-10-D). Passing `null` for either omits the routes it produces and
// names them in the result's `skipped`, so a caller can never mistake a partial
// build for a complete one.

const { createHash } = require('node:crypto');
const { canonicalize } = require('../knowledge/jcs.js');
const { nfc, compareCodePoint } = require('../knowledge/unicode.js');
const { finding } = require('../knowledge/validate.js');
const chunks = require('../knowledge/chunks.js');
const markdown = require('../knowledge/markdown.js');
const jsonldView = require('../knowledge/jsonld.js');
const nquadsView = require('../knowledge/nquads.js');
const turtleView = require('../knowledge/turtle.js');
const ledgerModule = require('../governance/ledger.js');
const boardsModule = require('../governance/boards.js');
const discovery = require('./discovery.js');
const llms = require('./llms.js');
const search = require('./search.js');
const headers = require('./headers.js');
const now = require('./now.js');
const html = require('./html.js');

const { TYPE_PLURAL, TERMS, EXCLUDED_STATUS } = chunks;

/** AGSC-01-19: the default of `build.out`. */
const DEFAULT_OUT = 'www/';

/**
 * The four RDF views of AGSC-05, as one collaborator. `sha256` is injected into the
 * dataset builder because the Knowledge context hashes but never reads (AGSC-05-29).
 */
const DEFAULT_GRAPH = Object.freeze({
  jsonld: (items, options) => jsonldView.toJsonLd(items, options),
  nquads: (items, options) => nquadsView.toNQuads(items, options),
  turtle: (items, options) => turtleView.toTurtle(items, options),
  context: (options) => jsonldView.context(options.ontologyTerms || [], jsonldView.allExternalProperties()),
});

/** AGSC-04-04 / AGSC-04-07: JSON artefacts are JCS-canonical with one trailing LF. */
function jsonBytes(value) {
  return `${canonicalize(value)}\n`;
}

/**
 * AGSC-06-19, second half (F27-08): the Schema.org JSON-LD an item or index page
 * MUST embed. The rule names exactly three types and no members, so exactly three
 * types are emitted and nothing is invented: a `concept` item is a `DefinedTerm`,
 * every other item is a `TechArticle`, and an index route is the `Dataset` its
 * entries belong to. The object is serialised with JCS, so the bytes are
 * reproducible (AGSC-04-04, AGSC-06-19's `lastmod` neighbour), and `<` is escaped
 * as `\u003c` — still valid JSON — so no title can close the script element
 * (AGSC-06-05: nothing executable reaches a page).
 */
const SCHEMA_ORG = 'https://schema.org';

function schemaOrg(value) {
  return canonicalize(value).split('<').join('\\u003c');
}

/** AGSC-04-07: UTF-8, LF, NFC, exactly one trailing LF. */
function textBytes(text) {
  return nfc(String(text).split('\r\n').join('\n')).replace(/\n*$/u, '\n');
}

/**
 * The flat item record every surface of this package reads — the frontmatter keys
 * beside `slug`, `type`, `body` and `path`. The loaded Item of the module contract
 * nests its frontmatter; the conformance vectors carry it flat. One shape reaches
 * the emitters, and it is this one.
 * @param {object} item
 * @returns {object}
 */
function flatten(item) {
  if (item == null || item.frontmatter == null) return item;
  return {
    ...item.frontmatter, body: item.body, path: item.path, slug: item.slug, type: item.type,
  };
}

/** AGSC-06-30 / AGSC-11-22 / AGSC-01-20: the published set, used by every surface. */
function publishedItems(items, releases) {
  return (items || []).map(flatten).filter((item) => chunks.isPublished(item, releases));
}

/** AGSC-05-01: `<site.base>/<type-plural>/<slug>/`. */
function routeOf(item) {
  const plural = TYPE_PLURAL[item.type] || TYPE_PLURAL.concept;
  return `/${plural}/${item.slug}/`;
}

/**
 * AGSC-06-19: `sitemap.xml` lists every published route with `lastmod` from the
 * build instant, ordered by URL.
 */
function sitemap(base, routes, instant) {
  const urls = [...routes].sort(compareCodePoint).map((route) => `  <url><loc>${discovery.href(base, route)}</loc><lastmod>${instant}</lastmod></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

/** AGSC-06-18, dialect 1: the AI-usage signals of `robots.txt` (RFC 9309). */
function robots(base) {
  return `User-agent: *\n# Content Signals Policy: the same policy as /.well-known/tdmrep.json and /legal/\n`
    + `Content-Signal: search=yes, ai-input=yes, ai-train=no\nAllow: /\n\nSitemap: ${discovery.href(base, '/sitemap.xml')}\n`;
}

/** AGSC-06-18, dialect 2: the TDM reservation, at its well-known location only. */
function tdmrep(base) {
  return [{ location: `${String(base).replace(/\/+$/u, '')}/`, 'tdm-reservation': 1 }];
}

/** RFC 9116: the one security file that is a route (AGSC-06-01, PRD-047). */
function securityTxt(base, expires) {
  return `Policy: ${discovery.href(base, '/legal/')}\nExpires: ${expires}\nPreferred-Languages: en\n`;
}

/** AGSC-06-02: the two machine views of an item. */
function pageMarkdown(item) {
  return textBytes(item.body == null ? '' : item.body);
}

/**
 * AGSC-06-21: "a writer MUST paginate any index route carrying more than 500
 * entries as `/<route>/page-<n>/` (`<n>` from `2`; page 1 is the route
 * itself)". The bound is the same 500 that shards `search.json` and
 * `chunks.jsonl`, so it is stated once, in `distribution/search.js`.
 *
 * @param {Array<object>} entries the index's entries, already ordered.
 * @param {number} [perPage]
 * @returns {Array<{route:string, entries:Array<object>}>} page 1 first.
 */
function paginate(route, entries, perPage = search.ITEMS_PER_SHARD) {
  if (entries.length <= perPage) return [{ entries, route }];
  const pages = [];
  for (let i = 0; i < entries.length; i += perPage) {
    const n = pages.length + 1;
    pages.push({ entries: entries.slice(i, i + perPage), route: n === 1 ? route : `${route}page-${n}/` });
  }
  return pages;
}

/**
 * AGSC-06-01 names routes this milestone does not produce. Each one is listed
 * here with the reason, and `build` puts every one of them into `skipped`, so
 * a caller can never mistake an absent route for a complete emission
 * (WP-10-G, 2026-09-18).
 */
const UNPRODUCED_ROUTES = Object.freeze([
  ['/compose/', 'no module renders the saved-composition page yet (AGSC-02-97, AGSC-07-24)'],
  ['/skills/, /skills/index.json, /skills/<cluster>/SKILL.md',
    'the seven Harness files of AGSC-07-12 are not written at this milestone (WP-11)'],
  ['/specs/, /specs/agentic-knowledge/, /specs/mcp/',
    'the published specification pages are the site repository\'s, not the engine\'s (AGSC-06-01)'],
  ['/about/, /legal/, /changelog/',
    'these three pages are authored, not derived; no rule pins their bytes (AGSC-06-01)'],
  ['/feed.xml', 'no rule pins the feed bytes; `build.feed` has nothing to switch on yet (AGSC-06-01)'],
  ['/attachments/<slug>/<file>',
    'the served bytes are the hashed bytes of AGSC-05-29 and reach `build` through no port (AGSC-02-98)'],
  ['/graph/fragments/**',
    'OPTIONAL at 1.x; `knowledge/nquads.js#shard` produces them and no rule requires the route (AGSC-06-33)'],
  ['/<type-plural>/<slug>/<lang>/', 'no language variant exists in this Bundle (AGSC-01-13)'],
]);

/**
 * Build a Bundle into a deterministic file map.
 *
 * @param {object} bundle `{root, config, index:{frontmatter, body}, items, findings}`.
 * @param {object} ports `{fs, clock, proc}` — injected, never imported.
 * @param {object} [options]
 * @param {string} options.specVersion
 * @param {string} options.version the engine version, for the ledger's build actor.
 * @param {number} [options.level] the conformance Level of the emission (default 2).
 * @param {(body:string)=>{html:string, headings:Array<object>}} [options.render] C's renderer.
 * @param {{jsonld:Function, nquads:Function, turtle:Function}} [options.graph] D's views.
 * @param {Array<object>} [options.gitLog] the AGSC-08-20b git-log file.
 * @param {string} [options.contentTree] the git tree hash of `content/`.
 * @returns {{files:Map<string,string>, findings:Array<object>, skipped:Array<string>}}
 */
function build(bundle, ports, options = {}) {
  const config = bundle.config || {};
  const site = config.site || {};
  const base = String(site.base || '').replace(/\/+$/u, '');
  const level = options.level == null ? 2 : Number(options.level);
  // AGSC-10-02 / AGSC-10-04: a Level-0 publisher emits the four Level-0 artefacts
  // and nothing this specification asks only of a writer.
  const full = level >= 2;
  const licenseProse = (config.bundle && config.bundle.license_prose) || TERMS;
  const specVersion = options.specVersion;
  const instant = ports.clock.iso === undefined ? ledgerModule.instantFromEpoch(ports.clock.now()) : ports.clock.iso();
  const files = new Map();
  const findings = [...(bundle.findings || [])];
  const skipped = [];
  const put = (route, text) => files.set(route, text);

  const items = publishedItems(bundle.items, config.releases);
  const allItems = (bundle.items || []).map(flatten);
  const indexFrontmatter = (bundle.index && bundle.index.frontmatter) || {};

  // ------------------------------------------------------------ text surfaces
  const llmsBundle = {
    base: `${base}/`,
    title: site.title == null ? indexFrontmatter.title : site.title,
    description: indexFrontmatter.description,
    license_prose: licenseProse,
    clusters: items.filter((i) => i.type === 'cluster').map((c) => ({ slug: c.slug, title: c.title })),
    items,
  };
  const llmsOptions = { generatedAt: instant, specVersion, terms: TERMS };
  put('/llms.txt', llms.llmsTxt(llmsBundle, llmsOptions));
  put('/llms-full.txt', llms.llmsFullTxt(llmsBundle, llmsOptions));

  // ------------------------------------------------------------ search (AGSC-06-16/21)
  // Every published item, clusters included: AGSC-06-16 names no exclusion of its
  // own, and AGSC-06-30's published set is the status one `publishedItems` applied.
  for (const file of search.files(items).files) put(file.path, jsonBytes(file.value));

  // ------------------------------------------------------------ chunks (AGSC-06-26…31)
  // "A Level ≥ 2 writer MUST emit /chunks.jsonl" — a Level-0 publisher emits none.
  const chunkRecords = !full ? [] : chunks.records(items, {
    base: `${base}/`,
    maxBytes: (config.chunks || {}).max_bytes,
    license: licenseProse,
    attachmentBytes: options.attachmentBytes,
    releases: config.releases,
  }).records;
  if (full) for (const file of chunks.files(chunkRecords, canonicalize).files) put(file.path, file.text);

  // ------------------------------------------------------------ boards (AGSC-10-13)
  const board = boardsModule.boards(full ? allItems : [], { base: `${base}/`, generatedAt: instant, gitLog: options.gitLog });
  if (board.index !== null) {
    put('/boards/index.json', jsonBytes(board.index));
    for (const one of board.boards) put(one.path, jsonBytes(one.board));
  }
  findings.push(...boardsModule.wipLimit(allItems, config));

  // ------------------------------------------------------------ ledger (AGSC-08-20)
  let ledgerHead = null;
  if (full && options.gitLog !== undefined && options.contentTree !== undefined) {
    const derived = ledgerModule.derive(options.gitLog, options.contentTree, options.version,
      { epoch: ports.clock.now() });
    put('/ledger.jsonl', derived.ledger);
    ledgerHead = derived.head;
  } else {
    skipped.push(full
      ? '/ledger.jsonl (no git-log file was supplied; AGSC-08-20a)'
      : '/ledger.jsonl (a Level-0 publisher has no ledger; AGSC-06-08a)');
  }

  // ------------------------------------------------------------ NOW (AGSC-06-22)
  const nowState = now.state(items, config, { instant, allItems });
  const nowMd = now.nowMarkdown(nowState);
  if (full) put('/now.md', nowMd);

  // ------------------------------------------------------------ RDF views (D)
  const graph = options.graph === undefined ? DEFAULT_GRAPH : options.graph;
  const graphView = {
    base: `${base}/`,
    lang: (config.i18n || {}).default,
    bundle: {
      id: (config.bundle || {}).id,
      license_prose: licenseProse,
      spec_version: specVersion,
    },
    attachmentBytes: options.attachmentBytes,
    sha256: (bytes) => createHash('sha256').update(bytes).digest('hex'),
    ontologyTerms: options.ontologyTerms,
    // AGSC-06-32: a JSON-LD view names `/ns/context.jsonld` as its `@context`
    // ONLY at Level >= 2, where this build actually emits that file; a Level-0
    // emission would otherwise point at a URL it does not serve (WP-10-G).
    ...(full && graph !== null && typeof graph.context === 'function'
      ? { contextUrl: discovery.href(base, '/ns/context.jsonld') }
      : {}),
  };
  if (graph !== null) {
    const view = graphView;
    // AGSC-10-02: `/graph.jsonld` is a Level-0 artefact; the other three views and
    // the context file are AGSC-10-04's, so a Level-0 emission omits them.
    if (typeof graph.jsonld === 'function') put('/graph.jsonld', jsonBytes(graph.jsonld(items, view)));
    if (full && typeof graph.nquads === 'function') put('/graph.nq', textBytes(graph.nquads(items, view)));
    if (full && typeof graph.turtle === 'function') put('/graph.ttl', textBytes(graph.turtle(items, view)));
    if (full && typeof graph.context === 'function') put('/ns/context.jsonld', jsonBytes(graph.context(view)));
  } else {
    skipped.push('/graph.jsonld, /graph.nq, /graph.ttl, /ns/context.jsonld (the RDF views were switched off)');
  }
  if (full && graph !== null && typeof graph.context !== 'function') {
    skipped.push('/ns/context.jsonld (no context generator was supplied; AGSC-06-32)');
  }

  // ------------------------------------------------------------ per-item views
  // AGSC-06-02: an item has TWO machine views, `/pages/<slug>.md` and
  // `/pages/<slug>.jsonld`; the second is the same JSON-LD the graph carries,
  // restricted to that one item (WP-10-G wired it, AGSC-06-01).
  if (full) {
    for (const item of items) put(`/pages/${item.slug}.md`, pageMarkdown(item));
    if (graph !== null && typeof graph.jsonld === 'function') {
      for (const item of items) put(`/pages/${item.slug}.jsonld`, jsonBytes(graph.jsonld([item], graphView)));
    } else {
      skipped.push('/pages/<slug>.jsonld (the RDF views were switched off; AGSC-06-02)');
    }
  }

  // ------------------------------------------------------------ licence dialects
  put('/robots.txt', robots(base));
  put('/.well-known/tdmrep.json', jsonBytes(tdmrep(base)));
  put('/.well-known/security.txt', securityTxt(base, instant));

  // ------------------------------------------------------------ discovery document
  const digests = {};
  for (const [route, text] of files) digests[route] = discovery.digestOf(text);
  const wellknown = discovery.linkset(config, {
    level,
    ledgerHead,
    digests,
    counts: discovery.countsOf(items),
    generatedAt: instant,
    specVersion,
    bundleHash: discovery.digestOf(canonicalize([...files.keys()].sort(compareCodePoint).map((k) => [k, digests[k]]))),
    // AGSC-11-16: the declaration is DERIVED from what the writer actually emits;
    // only the declaration-only surfaces come from configuration.
    routes: [...files.keys()],
    surfaces: [
      ...(files.has('/llms.txt') ? [{ surface: 'llms-txt', target: discovery.href(base, '/llms.txt') }] : []),
      ...(files.has('/chunks.jsonl') ? [{ surface: 'chunks', target: discovery.href(base, '/chunks.jsonl') }] : []),
      ...(Array.isArray(config.surfaces) ? config.surfaces : []),
    ],
  });
  findings.push(...discovery.check(wellknown, { level }));
  put(discovery.WELLKNOWN_PATH, jsonBytes(wellknown));

  // ------------------------------------------------------------ sitemap and headers
  const routes = ['/', ...items.map(routeOf)];
  put('/sitemap.xml', sitemap(base, routes, instant));
  put('/_headers', headers.headersFile(config));
  put('/_redirects', headers.redirectsFile(
    items.flatMap((i) => (Array.isArray(i.aliases) ? i.aliases : [])
      .filter((a) => String(a).startsWith('/'))
      .map((a) => ({ from: String(a), to: routeOf(i) })))
  ));

  // ------------------------------------------------------------ HTML pages (C)
  const render = options.render === undefined ? markdown.render : options.render;
  if (full && typeof render === 'function') {
    const pageOptions = { render, licenseProse, nav: [['/', 'Home'], ['/search/', 'Search']] };
    const entryOf = (i) => ({ href: routeOf(i), title: i.title == null ? i.slug : i.title, description: i.description });
    /** One index route, paginated per AGSC-06-21 above 500 entries. */
    const putIndex = (route, title, description, entries) => {
      for (const page of paginate(route, entries)) {
        const jsonld = schemaOrg({
          '@context': SCHEMA_ORG, '@type': 'Dataset',
          description: description == null ? '' : description,
          name: title == null ? '' : title,
          url: discovery.href(base, page.route),
        });
        put(`${page.route}index.html`, html.indexPage({ description, entries: page.entries, title }, { ...pageOptions, jsonld }));
      }
    };

    for (const item of items) {
      const canonical = discovery.href(base, routeOf(item));
      const name = item.title == null ? item.slug : item.title;
      const jsonld = schemaOrg(item.type === 'concept'
        ? {
          '@context': SCHEMA_ORG, '@type': 'DefinedTerm',
          description: item.description == null ? '' : item.description, name, url: canonical,
        }
        : {
          '@context': SCHEMA_ORG, '@type': 'TechArticle',
          description: item.description == null ? '' : item.description, headline: name, url: canonical,
        });
      put(`${routeOf(item)}index.html`, html.itemPage(item, { ...pageOptions, canonical, jsonld }));
    }
    // AGSC-06-01: `/` is the Bundle's own index route.
    putIndex('/', site.title == null ? indexFrontmatter.title : site.title,
      indexFrontmatter.description, items.map(entryOf));
    for (const plural of [...new Set(items.map((i) => TYPE_PLURAL[i.type] || TYPE_PLURAL.concept))].sort(compareCodePoint)) {
      putIndex(`/${plural}/`, plural, `Every ${plural} item of this node.`,
        items.filter((i) => (TYPE_PLURAL[i.type] || TYPE_PLURAL.concept) === plural).map(entryOf));
    }
    // AGSC-06-01: `/tags/<tag>/`, one index route per tag actually used.
    const tags = new Map();
    for (const item of items) {
      for (const tag of Array.isArray(item.tags) ? item.tags : []) {
        if (!tags.has(String(tag))) tags.set(String(tag), []);
        tags.get(String(tag)).push(entryOf(item));
      }
    }
    for (const tag of [...tags.keys()].sort(compareCodePoint)) {
      putIndex(`/tags/${tag}/`, tag, `Every item tagged "${tag}".`, tags.get(tag));
    }
    // AGSC-06-01: `/search/` is the page whose data is `/search.json`.
    putIndex('/search/', 'Search', 'The index of this node is /search.json.', items.map(entryOf));
    put('/now/index.html', html.nowPage(nowMd, pageOptions));
    put('/404.html', html.notFoundPage(pageOptions));
  } else {
    skipped.push(full
      ? 'every HTML route (the Markdown renderer was switched off)'
      : 'every HTML route (AGSC-10-02 asks a Level-0 publisher for no generated page)');
  }

  // ------------------------------------------------------------ AGSC-06-01 routes with no producer
  if (full) for (const [route, why] of UNPRODUCED_ROUTES) skipped.push(`${route} (${why})`);

  // AGSC-04-01: one deterministic order, independent of insertion order.
  const ordered = new Map([...files.keys()].sort(compareCodePoint).map((k) => [k, files.get(k)]));
  return { files: ordered, findings, skipped, state: nowState, ledgerHead };
}

/**
 * Write a build through the FileSystem port. Routes are site-absolute; the port's
 * root is `build.out` (AGSC-01-19), and `/` is the separator on every platform.
 *
 * @param {Map<string,string>} files
 * @param {object} ports `{fs}`
 * @returns {Array<string>} the written paths, in order.
 */
function write(files, ports) {
  const written = [];
  for (const [route, text] of files) {
    const path = route.replace(/^\//u, '').replace(/\/$/u, '/index.html');
    const at = path.lastIndexOf('/');
    if (at !== -1) ports.fs.mkdirp(path.slice(0, at));
    ports.fs.writeFile(path, text);
    written.push(path);
  }
  return written;
}

/**
 * AGSC-04-02: build twice and compare bytes. A difference is `AGSC-E602` — the
 * build is not byte-reproducible, which no amount of testing downstream can repair.
 *
 * @param {object} bundle
 * @param {object} ports
 * @param {object} [options]
 * @returns {Array<object>} Findings; empty means the build is reproducible.
 */
function verify(bundle, ports, options = {}) {
  const first = build(bundle, ports, options).files;
  const second = build(bundle, ports, options).files;
  const out = [];
  const keys = new Set([...first.keys(), ...second.keys()]);
  for (const key of [...keys].sort(compareCodePoint)) {
    if (first.get(key) !== second.get(key)) {
      out.push(finding('AGSC-E602', `two builds of one Bundle differ at ${key} (AGSC-04-02)`, { file: key }));
    }
  }
  return out;
}

module.exports = {
  build, write, verify, routeOf, sitemap, robots, tdmrep, securityTxt,
  publishedItems, jsonBytes, textBytes, paginate,
  DEFAULT_OUT, EXCLUDED_STATUS, UNPRODUCED_ROUTES,
};
