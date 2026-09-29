'use strict';
// Conformance area `chunks` — AGSC-06-26…31.
// chk-0001 record shape and ids, chk-0002 the size bound, chk-0003 exclusions and
// attachment chunks, chk-0004 the fence rule, chk-0005 the file bytes, chk-0006 the
// numeric ordinal order, chk-0008 the shards and the manifest, whose first member
// is `bundle_version` (AGSC-06-31).

const chunks = require('../../../src/knowledge/chunks.js');
const { canonicalize } = require('../../../src/knowledge/jcs.js');
const { checks, deepEqual, subsetOf } = require('./_assert.js');

/** The items of a vector: a literal list, or `item_count` copies of a template. */
function itemsOf(input) {
  if (Array.isArray(input.items)) return input.items;
  const out = [];
  for (let i = 1; i <= Number(input.item_count); i += 1) {
    out.push({ ...input.item_template, slug: `i-${String(i).padStart(4, '0')}` });
  }
  return out;
}

function recordsOf(vector) {
  const input = vector.input;
  return chunks.records(itemsOf(input), {
    base: input.site.base,
    maxBytes: (input.chunks || {}).max_bytes,
    attachmentBytes: input.attachment_bytes,
  }).records;
}

module.exports.run = (vector) => {
  const expected = vector.expected;
  const list = recordsOf(vector);
  const result = [];

  if (expected.lines !== undefined) {
    result.push(['line count', list.length === expected.lines.length,
      `${list.length} records, ${expected.lines.length} expected`]);
    expected.lines.forEach((line, i) => {
      result.push([`line ${i}`, list[i] !== undefined && deepEqual(line, list[i]),
        JSON.stringify(list[i])]);
    });
  }
  if (expected.citation_anchor_for_line_1 !== undefined) {
    const anchor = chunks.citationAnchor(list[1].id);
    result.push(['citation anchor', anchor === expected.citation_anchor_for_line_1, anchor]);
  }
  if (expected.byte_lengths !== undefined) {
    const lengths = list.map((r) => chunks.byteLength(r.text));
    result.push(['byte lengths', deepEqual(lengths, expected.byte_lengths), JSON.stringify(lengths)]);
  }
  if (expected.sections !== undefined) {
    const got = list.map((r) => ({ ordinal: r.ordinal, section: r.section, text: r.text }));
    result.push(['sections', deepEqual(got, expected.sections), JSON.stringify(got)]);
  }
  if (expected.heading_repeated !== undefined) {
    const repeated = list.slice(1).some((r) => r.section !== '' && r.ordinal > 0 && r.text.startsWith('## '));
    result.push(['heading not repeated', repeated === expected.heading_repeated, String(repeated)]);
  }
  if (expected.overlap !== undefined) {
    const joined = list.map((r) => r.text).join('');
    const overlap = list.some((r, i) => i > 0 && list[i - 1].text.endsWith(r.text.slice(0, 16)) && r.text !== '');
    result.push(['no overlap', overlap === expected.overlap, `joined ${joined.length} characters`]);
  }
  if (expected.chunks !== undefined) {
    const got = list.map((r) => ({ ordinal: r.ordinal, section: r.section, text: r.text }));
    result.push(['chunks', deepEqual(got, expected.chunks), JSON.stringify(got)]);
  }
  if (expected.items_present !== undefined) {
    const present = [...new Set(list.map((r) => r.item))];
    result.push(['items present', expected.items_present.every((s) => present.includes(s)), JSON.stringify(present)]);
    result.push(['items absent', expected.items_absent.every((s) => !present.includes(s)), JSON.stringify(present)]);
  }
  if (expected.attachment_chunk !== undefined) {
    const one = list.find((r) => r.section === expected.attachment_chunk.section && r.item === expected.attachment_chunk.item);
    result.push(['attachment chunk', one !== undefined && subsetOf(expected.attachment_chunk, one), JSON.stringify(one)]);
  }
  if (expected.cluster_chunk_text !== undefined) {
    const one = list.find((r) => r.text === expected.cluster_chunk_text);
    result.push(['cluster chunk', one !== undefined, JSON.stringify(list.map((r) => r.item))]);
  }
  if (expected.ordinals !== undefined) {
    const ordinals = list.map((r) => r.ordinal);
    result.push(['ordinals ascend numerically', deepEqual(ordinals, expected.ordinals), JSON.stringify(ordinals)]);
  }
  if (expected.output !== undefined) {
    const bytes = chunks.serialize(list, canonicalize);
    result.push(['file bytes', bytes === expected.output, JSON.stringify(bytes)]);
    if (expected.line_count !== undefined) {
      result.push(['line count', bytes.split('\n').length - 1 === expected.line_count, String(bytes.split('\n').length - 1)]);
    }
    if (expected.ends_with_single_lf !== undefined) {
      const ok = bytes.endsWith('\n') && !bytes.endsWith('\n\n');
      result.push(['one trailing LF', ok === expected.ends_with_single_lf, JSON.stringify(bytes.slice(-4))]);
    }
  }
  if (expected.manifest !== undefined) {
    // AGSC-06-31: the manifest's first member is the content version of
    // AGSC-04-25, which the BUILD derives and hands in. The vector's input carries
    // it, because a module that formats a manifest cannot invent a build fact.
    const emitted = chunks.files(list, canonicalize, { bundleVersion: vector.input.bundle_version });
    const manifest = emitted.files.find((f) => f.path === '/chunks.jsonl');
    result.push(['manifest bytes', manifest.text === expected.manifest, JSON.stringify(manifest.text)]);
    for (const [path, count] of Object.entries(expected.shard_line_counts)) {
      const shard = emitted.files.find((f) => f.path === path);
      const got = shard === undefined ? -1 : shard.text.split('\n').length - 1;
      result.push([`${path} lines`, got === count, String(got)]);
    }
    const first = emitted.files.find((f) => f.path === '/chunks-02.jsonl');
    const last = emitted.files.find((f) => f.path === '/chunks-01.jsonl');
    const slugOf = (text, index) => JSON.parse(text.split('\n')[index]).item;
    result.push(['first slug in shard 02', slugOf(first.text, 0) === expected.first_slug_in_shard_02, slugOf(first.text, 0)]);
    const lines = last.text.split('\n').filter((l) => l !== '');
    result.push(['last slug in shard 01', JSON.parse(lines[lines.length - 1]).item === expected.last_slug_in_shard_01,
      JSON.parse(lines[lines.length - 1]).item]);
  }

  return checks(result);
};
