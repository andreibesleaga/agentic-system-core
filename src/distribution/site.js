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
const adopt = require('../knowledge/adopt.js');
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
const pageTools = require('./page-tools.js');
const surfaces = require('../boundary/surfaces.js');
const browserBundle = require('../composition/browser.js');
const skills = require('../composition/skills.js');

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

/**
 * AGSC-11-16 / AGSC-11-19: the surfaces this build DECLARES, derived from what the
 * writer actually emits, through the Boundary context's `declare()` and through no
 * second list.
 *
 * Until rc.5 this build assembled the declaration by hand from two emitted files
 * (`/llms.txt`, `/chunks.jsonl`) plus `config.surfaces[]`, while
 * `boundary/surfaces.js` — the module that knows every built-in surface, its route,
 * its access class and its version — was called only by tests. The site therefore
 * EMITTED the page-tool surface at `/compose/` and never DECLARED it, which is
 * exactly the condition AGSC-11-19 tells the validator to warn about (AGSC-E211).
 * One path now, so a surface cannot be served and forgotten (ENG3-04).
 *
 * `webmcpVersion` is an OPTION, not a configuration key: `config.schema.json` closes
 * `surfaces[]` against the built-in surfaces, so a node states the WebMCP Draft
 * Community Group Report date it targets in code. The default is
 * `surfaces.WEBMCP_SURFACE_VERSION`; AGSC-11-16 as amended at rc.5 conforms any
 * `YYYY-MM-DD` date and pins none.
 *
 * @param {{base:string, config:object, emitted:Array<string>, mcpServed?:boolean,
 *   webmcpVersion?:string}} options
 * @returns {Array<object>} `{surface, target, version, access}`, discovery's shape.
 */
function declaredSurfaces(options) {
  const config = options.config || {};
  const declared = surfaces.declare({
    base: `${String(options.base).replace(/\/+$/u, '')}/`,
    emitted: options.emitted || [],
    mcpServed: options.mcpServed === true,
    surfaces: Array.isArray(config.surfaces) ? config.surfaces : [],
    webmcpVersion: options.webmcpVersion,
  });
  return declared.map((link) => {
    const entry = { surface: link['agsc-surface'][0], target: link.href };
    if (link['agsc-surface-version'] !== undefined) [entry.version] = link['agsc-surface-version'];
    if (link['agsc-access'] !== undefined) [entry.access] = link['agsc-access'];
    return entry;
  });
}

/**
 * AGSC-11-14 + research/34 option 3: the forge address at which a visitor edits ONE
 * item's source file.
 *
 * The configured member is `contribute[]` — the only repository member the frozen
 * `config.schema.json` has — and only an entry whose `mode` is `pr`, because that is
 * the mode whose target is a forge `https:` URL. Nothing is invented: where the host
 * is one whose edit-view spelling this function states, the link is that view of the
 * item's own `content/<type-plural>/<slug>.md`; where it is not, the link is the
 * configured contribution target itself, unchanged. `HEAD` names the repository's
 * default branch without this engine having to know its name.
 *
 * A link OUT to a forge is not a route (AGSC-06-01 governs what this writer emits),
 * carries no script, submits no form and reaches no third-party origin at load time
 * (AGSC-06-05, AGSC-06-17) — it is an ordinary anchor a person may follow.
 *
 * @param {object} config `agsc.config.json`
 * @param {string} path the item's Bundle-relative source path.
 * @returns {string|null} the href, or `null` when no `pr` channel is configured.
 */
function contributeEditUrl(config, path) {
  const entries = Array.isArray(config && config.contribute) ? config.contribute : [];
  const entry = entries.find((c) => c && c.mode === 'pr' && typeof c.target === 'string'
    && /^https:\/\//u.test(c.target));
  if (entry === undefined) return null;
  const repository = String(entry.target)
    .replace(/\/+$/u, '')
    .replace(/\.git$/u, '')
    .replace(/\/(?:compare|pulls|pull\/new|issues\/new)$/u, '');
  const host = repository.replace(/^https:\/\//u, '').split('/')[0].toLowerCase();
  const segment = FORGE_EDIT_SEGMENT[host];
  if (segment === undefined) return entry.target;
  return `${repository}${segment}${path.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * The edit-view spelling of the forges whose shape this engine states. A host absent
 * from this map is never guessed at: the contribution target is linked instead.
 */
const FORGE_EDIT_SEGMENT = Object.freeze({
  'codeberg.org': '/_edit/HEAD/',
  'github.com': '/edit/HEAD/',
  'gitlab.com': '/-/edit/HEAD/',
});

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

/** RFC 9116 §2.5.5's recommendation, in seconds: "less than a year into the future". */
const YEAR_SECONDS = 365 * 24 * 60 * 60;
/** What the writer derives when the authored file states no `Expires` (one day inside the year). */
const EXPIRES_AHEAD_SECONDS = 364 * 24 * 60 * 60;

/**
 * The authored `.well-known/security.txt` of the Bundle root, read through the
 * injected port exactly as `LICENSE-CONTENT` is (AGSC-06-18 as amended at rc.5).
 *
 * RFC 9116 §2.5.3 makes `Contact` mandatory — "This field MUST always be present in
 * a 'security.txt' file" — and a contact is a fact about the PUBLISHER that no
 * writer can derive from a Bundle: it is an address, a page or a mailbox that must
 * be watched by a person. `agsc.config.json` has no member for it (the configuration
 * is closed, AGSC-01-18), so the authored file is the input, and its absence is a
 * build failure rather than an invalid published file. The missing configuration
 * member is recorded as a specification item for 1.0.0.
 *
 * @param {object} ports `{fs}`
 * @returns {string|null} the authored bytes, or `null` when there are none.
 */
function readSecurityTxt(ports) {
  const fs = ports && ports.fs;
  if (!fs || typeof fs.readFile !== 'function') return null;
  try {
    if (typeof fs.exists === 'function' && !fs.exists('.well-known/security.txt')) return null;
    const text = String(fs.readFile('.well-known/security.txt', 'utf8'));
    return text.trim() === '' ? null : text;
  } catch (e) {
    return null;
  }
}

/**
 * RFC 9116 §2.2: a field line is `name: value`; blank lines and lines beginning
 * with `#` are ignored. Anything else is not a field and is reported rather than
 * published.
 *
 * @param {string} text
 * @returns {{fields:Array<{name:string, value:string, line:number}>, bad:Array<{line:number, text:string}>}}
 */
function securityFields(text) {
  const fields = [];
  const bad = [];
  String(text).split('\n').forEach((raw, index) => {
    const line = raw.replace(/\r$/u, '');
    if (line.trim() === '' || line.trimStart().startsWith('#')) return;
    const at = line.indexOf(':');
    if (at <= 0) {
      bad.push({ line: index + 1, text: line });
      return;
    }
    fields.push({ line: index + 1, name: line.slice(0, at).trim().toLowerCase(), value: line.slice(at + 1).trim() });
  });
  return { bad, fields };
}

/**
 * RFC 9116: the one security file that is a route (AGSC-06-01, PRD-047).
 *
 * Until rc.5 this function emitted `Expires` = the BUILD INSTANT and no `Contact`
 * at all, so every engine-built site published a file that RFC 9116 makes invalid
 * twice over: §2.5.3 "This field MUST always be present in a 'security.txt' file"
 * (Contact) and §2.5.5 "This field MUST always be present and MUST NOT appear more
 * than once" together with "It is RECOMMENDED that the value of this field be less
 * than a year into the future to avoid staleness" (Expires — which a build instant
 * never satisfies, being in the past the moment it is written). A published security
 * contact that does not work is worse than none, so the writer now derives what it
 * can, requires what it cannot derive, and emits nothing it knows to be invalid.
 *
 * What is authored: every field of the Bundle root's `.well-known/security.txt`,
 * published verbatim and in the authored order. What is derived, and only when the
 * authored file does not state it: `Expires` (364 days after the build instant, so
 * it is inside §2.5.5's year and can never go stale between two builds), `Canonical`
 * (§2.5.2) and `Policy` (§2.5.7, only when `/legal/` is emitted — a `Policy` naming
 * a 404 is worse than no `Policy` at all, V9D-A6).
 *
 * @param {string} base the site base (AGSC-01-19).
 * @param {string} instant the build instant (AGSC-04-10).
 * @param {object} [options] `{authored, legal}`.
 * @returns {{text:(string|null), findings:Array<object>}} `text` is `null` when
 *   nothing valid can be emitted; every reason is a finding.
 */
function securityTxt(base, instant, options = {}) {
  const legal = options.legal === undefined ? true : Boolean(options.legal);
  const file = '.well-known/security.txt';
  const authored = options.authored === undefined ? null : options.authored;
  const findings = [];
  if (authored === null) {
    // §9.4 registers no code for "a published artefact is invalid against the
    // standard it claims"; the closest registered row is used and the missing
    // registration is on the specification items list. `AGSC-E901` is "file not
    // found" (AGSC-01-01) and the missing file is exactly the fault.
    findings.push(finding('AGSC-E901',
      'no .well-known/security.txt in the Bundle root, so the published one would carry no Contact:'
      + ' field — RFC 9116 section 2.5.3 says "This field MUST always be present in a \'security.txt\''
      + ' file". Nothing is emitted for /.well-known/security.txt (AGSC-06-01, PRD-047)',
      { file }));
    return { findings, text: null };
  }

  const { bad, fields } = securityFields(authored);
  for (const line of bad) {
    findings.push(finding('AGSC-E204',
      `${file}:${line.line} is not an RFC 9116 field line ("name: value"), a blank line or a comment`,
      { file, line: line.line }));
  }
  const contacts = fields.filter((f) => f.name === 'contact' && f.value !== '');
  if (contacts.length === 0) {
    // "required key missing" — the words of AGSC-E202, applied to a required FIELD.
    findings.push(finding('AGSC-E202',
      'the authored .well-known/security.txt states no Contact: field — RFC 9116 section 2.5.3:'
      + ' "This field MUST always be present in a \'security.txt\' file"',
      { file }));
  }

  const expiresFields = fields.filter((f) => f.name === 'expires');
  const now = ledgerModule.epochFromInstant(instant);
  if (expiresFields.length > 1) {
    findings.push(finding('AGSC-E204',
      'the authored .well-known/security.txt states Expires more than once — RFC 9116 section 2.5.5:'
      + ' "This field MUST always be present and MUST NOT appear more than once"',
      { file, line: expiresFields[1].line }));
  }
  for (const field of expiresFields.slice(0, 1)) {
    const at = ledgerModule.epochFromInstant(field.value);
    if (at === null) {
      findings.push(finding('AGSC-E204',
        `the authored Expires value "${field.value}" is not an instant of the form`
        + ' YYYY-MM-DDTHH:MM:SSZ (AGSC-04-10, RFC 9116 section 2.5.5)',
        { file, line: field.line }));
    } else if (now !== null && at <= now) {
      findings.push(finding('AGSC-E204',
        `the authored Expires value "${field.value}" is not after the build instant ${instant}:`
        + ' the file would be published stale. RFC 9116 section 2.5.5: "It is RECOMMENDED that the'
        + ' value of this field be less than a year into the future to avoid staleness"',
        { file, line: field.line }));
    } else if (now !== null && at - now > YEAR_SECONDS) {
      findings.push(finding('AGSC-E204',
        `the authored Expires value "${field.value}" is more than a year after the build instant —`
        + ' RFC 9116 section 2.5.5: "It is RECOMMENDED that the value of this field be less than a'
        + ' year into the future to avoid staleness"',
        { file, line: field.line, severity: 'warn' }));
    }
  }

  if (findings.some((f) => f.severity !== 'warn')) return { findings, text: null };

  // RFC 9116 is line-oriented (AGSC-02-24, rc.5, FV28-01): every value the writer
  // interpolates is neutralised, because a writer may receive a file it did not
  // validate.
  const lines = fields.map((f) => `${capitalise(f.name)}: ${singleLine(f.value)}`);
  const stated = new Set(fields.map((f) => f.name));
  if (!stated.has('expires') && now !== null) {
    lines.push(`Expires: ${ledgerModule.instantFromEpoch(now + EXPIRES_AHEAD_SECONDS)}`);
  }
  if (!stated.has('canonical')) {
    lines.push(`Canonical: ${singleLine(discovery.href(base, '/.well-known/security.txt'))}`);
  }
  if (!stated.has('policy') && legal) {
    lines.push(`Policy: ${singleLine(discovery.href(base, '/legal/'))}`);
  }
  return { findings, text: `${lines.join('\n')}\n` };
}

/** RFC 9116 field names are case-insensitive; the file reads better in the registry's case. */
function capitalise(name) {
  return String(name).split('-').map((part) => (part === '' ? part : part[0].toUpperCase() + part.slice(1))).join('-');
}

/**
 * AGSC-06-02 + AGSC-05-07: the Markdown machine view of an item.
 *
 * AGSC-05-07 is one sentence — "`pages/<slug>.md` MUST be a byte-identical copy of
 * the lint-normalized source file" — and until rc.5 this function emitted the BODY
 * alone, so the published view carried neither the item's type nor its title nor its
 * provenance, and the MUST was silently unmet (ENG3-01). The lint-normalized source
 * file is the AGSC-04-19 frontmatter block of `knowledge/adopt.js#serialize` followed
 * by the body, which is also what makes AGSC-09-16 satisfiable at all: a page tool
 * can only return the item a local `read` returns if the frontmatter is published.
 *
 * `source` is the LOADED item, which still carries its frontmatter object with the
 * authored key order; `item` is the flattened record every other surface reads. A
 * record with no frontmatter (the flat items the vectors carry) keeps the old bytes.
 */
function pageMarkdown(item, source) {
  const frontmatter = source == null ? null : source.frontmatter;
  const body = item.body == null ? '' : item.body;
  if (frontmatter == null || typeof frontmatter !== 'object') return textBytes(body);
  return textBytes(`${adopt.serialize(frontmatter)}${body}`);
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
 * PRD-019: `/legal/` carries the content-use terms, a PRIVACY NOTICE, the operator
 * and a retention statement. AGSC-06-18 as amended at rc.5 derives the first of the
 * four from `LICENSE-CONTENT`; the other three are facts about the PUBLISHER, which
 * no writer can derive from a Bundle and none of which the closed configuration of
 * AGSC-01-18 carries. The privacy notice and the retention statement it contains are
 * therefore authored, in the Bundle root's `PRIVACY.md`, read exactly as
 * `LICENSE-CONTENT` is; the operator line is derived from `site.author` and
 * `bundle.operator`, which the configuration does carry.
 *
 * A Bundle with no `PRIVACY.md` gets a `/legal/` page WITHOUT a privacy section and
 * a warning naming what is missing — never an invented notice, because a privacy
 * notice that is not the publisher's own words is worse than none.
 */
function readPrivacyNotice(ports) {
  const fs = ports && ports.fs;
  if (!fs || typeof fs.readFile !== 'function') return null;
  try {
    if (typeof fs.exists === 'function' && !fs.exists('PRIVACY.md')) return null;
    const text = String(fs.readFile('PRIVACY.md', 'utf8'));
    return text.trim() === '' ? null : text;
  } catch (e) {
    return null;
  }
}

/**
 * PRD-019's operator identification, from the configuration and nowhere else:
 * `site.author` is the accountable person's name (AGSC-01-18) and `bundle.operator`
 * the `human:<id>` every item's provenance already publishes (AGSC-01-25). `null`
 * when the Bundle names neither, which is a warning, not an invention.
 */
function operatorLine(config) {
  const author = config && config.site && typeof config.site.author === 'string' ? config.site.author.trim() : '';
  const operator = config && config.bundle && typeof config.bundle.operator === 'string' ? config.bundle.operator.trim() : '';
  if (author === '' && operator === '') return null;
  if (author === '') return operator;
  return operator === '' ? author : `${author} (${operator})`;
}

/**
 * Everything the two legal-facing surfaces need from the PUBLISHER rather than from
 * the content — RFC 9116's security contact and PRD-019's privacy notice, operator
 * and retention statement — resolved and checked in ONE place, so that `lint` and
 * `build` can never disagree about them.
 *
 * `lint` calls it to fail early; `build` calls it to decide what it may emit. Under
 * `ci` the lint lane runs first and the build is told not to repeat the findings
 * (`options.publication === false`), because one fault is counted once (AGSC-09-11).
 *
 * @param {object} bundle the loaded Bundle.
 * @param {object} ports `{fs, clock}`.
 * @param {object} [options] `{instant, level, hasLegal, licenseContent, privacy, securityTxt}`.
 * @returns {{findings:Array<object>, hasLegal:boolean, licenseContent:(string|null),
 *   operator:(string|null), privacy:(string|null), security:{text:(string|null), findings:Array<object>}}}
 */
function publicationFindings(bundle, ports, options = {}) {
  const config = (bundle && bundle.config) || {};
  const base = String((config.site && config.site.base) || '').replace(/\/+$/u, '');
  const level = options.level == null ? 2 : Number(options.level);
  const clock = ports && ports.clock;
  const instant = options.instant !== undefined ? options.instant
    : clock && clock.iso !== undefined ? clock.iso()
      : clock && typeof clock.now === 'function' ? ledgerModule.instantFromEpoch(clock.now())
        : ledgerModule.instantFromEpoch(0);
  const licenseContent = options.licenseContent === undefined ? readLicenseContent(ports) : options.licenseContent;
  const privacy = options.privacy === undefined ? readPrivacyNotice(ports) : options.privacy;
  const operator = operatorLine(config);
  const hasLegal = options.hasLegal === undefined ? level >= 2 && licenseContent !== null : Boolean(options.hasLegal);
  const security = securityTxt(base, instant, {
    authored: options.securityTxt === undefined ? readSecurityTxt(ports) : options.securityTxt,
    legal: hasLegal,
  });
  const findings = [...security.findings];
  if (hasLegal && privacy === null) {
    // §9.4 registers no code for "a required section of a published page has no
    // input"; `AGSC-E406` ("expected body section missing", a warning) is the
    // closest registered row and the missing registration is on the specification
    // items list.
    findings.push(finding('AGSC-E406',
      'no PRIVACY.md in the Bundle root, so /legal/ carries the Content Use Terms without a privacy'
      + ' notice or a retention statement (PRD-019). A writer never invents one',
      { file: 'PRIVACY.md', severity: 'warn' }));
  }
  if (hasLegal && operator === null) {
    findings.push(finding('AGSC-E406',
      'neither site.author nor bundle.operator is configured, so /legal/ can identify no operator'
      + ' of this node (PRD-019, AGSC-01-18, AGSC-01-25)',
      { file: 'agsc.config.json', severity: 'warn' }));
  }
  return { findings, hasLegal, licenseContent, operator, privacy, security };
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
 * An absolute URL in one of the two text dialects is an INTERNAL link only when it
 * is under this node's own base: since rc.5 `security.txt` carries a `Contact:`
 * field, which is by definition somewhere else (RFC 9116 section 2.5.3 — "a web page
 * with contact information"), and reading it as a route of this build would report
 * every valid security contact as a dangling link. Without a `base` the function
 * keeps its earlier behaviour, which is what its own unit test states.
 *
 * @param {Map<string,string>} files
 * @param {object} [options] `{base}` — this node's base (AGSC-01-19), no trailing slash.
 * @returns {Array<{from:string, href:string, route:(string|null)}>}
 */
function internalLinks(files, options = {}) {
  const base = typeof options.base === 'string' && options.base !== '' ? options.base.replace(/\/+$/u, '') : null;
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
        // The two text dialects carry ABSOLUTE URLs; the path of one under this
        // node's own base is what must resolve. Another origin is somebody else's.
        if (base === null || m[0] === base || m[0].startsWith(`${base}/`)) {
          const path = m[0].replace(/^https?:\/\/[^/]*/u, '');
          add(route, path === '' ? '/' : path);
        }
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
 * AGSC-07-19/07-20: the published skill packs of this Bundle, one per Cluster,
 * plus the `index.json` that is also their lockfile.
 *
 * It is a named export so that `agsc skills` and `agsc build` produce the SAME
 * bytes from the same call — a pack a reader downloads from `/skills/` and a pack
 * an operator writes into `dist/skills/` must not be able to differ.
 *
 * @param {object} bundle the loaded Bundle.
 * @param {{generatedAt:string, specVersion:string, sha256?:Function}} options
 * @param {object} [config] the resolved configuration; `bundle.config` by default.
 * @returns {{files:Array<object>, findings:Array<object>, index:object}}
 */
function skillPacks(bundle, options, config) {
  const resolved = config === undefined ? (bundle.config || {}) : config;
  const site = resolved.site || {};
  const base = String(site.base || '').replace(/\/+$/u, '');
  return skills.packs(publishedItems(bundle.items, resolved.releases), {
    base: `${base}/`,
    generatedAt: String(options.generatedAt),
    license: (resolved.bundle && resolved.bundle.license_prose) || TERMS,
    sha256: options.sha256 === undefined
      ? (bytes) => createHash('sha256').update(String(bytes), 'utf8').digest('hex')
      : options.sha256,
    specVersion: String(options.specVersion),
  });
}

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

  // ------------------------------------------------------------ skill packs (AGSC-07-19)
  // The PUBLISHED packs of spec/07 §7.4, one per Cluster, plus the index that is
  // also the lockfile of AGSC-07-20. A Level-0 publisher emits none: AGSC-10-04
  // puts the `skills` vector area at Level 2.
  const packs = !full ? { files: [], findings: [], index: { packs: [] } }
    : skillPacks(bundle, { generatedAt: instant, specVersion }, config);
  findings.push(...packs.findings);
  for (const file of packs.files) put(`/skills/${file.path}`, file.text);

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
  const graphBase = {
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
  };
  // AGSC-06-32 (NS-02): the context is generated ONCE per build and is then both
  // the bytes of `/ns/context.jsonld` and the compaction table every JSON-LD view
  // uses — so the file a node serves and the documents it serves can never
  // disagree, which is exactly what the round-trip clause of AGSC-06-32 asks. The
  // generated object was previously written to disk and never handed to the
  // emitter, so `graph.jsonld` wrote every vocabulary IRI out in full and the
  // round trip failed on a node's own output.
  const contextObject = graph !== null && typeof graph.context === 'function'
    ? graph.context(graphBase)
    : null;
  // AGSC-05-09 as amended at rc.5 (NS-03): `graph.jsonld` names a context at EVERY
  // Level. A Level ≥ 2 writer serves a byte-identical copy at `/ns/context.jsonld`
  // and MAY name that; a Level-0 or Level-1 writer, which AGSC-06-32 forbids to
  // emit a context file, names the specification's persistent versioned URL, which
  // "is a constant of this specification, resolvable by every reader at every
  // Level". Before rc.5 the rule was read as permitting no `@context` below Level 2,
  // and a conforming processor then silently discarded every compacted member.
  const ontologyVersion = options.ontologyVersion;
  let contextUrl;
  if (contextObject !== null) {
    if (full) contextUrl = discovery.href(base, '/ns/context.jsonld');
    else if (ontologyVersion) contextUrl = jsonldView.persistentContextUrl(ontologyVersion);
  }
  const graphView = {
    ...graphBase,
    ...(contextObject === null ? {} : { context: contextObject }),
    ...(contextUrl === undefined ? {} : { contextUrl }),
  };
  if (graph !== null) {
    const view = graphView;
    // AGSC-10-02: `/graph.jsonld` is a Level-0 artefact; the other three views and
    // the context file are AGSC-10-04's, so a Level-0 emission omits them.
    if (typeof graph.jsonld === 'function') put('/graph.jsonld', jsonBytes(graph.jsonld(items, view)));
    if (full && typeof graph.nquads === 'function') put('/graph.nq', textBytes(graph.nquads(items, view)));
    if (full && typeof graph.turtle === 'function') put('/graph.ttl', textBytes(graph.turtle(items, view)));
    if (full && contextObject !== null) put('/ns/context.jsonld', jsonBytes(contextObject));
  } else {
    skipped.push('/graph.jsonld, /graph.nq, /graph.ttl, /ns/context.jsonld (the RDF views were switched off)');
  }
  if (full && graph !== null && contextObject === null) {
    skipped.push('/ns/context.jsonld (no context generator was supplied; AGSC-06-32)');
  }
  if (!full && graph !== null && typeof graph.jsonld === 'function' && contextUrl === undefined) {
    skipped.push('the `@context` of /graph.jsonld (no ontology version was supplied, so the'
      + ' persistent versioned context URL of AGSC-05-09 cannot be named; a reader expanding'
      + ' this document drops every member whose key is a term or a compact IRI)');
  }

  // ------------------------------------------------------------ per-item views
  // AGSC-06-02: an item has TWO machine views, `/pages/<slug>.md` and
  // `/pages/<slug>.jsonld`; the second is the same JSON-LD the graph carries,
  // restricted to that one item (WP-10-G wired it, AGSC-06-01).
  if (full) {
    // AGSC-05-07: the published Markdown view is the lint-normalized SOURCE FILE, so
    // the loaded item — the only record that still carries the frontmatter object in
    // its authored key order — is looked up beside the flattened one.
    const loadedBySlug = new Map((bundle.items || []).map((i) => [i.slug, i]));
    for (const item of items) put(`/pages/${item.slug}.md`, pageMarkdown(item, loadedBySlug.get(item.slug)));
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

  // RFC 9116 + PRD-019: everything the two legal-facing surfaces need from the
  // publisher, resolved once. `options.publication === false` means another lane of
  // THIS run has already reported these findings — `ci` runs the lint lane before
  // the build, and one fault is counted once (AGSC-09-11) — so the build still
  // refuses to emit an invalid file and simply does not repeat the reason.
  const publication = publicationFindings(bundle, ports, {
    hasLegal, instant, level, licenseContent, privacy: options.privacy, securityTxt: options.securityTxt,
  });
  const security = publication.security;
  if (options.publication !== false) findings.push(...publication.findings);
  if (security.text === null) {
    skipped.push('/.well-known/security.txt (no valid RFC 9116 contact: see the findings against'
      + ' .well-known/security.txt; an invalid published security contact is worse than none)');
  } else {
    put('/.well-known/security.txt', security.text);
  }

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
    surfaces: declaredSurfaces({
      base,
      config,
      emitted: [...files.keys(), ...(full && typeof renderer === 'function' ? ['/compose/'] : [])],
    }),
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
        // AGSC-09-16: "the `/compose/` page AND THE ITEM PAGES". The three scripts
        // are the same shared files the `/compose/` route already serves — a
        // reference, never a copy, so the 100 KB page budget of AGSC-06-21 pays for
        // three `<script src>` elements and nothing more.
        pageToolScripts: composePage.PAGE_TOOL_SCRIPTS,
        // AGSC-11-14 + research/34 option 3: the plain "Propose an edit" anchor.
        editUrl: contributeEditUrl(config, pathOf(item)),
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

    // AGSC-06-18: the Content Use Terms text, from `LICENSE-CONTENT` and nowhere
    // else — and, since this package, PRD-019's other three obligations beside it:
    // the privacy notice (authored, `PRIVACY.md`), the operator (configured) and the
    // retention statement the authored notice carries. Each missing input omits its
    // section and warns; none is ever invented.
    if (hasLegal) {
      put('/legal/index.html', html.legalPage({
        licenseProse,
        operator: publication.operator,
        privacy: publication.privacy === null ? null : render(textBytes(publication.privacy)).html,
        rendered: render(textBytes(licenseContent)).html,
        terms: TERMS,
      }, pageOptions));
    }

    // AGSC-06-01 `/skills/`: the human index of the packs emitted above. The packs
    // themselves are Markdown and JSON, which is why this page is the only HTML the
    // `/skills/**` route family carries.
    if (packs.index.packs.length > 0) {
      putIndex('/skills/', 'Skill packs',
        'One pack per Cluster, each a single SKILL.md of text (AGSC-07-19).',
        packs.index.packs.map((pack) => ({
          description: pack.description,
          href: `/skills/${pack.name}/SKILL.md`,
          title: pack.name,
        })));
    }

    // AGSC-06-01 `/compose/` + AGSC-07-01/07-13: the combiner in the browser. The
    // three scripts are same-origin assets of this one route, because AGSC-06-17's
    // `script-src 'self'` admits no inline script.
    put('/compose/index.html', html.composePage({ assets: composePage.ASSETS }, pageOptions));
    put('/compose/agsc-core.js', textBytes(browserBundle.bundle({ specVersion })));
    put('/compose/agsc-page-tools.js', textBytes(pageTools.bundle({
      bundleId: (config.bundle || {}).id, specVersion,
    })));
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
  for (const link of internalLinks(ordered, { base })) {
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
  declaredSurfaces, contributeEditUrl, pageMarkdown, skillPacks, FORGE_EDIT_SEGMENT,
  budgets, timeBudget, internalLinks, resolvesTo, readLicenseContent,
  readSecurityTxt, readPrivacyNotice, securityFields, operatorLine, publicationFindings,
  baseDirOf, resolveRelative, bodyHrefResolver,
  BUDGET_HTML_BYTES, BUDGET_INDEX_DOC_BYTES, BUDGET_MS_PER_500_ITEMS,
  DEFAULT_OUT, EXCLUDED_STATUS, UNPRODUCED_ROUTES,
};
