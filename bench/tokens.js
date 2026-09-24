'use strict';
/**
 * bench/tokens.js — token counts per item over the three agent-facing text
 * surfaces (measurement layer B).
 *
 *   llms.txt        the one index line each item has
 *   chunks.jsonl    every chunk record of the item, as the whole JSON line an
 *                   agent reads, and as the `text` member alone (its shards too)
 *   llm-context     `export --to llm-context`: the item's sections of
 *                   `llms-ctx.txt` and its rows of `chunks-index.toon`
 *
 * The tokenizer is INJECTED: `encoders` maps a vocabulary name to a function
 * that returns the token count of a string. The kit pins `gpt-tokenizer`
 * (MIT, offline, the real BPE tables of `o200k_base` and `cl100k_base`); it is
 * not a dependency of this package, so the caller installs it outside the
 * repository and passes its `encode(...).length`. No Claude figure is ever
 * produced: Anthropic publishes no offline tokenizer, so such a count would be
 * a guess, and these two vocabularies are named proxies, never Claude's.
 *
 * Pure apart from reading the files it is pointed at: no clock, no network.
 */

const fs = require('node:fs');
const path = require('node:path');

/** min, median, max and total of a list, or nulls for nothing. */
function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return { items: 0, max: null, median: null, min: null, total: 0 };
  const mid = Math.floor(n / 2);
  return {
    items: n,
    max: sorted[n - 1],
    median: n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
    min: sorted[0],
    total: sorted.reduce((a, b) => a + b, 0),
  };
}

/** Add `value` to `map[key]`. */
function add(map, key, value) {
  map.set(key, (map.get(key) || 0) + value);
}

/** The item slug an `llms.txt` index line links to: the last path segment. */
function slugOfLine(line) {
  const m = /^- \[[^\]]*\]\(([^)]+)\)/u.exec(line);
  if (m === null) return null;
  const parts = m[1].split('/').filter((p) => p !== '');
  return parts[parts.length - 1];
}

/**
 * Per-item token counts for one vocabulary.
 * @param {{llms:string, chunks:string[], ctx:string|null, index:string|null}} texts
 * @param {(text:string)=>number} count
 */
function countOne(texts, count) {
  const llms = new Map();
  for (const line of texts.llms.split('\n')) {
    const slug = slugOfLine(line);
    if (slug !== null) add(llms, slug, count(line));
  }
  const lines = new Map();
  const bodies = new Map();
  for (const file of texts.chunks) {
    for (const line of file.split('\n')) {
      if (line.trim() === '') continue;
      const record = JSON.parse(line);
      add(lines, record.item, count(line));
      add(bodies, record.item, count(String(record.text)));
    }
  }
  const out = {
    chunks_line: stats([...lines.values()]),
    chunks_text: stats([...bodies.values()]),
    llms_line: stats([...llms.values()]),
    llms_file: count(texts.llms),
  };
  if (texts.ctx !== null) {
    const ctx = new Map();
    // A section starts at its `## <title>` heading followed by the `- id:` line;
    // a chunk's own text also carries `## ` headings, inside its fence, so a plain
    // split on headings would cut sections apart.
    const sections = texts.ctx.split(/\n(?=## [^\n]*\n\n- id: )/u);
    for (const section of sections.slice(1)) {
      const m = /\n- item: ([^\n]+)\n/u.exec(section);
      if (m !== null) add(ctx, m[1], count(section));
    }
    out.ctx_section = stats([...ctx.values()]);
    out.ctx_file = count(texts.ctx);
  }
  if (texts.index !== null) {
    const rows = new Map();
    for (const row of texts.index.split('\n').slice(1)) {
      const fields = row.trim().split(',');
      if (fields.length >= 2) add(rows, fields[1], count(row));
    }
    out.index_row = stats([...rows.values()]);
    out.index_file = count(texts.index);
  }
  return out;
}

/**
 * Read a built node (and, optionally, its llm-context export) and count.
 * @param {string} www the build output
 * @param {string|null} exportDir the directory `export --to llm-context` wrote
 * @param {Record<string, (text:string)=>number>} encoders
 */
function count(www, exportDir, encoders) {
  const read = (p) => fs.readFileSync(p, 'utf8');
  const chunkFiles = fs.readdirSync(www).filter((f) => /^chunks(?:-\d+)?\.jsonl$/u.test(f)).sort();
  const texts = {
    chunks: chunkFiles.map((f) => read(path.join(www, f))),
    ctx: exportDir === null ? null : read(path.join(exportDir, 'llms-ctx.txt')),
    index: exportDir === null ? null : read(path.join(exportDir, 'chunks-index.toon')),
    llms: read(path.join(www, 'llms.txt')),
  };
  const out = { chunk_files: chunkFiles, vocabularies: Object.create(null) };
  for (const name of Object.keys(encoders).sort()) out.vocabularies[name] = countOne(texts, encoders[name]);
  return out;
}

module.exports = { count, countOne, slugOfLine, stats };
