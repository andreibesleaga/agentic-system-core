'use strict';
// CONTEXT Distribution (Emission) — Surface: the one discovery document.
// Implements AGSC-06-07 (one file, one media type, one profile), AGSC-06-08 (the
// RFC 9264 link set, its sole top-level member and the extension target
// attributes), AGSC-06-08a (the Level-0 form), AGSC-06-09/10 (the relation names
// and the ordering), AGSC-06-11 (`agsc-ledger-head`), AGSC-06-35 (related-system
// links), AGSC-10-12 (the mutual peer check), AGSC-11-16 (`rel#surface`),
// AGSC-11-20 (`agsc-visibility` and `rel#access`) and AGSC-11-23 (`agsc-tombstone`).
//
// AGSC-06-07 makes the well-known suffix a SINGLE point of substitution: it is the
// constant `WELLKNOWN_SUFFIX` below, and the path, the `_redirects` alias and the
// peer URLs all derive from it, so a refused registration costs one PATCH.
//
// Pure function of its input; `site.js` writes the bytes. Vectors disc-0004,
// disc-0005, disc-0016.

const { createHash } = require('node:crypto');
const federation = require('../boundary/federation.js');
const surfaces = require('../boundary/surfaces.js');
const { compareCodePoint, compareUtf16 } = require('../knowledge/unicode.js');
const { finding } = require('../knowledge/validate.js');

/** AGSC-06-07: the one substitutable constant. */
const WELLKNOWN_SUFFIX = 'knowledge-linkset';
const WELLKNOWN_PATH = `/.well-known/${WELLKNOWN_SUFFIX}`;
/** AGSC-06-17: the alias kept until the last 0.0.x consumer is retired. */
const WELLKNOWN_ALIAS = '/.well-known/agentic-knowledge';
const MEDIA_TYPE = 'application/linkset+json';
const PROFILE = 'https://w3id.org/agentic-system-core/profile/agentic-knowledge';
const REL = 'https://w3id.org/agentic-system-core/rel#';

/** AGSC-06-10: the extension relation names, and no others. */
const EXTENSION_RELATIONS = Object.freeze([
  'access', 'boards', 'context', 'contribute', 'graph', 'ledger', 'now',
  'ontology', 'peer', 'signature', 'skills', 'surface',
]); // `signature`: AGSC-06-08/06-10 — optional, affects nothing; `boards`: AGSC-10-13 (2026-09-25)
/** AGSC-06-10 + AGSC-06-35: the IANA-registered short names this profile uses. */
const REGISTERED_RELATIONS = Object.freeze([
  'alternate', 'author', 'cite-as', 'collection', 'describedby', 'item', 'license',
  'related', 'service-desc', 'service-doc', 'service-meta',
]); // `cite-as` (RFC 8574): AGSC-06-10/06-35
/** AGSC-06-35: the short names a `related[]` entry may carry. */
const RELATED_RELATIONS = Object.freeze([
  'alternate', 'cite-as', 'collection', 'describedby', 'item', 'related',
  'service-desc', 'service-doc', 'service-meta',
]);
/** Every relation name that may appear, for the validator of `check()`. */
const ALLOWED_RELATIONS = Object.freeze([
  ...REGISTERED_RELATIONS, ...EXTENSION_RELATIONS.map((n) => `${REL}${n}`),
]);

/**
 * AGSC-06-08: the bundle-level facts, carried on the anchor's `describedby` link.
 * `agsc-bundle-version` (AGSC-04-25) sits between
 * `agsc-bundle-hash` and `agsc-counts` in the JCS member order of AGSC-04-05,
 * which is where a reader of the emitted bytes will find it.
 */
const ANCHOR_ATTRIBUTES = Object.freeze([
  'agsc-bundle-hash', 'agsc-bundle-version', 'agsc-counts', 'agsc-generated-at',
  'agsc-spec-version', 'digest',
]);
/** AGSC-06-08 / AGSC-06-11: the attributes of the `rel#ledger` link. */
const LEDGER_ATTRIBUTES = Object.freeze(['agsc-ledger-head', 'digest']);
/** AGSC-06-08a: the attributes a Level-0 document omits, every one of them. */
const LEVEL0_OMITTED = Object.freeze([
  'agsc-bundle-hash', 'agsc-bundle-version', 'agsc-counts', 'agsc-generated-at',
  'agsc-ledger-head', 'agsc-spec-version', 'digest',
]);
/**
 * AGSC-11-20: the four attributes a `restricted` node MUST omit although it is
 * Level ≥ 2 — per-type population, the fingerprint, the content version (whose
 * untagged forms carry the commit count and the commit hash of the content
 * branch) and the ledger head are all content facts, and an integrity attribute
 * over a gated artefact is a confirmation-of-content oracle. It MUST still carry
 * `agsc-spec-version` and `agsc-generated-at`, which say only that the node
 * exists and is current. Presence is `AGSC-E210` (AGSC-09-93).
 */
const RESTRICTED_OMITTED = Object.freeze([
  'agsc-bundle-hash', 'agsc-bundle-version', 'agsc-counts', 'agsc-ledger-head',
]);
/** RFC 8288 §3.4 / RFC 9264 §4.2.4: the members that are NOT target attributes. */
const LINK_MEMBERS = Object.freeze(['href', 'hreflang', 'media', 'title', 'title*', 'type']);

/**
 * AGSC-06-08 and AGSC-11-16 (with AGSC-06-35's `profile`): every target attribute
 * this version defines. A document of a newer MINOR may carry others, which a
 * reader ignores (AGSC-00-21, AGSC-09-93).
 */
const KNOWN_ATTRIBUTES = Object.freeze([
  'agsc-access', 'agsc-bundle-hash', 'agsc-bundle-version', 'agsc-contribute-mode', 'agsc-counts',
  'agsc-generated-at', 'agsc-ledger-head', 'agsc-spec-version', 'agsc-surface', 'agsc-surface-version',
  'agsc-tombstone', 'agsc-visibility', 'digest', 'profile',
]);

/**
 * AGSC-11-20: the targets a `restricted` node serves unauthenticated — its
 * unauthenticated view is the discovery document, `/llms.txt` and `/graph.jsonld`
 * at Level 0 — and so the only artefacts whose `digest` it may publish. A digest
 * over a gated artefact is a confirmation-of-content oracle, and the digest of
 * `/graph.nq` is the bundle fingerprint the same rule withholds.
 */
const OPEN_WHEN_RESTRICTED = Object.freeze(['/graph.jsonld', '/llms.txt']);

/**
 * The MAJOR.MINOR of the specification this reader implements (AGSC-00-15); a caller
 * that knows its full version passes it as `options.specVersion`.
 */
const OWN_SPEC_VERSION = '1.0';

/** The `{major, minor}` of a version string, or `null` when it names none. */
function majorMinor(version) {
  const match = /^(\d+)\.(\d+)(?:\.|$)/u.exec(String(version == null ? '' : version));
  return match === null ? null : { major: Number(match[1]), minor: Number(match[2]) };
}

/**
 * AGSC-00-21 with AGSC-09-93: is `declared` a newer MINOR of the reader's own MAJOR?
 * Only then are relations and attributes this version does not define ignored,
 * with a warning, instead of failing the document; another MAJOR has no tolerance.
 *
 * @param {string} declared the document's `agsc-spec-version`.
 * @param {string} own the reader's specification version.
 */
function newerMinor(declared, own) {
  const theirs = majorMinor(declared);
  const mine = majorMinor(own);
  return theirs !== null && mine !== null && theirs.major === mine.major && theirs.minor > mine.minor;
}

/** AGSC-06-01 / AGSC-05-01: the item types whose counts AGSC-06-08 publishes. */
const COUNTED_TYPES = Object.freeze({
  cluster: 'clusters',
  concept: 'concepts',
  episode: 'episodes',
  gate: 'gates',
  lesson: 'lessons',
  procedure: 'procedures',
});

/** AGSC-11-16: the built-in surfaces take fixed access classes. */
const BUILTIN_SURFACE_ACCESS = Object.freeze({
  'llms-txt': 'none', chunks: 'none', webmcp: 'consent', mcp: 'consent',
});

/**
 * RFC 9530 + RFC 9651 §4.1: `sha-256=:<base64>:`, one string in an array.
 * @param {string|Buffer} bytes the canonical bytes of the target.
 * @returns {string}
 */
function digestOf(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes), 'utf8');
  return `sha-256=:${createHash('sha256').update(buffer).digest('base64')}:`;
}

/**
 * AGSC-06-08: `agsc-counts`, one `"<type-plural>=<n>"` string per item type, in
 * code-point order of the type name, counted over the PUBLISHED set.
 * @param {Array<object>} items the published items.
 * @returns {Array<string>}
 */
function countsOf(items) {
  const tally = Object.create(null);
  for (const plural of Object.values(COUNTED_TYPES)) tally[plural] = 0;
  for (const item of items) {
    const plural = COUNTED_TYPES[item.type];
    if (plural !== undefined) tally[plural] += 1;
  }
  return Object.keys(tally).sort(compareCodePoint).map((plural) => `${plural}=${tally[plural]}`);
}

/** Absolute URL from the Bundle base plus a route (AGSC-06-10: every href is absolute). */
function href(base, route) {
  return `${String(base).replace(/\/+$/u, '')}${route}`;
}

/** The canonical well-known URL of a node, the value a `rel#peer` link names. */
function wellknownUrl(base) {
  return href(base, WELLKNOWN_PATH);
}

/** One link object, with `href` and `type` first and every attribute an array. */
function link(url, type, attributes = {}) {
  const out = {};
  for (const [name, value] of Object.entries(attributes)) {
    if (value == null) continue;
    out[name] = Array.isArray(value) ? value.map(String) : [String(value)];
  }
  out.href = url;
  if (type != null) out.type = type;
  return out;
}

/** AGSC-06-10: within one relation's array, link objects are ordered by `href`. */
function byHref(list) {
  return [...list].sort((a, b) => compareCodePoint(String(a.href), String(b.href)));
}

/**
 * Build the discovery document (AGSC-06-08, AGSC-06-08a).
 *
 * @param {object} config `agsc.config.json` — `site.base` is the only required key.
 * @param {object} [options]
 * @param {number} [options.level] 0 or ≥2 (AGSC-10-02); default 2.
 * @param {string} [options.ledgerHead] the lowercase-hex head of the derived ledger.
 * @param {object} [options.digests] route → RFC 9530 digest string.
 * @param {Array<string>} [options.counts] `agsc-counts`, from `countsOf()`.
 * @param {string} [options.generatedAt] the AGSC-04-10 build instant.
 * @param {string} [options.specVersion]
 * @param {string} [options.bundleHash] the AGSC-04 bundle hash, RFC 9530 syntax.
 * @param {string} [options.bundleVersion] the AGSC-04-25 content version.
 * @param {Array<object>} [options.surfaces] `{surface, target, version, access}`.
 * @param {Iterable<string>} [options.routes] the routes the build actually emitted.
 *   A relation link is emitted for a route this node HAS, at every Level — AGSC-06-08a
 *   omits the digests and the `agsc-*` attributes at Level 0, never the links
 *   themselves, and AGSC-11-16 derives a declaration "from what the writer actually
 *   emits". Omitting it means "every Level-≥2 route" (the reference emission).
 * @param {string} [options.tombstone] an AGSC-04-10 instant (AGSC-11-23).
 * @param {string} [options.successor] a successor node's discovery document.
 * @returns {object} the link set, ready for JCS.
 */
function linkset(config, options = {}) {
  const level = options.level == null ? 2 : Number(options.level);
  const full = level >= 2;
  const site = (config && config.site) || {};
  const base = String(site.base || '').replace(/\/+$/u, '');
  const anchor = `${base}/`;
  const digests = options.digests || {};
  const visibility = (config && config.visibility) || 'public';
  const gated = visibility === 'restricted';
  const digest = (route) => (full && digests[route] != null
    && (!gated || OPEN_WHEN_RESTRICTED.includes(route)) ? digests[route] : undefined);
  const emitted = options.routes == null ? null : new Set(options.routes);
  const has = (route) => (emitted === null ? full : emitted.has(route));

  const context = { anchor };
  const put = (relation, list) => {
    if (list.length > 0) context[relation] = byHref(list);
  };

  // AGSC-06-08: bundle facts ride on the anchor's `describedby` link and NOWHERE else.
  // AGSC-11-20: a `restricted` node publishes neither the content facts nor the
  // content version, at any Level, and no digest of a target it gates.
  const describedby = {
    digest: digest('/graph.jsonld'),
    'agsc-bundle-hash': full && !gated ? options.bundleHash : undefined,
    'agsc-bundle-version': full && !gated ? options.bundleVersion : undefined,
    'agsc-counts': full && !gated ? options.counts : undefined,
    'agsc-generated-at': full ? options.generatedAt : undefined,
    'agsc-spec-version': full ? options.specVersion : undefined,
  };
  // AGSC-11-20: emitted only when the value is `restricted`.
  if (visibility === 'restricted') describedby['agsc-visibility'] = 'restricted';
  // AGSC-11-23: a node that stops publishing keeps serving a valid link set.
  if (options.tombstone != null) describedby['agsc-tombstone'] = options.tombstone;

  put('describedby', [link(href(base, '/graph.jsonld'), 'application/ld+json', describedby)]);
  const alternates = [link(href(base, '/llms.txt'), 'text/plain', { digest: digest('/llms.txt') })];
  if (options.successor != null) alternates.push(link(String(options.successor), MEDIA_TYPE));
  put('alternate', alternates);
  // A link to a route this node does not emit is a 404 every agent follows: the
  // licence page and the specification pages are linked only when the build wrote
  // them (the build skips `/legal/` without a LICENSE-CONTENT file, and `/specs/`
  // is the site repository's, not the engine's — AGSC-06-01).
  if (has('/legal/') || has('/legal/index.html')) put('license', [link(href(base, '/legal/'), null, {})]);
  if (has('/specs/') || has('/specs/index.html')) put('service-doc', [link(href(base, '/specs/'), null, {})]);

  const graphLinks = [];
  if (has('/graph.nq')) graphLinks.push(link(href(base, '/graph.nq'), 'application/n-quads', { digest: digest('/graph.nq') }));
  if (has('/graph.ttl')) graphLinks.push(link(href(base, '/graph.ttl'), 'text/turtle', { digest: digest('/graph.ttl') }));
  put(`${REL}graph`, graphLinks);
  if (has('/ns/context.jsonld')) {
    put(`${REL}context`, [link(href(base, '/ns/context.jsonld'), 'application/ld+json', { digest: digest('/ns/context.jsonld') })]);
  }
  if (has('/ns/agsc.ttl')) {
    put(`${REL}ontology`, [link(href(base, '/ns/agsc.ttl'), 'text/turtle', { digest: digest('/ns/agsc.ttl') })]);
  }
  if (has('/now.md')) put(`${REL}now`, [link(href(base, '/now.md'), 'text/markdown', { digest: digest('/now.md') })]);
  if (has('/skills/index.json')) {
    put(`${REL}skills`, [link(href(base, '/skills/index.json'), 'application/json', { digest: digest('/skills/index.json') })]);
  }
  // AGSC-10-13 (2026-09-25): the board index exists only while a task exists, so the
  // link is emitted for a route the build actually wrote — read from the emitted
  // route set, or, when a caller states none, from the digests it supplied.
  const boardsRoute = '/boards/index.json';
  if (emitted === null ? digests[boardsRoute] != null : emitted.has(boardsRoute)) {
    put(`${REL}boards`, [link(href(base, boardsRoute), 'application/json', { digest: digest(boardsRoute) })]);
  }
  // AGSC-06-11: a Level-0 node publishes no `rel#ledger` link and therefore no head.
  if (full && !gated && options.ledgerHead != null) {
    put(`${REL}ledger`, [link(href(base, '/ledger.jsonl'), 'application/jsonl', {
      digest: digest('/ledger.jsonl'), 'agsc-ledger-head': options.ledgerHead,
    })]);
  }

  // AGSC-10-12: each peer is named by its canonical well-known URL.
  const peers = Array.isArray(config && config.peers) ? config.peers : [];
  put(`${REL}peer`, peers.map((p) => link(String(p), MEDIA_TYPE)));

  // AGSC-11-16: one `rel#surface` link per surface the node serves, and no other.
  const surfaces = Array.isArray(options.surfaces) ? options.surfaces : [];
  put(`${REL}surface`, surfaces.map((s) => link(String(s.target), s.type == null ? undefined : s.type, {
    'agsc-surface': s.surface,
    'agsc-surface-version': s.version,
    'agsc-access': s.access == null ? BUILTIN_SURFACE_ACCESS[s.surface] : s.access,
  })));

  // AGSC-11-14 / AGSC-11-20.
  const contribute = Array.isArray(config && config.contribute) ? config.contribute : [];
  put(`${REL}contribute`, contribute.map((c) => link(String(c.target), null, { 'agsc-contribute-mode': c.mode })));
  if (visibility === 'restricted' && config && config.access != null) {
    put(`${REL}access`, [link(String(config.access), null, { 'agsc-access': 'credential' })]);
  }

  // AGSC-06-35: related-system links, IANA-registered relations only, never derived.
  // ONE implementation writes them, `federation.relatedLinks`, so the vector that
  // proves it proves the bytes the build publishes: `type` and `title` are strings
  // and `profile`, an extension attribute, is an array (AGSC-06-10, RFC 9264
  // §4.2.4.1 and §4.2.4.3). A malformed `related[]` is AGSC-E209 at configuration
  // time and contributes no link.
  const related = federation.relatedLinks(config).links;
  for (const relation of Object.keys(related)) {
    context[relation] = byHref([...(context[relation] || []), ...related[relation].map((one) => ({ ...one }))]);
  }

  // AGSC-06-08: relation-name members ordered as JSON member names (AGSC-04-05).
  const ordered = { anchor: context.anchor };
  for (const name of Object.keys(context).filter((k) => k !== 'anchor').sort(compareUtf16)) {
    ordered[name] = context[name];
  }
  return { linkset: [ordered] };
}

/** The target attributes of one link object — everything that is not an RFC member. */
function attributesOf(one) {
  return Object.keys(one).filter((k) => !LINK_MEMBERS.includes(k)).sort(compareCodePoint);
}

/**
 * AGSC-11-16: the shape of one `rel#surface` link — the same structural checks
 * `tools/validate-wellknown` makes, so the engine's checker and the independent
 * validator cannot disagree about a document (found 2026-10-02: an `llms-txt` link
 * carrying `agsc-surface-version` passed here and failed there).
 */
function surfaceFindings(one, fail, warn) {
  const values = (name) => (Array.isArray(one[name]) ? one[name] : undefined);
  const surface = values('agsc-surface');
  const name = surface !== undefined && surface.length === 1 ? surface[0] : null;
  if (name === null) fail('AGSC-E210', `rel#surface ${one.href}: agsc-surface must carry exactly one value (AGSC-11-16)`);
  else if (!surfaces.SURFACE_NAMES.includes(name) && !/^x-[a-z0-9]+(-[a-z0-9]+)+$/u.test(name)) {
    warn('AGSC-E210', `rel#surface ${one.href}: unknown surface ${JSON.stringify(name)} (AGSC-11-16; a reader treats it as not served, AGSC-11-02)`);
  }
  const access = values('agsc-access');
  if (access === undefined || access.length !== 1) fail('AGSC-E210', `rel#surface ${one.href}: agsc-access must carry exactly one value (AGSC-11-16)`);
  else if (!surfaces.ACCESS_CLASSES.includes(access[0])) {
    warn('AGSC-E210', `rel#surface ${one.href}: unknown access class ${JSON.stringify(access[0])} (read as credential, AGSC-11-02)`);
  }
  const version = one['agsc-surface-version'];
  if (name !== null && surfaces.VERSION_REQUIRED.includes(name) && !(Array.isArray(version) && version.length === 1)) {
    fail('AGSC-E210', `rel#surface ${one.href}: agsc-surface-version is required for ${name} (AGSC-11-16)`);
  }
  if ((name === 'llms-txt' || name === 'chunks') && version !== undefined) {
    fail('AGSC-E210', `rel#surface ${one.href}: agsc-surface-version must be absent for ${name} (AGSC-11-16)`);
  }
  if (name === 'llms-txt' && !/\/llms\.txt$/u.test(String(one.href).split(/[?#]/u)[0])) {
    fail('AGSC-E210', 'rel#surface llms-txt must target /llms.txt (AGSC-11-16)');
  }
}

/**
 * Validate a discovery document (AGSC-06-08, AGSC-06-08a, AGSC-06-09/10).
 * Structural faults are Findings with registered codes, never thrown strings.
 *
 * @param {object} doc
 * @param {{level?:number, file?:string, requireLedger?:boolean}} [options]
 *   `requireLedger: false` when the caller knows no ledger could be derived.
 * @returns {Array<object>} Findings; empty means the document conforms.
 */
function check(doc, options = {}) {
  const level = options.level == null ? 2 : Number(options.level);
  const file = options.file == null ? WELLKNOWN_PATH : options.file;
  const out = [];
  const fail = (code, message) => out.push(finding(code, message, { file }));
  const warn = (code, message) => out.push(finding(code, message, { file, severity: 'warn' }));

  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    fail('AGSC-E209', 'the discovery document is not a JSON object (AGSC-06-08)');
    return out;
  }
  const top = Object.keys(doc);
  if (top.length !== 1 || top[0] !== 'linkset') {
    fail('AGSC-E209', `linkset must be the sole top-level member; found [${top.join(', ')}] (AGSC-06-08)`);
    return out;
  }
  if (!Array.isArray(doc.linkset)) {
    fail('AGSC-E209', 'linkset must be an array of link context objects (AGSC-06-09)');
    return out;
  }
  for (const context of doc.linkset) {
    if (context === null || typeof context !== 'object' || typeof context.anchor !== 'string') {
      fail('AGSC-E209', 'every link context object carries an anchor (AGSC-06-09)');
      continue;
    }
    // AGSC-00-21 / AGSC-09-93: a document of a newer MINOR of this MAJOR may use a
    // relation or an attribute this version does not define; it is ignored, with the
    // warning AGSC-E506 naming the newer version, and never fails the document.
    const declared = [].concat(((context.describedby || [])[0] || {})['agsc-spec-version'] || [])[0];
    const newer = newerMinor(declared, options.specVersion == null ? OWN_SPEC_VERSION : options.specVersion);
    for (const relation of Object.keys(context)) {
      if (relation === 'anchor') continue;
      if (!ALLOWED_RELATIONS.includes(relation)) {
        if (newer) {
          warn('AGSC-E506', `relation "${relation}" is not defined by this version; the document declares the newer ${declared}, so the relation is ignored (AGSC-00-21)`);
          continue;
        }
        fail('AGSC-E209', `relation "${relation}" is neither an IANA-registered short name nor a ${REL}<name> extension URI (AGSC-06-10)`);
        continue;
      }
      if (!Array.isArray(context[relation])) {
        fail('AGSC-E209', `relation "${relation}" must hold an array of link objects (AGSC-06-09)`);
        continue;
      }
      for (const one of context[relation]) {
        if (one === null || typeof one !== 'object' || typeof one.href !== 'string') {
          fail('AGSC-E209', `a link of "${relation}" carries no href (AGSC-06-09)`);
          continue;
        }
        for (const name of attributesOf(one)) {
          if (newer && !KNOWN_ATTRIBUTES.includes(name)) {
            warn('AGSC-E506', `target attribute "${name}" of "${relation}" is not defined by this version; the document declares the newer ${declared}, so the attribute is ignored (AGSC-00-21)`);
            continue;
          }
          if (!Array.isArray(one[name])) {
            fail('AGSC-E209', `target attribute "${name}" must be an array of strings (AGSC-06-08)`);
          }
          if (level === 0 && LEVEL0_OMITTED.includes(name)) {
            fail('AGSC-E209', `a Level-0 document omits "${name}" (AGSC-06-08a)`);
          }
        }
        if (relation === `${REL}surface`) surfaceFindings(one, fail, warn);
      }
    }
    if (level >= 2) {
      const describedby = (context.describedby || [])[0];
      const present = describedby === undefined ? [] : attributesOf(describedby);
      // AGSC-11-20: on a gated node the four content attributes are FORBIDDEN, not
      // required — the same document is valid with them absent and invalid with
      // them present, which is why the required set is read through the document's
      // own `agsc-visibility` and never from a caller's option.
      const gatedDoc = present.includes('agsc-visibility')
        && [].concat(describedby['agsc-visibility']).map(String).includes('restricted');
      for (const name of ANCHOR_ATTRIBUTES) {
        if (gatedDoc && RESTRICTED_OMITTED.includes(name)) continue;
        if (!present.includes(name)) {
          fail('AGSC-E209', `the anchor's describedby link must carry "${name}" at Level ≥ 2 (AGSC-06-08a)`);
        }
      }
      if (gatedDoc) {
        for (const name of RESTRICTED_OMITTED) {
          if (present.includes(name)) {
            fail('AGSC-E210', `a restricted node must omit "${name}": per-type population, the fingerprint, the content version and the ledger head are content facts (AGSC-11-20)`);
          }
        }
        if ((context[`${REL}ledger`] || []).length > 0) {
          fail('AGSC-E210', 'a restricted node publishes no rel#ledger link (AGSC-11-20)');
        }
      }
      const ledger = (context[`${REL}ledger`] || [])[0];
      // AGSC-10-04 / AGSC-09-93: the derived ledger is part of Level 2, so a public
      // node claiming it links `/ledger.jsonl`. A build that was given no git-log
      // file cannot derive one (AGSC-06-01 makes the route conditional on it) and
      // says so with `requireLedger: false`; the document it writes is then not a
      // Level-2 document, which the validator reports.
      if (ledger === undefined && !gatedDoc && options.requireLedger !== false) {
        fail('AGSC-E202', 'no rel#ledger link: a Level ≥ 2 node publishes /ledger.jsonl and links it (AGSC-10-04)');
      }
      if (ledger !== undefined) {
        for (const name of LEDGER_ATTRIBUTES) {
          if (!attributesOf(ledger).includes(name)) {
            fail('AGSC-E209', `the rel#ledger link must carry "${name}" at Level ≥ 2 (AGSC-06-11)`);
          }
        }
      }
    }
  }
  return out;
}

/** AGSC-11-23: a node that stops publishing carries `agsc-tombstone` on its anchor. */
function tombstoneOf(doc) {
  const context = ((doc || {}).linkset || [])[0] || {};
  const describedby = (context.describedby || [])[0] || {};
  const value = describedby['agsc-tombstone'];
  return Array.isArray(value) ? value[0] : null;
}

/**
 * AGSC-06-08 (amended 2026-10-02 for 1.0.0): true when the document's anchor is on the
 * origin of `url`, the URL it was retrieved from after redirects (RFC 9264 §9, RFC 8615
 * §4.3). A document with no such URL — read from a file — is not judged, so true.
 */
function anchorOnOrigin(doc, url) {
  if (url == null) return true;
  const anchor = (((doc || {}).linkset || [])[0] || {}).anchor;
  try {
    return new URL(String(anchor)).origin === new URL(String(url)).origin;
  } catch (e) {
    return false;
  }
}

/** Every `rel#peer` URL a document names. */
function peersOf(doc) {
  const context = ((doc || {}).linkset || [])[0] || {};
  return (context[`${REL}peer`] || []).map((one) => String(one.href));
}

/**
 * AGSC-10-12: the whole federation protocol. Two nodes federate when each lists the
 * other's canonical well-known URL under `rel#peer`; the check runs offline, over
 * two local documents. A tombstoned peer is *resolved, not mutual* (AGSC-11-23) — a
 * distinct outcome from `AGSC-E907`.
 *
 * @param {Array<{url:string, doc:object|null}>} nodes exactly two.
 * @returns {{both_resolve:boolean, each_names_the_other:boolean, mutual:boolean,
 *   tombstoned:Array<string>, findings:Array<object>}}
 */
function peerCheck(nodes) {
  const [a, b] = nodes;
  const findings = [];
  // A warning — a relation of a newer MINOR ignored (AGSC-00-21) — never fails a peer.
  // AGSC-06-08: a document whose anchor is not on the origin of the URL it was read from
  // is not that node's discovery document.
  const resolves = (n) => n != null && n.doc != null
    && check(n.doc, { level: n.level == null ? 2 : n.level }).every((f) => f.severity !== 'error')
    && anchorOnOrigin(n.doc, n.url);
  const bothResolve = resolves(a) && resolves(b);
  if (!bothResolve) {
    findings.push(finding('AGSC-E907',
      'a peer is unreachable or its discovery document is invalid; skipped for this walk (AGSC-10-12)',
      { file: WELLKNOWN_PATH }));
  }
  const tombstoned = [a, b]
    .filter((n) => n != null && n.doc != null && tombstoneOf(n.doc) != null)
    .map((n) => String(n.url));
  const names = (from, other) => from != null && from.doc != null
    && peersOf(from.doc).includes(String(other.url));
  const eachNames = bothResolve && names(a, b) && names(b, a);
  return {
    both_resolve: bothResolve,
    each_names_the_other: eachNames,
    mutual: eachNames && tombstoned.length === 0,
    tombstoned,
    peer_relation: `${REL}peer`,
    findings,
  };
}

module.exports = {
  anchorOnOrigin,
  KNOWN_ATTRIBUTES,
  OPEN_WHEN_RESTRICTED,
  linkset,
  newerMinor,
  check,
  peerCheck,
  peersOf,
  tombstoneOf,
  countsOf,
  digestOf,
  wellknownUrl,
  href,
  attributesOf,
  WELLKNOWN_SUFFIX,
  WELLKNOWN_PATH,
  WELLKNOWN_ALIAS,
  MEDIA_TYPE,
  PROFILE,
  REL,
  EXTENSION_RELATIONS,
  REGISTERED_RELATIONS,
  RELATED_RELATIONS,
  ALLOWED_RELATIONS,
  ANCHOR_ATTRIBUTES,
  LEDGER_ATTRIBUTES,
  RESTRICTED_OMITTED,
  COUNTED_TYPES,
};
