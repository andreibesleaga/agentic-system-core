'use strict';
// CONTEXT Knowledge — aggregate: Chunk.
// Implements AGSC-06-26 (the `/chunks.jsonl` file), AGSC-06-27 (the two cuts),
// AGSC-06-28 (the identifier), AGSC-06-29 (the record shape and the line order),
// AGSC-06-30 (exclusions, clusters and attachments) and AGSC-06-31 (the shards and
// the manifest). The anchors of AGSC-03-13 are computed here for the `section`
// member that AGSC-06-28 names.
//
// The chunk export is Knowledge, not Distribution (spec/06 §6.5): what a chunk IS
// — where it is cut, what it carries, what its identifier is — is a property of the
// Bundle, and `distribution/site.js` only writes the bytes this module produces.
//
// PURE: no fs, no process, no clock, no network, no cross-context require.
// `node:crypto` is used for SHA-256 only: a deterministic function of its input,
// with no host state, exactly as AGSC-04-03 requires of this context.
//
// The CommonMark parse and the AGSC-03-13 anchors are `knowledge/markdown.js`'s
// (WP-10-C), not a second implementation: one parser decides what a fence is and
// one algorithm decides what an anchor is, so a chunk's `section` is always the
// anchor the rendered page carries.
//
// Vectors: chk-0001…chk-0007.

const { createHash } = require('node:crypto');
const { compareCodePoint } = require('./unicode.js');
const markdown = require('./markdown.js');

/** AGSC-06-18: the Content Use Terms identifier, a constant, never configurable. */
const TERMS = 'LicenseRef-AgenticSystemCore-Content-Use-1.0';
/** AGSC-08-18: the value an agent MUST attach when chunk text re-enters a model. */
const TRUST = 'untrusted';
/** AGSC-06-27: the default and the maximum of `chunks.max_bytes` (AGSC-11-01). */
const DEFAULT_MAX_BYTES = 4096;
const MAX_MAX_BYTES = 65536;
const MIN_MAX_BYTES = 256;
/** AGSC-06-31 / AGSC-06-21: the sharding trigger, counted in ITEMS, not lines. */
const ITEMS_PER_SHARD = 500;

/** AGSC-03-01: the fourteen Link keys, in the order the schema declares them. */
const LINK_KEYS = Object.freeze([
  'related', 'broader', 'narrower', 'uses', 'requires', 'excludes',
  'derived-from', 'contradicts', 'supersedes',
  'implements', 'verifies', 'covers', 'blocked-by', 'decided-by',
]);

/** AGSC-01-02 / AGSC-05-01: the folder and IRI segment of each item type. */
const TYPE_PLURAL = Object.freeze({
  concept: 'concepts',
  procedure: 'procedures',
  lesson: 'lessons',
  episode: 'episodes',
  cluster: 'clusters',
  gate: 'gates',
});

/** AGSC-06-30 / AGSC-11-22: statuses excluded from every published surface. */
const EXCLUDED_STATUS = Object.freeze(['draft', 'retired']);

// ------------------------------------------------------- AGSC-06-27 cut points

/**
 * The Cut-1 points of AGSC-06-27: every ATX heading of level 2 or 3 that lies
 * OUTSIDE any fenced (or indented) code block, in document order, with the
 * AGSC-03-13 anchor the page gives it. A `## ` line inside a fence is content and a
 * setext heading is not a cut point — both of which follow from asking the
 * CommonMark parser rather than a regular expression.
 *
 * @param {string} body
 * @returns {Array<{line:number, anchor:string}>} `line` is 0-based.
 */
function cutPoints(body) {
  const scanned = markdown.scan(String(body));
  const code = new Set();
  for (const token of scanned.tokens) {
    if (token.type !== 'fence' && token.type !== 'code_block') continue;
    if (!Array.isArray(token.map)) continue;
    for (let i = token.map[0]; i < token.map[1]; i += 1) code.add(i);
  }
  // `headings[].line` is 1-based and `id` is the resolved AGSC-03-13 anchor,
  // numbered and de-duplicated over EVERY heading of the body, setext included.
  const anchorAt = new Map(scanned.headings.map((h) => [h.line - 1, h.id]));
  const lines = String(body).split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (code.has(i)) continue;
    if (!/^ {0,3}#{2,3}(?:[ \t]|$)/u.test(lines[i])) continue;
    out.push({ line: i, anchor: anchorAt.has(i) ? anchorAt.get(i) : markdown.anchorOf(lines[i].replace(/^ {0,3}#{2,3}[ \t]*/u, '')) });
  }
  return out;
}

// ------------------------------------------------------------------- the cuts

/** UTF-8 byte length of a string, the unit AGSC-06-27 and AGSC-06-31 count in. */
function byteLength(s) {
  return Buffer.byteLength(s, 'utf8');
}

/**
 * Cut 1 (AGSC-06-27): split a body at every ATX heading of level 2 or 3 outside a
 * fenced code block. The text before the first such heading is section `''`
 * (chunk 0), dropped when empty; each heading with its following text is one
 * section, the heading line included. The blank lines immediately before a cut
 * belong to neither section, so a section's text ends with exactly one LF and
 * never begins with one.
 *
 * @param {string} body
 * @returns {Array<{section:string, text:string}>}
 */
function sections(body) {
  const lines = String(body).split('\n');
  const cuts = cutPoints(body);
  const bounds = [0, ...cuts.map((h) => h.line), lines.length];
  const out = [];
  for (let i = 0; i < bounds.length - 1; i += 1) {
    const slice = lines.slice(bounds[i], bounds[i + 1]);
    // Drop the trailing blank lines that precede the next cut, then re-terminate
    // with exactly one LF. `split('\n')` on a body ending in LF leaves a final
    // empty element, which this same trim removes.
    while (slice.length > 0 && slice[slice.length - 1].trim() === '') slice.pop();
    if (slice.length === 0) continue; // an empty chunk 0 is not emitted (V7-09)
    out.push({ section: i === 0 ? '' : cuts[i - 1].anchor, text: `${slice.join('\n')}\n` });
  }
  return out;
}

/**
 * Cut 2 (AGSC-06-27): split one section's text so that no piece exceeds
 * `maxBytes` UTF-8 bytes, at the LAST paragraph boundary at or before the bound
 * (the separating blank line belongs to neither piece), repeatedly; a single
 * paragraph longer than the bound is split at the last LF at or before it and,
 * failing that, at the bound on a code-point boundary. No overlap, and the
 * heading is never repeated.
 *
 * @param {string} text
 * @param {number} maxBytes
 * @returns {Array<string>}
 */
function splitBySize(text, maxBytes) {
  const out = [];
  let rest = String(text);
  while (byteLength(rest) > maxBytes) {
    let cut = -1;
    let skip = 0;
    // The last paragraph boundary whose leading piece fits.
    for (let i = rest.indexOf('\n\n'); i !== -1; i = rest.indexOf('\n\n', i + 1)) {
      if (byteLength(rest.slice(0, i + 1)) > maxBytes) break;
      cut = i + 1;
      skip = 1;
    }
    if (cut === -1) {
      // The last LF at or before the bound (the piece keeps that LF).
      for (let i = rest.indexOf('\n'); i !== -1; i = rest.indexOf('\n', i + 1)) {
        if (byteLength(rest.slice(0, i + 1)) > maxBytes) break;
        cut = i + 1;
        skip = 0;
      }
    }
    if (cut === -1) {
      // The bound itself, on a code-point boundary.
      let taken = 0;
      let bytes = 0;
      for (const ch of rest) {
        const n = byteLength(ch);
        if (bytes + n > maxBytes) break;
        bytes += n;
        taken += ch.length;
      }
      cut = taken > 0 ? taken : [...rest][0].length;
      skip = 0;
    }
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut + skip);
  }
  if (rest !== '') out.push(rest);
  return out;
}

// ------------------------------------------------------------------- the record

/** AGSC-06-28: the chunk identifier. */
function chunkId(iri, section, ordinal) {
  const h = createHash('sha256');
  h.update(Buffer.from(iri, 'utf8'));
  h.update(Buffer.from([0]));
  h.update(Buffer.from(section, 'utf8'));
  h.update(Buffer.from([0]));
  h.update(Buffer.from(String(ordinal), 'utf8'));
  return h.digest('hex');
}

/** AGSC-06-29: `digest` is over the UTF-8 bytes of `text`. */
function digestOf(text) {
  return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

/** AGSC-06-28 / AGSC-05-01: the citation anchor an agent uses to cite a chunk. */
function citationAnchor(id) {
  return `#chunk-${id.slice(0, 16)}`;
}

/** AGSC-05-01: the item IRI. A `type` this specification does not name is unknown. */
function itemIri(base, item) {
  const plural = TYPE_PLURAL[item.type] || TYPE_PLURAL.concept;
  return `${String(base).replace(/\/+$/u, '')}/${plural}/${item.slug}/`;
}

/**
 * AGSC-06-29 `links`: the item's authored Links as key → slug array, anchors
 * stripped, each array in code-point order, in JCS order; omitted when empty.
 */
function linksOf(item) {
  const links = {};
  for (const key of LINK_KEYS) {
    const value = item[key];
    if (!Array.isArray(value) || value.length === 0) continue;
    const slugs = value
      .map((v) => String(v).split('#')[0])
      .filter((v) => v !== '')
      .sort(compareCodePoint);
    if (slugs.length > 0) links[key] = slugs;
  }
  return Object.keys(links).length === 0 ? null : links;
}

/** AGSC-06-30: the published set — the same one `search.json` and `/llms.txt` use. */
function isPublished(item, releases) {
  if (EXCLUDED_STATUS.includes(item.status)) return false;
  // AGSC-01-20: the `releases` switchboard holds back an unreleased `release`.
  if (item.release != null && releases != null
      && Object.prototype.hasOwnProperty.call(releases, item.release)
      && releases[item.release] === false) return false;
  return true;
}

function record(fields) {
  const out = {
    digest: fields.digest,
    id: fields.id,
    iri: fields.iri,
    item: fields.item,
    kind: fields.kind,
    license: fields.license,
    ordinal: fields.ordinal,
    section: fields.section,
    terms: TERMS,
    text: fields.text,
    title: fields.title,
    trust: TRUST,
    type: fields.type,
  };
  if (fields.subkind != null) out.subkind = fields.subkind;
  if (fields.links != null) out.links = fields.links;
  return out;
}

/**
 * Every chunk of a Bundle, ordered by item slug (code point), then `section`
 * (code point), then `ordinal` ascending NUMERICALLY (AGSC-06-29).
 *
 * @param {Array<object>} items parsed item frontmatter plus `body`, one per item.
 * @param {object} options
 * @param {string} options.base `site.base` (AGSC-05-03).
 * @param {number} [options.maxBytes] `chunks.max_bytes` (AGSC-11-01, default 4096).
 * @param {string} [options.license] `bundle.license_prose` (AGSC-01-18).
 * @param {object} [options.attachmentBytes] file name → text, for text attachments.
 * @param {object} [options.releases] the AGSC-01-20 switchboard.
 * @returns {{records:Array<object>, findings:Array<object>}}
 */
function records(items, options = {}) {
  const base = options.base;
  const license = options.license || TERMS;
  const attachmentBytes = options.attachmentBytes || {};
  // The bound is used as given. AGSC-11-01's range (256…65536) is a CONFIGURATION
  // rule, checked once against `config.schema.json` and reported as `AGSC-E209`;
  // clamping it here would silently emit bytes no rule describes (chk-0006 cuts at
  // 200, below the configuration minimum, because it is a chunker case, not a
  // configuration case).
  const maxBytes = options.maxBytes == null ? DEFAULT_MAX_BYTES : Number(options.maxBytes);

  const out = [];
  for (const item of items) {
    if (!isPublished(item, options.releases)) continue;
    const iri = itemIri(base, item);
    const title = item.title == null ? item.slug : item.title;
    const links = linksOf(item);
    const common = {
      iri, item: item.slug, kind: item.type || 'concept', license, title, links,
    };
    if (item.type === 'concept' && item.kind != null) common.subkind = item.kind;

    if (item.type === 'cluster') {
      // AGSC-06-30: a cluster contributes one chunk, its description; a cluster
      // without one contributes no chunk (V7-09).
      if (item.description == null || item.description === '') continue;
      out.push(record({
        ...common, ordinal: 0, section: '', type: 'text', text: item.description,
        digest: digestOf(item.description), id: chunkId(iri, '', 0),
      }));
      continue;
    }

    for (const part of sections(item.body == null ? '' : item.body)) {
      splitBySize(part.text, maxBytes).forEach((text, ordinal) => {
        out.push(record({
          ...common, ordinal, section: part.section, type: 'text', text,
          digest: digestOf(text), id: chunkId(iri, part.section, ordinal),
        }));
      });
    }

    // AGSC-06-30: one chunk per attachment, `section` = `attachment-<n>` (1-based).
    const attachments = Array.isArray(item.attachments) ? item.attachments : [];
    attachments.forEach((attachment, i) => {
      const section = `attachment-${i + 1}`;
      const isText = /^(?:text\/|image\/svg\+xml$)/u.test(String(attachment.media_type));
      const bytes = attachmentBytes[attachment.file];
      const text = isText && bytes != null ? String(bytes) : String(attachment.alt == null ? '' : attachment.alt);
      out.push(record({
        ...common, ordinal: 0, section, type: attachment.media_type, text,
        digest: digestOf(text), id: chunkId(iri, section, 0),
      }));
    });
  }

  out.sort((a, b) => compareCodePoint(a.item, b.item)
    || compareCodePoint(a.section, b.section)
    || a.ordinal - b.ordinal);
  return { records: out, findings: [] };
}

/**
 * AGSC-06-26: one JCS-canonical object per LF-terminated line, no blank line, one
 * trailing LF. The canonicalizer is injected so that this module keeps the single
 * JCS implementation of `knowledge/jcs.js` without importing it into a hot loop
 * twice; callers pass `require('./jcs.js').canonicalize`.
 *
 * @param {Array<object>} list
 * @param {(value:unknown)=>string} canonicalize
 * @returns {string}
 */
function serialize(list, canonicalize) {
  return list.map((r) => `${canonicalize(r)}\n`).join('');
}

/**
 * AGSC-06-31: the emitted file set. At or below 500 items `/chunks.jsonl` is the
 * whole export; above it, `/chunks-<nn>.jsonl` holds the lines of at most 500 items
 * each in slug order (no item split across shards) and `/chunks.jsonl` becomes the
 * JCS manifest `{"lines_total", "shards"}`.
 *
 * @param {Array<object>} list the records of `records()`, already ordered.
 * @param {(value:unknown)=>string} canonicalize
 * @param {{itemsPerShard?:number}} [options]
 * @returns {{files:Array<{path:string, text:string}>, manifest:(object|null)}}
 */
function files(list, canonicalize, options = {}) {
  const perShard = options.itemsPerShard == null ? ITEMS_PER_SHARD : options.itemsPerShard;
  const slugs = [];
  for (const r of list) if (slugs[slugs.length - 1] !== r.item) slugs.push(r.item);
  if (slugs.length <= perShard) {
    return { files: [{ path: '/chunks.jsonl', text: serialize(list, canonicalize) }], manifest: null };
  }
  const shardOf = new Map();
  slugs.forEach((slug, i) => shardOf.set(slug, Math.floor(i / perShard)));
  const buckets = [];
  for (const r of list) {
    const n = shardOf.get(r.item);
    if (buckets[n] === undefined) buckets[n] = [];
    buckets[n].push(r);
  }
  const out = buckets.map((bucket, n) => ({
    path: `/chunks-${String(n + 1).padStart(2, '0')}.jsonl`,
    text: serialize(bucket, canonicalize),
  }));
  // AGSC-06-31 as amended at rc.6 (D113): `bundle_version` is the only member
  // added to the manifest, and JCS sorts it first. It is the content version the
  // BUILD derived (AGSC-04-25) and is handed in; a caller that has none — a
  // library caller sharding a record list outside a build — states none, because
  // a derived build fact cannot be invented by the module that formats it.
  const version = options.bundleVersion == null ? '' : String(options.bundleVersion);
  const manifest = {
    ...(version === '' ? {} : { bundle_version: version }),
    lines_total: list.length,
    shards: out.map((f) => f.path),
  };
  return {
    files: [{ path: '/chunks.jsonl', text: `${canonicalize(manifest)}\n` }, ...out],
    manifest,
  };
}

module.exports = {
  records,
  serialize,
  files,
  sections,
  splitBySize,
  cutPoints,
  chunkId,
  digestOf,
  citationAnchor,
  itemIri,
  linksOf,
  isPublished,
  byteLength,
  LINK_KEYS,
  TYPE_PLURAL,
  TERMS,
  TRUST,
  DEFAULT_MAX_BYTES,
  MAX_MAX_BYTES,
  MIN_MAX_BYTES,
  ITEMS_PER_SHARD,
  EXCLUDED_STATUS,
};
