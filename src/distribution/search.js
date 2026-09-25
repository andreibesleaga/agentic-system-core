'use strict';
// CONTEXT Distribution (Emission) — Surface: the prebuilt search index.
// Implements AGSC-06-16 (the shape, the member order and the omitted members),
// AGSC-06-23 (the normative tokenizer) and the AGSC-06-21 shard rule for
// `/search-<nn>.json`; `query` is the ranking the `/search/` page runs over the
// same index (`search-page.js` ships its source text).
//
// Distribution READS the other contexts' results and adds nothing to the content:
// what counts as a fenced code block is `knowledge/markdown.js`'s CommonMark parse
// not a second regular expression, because two definitions of "fenced"
// would cut two different token sets from one body.
//
// No fs, no clock, no network here either — this module is a pure function of its
// input; `site.js` is what hands the bytes to the FileSystem port.
//
// Vectors: build-0001, build-0002, build-0003.

const { compareCodePoint, compareUtf16 } = require('../knowledge/unicode.js');
const markdown = require('../knowledge/markdown.js');

/** AGSC-06-21: above this many items the index is sharded. */
const ITEMS_PER_SHARD = 500;

/**
 * Tokenize text per AGSC-06-23: NFC, then ASCII lower-casing (only U+0041–U+005A;
 * no locale casing and no case folding of non-ASCII, so `Σ` is kept as authored),
 * then split at every boundary run, then drop tokens shorter than two Unicode code
 * points (AGSC-02-24). No stemming, no stop words, no synonyms, no n-grams.
 *
 * A boundary is every run of characters that are NOT token characters. A token
 * character is `[a-z0-9]` or a character whose General_Category is `L*` (any
 * letter), `Nd` (decimal digit) or `M*` (combining mark). `No`/`Nl` forms such as
 * `²` and `Ⅷ` are boundaries — which is why the class is spelled out rather than
 * written `\w` or `\p{L}\p{N}`, both of which disagree with build-0002. The class
 * is a single character alternation, so the split is linear in the input (no
 * backtracking; the ReDoS rule of `coding/secure-coding.skill.md`).
 *
 * SELF-CONTAINED on purpose: the regular expression and the minimum length live in
 * the function body and nothing here reads a module-scope binding, because the
 * `/search/` page runs THIS FUNCTION'S OWN SOURCE TEXT (`search-page.js`, the
 * pattern of `composition/browser.js`) — so the page cannot tokenize a query any
 * differently from how the writer tokenized the bodies. `PORTABLE` below names it.
 *
 * @param {string} text
 * @param {{unicodeVersion?:string}} [options] advisory: AGSC-04-22 makes the
 *   General_Category table the claim's business, not this function's — the runtime's
 *   table is used and a claim states its version (AGSC-09-01).
 * @returns {Array<string>} tokens in input order, duplicates included.
 */
function tokenize(text, options) {
  void options;
  const lowered = String(text).normalize('NFC').replace(/[A-Z]/gu, (c) => c.toLowerCase());
  return lowered.split(/[^a-z0-9\p{L}\p{Nd}\p{M}]+/u).filter((t) => [...t].length >= 2);
}

/**
 * Search a prebuilt index (AGSC-06-16, or the shards of AGSC-06-21 merged back into
 * one) for a query: the query is tokenized with `tokenize` — the same function that
 * produced the postings — and a document scores one point per DISTINCT query token
 * whose posting list names it. Hits are ordered by score, highest first, then by
 * slug; `docs[]` is already in slug order (AGSC-06-16), and a slug is ASCII
 * (AGSC-01-10), so the tie-break is a plain string comparison. A query with no
 * token, or an index with no `docs[]`, answers no hit.
 *
 * Also SELF-CONTAINED (it reads only `tokenize`, which the page carries beside it):
 * this is the ranking the `/search/` page runs, and it is the ranking of the
 * `search` page tool — one point per matching token, score then slug — so a person
 * at the search box and an assistant calling the tool get the same order.
 *
 * @param {{docs:Array<object>, terms:object}} index
 * @param {string} text the query.
 * @returns {Array<{score:number, slug:string, title:string, description?:string, cluster?:string}>}
 */
function query(index, text) {
  const wanted = [];
  for (const token of tokenize(text)) if (wanted.indexOf(token) === -1) wanted.push(token);
  if (wanted.length === 0 || !index || !Array.isArray(index.docs)) return [];
  const terms = index.terms && typeof index.terms === 'object' ? index.terms : {};
  const hits = [];
  for (let d = 0; d < index.docs.length; d += 1) {
    const doc = index.docs[d] || {};
    let score = 0;
    for (let w = 0; w < wanted.length; w += 1) {
      const postings = Object.prototype.hasOwnProperty.call(terms, wanted[w]) ? terms[wanted[w]] : null;
      if (Array.isArray(postings) && postings.indexOf(d) !== -1) score += 1;
    }
    if (score === 0) continue;
    const hit = { score, slug: String(doc.slug), title: String(doc.title === undefined ? doc.slug : doc.title) };
    if (typeof doc.description === 'string' && doc.description !== '') hit.description = doc.description;
    if (typeof doc.cluster === 'string' && doc.cluster !== '') hit.cluster = doc.cluster;
    hits.push(hit);
  }
  hits.sort((a, b) => b.score - a.score || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return hits;
}

/**
 * The functions the `/search/` page runs as their own source text
 * (`distribution/search-page.js`); each is self-contained, as the comments above say.
 */
const PORTABLE = Object.freeze(['tokenize', 'query']);

/**
 * AGSC-06-23: "the body with fenced code blocks removed". Which lines those are is
 * the CommonMark parser's answer (`fence` tokens and their line maps), never a
 * regular expression over the text — an indented code block is NOT a fenced one and
 * stays in the tokenizer input.
 * @param {string} body
 * @returns {string}
 */
function stripFencedCode(body) {
  const lines = String(body).split('\n');
  const drop = new Set();
  for (const token of markdown.scan(String(body)).tokens) {
    if (token.type !== 'fence' || !Array.isArray(token.map)) continue;
    for (let i = token.map[0]; i < token.map[1]; i += 1) drop.add(i);
  }
  return lines.filter((_, i) => !drop.has(i)).join('\n');
}

/**
 * AGSC-06-23: the tokenizer input of one item is, in this order, `title`,
 * `description`, every `tags` value and the body with fenced code removed.
 * @param {object} item
 * @returns {string}
 */
function tokenizerInput(item) {
  const tags = Array.isArray(item.tags) ? item.tags.map(String) : [];
  return [
    item.title == null ? '' : String(item.title),
    item.description == null ? '' : String(item.description),
    ...tags,
    stripFencedCode(item.body == null ? '' : String(item.body)),
  ].join('\n');
}

/**
 * AGSC-06-16 `docs[]` entry. A member is never emitted as the empty string, so the
 * index stays a function of the authored keys: an item with no `clusters[]` omits
 * `cluster` and an item with no `description` omits `description`.
 */
function docOf(item) {
  const doc = {};
  const clusters = Array.isArray(item.clusters) ? item.clusters : [];
  if (clusters.length > 0 && clusters[0] !== '') doc.cluster = String(clusters[0]);
  if (item.description != null && item.description !== '') doc.description = String(item.description);
  doc.slug = String(item.slug);
  doc.title = item.title == null ? String(item.slug) : String(item.title);
  return doc;
}

/**
 * Build `search.json` (AGSC-06-16): `{terms:{token:[docIndex…]}, docs:[…]}`.
 * `docs[]` is ordered by slug (code point, AGSC-04-12 — paths and identifiers),
 * each posting list ascends without repetition, and the `terms` member names are
 * ordered as JSON member names, by UTF-16 code units (AGSC-04-05) — the two
 * orderings differ for astral-plane text, which is what build-0003 pins.
 *
 * @param {Array<object>} items `{slug, title, description?, tags?, clusters?, body?}`.
 * @returns {{docs:Array<object>, terms:object}}
 */
function index(items) {
  const docs = [...items].sort((a, b) => compareCodePoint(String(a.slug), String(b.slug)));
  const terms = Object.create(null);
  docs.forEach((item, docIndex) => {
    for (const token of new Set(tokenize(tokenizerInput(item)))) {
      if (terms[token] === undefined) terms[token] = [];
      terms[token].push(docIndex);
    }
  });
  const ordered = {};
  for (const token of Object.keys(terms).sort(compareUtf16)) ordered[token] = terms[token];
  return { docs: docs.map(docOf), terms: ordered };
}

/**
 * AGSC-06-21: at or below 500 items `/search.json` is the whole index; above it the
 * index is sharded as `/search-<nn>.json` (zero-padded from `01`, in slug order)
 * and `/search.json` becomes the manifest `{docs_total, shards[]}`.
 *
 * @param {Array<object>} items
 * @param {{itemsPerShard?:number}} [options]
 * @returns {{files:Array<{path:string, value:object}>, manifest:(object|null)}}
 */
function files(items, options = {}) {
  const perShard = options.itemsPerShard == null ? ITEMS_PER_SHARD : options.itemsPerShard;
  const sorted = [...items].sort((a, b) => compareCodePoint(String(a.slug), String(b.slug)));
  if (sorted.length <= perShard) {
    return { files: [{ path: '/search.json', value: index(sorted) }], manifest: null };
  }
  const shards = [];
  for (let i = 0; i < sorted.length; i += perShard) {
    shards.push({
      path: `/search-${String(shards.length + 1).padStart(2, '0')}.json`,
      value: index(sorted.slice(i, i + perShard)),
    });
  }
  const manifest = { docs_total: sorted.length, shards: shards.map((s) => s.path) };
  return { files: [{ path: '/search.json', value: manifest }, ...shards], manifest };
}

module.exports = {
  PORTABLE,
  tokenize,
  query,
  stripFencedCode,
  tokenizerInput,
  index,
  files,
  ITEMS_PER_SHARD,
};
