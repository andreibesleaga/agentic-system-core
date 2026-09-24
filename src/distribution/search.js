'use strict';
// CONTEXT Distribution (Emission) — Surface: the prebuilt search index.
// Implements AGSC-06-16 (the shape, the member order and the omitted members),
// AGSC-06-23 (the normative tokenizer) and the AGSC-06-21 shard rule for
// `/search-<nn>.json`.
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

const { nfc, compareCodePoint, compareUtf16 } = require('../knowledge/unicode.js');
const markdown = require('../knowledge/markdown.js');

/** AGSC-06-23 / AGSC-02-24: a token shorter than this many code points is dropped. */
const MIN_TOKEN_CODE_POINTS = 2;
/** AGSC-06-21: above this many items the index is sharded. */
const ITEMS_PER_SHARD = 500;

/**
 * AGSC-06-23: every run of characters that are NOT token characters is a boundary.
 * A token character is `[a-z0-9]` or a character whose General_Category is `L*`
 * (any letter), `Nd` (decimal digit) or `M*` (combining mark). `No`/`Nl` forms such
 * as `²` and `Ⅷ` are boundaries — which is why this class is spelled out rather
 * than written `\w` or `\p{L}\p{N}`, both of which disagree with build-0002.
 *
 * The class is a single character alternation, so the split is linear in the input
 * (no backtracking; the ReDoS rule of `coding/secure-coding.skill.md`).
 */
const NON_TOKEN = /[^a-z0-9\p{L}\p{Nd}\p{M}]+/gu;

/**
 * Tokenize text per AGSC-06-23: NFC, then ASCII lower-casing (only U+0041–U+005A;
 * no locale casing and no case folding of non-ASCII, so `Σ` is kept as authored),
 * then split at every boundary run, then drop tokens shorter than two Unicode code
 * points. No stemming, no stop words, no synonyms, no n-grams.
 *
 * @param {string} text
 * @param {{unicodeVersion?:string}} [options] advisory: AGSC-04-22 makes the
 *   General_Category table the claim's business, not this function's — the runtime's
 *   table is used and a claim states its version (AGSC-09-01).
 * @returns {Array<string>} tokens in input order, duplicates included.
 */
function tokenize(text, options = {}) {
  void options;
  const lowered = nfc(String(text)).replace(/[A-Z]/gu, (c) => c.toLowerCase());
  return lowered.split(NON_TOKEN).filter((t) => [...t].length >= MIN_TOKEN_CODE_POINTS);
}

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
  tokenize,
  stripFencedCode,
  tokenizerInput,
  index,
  files,
  ITEMS_PER_SHARD,
};
