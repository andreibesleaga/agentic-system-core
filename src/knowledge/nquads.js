'use strict';
// CONTEXT Knowledge — aggregate: the RDF dataset of a Bundle, and its canonical form.
//
// Implements AGSC-05-01…05-03 (IRIs), AGSC-05-12/05-13 (classes), AGSC-05-14/05-15
// (Source and Review fragment IRIs and their reachability edges), AGSC-05-16 (the
// fourteen Link keys and their computed inverses), AGSC-05-26/05-26a/05-27 (the
// frontmatter → property table), AGSC-05-29/05-30 (attachments, ports, task state),
// AGSC-05-31 (the three literal forms), AGSC-05-32 (N-Quads escaping),
// AGSC-04-13/04-15/04-16 (the sort that IS the canonicalisation) and AGSC-06-33
// (the optional static fragments).
//
// PURE: no fs, no process, no clock, no network, no cross-context require. The build
// instant, the file bytes of an attachment and the Bundle configuration are passed in.
//
// WHY THIS FILE WRITES N-QUADS BY HAND. `n3@2.7.12` is the pinned RDF library and it
// parses this module's output in the round-trip tests, but its *writer* cannot be
// used here: probed on 2026-09-18 it emits `\U0001f600` for an astral character and
// omits `^^<xsd:string>` on a plain literal — the two forms AGSC-05-32 and
// AGSC-05-31(c) specifically forbid and require (vector `graph-0012`). The escaping
// and the ordering are pinned byte-for-byte by the specification, so they are ours;
// everything a library can be trusted with (parsing, isomorphism checks) is the
// library's.
//
// The dataset is blank-node-free by construction (AGSC-05-08): every node a rule of
// §05 instantiates — item, Bundle, Source, Review, Attachment — has an IRI, and the
// canonicalisation of AGSC-04-16 therefore degenerates to the sort of AGSC-04-13.

const { compareCodePoint } = require('./unicode.js');
const skos = require('./skos.js');

// ---------------------------------------------------------------- namespaces

/** The vocabulary namespace. A constant of the specification (AGSC-05-02). */
const NS = 'https://w3id.org/agentic-system-core/ns#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const DCTERMS = 'http://purl.org/dc/terms/';
const PROV = 'http://www.w3.org/ns/prov#';
const SCHEMA = 'https://schema.org/';
const XSD = 'http://www.w3.org/2001/XMLSchema#';

const XSD_STRING = `${XSD}string`;
const XSD_DATETIME = `${XSD}dateTime`;
const RDF_TYPE = `${RDF}type`;

/** The prefix table of the stable-Turtle profile and of the context file, in code-point order of the prefix (AGSC-05-10, AGSC-06-32). */
const PREFIXES = Object.freeze({
  asc: NS,
  dcterms: DCTERMS,
  prov: PROV,
  rdfs: RDFS,
  schema: SCHEMA,
  skos: SKOS,
  xsd: XSD,
});

// ---------------------------------------------------------------- terms

/** An IRI term. Frozen: terms are value objects (SWEBOK design, ubiquitous language). */
function iri(value) {
  return Object.freeze({ termType: 'iri', value });
}

/**
 * A literal term in one of the three forms of AGSC-05-31:
 * (a) `{ lang }` language-tagged, never also typed; (b) `{ datatype }` typed;
 * (c) plain — which IS `xsd:string` and is written with an explicit datatype in
 * N-Quads and without one in Turtle.
 */
function literal(value, options = {}) {
  const lang = options.lang ? String(options.lang).toLowerCase() : undefined;
  if (lang) return Object.freeze({ termType: 'literal', value, lang });
  return Object.freeze({ termType: 'literal', value, datatype: options.datatype || XSD_STRING });
}

/**
 * A quad. `graph` is null in the default graph, and a plain IRI string is accepted
 * there and wrapped, because every caller of this module names a graph by its IRI.
 */
function quad(subject, predicate, object, graph) {
  const name = typeof graph === 'string' ? iri(graph) : graph;
  return Object.freeze({ subject, predicate, object, graph: name || null });
}

// ---------------------------------------------------------------- IRIs (AGSC-05-01…05-03)

const TYPE_PLURAL = Object.freeze({
  concept: 'concepts',
  procedure: 'procedures',
  lesson: 'lessons',
  episode: 'episodes',
  gate: 'gates',
  cluster: 'clusters',
});

/** `<type>` → `<type-plural>` of the route and of the item IRI (AGSC-05-01, AGSC-06-01). */
function typePlural(type) {
  return TYPE_PLURAL[type] || null;
}

/** `<site.base>/` — the Bundle IRI (AGSC-05-03). Accepts the base with or without its trailing slash. */
function bundleIri(base) {
  return `${String(base || '').replace(/\/+$/u, '')}/`;
}

/** `<site.base>/<type-plural>/<slug>/` — the item IRI (AGSC-05-01). */
function itemIri(item, options) {
  const plural = typePlural(item.type);
  if (!plural) return null;
  return `${bundleIri(options.base)}${plural}/${item.slug}/`;
}

// ---------------------------------------------------------------- serialization (AGSC-05-32)

/**
 * The escapes of AGSC-05-32 and no others: `\\`, `\"`, `\n`, `\r`, `\t` and
 * `\u00XX` (four LOWERCASE hex digits) for every other character below U+0020.
 * Every character at or above U+0020 is written as itself in UTF-8, so an astral
 * character is never `\U`-escaped (vector `graph-0012`). Iteration is by code
 * point, so a surrogate pair is never split.
 */
function escapeLiteral(value) {
  let out = '';
  for (const ch of value) {
    const cp = ch.codePointAt(0);
    if (ch === '\\') out += '\\\\';
    else if (ch === '"') out += '\\"';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (cp < 0x20) out += `\\u${cp.toString(16).padStart(4, '0')}`;
    else out += ch;
  }
  return out;
}

/** Characters an IRIREF cannot carry unescaped (RFC 3987 §2.2; AGSC-11-12 rejects them at lint, so this is a guard, not a rewrite). */
const IRI_FORBIDDEN = new Set(['<', '>', '"', '{', '}', '|', '^', '`', '\\']);

/** An IRI between `<` and `>`, with the same control-character escaping and no percent-re-encoding (AGSC-05-32). */
function escapeIri(value) {
  let out = '';
  for (const ch of value) {
    const cp = ch.codePointAt(0);
    if (cp < 0x20 || IRI_FORBIDDEN.has(ch)) out += `\\u${cp.toString(16).padStart(4, '0')}`;
    else out += ch;
  }
  return out;
}

/** One term in N-Quads syntax. A plain literal carries an explicit `^^xsd:string` (AGSC-05-31 form c). */
function nquadsTerm(term) {
  if (term.termType === 'iri') return `<${escapeIri(term.value)}>`;
  if (term.lang) return `"${escapeLiteral(term.value)}"@${term.lang}`;
  return `"${escapeLiteral(term.value)}"^^<${escapeIri(term.datatype)}>`;
}

/** One quad as one N-Quads line, without its LF. */
function nquadsLine(q) {
  const graph = q.graph ? ` ${nquadsTerm(q.graph)}` : '';
  return `${nquadsTerm(q.subject)} ${nquadsTerm(q.predicate)} ${nquadsTerm(q.object)}${graph} .`;
}

/**
 * Canonical N-Quads (AGSC-04-15/04-16): the lines de-duplicated and sorted by their
 * serialized bytes, each terminated by a single LF. UTF-8 preserves code-point
 * order, so the code-point comparison of AGSC-04-12 IS the byte comparison.
 */
function serialize(quads) {
  const lines = [...new Set(quads.map(nquadsLine))].sort(compareCodePoint);
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------- the mapping tables

/**
 * The fourteen Link keys → RDF property, and the computed inverse where §03 names
 * one (AGSC-05-16, AGSC-03-04/05). `derived-from` has no inverse row: §03 names the
 * authored direction only (`prov:wasDerivedFrom`), and AGSC-05-27's object-property
 * list is closed, so no `prov:hadDerivation` is invented.
 */
const LINK_PROPERTIES = Object.freeze({
  related: { property: `${SKOS}related`, symmetric: true },
  broader: { property: `${SKOS}broader`, inverse: `${SKOS}narrower` },
  narrower: { property: `${SKOS}narrower`, inverse: `${SKOS}broader` },
  uses: { property: `${NS}uses`, inverse: `${NS}usedBy` },
  requires: { property: `${DCTERMS}requires`, inverse: `${DCTERMS}isRequiredBy` },
  excludes: { property: `${NS}excludes`, symmetric: true },
  'derived-from': { property: `${PROV}wasDerivedFrom` },
  contradicts: { property: `${NS}contradicts`, symmetric: true },
  supersedes: { property: `${DCTERMS}replaces`, inverse: `${DCTERMS}isReplacedBy` },
  implements: { property: `${NS}implements`, inverse: `${NS}implementedBy` },
  verifies: { property: `${NS}verifies`, inverse: `${NS}isVerifiedBy` },
  covers: { property: `${NS}covers`, inverse: `${NS}coveredBy` },
  'blocked-by': { property: `${NS}blockedBy`, inverse: `${NS}blocks` },
  'decided-by': { property: `${NS}decidedBy`, inverse: `${NS}decides` },
});

/**
 * The AGSC-05-26 table, extended by AGSC-05-30: frontmatter key (dotted for a nested
 * mapping) → property and datatype, on the item. A key absent from an item emits no
 * triple and nothing is ever inferred — `status` included, whose AGSC-02-23 default
 * is a reading default (AGSC-05-26).
 *
 * `array: true` emits one triple per value. `date: true` renders a `YYYY-MM-DD` by
 * the midnight convention of AGSC-05-14.
 */
const DATATYPE_PROPERTIES = Object.freeze([
  { key: 'status', property: `${NS}status`, datatype: XSD_STRING },
  { key: 'kind', property: `${NS}kind`, datatype: XSD_STRING, types: ['concept'] },
  { key: 'stale_after', property: `${NS}staleAfter`, datatype: XSD_DATETIME, date: true },
  { key: 'prov.origin', property: `${NS}origin`, datatype: XSD_STRING },
  { key: 'prov.operator', property: `${NS}operator`, datatype: XSD_STRING },
  { key: 'prov.model', property: `${NS}model`, datatype: XSD_STRING },
  { key: 'level', property: `${NS}level`, datatype: XSD_STRING, types: ['gate'] },
  { key: 'severity', property: `${NS}severity`, datatype: XSD_STRING, types: ['lesson'] },
  { key: 'outcome', property: `${NS}outcome`, datatype: XSD_STRING, types: ['episode'] },
  { key: 'generated.by', property: `${NS}generatedBy`, datatype: XSD_STRING },
  { key: 'generated.at', property: `${NS}generatedAt`, datatype: XSD_DATETIME, date: true },
  { key: 'produces', property: `${NS}produces`, datatype: XSD_STRING, array: true, types: ['concept'] },
  { key: 'consumes', property: `${NS}consumes`, datatype: XSD_STRING, array: true, types: ['concept'] },
  { key: 'task_state', property: `${NS}taskState`, datatype: XSD_STRING, types: ['concept'] },
]);

/**
 * Frontmatter keys that are deliberately NOT exported, each with the rule that says
 * so. Named here so that adding an export is a decision and not an accident.
 *   `verdict_digest`  AGSC-05-30 — not exported (vector `graph-0013`).
 *   `prov.agent`      AGSC-05-26 — a build-time severity discriminator, not a fact.
 *   `prov.agreement`  AGSC-05-26 — carried by the DCO-Plus trailer (AGSC-08-06).
 */
const NEVER_EXPORTED = Object.freeze(['verdict_digest', 'prov.agent', 'prov.agreement']);

/**
 * AGSC-06-18: the **Content Use Terms identifier** is a constant of the
 * specification — "it names the terms every export carries, INDEPENDENTLY of
 * `bundle.license_prose`". AGSC-05-26 makes it the
 * object of `schema:usageInfo` on the Bundle node AND on every item node, as an
 * `xsd:string` literal (AGSC-05-31 form (c)), so that `pages/<slug>.jsonld` and the
 * `export --jsonl` line of AGSC-01-27 carry the licence without a second fetch.
 * Before rc.5 the engine took it from `options.bundle.usage_info` and wrote it as an
 * IRI, on the Bundle alone; both were defects (vector `graph-0015`).
 */
const CONTENT_USE_TERMS = 'LicenseRef-AgenticSystemCore-Content-Use-1.0';

/**
 * The two AGSC-05-26 rows that come from CONFIGURATION rather than from an item key:
 * `schema:license` (the value of `bundle.license_prose`) and `schema:usageInfo` (the
 * constant above). Both are emitted on the subject given, as plain literals.
 *
 * They are emitted only when the caller supplies `options.bundle` — the record of the
 * build's configuration. With no configuration there is no `license_prose` to name and
 * no build whose terms could be stated, which is why every released vector that
 * serialises a bare item list (`graph-0001`, `graph-0002`, `graph-0004`, `graph-0006`)
 * expects neither triple and is unchanged by this rule.
 */
function licenceQuads(bundle, subject, graph) {
  const out = [];
  if (!bundle) return out;
  if (bundle.license_prose !== undefined) {
    out.push(quad(iri(subject), iri(`${SCHEMA}license`), literal(String(bundle.license_prose)), graph));
  }
  // AGSC-06-18 (rc.6, 2026-09-24): the Content Use Terms only where the publisher
  // adopts them; otherwise the prose licence stands in their place.
  const adopted = bundle.license_prose == null || String(bundle.license_prose) === CONTENT_USE_TERMS;
  const usage = bundle.terms != null ? String(bundle.terms)
    : (adopted ? CONTENT_USE_TERMS : String(bundle.license_prose));
  out.push(quad(iri(subject), iri(`${SCHEMA}usageInfo`), literal(usage), graph));
  return out;
}

// ---------------------------------------------------------------- small helpers

function readPath(object, dotted) {
  return dotted.split('.').reduce((value, key) => (
    value && typeof value === 'object' ? value[key] : undefined), object);
}

/**
 * The midnight convention of AGSC-05-14: a `YYYY-MM-DD` date becomes the instant
 * `YYYY-MM-DDT00:00:00Z`, because the OWL 2 datatype map has no `xsd:date`
 * (AGSC-05-22). A value that is already an instant is returned unchanged.
 */
function instant(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? `${value}T00:00:00Z` : value;
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

// ---------------------------------------------------------------- the dataset

/**
 * Resolve a Link value — a slug, optionally `<slug>#<anchor>` (AGSC-03-02) — to the
 * target's IRI. An unresolved target emits no edge; it is the lint error AGSC-E301,
 * raised where links are resolved, not here.
 */
function resolveTarget(value, index) {
  const hash = String(value).indexOf('#');
  const slug = hash === -1 ? String(value) : String(value).slice(0, hash);
  const anchor = hash === -1 ? '' : String(value).slice(hash);
  const target = index.get(slug);
  return target ? { iri: `${target.iri}${anchor}`, type: target.type } : null;
}

/** The Source nodes of `sources[]` and the `asc:source` reachability edges (AGSC-05-14). */
function sourceQuads(item, subject, graph) {
  const out = [];
  asArray(item.sources).forEach((entry, n) => {
    const node = iri(`${subject}#source-${n + 1}`);
    out.push(quad(iri(subject), iri(`${NS}source`), node, graph));
    out.push(quad(node, iri(RDF_TYPE), iri(`${NS}Source`), graph));
    if (entry.resource !== undefined) out.push(quad(node, iri(`${DCTERMS}source`), literal(entry.resource), graph));
    if (entry.title !== undefined) out.push(quad(node, iri(`${DCTERMS}title`), literal(entry.title), graph));
    if (entry.author !== undefined) out.push(quad(node, iri(`${DCTERMS}creator`), literal(entry.author), graph));
    if (entry.year !== undefined) out.push(quad(node, iri(`${DCTERMS}date`), literal(String(entry.year)), graph));
    if (entry.verified !== undefined) {
      out.push(quad(node, iri(`${NS}verifiedOn`), literal(instant(entry.verified), { datatype: XSD_DATETIME }), graph));
    }
    if (entry.grade !== undefined) out.push(quad(node, iri(`${NS}grade`), literal(entry.grade), graph));
  });
  return out;
}

/** The Review nodes of `verified[]` and the `asc:review` reachability edges (AGSC-05-15). */
function reviewQuads(item, subject, graph) {
  const out = [];
  asArray(item.verified).forEach((entry, n) => {
    const node = iri(`${subject}#review-${n + 1}`);
    out.push(quad(iri(subject), iri(`${NS}review`), node, graph));
    out.push(quad(node, iri(RDF_TYPE), iri(`${NS}Review`), graph));
    if (entry.by !== undefined) out.push(quad(node, iri(`${NS}verifiedBy`), literal(entry.by), graph));
    if (entry.at !== undefined) {
      out.push(quad(node, iri(`${NS}verifiedAt`), literal(instant(entry.at), { datatype: XSD_DATETIME }), graph));
    }
  });
  return out;
}

/** Look up an attachment's bytes by `<slug>/<file>` first, then by `<file>` alone. */
function attachmentBytes(store, slug, file) {
  if (!store) return undefined;
  if (typeof store === 'function') return store(slug, file);
  const get = (key) => (store instanceof Map ? store.get(key) : store[key]);
  const scoped = get(`${slug}/${file}`);
  return scoped === undefined ? get(file) : scoped;
}

/**
 * The Attachment nodes of `attachments[]` and the `asc:hasAttachment` edges
 * (AGSC-05-29). `options.sha256` hashes the file bytes; the Knowledge context never
 * reads a file, so both the bytes and the hash function are injected.
 *
 * Exported on its own because `graph-0010` states exactly these quads.
 */
function attachmentQuads(item, options) {
  const subject = options.subject || itemIri(item, options);
  const graph = options.graph === null ? null : (options.graph || bundleIri(options.base));
  const licence = options.license || (options.bundle && options.bundle.license_prose);
  const out = [];
  asArray(item.attachments).forEach((entry, n) => {
    const node = iri(`${subject}#attachment-${n + 1}`);
    out.push(quad(iri(subject), iri(`${NS}hasAttachment`), node, graph));
    out.push(quad(node, iri(RDF_TYPE), iri(`${NS}Attachment`), graph));
    if (entry.media_type !== undefined) out.push(quad(node, iri(`${DCTERMS}format`), literal(entry.media_type), graph));
    const resolved = entry.license || licence;
    if (resolved !== undefined) out.push(quad(node, iri(`${DCTERMS}license`), literal(resolved), graph));
    if (entry.file !== undefined) out.push(quad(node, iri(`${DCTERMS}source`), literal(entry.file), graph));
    if (entry.alt !== undefined) out.push(quad(node, iri(`${DCTERMS}title`), literal(entry.alt), graph));
    const bytes = attachmentBytes(options.attachmentBytes, item.slug, entry.file);
    if (bytes !== undefined && typeof options.sha256 === 'function') {
      out.push(quad(node, iri(`${NS}sha256`), literal(options.sha256(bytes)), graph));
    }
  });
  return out;
}

/** The datatype properties of the AGSC-05-26 table, extended by AGSC-05-30. */
function datatypeQuads(item, subject, graph) {
  const out = [];
  for (const row of DATATYPE_PROPERTIES) {
    if (row.types && !row.types.includes(item.type)) continue;
    const raw = readPath(item, row.key);
    if (raw === undefined || raw === null) continue;
    const values = row.array ? asArray(raw) : [raw];
    for (const value of values) {
      const text = row.date ? instant(String(value)) : String(value);
      out.push(quad(iri(subject), iri(row.property), literal(text, { datatype: row.datatype }), graph));
    }
  }
  // AGSC-11-22: a retired item stays in the graph and carries asc:retiredAt, derived
  // from `modified`, from `date` when `modified` is absent, and omitted when neither is.
  if (item.status === 'retired') {
    const when = item.modified !== undefined ? item.modified : item.date;
    if (when !== undefined) {
      out.push(quad(iri(subject), iri(`${NS}retiredAt`), literal(instant(String(when)), { datatype: XSD_DATETIME }), graph));
    }
  }
  return out;
}

/**
 * `date`/`modified` → `dcterms:created`/`dcterms:modified` (AGSC-05-27).
 *
 * At rc.5 the AGSC-05-26 table gained the two rows the gap this comment
 * used to report was about: `date` → `dcterms:created` and `modified` →
 * `dcterms:modified`, both `xsd:dateTime` at midnight of that date (AGSC-04-10), and
 * AGSC-05-31 form (b) names them as the one DCTerms exception to form (c). The
 * engine's reading is now the rule's own text; vector `graph-0018`.
 */
function dateQuads(item, subject, graph) {
  const out = [];
  if (item.date !== undefined) {
    out.push(quad(iri(subject), iri(`${DCTERMS}created`), literal(instant(String(item.date)), { datatype: XSD_DATETIME }), graph));
  }
  if (item.modified !== undefined) {
    out.push(quad(iri(subject), iri(`${DCTERMS}modified`), literal(instant(String(item.modified)), { datatype: XSD_DATETIME }), graph));
  }
  return out;
}

/** The typed Links of AGSC-05-16 and their computed inverses (AGSC-03-04/05/06). */
function linkQuads(item, subject, index, graph) {
  const out = [];
  for (const [key, rule] of Object.entries(LINK_PROPERTIES)) {
    // A `broader` on a cluster is nesting, not a semantic relation: SKOS owns it
    // (AGSC-05-19) and it is emitted by `skos.membership`, never here.
    if (key === 'broader' && item.type === 'cluster') continue;
    for (const value of asArray(item[key])) {
      const target = resolveTarget(value, index);
      if (!target) continue;
      // AGSC-05-20: a Collection MUST NOT appear in a semantic relation. Neither end
      // may be a Cluster, or the export would entail the S37 contradiction.
      if (skos.isSemanticRelation(rule.property)
          && !(skos.allowsSemanticRelation(item.type) && skos.allowsSemanticRelation(target.type))) continue;
      out.push(quad(iri(subject), iri(rule.property), iri(target.iri), graph));
      if (rule.symmetric) out.push(quad(iri(target.iri), iri(rule.property), iri(subject), graph));
      else if (rule.inverse) out.push(quad(iri(target.iri), iri(rule.inverse), iri(subject), graph));
    }
  }
  return out;
}

/**
 * The RDF dataset of a set of items (AGSC-05). Blank-node-free by construction.
 *
 * @param {object[]} items  parsed items: `{ type, slug, ...frontmatter }`
 * @param {object} options
 *   `base`            the site base (AGSC-05-01)
 *   `graph`           the graph name; defaults to the Bundle IRI, `null` puts every
 *                     quad in the default graph
 *   `bundle`          `{ id, spec_version, license_prose }` — when given,
 *                     the Bundle node of AGSC-05-03/05-26 is emitted
 *   `lang`            `i18n.default` (AGSC-01-13), the fallback language tag
 *   `attachmentBytes` `{ '<slug>/<file>' | '<file>': bytes }` or a lookup function
 *   `sha256`          `(bytes) => lowercase hex` (AGSC-05-29); injected, since the
 *                     Knowledge context hashes but never reads
 *   `mentions`        `[{source, target}]` — the inline-link edges of AGSC-03-11,
 *                     already resolved to slugs by the Links module
 *   `citations`       `[{source, see_also, peer}]` — the AGSC-11-12 peer citations,
 *                     already normalised by `boundary/federation.js#peerCitations`
 * @returns {object[]} quads
 */
function dataset(items, options = {}) {
  const list = asArray(items);
  const base = bundleIri(options.base);
  const graph = options.graph === null ? null : (options.graph ? String(options.graph) : base);
  const defaultLang = options.lang || 'en';
  const index = new Map(list.filter((it) => typePlural(it.type))
    .map((it) => [it.slug, { iri: itemIri(it, { base }), type: it.type }]));
  const out = [];

  if (options.bundle) {
    const node = iri(base);
    out.push(quad(node, iri(RDF_TYPE), iri(`${NS}Bundle`), graph));
    if (options.bundle.spec_version !== undefined) {
      out.push(quad(node, iri(`${NS}specVersion`), literal(options.bundle.spec_version), graph));
    }
    out.push(...licenceQuads(options.bundle, base, graph));
  }

  for (const item of list) {
    const subject = itemIri(item, { base });
    if (!subject) continue;
    const lang = item.lang ? String(item.lang).toLowerCase() : defaultLang;
    out.push(quad(iri(subject), iri(RDF_TYPE), iri(skos.classOf(item.type)), graph));
    if (skos.isConceptType(item.type)) out.push(quad(iri(subject), iri(`${SKOS}inScheme`), iri(base), graph));
    for (const label of skos.labels(item, { lang })) {
      out.push(quad(iri(subject), iri(label.property), literal(label.value, { lang: label.lang }), graph));
    }
    out.push(...licenceQuads(options.bundle, subject, graph));
    out.push(...datatypeQuads(item, subject, graph));
    out.push(...dateQuads(item, subject, graph));
    out.push(...linkQuads(item, subject, index, graph));
    out.push(...sourceQuads(item, subject, graph));
    out.push(...reviewQuads(item, subject, graph));
    out.push(...attachmentQuads(item, { ...options, base, graph, subject }));
  }

  for (const edge of skos.membership(list, (slug) => (index.has(slug) ? index.get(slug).iri : null))) {
    out.push(quad(iri(edge.subject), iri(`${SKOS}member`), iri(edge.object), graph));
  }

  // AGSC-03-11/05-16 — an inline Markdown link between items is the untyped edge
  // `asc:mentions`. Resolving a body's links is the Links module's work, so the
  // resolved pairs are INJECTED rather than re-derived here: `mentions` is
  // `[{source, target}]` of slugs (or IRIs), which is what `links.resolve` yields.
  for (const edge of asArray(options.mentions)) {
    const source = resolveTarget(edge.source, index);
    const target = resolveTarget(edge.target, index);
    if (source && target) out.push(quad(iri(source.iri), iri(`${NS}mentions`), iri(target.iri), graph));
  }

  // AGSC-11-12 (F6) — a citation of a declared peer's page is `rdfs:seeAlso` plus
  // `asc:peerOrigin` on the citing item. Which `sources[].resource` values lie under
  // a peer base, and their normalised IRIs, are the Boundary context's decision
  // (`boundary/federation.js#peerCitations`), so the pairs are INJECTED exactly as
  // `mentions` is; this writer only places them. A pair whose citing item is not in
  // this dataset (another item's per-page view) contributes nothing.
  for (const citation of asArray(options.citations)) {
    const source = resolveTarget(citation.source, index);
    if (!source || typeof citation.see_also !== 'string' || typeof citation.peer !== 'string') continue;
    out.push(quad(iri(source.iri), iri(`${RDFS}seeAlso`), iri(citation.see_also), graph));
    out.push(quad(iri(source.iri), iri(`${NS}peerOrigin`), iri(citation.peer), graph));
  }
  return out;
}

/** Canonical N-Quads for a set of items (AGSC-04-15). */
function toNQuads(items, options = {}) {
  return serialize(dataset(items, options));
}

// ---------------------------------------------------------------- static fragments (AGSC-06-33)

/** The first 16 hex characters of the SHA-256 of an IRI (AGSC-06-33). */
function fragmentName(value, sha256) {
  return sha256(value).slice(0, 16);
}

/**
 * The optional static query fragments of AGSC-06-33: one file per distinct subject
 * IRI and per distinct predicate IRI, each holding that term's lines of `graph.nq`
 * in the same byte order, plus the index. Object fragments are NOT emitted at 1.x,
 * and a writer that emits no fragment emits no index.
 *
 * @param {string} nquads   canonical N-Quads (the output of `serialize`)
 * @param {object} options  `sha256` (injected, AGSC-04-17) and `generatedAt`
 *                          (AGSC-04-09/04-10 — the build instant, never a clock)
 * @returns {{files: {path: string, text: string}[], index: object|null}}
 */
function shard(nquads, options = {}) {
  const sha256 = options.sha256;
  const lines = String(nquads).split('\n').filter((line) => line !== '');
  const subjects = new Map();
  const predicates = new Map();
  for (const line of lines) {
    const match = /^<([^>]*)> <([^>]*)> /u.exec(line);
    if (!match) continue;
    const [, subject, predicate] = match;
    if (!subjects.has(subject)) subjects.set(subject, []);
    if (!predicates.has(predicate)) predicates.set(predicate, []);
    subjects.get(subject).push(line);
    predicates.get(predicate).push(line);
  }
  const files = [];
  const collect = (map, dir) => [...map.entries()]
    .map(([term, own]) => ({ path: `${dir}/${fragmentName(term, sha256)}.nq`, text: `${own.join('\n')}\n` }))
    .sort((a, b) => compareCodePoint(a.path, b.path));
  const subjectFiles = collect(subjects, 's');
  const predicateFiles = collect(predicates, 'p');
  files.push(...subjectFiles, ...predicateFiles);
  if (files.length === 0) return { files: [], index: null };
  return {
    files,
    index: {
      generated_at: options.generatedAt,
      predicates: predicateFiles.map((f) => f.path),
      subjects: subjectFiles.map((f) => f.path),
    },
  };
}

/**
 * How many blank nodes a serialization carries. Always 0 for this engine's own
 * output (AGSC-05-08); the counter exists so that a test can say so rather than
 * assume it (vector `graph-0010`).
 */
function countBlankNodes(nquads) {
  return (String(nquads).match(/(?:^|[\s<])_:/gu) || []).length;
}

module.exports = {
  NS,
  RDF,
  RDFS,
  SKOS,
  DCTERMS,
  PROV,
  SCHEMA,
  XSD,
  XSD_STRING,
  XSD_DATETIME,
  RDF_TYPE,
  PREFIXES,
  LINK_PROPERTIES,
  DATATYPE_PROPERTIES,
  NEVER_EXPORTED,
  CONTENT_USE_TERMS,
  iri,
  literal,
  quad,
  typePlural,
  bundleIri,
  itemIri,
  instant,
  escapeLiteral,
  escapeIri,
  nquadsTerm,
  serialize,
  dataset,
  attachmentQuads,
  toNQuads,
  shard,
  fragmentName,
  countBlankNodes,
};
