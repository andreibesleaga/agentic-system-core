'use strict';
// CONTEXT Knowledge — the tabular chunk index, `chunks-index.toon` (AGSC-06-37).
//
// WHAT. The uniform metadata of every chunk line — `id`, `item`, `kind`, `section`, `ordinal`,
// `title`, `digest` — in the tabular form of TOON (specification 4.1 §9.3): the header
// `chunks[<n>]{id,item,kind,section,ordinal,title,digest}:`, then one row per chunk line of
// `/chunks.jsonl`, in the same order, `id` and `digest` cut to their first 16 hexadecimal
// characters. One trailing LF (AGSC-04-07). The cut `digest` is a locator only: a reader that
// cites a chunk checks the full `digest` of the record (AGSC-06-29).
//
// WHO WRITES IT. The build serves it as `/chunks-index.toon` at Level 2 and above when the
// published set holds at most 500 items (`distribution/site.js`), and the memory adapter
// `export --to llm-context` writes the same bytes beside the node
// (`interchange/adapters/llm-context.js`). It lives here, in Knowledge, because two contexts that
// may not import each other (Distribution and Interchange) both write it.
//
// WHY A LIBRARY. The rows, their quoting and their escapes are the pinned encoder's
// (`@toon-format/toon`), never hand-written: a value is bare unless TOON's quoting rule requires
// quotes. Own code writes only the header of an empty table, because the encoder renders an empty
// array in the inline form `chunks: []`, which names no column (spec 4.1 §9.1), and the rule asks
// for the header with a count of 0 and no row.
//
// PURE: no fs, no clock, no network.

const { encode } = require('@toon-format/toon');
const { withOneTrailingFeed } = require('../shared/trailing.js');

/** The seven uniform members of the index, in AGSC-06-29's own member order. */
const INDEX_COLUMNS = Object.freeze(['id', 'item', 'kind', 'section', 'ordinal', 'title', 'digest']);

/** A 64-hex value cut to the sixteen characters the index carries. */
function short(hex) {
  return String(hex == null ? '' : hex).slice(0, 16);
}

/**
 * The index rows, in the column order. Every member is a string except `ordinal`, the decimal
 * ordinal of AGSC-06-28, so the table is uniform in the sense TOON's tabular form requires
 * ("arrays of uniform objects", spec 4.1 §9.3).
 *
 * @param {Array<object>} records chunk records from `knowledge/chunks.js#records`.
 * @returns {Array<object>}
 */
function indexRows(records) {
  return (records || []).map((r) => ({
    id: short(r.id),
    item: String(r.item),
    kind: String(r.kind),
    section: r.section == null ? '' : String(r.section),
    ordinal: Number(r.ordinal),
    title: r.title == null ? '' : String(r.title),
    digest: short(r.digest),
  }));
}

/**
 * The bytes of `chunks-index.toon`.
 *
 * @param {Array<object>} records
 * @returns {string} LF-terminated, exactly one trailing LF.
 */
function chunksIndexToon(records) {
  const rows = indexRows(records);
  if (rows.length === 0) return `chunks[0]{${INDEX_COLUMNS.join(',')}}:\n`;
  return withOneTrailingFeed(encode({ chunks: rows }));
}

module.exports = { INDEX_COLUMNS, chunksIndexToon, indexRows, short };
