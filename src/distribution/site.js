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
const { nfc, compareCodePoint, singleLine } = require('../knowledge/unicode.js');
const { finding } = require('../knowledge/validate.js');
const chunks = require('../knowledge/chunks.js');
const linksModule = require('../knowledge/links.js');
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
const composePage = require('./compose-page.js');
const webmcp = require('./webmcp.js');
const browserBundle = require('../composition/browser.js');

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

/** The Bundle-relative path of an item, derived when the record carries none. */
function pathOf(item) {
  if (typeof item.path === 'string' && item.path !== '') return item.path;
  return `content/${TYPE_PLURAL[item.type] || TYPE_PLURAL.concept}/${item.slug}.md`;
}

/**
 * AGSC-03-11 + AGSC-06-01 (added at rc.5, FV28-04): map ONE item's body references
 * onto the routes this build emits.
 *
 * A body reference is authored in the BUNDLE's geometry — `content/concepts/a.md`
 * reaches `content/concepts/b.md` as `b`, `b.md` or `../concepts/b.md`, which is the
 * normal form AGSC-03-12 normalises a wikilink to — and the page is served in the
 * ROUTE geometry, where `/concepts/a/` reaches `/concepts/b/` as `../b/`. The two
 * geometries are different, so NO authored spelling resolves in both, and a writer
 * that copied the authored target into the page emitted a link to nothing. That is
 * FV28-04: `agsc lint` passed (AGSC-03-11 was satisfied), and the page 404ed.
 *
 * The mapping is total and conservative:
 *   * an external target (AGSC-03-11: "never resolved at build time"), a
 *     fragment-only target and a query-only target are returned unchanged;
 *   * a target that resolves to a PUBLISHED item becomes that item's route plus the
 *     fragment it carried;
 *   * anything else — an asset under `content/assets/` (AGSC-06-01 emits no route
 *     for one), a draft or release-gated item (AGSC-06-30), a target that resolves
 *     to nothing — is returned unchanged, and the dangling-link guard below reports
 *     it as `AGSC-E901`. A writer never invents a route.
 *
 * @param {object} item the flattened item whose body is being rendered.
 * @param {Map<string,object>} byPath every PUBLISHED item, by Bundle-relative path.
 * @returns {(target:string)=>(string|null)} `null` means "leave it alone".
 */
function bodyHrefResolver(item, byPath) {
  const fromDir = linksModule.dirOf(pathOf(item));
  return (target) => {
    const raw = String(target);
    if (raw === '' || raw.startsWith('#') || raw.startsWith('?')) return null;
    if (linksModule.isExternalTarget(raw)) return null;
    if (raw.startsWith('/')) return null;
    const hash = raw.indexOf('#');
    const relative = hash < 0 ? raw : raw.slice(0, hash);
    const fragment = hash < 0 ? '' : raw.slice(hash);
    if (relative === '') return null;
    if (linksModule.bodyPathError(relative, fromDir) !== null) return null;
    const resolved = linksModule.resolveInside(fromDir, relative);
    // AGSC-03-11 as amended at rc.5 (R-04): `<slug>` and `<slug>.md` name the same
    // item, and the extension-less form is what wikilink normalisation produces.
    const target1 = byPath.get(resolved) || byPath.get(`${resolved}.md`);
    if (target1 === undefined) return null;
    return `${routeOf(target1)}${fragment}`;
  };
}

/**
 * AGSC-06-19: `sitemap.xml` lists every published route with `lastmod` from the
 * build instant, ordered by URL.
 */
function sitemap(base, routes, instant) {
  const urls = [...routes].sort(compareCodePoint).map((route) => `  <url><loc>${discovery.href(base, route)}</loc><lastmod>${instant}</lastmod></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

/**
 * AGSC-06-18, dialect 1: the AI-usage signals of `robots.txt` (RFC 9309). The
 * comment names `/legal/` only when the build emits it (V9D-A6): a file that points
 * at a route the same build does not produce is a dangling link whichever dialect
 * carries it.
 */
function robots(base, options = {}) {
  const legal = options.legal === undefined ? true : Boolean(options.legal);
  const policy = legal
    ? 'the same policy as /.well-known/tdmrep.json and /legal/'
    : 'the same policy as /.well-known/tdmrep.json';
  // AGSC-02-24 (rc.5, FV28-01): RFC 9309 is line-oriented — a line break in `base`
  // would forge a directive. `base` is pattern-bounded by AGSC-01-19; the writer
  // neutralises anyway, because a writer may receive a configuration it did not
  // validate.
  return `User-agent: *\n# Content Signals Policy: ${policy}\n`
    + `Content-Signal: search=yes, ai-input=yes, ai-train=no\nAllow: /\n\nSitemap: ${singleLine(discovery.href(base, '/sitemap.xml'))}\n`;
}

/** AGSC-06-18, dialect 2: the TDM reservation, at its well-known location only. */
function tdmrep(base) {
  return [{ location: `${String(base).replace(/\/+$/u, '')}/`, 'tdm-reservation': 1 }];
}

/**
 * RFC 9116: the one security file that is a route (AGSC-06-01, PRD-047). `Policy`
 * is OPTIONAL in RFC 9116, so it is emitted only when `/legal/` exists — a `Policy`
 * naming a 404 is worse than no `Policy` at all (V9D-A6).
 */
function securityTxt(base, expires, options = {}) {
  const legal = options.legal === undefined ? true : Boolean(options.legal);
  // RFC 9116 is line-oriented in the same way (AGSC-02-24, rc.5, FV28-01).
  const policy = legal ? `Policy: ${singleLine(discovery.href(base, '/legal/'))}\n` : '';
  return `${policy}Expires: ${singleLine(expires)}\nPreferred-Languages: en\n`;
}

/** AGSC-06-02: the two machine views of an item. */
function pageMarkdown(item) {
  return textBytes(item.body == null ? '' : item.body);
}

/**
 * AGSC-01-26 / AGSC-06-18: the Bundle's own `LICENSE-CONTENT`, the bytes `/legal/`
 * publishes. Read through the injected port — the file is in the Bundle root, which
 * is exactly what the port is rooted at — and `null` when there is none, because
 * its wording is an owner decision outside this specification and a writer may
 * never invent it.
 */
function readLicenseContent(ports) {
  const fs = ports && ports.fs;
  if (!fs || typeof fs.readFile !== 'function') return null;
  try {
    if (typeof fs.exists === 'function' && !fs.exists('LICENSE-CONTENT')) return null;
    const text = String(fs.readFile('LICENSE-CONTENT', 'utf8'));
    return text.trim() === '' ? null : text;
  } catch (e) {
    // Absent, unreadable or outside the root: all three mean "no terms text here".
    return null;
  }
}

/**
 * AGSC-01-07 / AGSC-02-13: the `.diagram` SOURCE of one item, read through the
 * FileSystem port. The compiler and the allow-list live in `html.js#diagramFigure`,
 * which is a pure template and owns no port; this function is the port read and
 * nothing else. A missing or unreadable source yields `null`, and `html.js` then
 * emits no figure — the page keeps its prose. The compiled `.svg` is NEVER written
 * to a route (AGSC-06-01's route set carries none).
 */
/**
 * AGSC-06-01 / AGSC-02-98 / AGSC-01-34: the bytes of `/attachments/<slug>/<file>`.
 *
 * Settled at rc.5 (work-order item 28). The route is in AGSC-06-01's route set and
 * AR2-23 makes the served bytes "the hashed bytes of AGSC-05-29" — the authored file
 * at `content/attachments/<slug>/<file>` — so the writer MUST produce it. Until now
 * `site.js` listed it as unproduced with the reason "reaches `build` through no
 * port", which was never true: `build` holds the FileSystem port, and the same file
 * is already read through it by `verbs/_helpers.js#attachmentFacts` for the
 * injection scan. The consequence was an `AGSC-E901` on every page carrying an
 * attachment, because `html.js` links each one as an `<img src="/attachments/…">` —
 * the eight ENG-1 saw under `--attach-diagrams`.
 *
 * The file is read as a Buffer, not as text: an attachment may be any media type
 * AGSC-02-98 admits, and re-encoding one through a string would change its bytes and
 * break the AGSC-01-34 digest comparison.
 */
function readAttachment(ports, slug, file) {
  const fs = ports && ports.fs;
  if (!fs || typeof fs.readFile !== 'function') return null;
  const path = `content/attachments/${slug}/${file}`;
  try {
    if (typeof fs.exists === 'function' && !fs.exists(path)) return null;
    return fs.readFile(path);
  } catch (e) {
    // Absent, unreadable or outside the root. AGSC-01-34 reports the absence as
    // AGSC-E413 from the lint lane; this function invents no bytes.
    return null;
  }
}

function readDiagramSource(ports, slug) {
  const fs = ports && ports.fs;
  if (!fs || typeof fs.readFile !== 'function') return null;
  const path = `content/diagrams/${slug}.diagram`;
  try {
    if (typeof fs.exists === 'function' && !fs.exists(path)) return null;
    return String(fs.readFile(path, 'utf8'));
  } catch (e) {
    return null;
  }
}

/**
 * AGSC-06-21, the half no writer measured (V9D-A1): "Budgets are normative and MUST
 * fail the build when exceeded: ≤100 KB per HTML page; ≤1 MB per index document;
 * ≤60 s build per 500 items … Exceeding a budget that no sharding rule relieves MUST
 * fail the build." (Three budgets since rc.5, ENG1-01; four until then.)
 *
 * All three byte/scale budgets are MEASURED here. The rule says a breach MUST FAIL the build, and
 * `spec/09-conformance.md` §9.4 registers NO code for a budget breach — so the
 * measurement is reported under `AGSC-E904`, the size-cap code, whose registry row
 * names AGSC-01-16 and AGSC-01-34 and not this rule. That is a compromise and it is
 * stated as one: inventing `AGSC-E6nn` would breach AGSC-09-15, and dropping the
 * measurement would leave a second silent MUST after F27-08. The missing
 * registration is on the specification items list.
 *
 * `KB` is read as 1000 bytes: the rule writes `KB`, not `KiB`, and AGSC-01-16
 * spells `1 MiB` explicitly where it means the binary prefix — so the two rules
 * distinguish them deliberately.
 *
 * The three BYTE budgets are measured here, where the bytes are. The fourth is a
 * DURATION, and a duration is a wall-clock measure: measuring it inside `build`
 * would make a finding depend on how busy the machine is, which is exactly the
 * flaky test this project forbids and would break `verify`'s byte comparison. It is
 * therefore `timeBudget()`, which the CLI calls with the elapsed time it measured.
 *
 * @param {Map<string,string>} files the emitted map.
 * @param {number} publishedCount the published item count.
 * @returns {Array<object>} Findings; empty means every byte budget is met.
 */
const BUDGET_HTML_BYTES = 100000;
/**
 * AGSC-06-21 as amended at rc.5 (ENG1-01): ONE index budget, ≤1 MB — 1,000,000
 * decimal UTF-8 bytes — measured **per index document**, which is `/search.json` at
 * or below 500 items and EACH `/search-<nn>.json` shard above it.
 *
 * It replaces `BUDGET_SEARCH_PER_ITEM_BYTES` (1 KB per published item) and
 * `BUDGET_SEARCH_TOTAL_BYTES` (500 KB absolute), which were wrong twice over: the
 * per-item figure and AGSC-06-23's "the body with fenced code blocks removed" were
 * jointly unsatisfiable for any Bundle of more than roughly 200-word items, and
 * their conjunction made the absolute clause unreachable at any count at or below
 * 407 items. Summing a manifest and ten shards into one number was the third error:
 * a manifest plus ten shards is eleven documents, each of which a reader downloads
 * on its own.
 */
const BUDGET_INDEX_DOC_BYTES = 1000000;
const BUDGET_MS_PER_500_ITEMS = 60000;

/** AGSC-06-21: the routes the index budget measures, one document at a time. */
const INDEX_DOCUMENT_ROUTE = /^\/search(?:-[0-9]+)?\.json$/u;

function budgets(files, publishedCount) {
  const out = [];
  const bytesOf = (text) => Buffer.byteLength(String(text), 'utf8');
  for (const route of [...files.keys()].sort(compareCodePoint)) {
    if (!route.endsWith('.html')) continue;
    const size = bytesOf(files.get(route));
    if (size > BUDGET_HTML_BYTES) {
      out.push(finding('AGSC-E904',
        `${route} is ${size} bytes; AGSC-06-21 budgets 100 KB per HTML page, and no sharding rule relieves a page`,
        { file: route }));
    }
  }
  // One finding per index DOCUMENT that exceeds the bound, in code-point route order,
  // so a build that ships eleven documents reports the ones that are too large and
  // names each. `publishedCount` no longer takes part: the bound is on the artefact.
  for (const route of [...files.keys()].sort(compareCodePoint)) {
    if (!INDEX_DOCUMENT_ROUTE.test(route)) continue;
    const size = bytesOf(files.get(route));
    if (size > BUDGET_INDEX_DOC_BYTES) {
      out.push(finding('AGSC-E904',
        `${route} is ${size} bytes; AGSC-06-21 budgets 1 MB per index document`,
        { file: route }));
    }
  }
  return out;
}

/**
 * AGSC-06-21's fourth budget: "≤60 s build per 500 items". The allowance scales with
 * the Bundle, so the budget is per-scale and a 5,000-item Bundle conforms.
 *
 * @param {number} elapsedMs the wall-clock duration the CALLER measured.
 * @param {number} publishedCount
 * @returns {Array<object>} Findings.
 */
function timeBudget(elapsedMs, publishedCount) {
  if (elapsedMs == null || !Number.isFinite(Number(elapsedMs))) return [];
  const allowed = Math.max(1, Math.ceil(Number(publishedCount) / 500)) * BUDGET_MS_PER_500_ITEMS;
  if (Number(elapsedMs) <= allowed) return [];
  return [finding('AGSC-E904',
    `the build took ${Math.round(Number(elapsedMs))} ms for ${publishedCount} published items; `
    + `AGSC-06-21 budgets ${allowed} ms (60 s per 500 items)`,
    { file: 'agsc.config.json' })];
}

/**
 * The DIRECTORY a relative href on `route` is resolved against — what a browser
 * uses as the base URL. `/a/b/index.html` is served at `/a/b/`, so its base is
 * `/a/b/`; `/pages/x.md` is served at itself, so its base is `/pages/`.
 */
function baseDirOf(route) {
  const r = String(route);
  const withoutIndex = r.endsWith('/index.html') ? r.slice(0, -'index.html'.length) : r;
  return withoutIndex.endsWith('/') ? withoutIndex : withoutIndex.slice(0, withoutIndex.lastIndexOf('/') + 1);
}

/**
 * Resolve a relative site path against a base directory, `/`-separated, with `.`
 * and `..` applied. `null` when it climbs above the site root — which is itself a
 * link to nothing, and is reported as one.
 */
function resolveRelative(baseDir, relative) {
  const out = baseDir.split('/').filter((s) => s !== '');
  for (const segment of String(relative).split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(segment);
  }
  const trailing = String(relative).endsWith('/') || String(relative) === '' ? '/' : '';
  return `/${out.join('/')}${trailing}`;
}

/**
 * Every internal link the emitted HTML, `robots.txt` and `security.txt` carry, with
 * the route each one resolves to. A build that links a route it does not emit ships
 * a dangling internal link — the defect V9D-A6 found on `/legal/` — so this is a
 * function the suite asserts over, not a promise in a comment.
 *
 * RELATIVE hrefs are resolved against the page's own route since rc.5 (FV28-04).
 * Before that this function read site-absolute hrefs only, and the patterns node
 * shipped 186 relative links over 65 targets on 52 pages, not one of which resolved
 * to an emitted route: the guard was blind to exactly the class of link an import
 * produces. External targets (a scheme, a protocol-relative `//`), fragment-only
 * and query-only targets are not internal links and are not collected.
 *
 * @param {Map<string,string>} files
 * @returns {Array<{from:string, href:string, route:(string|null)}>}
 */
function internalLinks(files) {
  const out = [];
  const add = (from, href) => {
    const raw = String(href);
    if (raw === '' || raw.startsWith('#') || raw.startsWith('?')) return;
    if (linksModule.isExternalTarget(raw)) return;
    const clean = raw.split('#')[0].split('?')[0];
    if (clean === '') return;
    out.push({
      from,
      href: raw,
      route: clean.startsWith('/') ? clean : resolveRelative(baseDirOf(from), clean),
    });
  };
  for (const route of [...files.keys()].sort(compareCodePoint)) {
    const text = String(files.get(route));
    if (route.endsWith('.html')) {
      const attribute = /(?:href|src)="([^"]*)"/gu;
      let m = attribute.exec(text);
      while (m !== null) {
        add(route, m[1]);
        m = attribute.exec(text);
      }
    }
    if (route === '/robots.txt' || route === '/.well-known/security.txt') {
      const absolute = /https?:\/\/[^\s]+/gu;
      let m = absolute.exec(text);
      while (m !== null) {
        // The two text dialects carry ABSOLUTE URLs; the path is what must resolve.
        const path = m[0].replace(/^https?:\/\/[^/]*/u, '');
        add(route, path === '' ? '/' : path);
        m = absolute.exec(text);
      }
    }
  }
  return out;
}

/**
 * The emitted route a site-absolute path is served from: `/x/` is `/x/index.html`,
 * `/x.json` is itself. `null` when the build emits nothing for it.
 */
function resolvesTo(files, route) {
  if (route === null || route === undefined) return null;
  if (files.has(route)) return route;
  const asIndex = route.endsWith('/') ? `${route}index.html` : `${route}/index.html`;
  if (files.has(asIndex)) return asIndex;
  return null;
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
  ['/skills/, /skills/index.json, /skills/<cluster>/SKILL.md',
    'the PUBLISHED skill packs of AGSC-07-19 are a different artefact from a Harness\'s'
    + ' per-Procedure SKILL.md (spec/07 §7.4) and belong to the skills package (WP-12)'],
  ['/specs/, /specs/agentic-knowledge/, /specs/mcp/',
    'the published specification pages are the site repository\'s, not the engine\'s (AGSC-06-01)'],
  ['/about/, /changelog/',
    'these two pages are authored, not derived; no rule pins their bytes (AGSC-06-01)'],
  ['/feed.xml',
    'reserved to 1.1 (AGSC-00-20): no 1.0 rule pins a feed\'s bytes, so the route cannot be'
    + ' derived, and `build.feed` is a RESERVED configuration name a 1.0 tool rejects with'
    + ' AGSC-E004 (AGSC-06-01, R-15 at rc.5) — it is not a switch an operator may set'],
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
  // AGSC-10-17 needs the derived `claimed_by` and AGSC-08-28(d) the auto-merge
  // count, so NOW reads the same two derived inputs the boards and the ledger do.
  const nowState = now.state(items, config, {
    allItems,
    claimedBy: boardsModule.claimants(options.gitLog),
    instant,
    ledger: files.get('/ledger.jsonl'),
  });
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
  // AGSC-06-18 / V9D-A6: `/legal/` is derived from the Bundle's own `LICENSE-CONTENT`
  // — "The Content Use Terms text is published at /legal/ … and a distribution
  // without it is incomplete". A Bundle that ships no such file gets no `/legal/`
  // route AND no link to one, in any of the three dialects, so that no build ever
  // emits a dangling internal link.
  const licenseContent = options.licenseContent === undefined
    ? readLicenseContent(ports)
    : options.licenseContent;
  const renderer = options.render === undefined ? markdown.render : options.render;
  const hasLegal = full && typeof renderer === 'function' && licenseContent !== null;
  if (full && licenseContent === null) {
    skipped.push('/legal/ (no LICENSE-CONTENT file in the Bundle root; AGSC-01-26, AGSC-06-18 —'
      + ' the Content Use Terms link is omitted from every page and from both text dialects'
      + ' rather than left dangling)');
  }
  put('/robots.txt', robots(base, { legal: hasLegal }));
  put('/.well-known/tdmrep.json', jsonBytes(tdmrep(base)));
  put('/.well-known/security.txt', securityTxt(base, instant, { legal: hasLegal }));

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
  const render = renderer;
  if (full && typeof render === 'function') {
    const pageOptions = {
      legal: hasLegal, licenseProse, nav: [['/', 'Home'], ['/search/', 'Search'], ['/compose/', 'Compose']], render,
    };
    const entryOf = (i) => ({ href: routeOf(i), title: i.title == null ? i.slug : i.title, description: i.description });
    // FV28-04: only a PUBLISHED item has a route (AGSC-06-30), so only a published
    // item is a rewriting target; a body link to a draft keeps its authored spelling
    // and is reported by the dangling-link guard.
    const publishedByPath = new Map(items.map((i) => [pathOf(i), i]));
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
      // AGSC-02-13 as amended at rc.5: the compiled diagram is inlined in this page
      // and emitted at no route. The source is read here, where the port is; the
      // compile, the AGSC-02-98 allow-list and the `<figure>` are `html.js`'s.
      const diagramSource = item.diagram == null ? null : readDiagramSource(ports, item.slug);
      if (diagramSource !== null) {
        findings.push(...html.diagramFigure(item, diagramSource).findings);
      }
      // AGSC-06-01: every attachment the item names is a route of its own, carrying
      // the authored bytes AGSC-05-29 hashed.
      for (const attachment of (Array.isArray(item.attachments) ? item.attachments : [])) {
        if (!attachment || typeof attachment.file !== 'string') continue;
        const bytes = readAttachment(ports, item.slug, attachment.file);
        if (bytes !== null) put(`/attachments/${item.slug}/${attachment.file}`, bytes);
      }
      // FV28-04: the body's references are rendered as the ROUTES this build emits,
      // never as the authored Bundle paths, which resolve to nothing on the site.
      put(`${routeOf(item)}index.html`, html.itemPage(item, {
        ...pageOptions,
        render: (body) => render(body, { href: bodyHrefResolver(item, publishedByPath) }),
        canonical,
        jsonld,
        ...(diagramSource === null ? {} : { diagramSource }),
      }));
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

    // AGSC-06-18: the Content Use Terms text, from `LICENSE-CONTENT` and nowhere else.
    if (hasLegal) {
      put('/legal/index.html', html.legalPage({
        licenseProse, rendered: render(textBytes(licenseContent)).html, terms: TERMS,
      }, pageOptions));
    }

    // AGSC-06-01 `/compose/` + AGSC-07-01/07-13: the combiner in the browser. The
    // three scripts are same-origin assets of this one route, because AGSC-06-17's
    // `script-src 'self'` admits no inline script.
    put('/compose/index.html', html.composePage({ assets: composePage.ASSETS }, pageOptions));
    put('/compose/agsc-core.js', textBytes(browserBundle.bundle({ specVersion })));
    put('/compose/agsc-compose.js', textBytes(composePage.controller({ licenseProse, specVersion })));
    put('/compose/webmcp.js', textBytes(webmcp.script()));

    // AGSC-10-13 + PUB-3 Q18: the HUMAN board page beside the JSON export.
    // Columns are the nine task states of AGSC-02-99, in their declared order, so
    // a board reads left to right the way the state machine runs.
    const wip = Math.min(...[...(Array.isArray(config.agents) ? config.agents : [])]
      .map((a) => (a.max_claims == null ? boardsModule.DEFAULT_MAX_CLAIMS : Number(a.max_claims)))
      .concat([Number.POSITIVE_INFINITY]));
    for (const one of board.boards) {
      const columns = boardsModule.TASK_STATES
        .map((state) => ({ state, tasks: one.board.tasks.filter((t) => t.state === state) }))
        .filter((column) => column.tasks.length > 0);
      // AGSC-06-19: a board page is an INDEX page — it lists the tasks of one
      // cluster — so it carries the `Dataset` of the three types the rule names.
      put(`/boards/${one.slug}/index.html`, html.boardPage({
        board: { ...one.board, slug: one.slug },
        columns,
        wip: Number.isFinite(wip) ? wip : null,
      }, {
        ...pageOptions,
        canonical: discovery.href(base, `/boards/${one.slug}/`),
        jsonld: schemaOrg({
          '@context': SCHEMA_ORG,
          '@type': 'Dataset',
          description: `Every task of the ${one.board.board} cluster, by state.`,
          name: `Board: ${one.board.board}`,
          url: discovery.href(base, `/boards/${one.slug}/`),
        }),
      }));
    }
  } else {
    skipped.push(full
      ? 'every HTML route (the Markdown renderer was switched off)'
      : 'every HTML route (AGSC-10-02 asks a Level-0 publisher for no generated page)');
  }

  // ------------------------------------------------------------ AGSC-06-01 routes with no producer
  if (full) for (const [route, why] of UNPRODUCED_ROUTES) skipped.push(`${route} (${why})`);

  // AGSC-04-01: one deterministic order, independent of insertion order. The entries
  // are MOVED rather than copied — `new Map([...files].sort())` holds the whole site
  // twice at the moment the build peaks, which at 10 000 items is the difference V9D-H1
  // measured (peak RSS 1 225 MiB). Nothing writes to `files` past this point.
  const orderedKeys = [...files.keys()].sort(compareCodePoint);
  const ordered = new Map();
  for (const key of orderedKeys) {
    ordered.set(key, files.get(key));
    files.delete(key);
  }

  // AGSC-06-21: the three byte budgets, MEASURED (V9D-A1). A breach MUST fail the
  // build, so these are `error` findings and `ci` exits 1 on them.
  findings.push(...budgets(ordered, items.length));

  // Every site-absolute link the build emits MUST resolve to a route the build
  // emits. This is the defect V9D-A6 found on `/legal/`, closed here as a check
  // rather than a habit: a link to nothing is a defect of THIS build, not of the
  // reader who follows it.
  for (const link of internalLinks(ordered)) {
    if (resolvesTo(ordered, link.route) !== null) continue;
    findings.push(finding('AGSC-E901',
      `${link.from} links ${link.href}, and this build emits no route for it (AGSC-06-01)`,
      { file: link.from }));
  }

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
  // Only the DIGEST of the first build is retained, not its bytes: comparing two whole
  // site maps held at once doubles the peak of the largest structure in the process
  // (V9D-H1), and a SHA-256 mismatch is the same fact as a byte mismatch. The digest is
  // computed here, in the host — the Distribution context writes but never hashes on
  // its own account (AGSC-05-29).
  const digest = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');
  const first = new Map();
  for (const [route, text] of build(bundle, ports, options).files) first.set(route, digest(text));
  const second = build(bundle, ports, options).files;
  const out = [];
  const keys = new Set([...first.keys(), ...second.keys()]);
  for (const key of [...keys].sort(compareCodePoint)) {
    const here = first.get(key);
    const there = second.has(key) ? digest(second.get(key)) : undefined;
    if (here !== there) {
      out.push(finding('AGSC-E602', `two builds of one Bundle differ at ${key} (AGSC-04-02)`, { file: key }));
    }
  }
  return out;
}

module.exports = {
  build, write, verify, routeOf, sitemap, robots, tdmrep, securityTxt,
  publishedItems, jsonBytes, textBytes, paginate, readAttachment, readDiagramSource,
  budgets, timeBudget, internalLinks, resolvesTo, readLicenseContent,
  baseDirOf, resolveRelative, bodyHrefResolver,
  BUDGET_HTML_BYTES, BUDGET_INDEX_DOC_BYTES, BUDGET_MS_PER_500_ITEMS,
  DEFAULT_OUT, EXCLUDED_STATUS, UNPRODUCED_ROUTES,
};
