'use strict';
// Conformance area `chunks` — AGSC-06-26…31, AGSC-06-37, AGSC-06-44, AGSC-06-45.
// chk-0001 record shape and ids, chk-0002 the size bound, chk-0003 exclusions and
// attachment chunks, chk-0004 the fence rule, chk-0005 the file bytes, chk-0006 the
// numeric ordinal order, chk-0008 the shards and the manifest, whose first member
// is `bundle_version` (AGSC-06-31); from 1.1 chk-0009 the `abstract` member
// (AGSC-06-29), chk-0010 the tabular index `/chunks-index.toon` (AGSC-06-37), chk-0014
// the digest, count and set commitment of the chunks surface link, chk-0015 the licence
// URL and the `content_digest` member (AGSC-06-44) and chk-0016 the text that never
// begins with a line feed (AGSC-06-45). The cases with `input.cases` are in CASE_HANDLERS.

//
// The handler is guarded (`_expected-reads.js`): a pass that left a member of
// `expected` unread is a fail. chk-0006's two members are read as follows:
// `vendor_member_permitted` says that a writer MAY append `x-<vendor>-<key>` members
// to a record (AGSC-02-05a), so the records are compared with `lines` after any such
// member is set aside; `lexical_order_is_wrong` is the order a string sort of the
// ordinals gives, which the records must not follow.

const chunks = require('../../../src/knowledge/chunks.js');
const chunksIndex = require('../../../src/knowledge/chunks-index.js');
const { sha256Field } = require('../../../src/knowledge/digest-field.js');
const { canonicalize } = require('../../../src/knowledge/jcs.js');
const { checks, deepEqual, subsetOf } = require('./_assert.js');
const { guarded } = require('./_expected-reads.js');

/** AGSC-02-05a: the vendor namespace. */
const VENDOR_MEMBER = /^x-[a-z0-9]+(-[a-z0-9]+)+$/u;

/** A record with its vendor members set aside. */
function withoutVendor(record) {
  const out = {};
  for (const [key, value] of Object.entries(record || {})) if (!VENDOR_MEMBER.test(key)) out[key] = value;
  return out;
}

/** The items of a vector: a literal list, or `item_count` copies of a template. */
function itemsOf(input) {
  if (Array.isArray(input.items)) return input.items;
  const out = [];
  for (let i = 1; i <= Number(input.item_count); i += 1) {
    out.push({ ...input.item_template, slug: `i-${String(i).padStart(4, '0')}` });
  }
  return out;
}

/**
 * The records of one input — the vector's own, or one of its cases. The licence URL is
 * the node's (AGSC-06-44), from `bundle` and whether the node emits `/legal/`.
 */
function recordsOfInput(input) {
  const config = { bundle: input.bundle, site: input.site };
  return chunks.records(itemsOf(input), {
    base: input.site.base,
    maxBytes: (input.chunks || {}).max_bytes,
    attachmentBytes: input.attachment_bytes,
    license: (input.bundle || {}).license_prose,
    licenseUrl: chunks.licenseUrl(config, { legal: input.legal_emitted === true }),
    contentDigest: (input.chunks || {}).content_digest === true,
  }).records;
}

const recordsOf = (vector) => recordsOfInput(vector.input);

/** The expected entry of each case, by name. */
const byName = (list) => new Map((list || []).map((c) => [c.name, c]));

/** chk-0010 (AGSC-06-37): the bytes of `/chunks-index.toon`, its header and the cut identifiers of each row. */
function indexCase(vector) {
  const wanted = byName(vector.expected.cases);
  const list = [];
  for (const input of vector.input.cases) {
    const want = wanted.get(input.name) || {};
    const records = recordsOfInput(input);
    const bytes = chunksIndex.chunksIndexToon(records);
    list.push([`${input.name} bytes`, bytes === want.output, JSON.stringify(bytes)]);
    list.push([`${input.name} header`, bytes.split('\n')[0] === want.header, bytes.split('\n')[0]]);
    if (want.row_prefixes !== undefined) {
      const cut = records.map((r) => [r.id.slice(0, 16), r.digest.slice(0, 16)]);
      list.push([`${input.name} row prefixes`, deepEqual(cut, want.row_prefixes), JSON.stringify(cut)]);
    }
  }
  return checks(list);
}

/** chk-0014 (AGSC-06-44): the digest, the count and the set commitment of the chunks surface link. */
function commitmentCase(vector) {
  const wanted = byName(vector.expected.cases);
  const list = [];
  for (const input of vector.input.cases) {
    const want = wanted.get(input.name) || {};
    const records = recordsOfInput(input);
    const facts = chunks.commitment(records);
    const digest = sha256Field(chunks.serialize(records, canonicalize));
    list.push([`${input.name} digest`, digest === want.digest, digest]);
    list.push([`${input.name} agsc-chunk-count`, facts.count === want.agsc_chunk_count, facts.count]);
    list.push([`${input.name} agsc-chunk-set`, facts.set === want.agsc_chunk_set, facts.set]);
    if (want.chunk_set_input_bytes !== undefined) {
      // The commitment's input, recomputed here from the rule's words: each id as 64 hex
      // characters and one LF, in file order.
      const input64 = records.map((r) => `${r.id}\n`).join('');
      list.push([`${input.name} commitment input bytes`, Buffer.byteLength(input64) === want.chunk_set_input_bytes
        && sha256Field(input64) === facts.set, String(Buffer.byteLength(input64))]);
    }
  }
  return checks(list);
}

/** chk-0015 (AGSC-06-44 with AGSC-06-29): the licence URL and the optional `content_digest` of each line. */
function licenceCase(vector) {
  const wanted = byName(vector.expected.cases);
  return checks(vector.input.cases.map((input) => {
    const records = recordsOfInput(input);
    const want = (wanted.get(input.name) || {}).lines;
    return [input.name, want !== undefined && deepEqual(want, records), JSON.stringify(records)];
  }));
}

const CASE_HANDLERS = { 'chk-0010': indexCase, 'chk-0014': commitmentCase, 'chk-0015': licenceCase };

module.exports.run = guarded((vector) => {
  if (CASE_HANDLERS[vector.id] !== undefined) return CASE_HANDLERS[vector.id](vector);
  const expected = vector.expected;
  const list = recordsOf(vector);
  const result = [];
  const vendorPermitted = typeof expected.vendor_member_permitted === 'string';

  if (expected.lines !== undefined) {
    result.push(['line count', list.length === expected.lines.length,
      `${list.length} records, ${expected.lines.length} expected`]);
    expected.lines.forEach((line, i) => {
      const got = vendorPermitted ? withoutVendor(list[i]) : list[i];
      result.push([`line ${i}`, list[i] !== undefined && deepEqual(line, got),
        JSON.stringify(list[i])]);
    });
  }
  if (typeof expected.lexical_order_is_wrong === 'string') {
    const ordinals = list.map((r) => r.ordinal);
    const lexical = ordinals.map(String).sort().slice(0, expected.lexical_order_is_wrong.split(',').length).join(',');
    const emitted = ordinals.slice(0, expected.lexical_order_is_wrong.split(',').length).join(',');
    result.push(['a string sort of the ordinals gives the stated wrong order', lexical === expected.lexical_order_is_wrong, lexical]);
    result.push(['the records do not follow it', emitted !== expected.lexical_order_is_wrong, emitted]);
  }
  if (expected.text_never_begins_with_a_line_feed !== undefined) {
    // AGSC-06-45: no text begins with a line feed, chunk 0 included.
    const none = list.every((r) => !r.text.startsWith('\n'));
    result.push(['no text begins with a line feed', none === expected.text_never_begins_with_a_line_feed,
      JSON.stringify(list.map((r) => r.text.slice(0, 8)))]);
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
});
