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
// Pure function of its input; `site.js` writes the bytes. Vectors disc-0003,
// disc-0004, disc-0005.

const { createHash } = require('node:crypto');
const { compareCodePoint, compareUtf16 } = require('../knowledge/unicode.js');
const { finding } = require('../knowledge/validate.js');

/** AGSC-06-07 (D60): the one substitutable constant. */
const WELLKNOWN_SUFFIX = 'knowledge-linkset';
const WELLKNOWN_PATH = `/.well-known/${WELLKNOWN_SUFFIX}`;
/** AGSC-06-17 (D60): the alias kept until the last 0.0.x consumer is retired. */
const WELLKNOWN_ALIAS = '/.well-known/agentic-knowledge';
const MEDIA_TYPE = 'application/linkset+json';
const PROFILE = 'https://w3id.org/agentic-system-core/profile/agentic-knowledge';
const REL = 'https://w3id.org/agentic-system-core/rel#';

/** AGSC-06-10: the extension relation names, and no others. */
const EXTENSION_RELATIONS = Object.freeze([
  'access', 'context', 'contribute', 'graph', 'ledger', 'now',
  'ontology', 'peer', 'signature', 'skills', 'surface',
]); // `signature`: AGSC-06-08/06-10 as amended at rc.6 — optional, affects nothing
/** AGSC-06-10 + AGSC-06-35: the IANA-registered short names this profile uses. */
const REGISTERED_RELATIONS = Object.freeze([
  'alternate', 'author', 'cite-as', 'collection', 'describedby', 'item', 'license',
  'related', 'service-desc', 'service-doc', 'service-meta',
]); // `cite-as` (RFC 8574): AGSC-06-10/06-35 as amended at rc.6
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
 * `agsc-bundle-version` (AGSC-04-25, added at rc.6) sits between
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
  const digest = (route) => (full && digests[route] != null ? digests[route] : undefined);
  const emitted = options.routes == null ? null : new Set(options.routes);
  const has = (route) => (emitted === null ? full : emitted.has(route));

  const context = { anchor };
  const put = (relation, list) => {
    if (list.length > 0) context[relation] = byHref(list);
  };

  // AGSC-06-08: bundle facts ride on the anchor's `describedby` link and NOWHERE else.
  // AGSC-11-20: a `restricted` node publishes neither the content facts nor the
  // content version, at any Level. Until rc.6 this was stated by the rule, checked
  // by nothing and emitted anyway (V9A-22 fixed the rule, not the writer).
  const gated = visibility === 'restricted';
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
  put('license', [link(href(base, '/legal/'), null, {})]);
  put('service-doc', [link(href(base, '/specs/'), null, {})]);

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
  for (const entry of (Array.isArray(config && config.related) ? config.related : [])) {
    const relation = String(entry.rel);
    const one = link(String(entry.href), entry.type == null ? undefined : entry.type, {
      profile: entry.profile, title: entry.title,
    });
    context[relation] = byHref([...(context[relation] || []), one]);
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
 * Validate a discovery document (AGSC-06-08, AGSC-06-08a, AGSC-06-09/10).
 * Structural faults are Findings with registered codes, never thrown strings.
 *
 * @param {object} doc
 * @param {{level?:number, file?:string}} [options]
 * @returns {Array<object>} Findings; empty means the document conforms.
 */
function check(doc, options = {}) {
  const level = options.level == null ? 2 : Number(options.level);
  const file = options.file == null ? WELLKNOWN_PATH : options.file;
  const out = [];
  const fail = (code, message) => out.push(finding(code, message, { file }));

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
    for (const relation of Object.keys(context)) {
      if (relation === 'anchor') continue;
      if (!ALLOWED_RELATIONS.includes(relation)) {
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
          if (!Array.isArray(one[name])) {
            fail('AGSC-E209', `target attribute "${name}" must be an array of strings (AGSC-06-08)`);
          }
          if (level === 0 && LEVEL0_OMITTED.includes(name)) {
            fail('AGSC-E209', `a Level-0 document omits "${name}" (AGSC-06-08a)`);
          }
        }
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
  const resolves = (n) => n != null && n.doc != null && check(n.doc, { level: n.level == null ? 2 : n.level }).length === 0;
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
  linkset,
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
  LEVEL0_OMITTED,
  RESTRICTED_OMITTED,
  COUNTED_TYPES,
  BUILTIN_SURFACE_ACCESS,
};
