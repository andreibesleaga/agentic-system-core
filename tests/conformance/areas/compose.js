'use strict';
// tests/conformance/areas/compose.js — area handler for `compose` vectors.
// Rules: AGSC-07-04..08, AGSC-07-09, AGSC-07-13a, AGSC-07-17,
// AGSC-07-23, AGSC-07-24, AGSC-02-97.

const crypto = require('node:crypto');

const { compose, verdictOf } = require('../../../src/composition/compose.js');
const { composeFrom, selectionBlock, selectionFences } = require('../../../src/composition/architecture.js');
const { dslRelationships, harnessName, isEmitted, selectionDigestInput } = require('../../../src/composition/harness.js');
const archive = require('../../../src/composition/archive.js');
const { checks, deepEqual, findingsMatch } = require('./_assert.js');

/** AGSC-07-17: an invalid composition returns the verdict alone, exit 1. */
function exitCodeOf(result) {
  return result.valid ? 0 : 1;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function runVerdictVector(vector) {
  const result = compose(vector.input.items, vector.input.selection);
  const verdict = plain(verdictOf(result));
  const list = [
    ['verdict', deepEqual(vector.expected.verdict, verdict), JSON.stringify(verdict)],
  ];
  if (vector.expected.exit !== undefined) {
    list.push(['exit', exitCodeOf(result) === vector.expected.exit, String(exitCodeOf(result))]);
  }
  if (vector.expected.harness_emitted !== undefined) {
    list.push(['harness_emitted', isEmitted(result) === vector.expected.harness_emitted, String(isEmitted(result))]);
  }
  return checks(list);
}

/** compose-0011 — Step 5 wiring, and the verdict-neutrality of AGSC-07-08. */
function runCompose0011(vector) {
  const result = compose(vector.input.items, vector.input.selection);
  const withoutPorts = compose(
    vector.input.items.map((item) => {
      const copy = Object.assign({}, item);
      delete copy.consumes;
      delete copy.produces;
      return copy;
    }),
    vector.input.selection,
  );
  const stripped = (v) => {
    const out = plain(verdictOf(v));
    out.warnings = out.warnings.filter((w) => w.code !== 'AGSC-E804');
    return out;
  };
  const added = plain(result.warnings.filter((w) => w.code === 'AGSC-E804'));
  return checks([
    ['wiring', deepEqual(vector.expected.wiring, plain(result.wiring)), JSON.stringify(plain(result.wiring))],
    ['dsl_relationships', deepEqual(vector.expected.dsl_relationships, plain(dslRelationships(result))),
      JSON.stringify(plain(dslRelationships(result)))],
    ['valid', result.valid === vector.expected.valid, String(result.valid)],
    ['warnings_added', deepEqual(vector.expected.warnings_added, added), JSON.stringify(added)],
    ['verdict_steps_1_to_4_unchanged',
      deepEqual(stripped(result), stripped(withoutPorts)) === vector.expected.verdict_steps_1_to_4_unchanged,
      `${JSON.stringify(stripped(result))} vs ${JSON.stringify(stripped(withoutPorts))}`],
  ]);
}

/**
 * AGSC-02-97: the block MUST NOT be rendered as prose. Proved by removing
 * every `yaml agsc-selection` fence from the body and asserting that no entry
 * of the extracted selection survives in what is left to render.
 */
function renderedAsProse(body, selection) {
  let prose = String(body);
  for (const fence of selectionFences(body)) prose = prose.replace(fence.content, '');
  prose = prose.replace(/^ {0,3}(`{3,}|~{3,}).*$/gmu, '');
  return selection.some((slug) => prose.includes(slug));
}

/** compose-0012 — `compose --from` over a saved architecture. */
function runCompose0012(vector) {
  const items = vector.input.items;
  const archSlug = items.find((i) => i.kind === 'architecture').slug;
  const from = composeFrom(items, archSlug);
  const explicit = compose(items, from.selection);
  const list = [
    ['selection_read', deepEqual(vector.expected.selection_read, plain(from.selection)), JSON.stringify(plain(from.selection))],
    ['same_verdict_as_explicit',
      deepEqual(plain(verdictOf(from.result)), plain(verdictOf(explicit))) === vector.expected.same_verdict_as_explicit,
      JSON.stringify(plain(verdictOf(from.result)))],
    ['block_rendered_as_prose',
      renderedAsProse(items.find((i) => i.slug === archSlug).body, from.selection) === vector.expected.block_rendered_as_prose,
      'the selection block reached the rendered prose'],
  ];
  const matched = findingsMatch(vector.expected.findings || [], plain(from.findings));
  list.push(['findings', matched.ok, matched.detail]);
  return checks(list);
}

/** compose-0014 — the selection block itself: extraction, AGSC-E301, AGSC-E805. */
function runCompose0014(vector) {
  const items = vector.input.items;
  const archSlug = items.find((i) => i.kind === 'architecture').slug;
  const block = selectionBlock(items.find((i) => i.slug === archSlug));
  const from = composeFrom(items, archSlug);
  const matched = findingsMatch(vector.expected.findings || [], plain(from.findings));
  return checks([
    ['extracted_selection', deepEqual(vector.expected.extracted_selection, plain(block.selection)), JSON.stringify(plain(block.selection))],
    ['rendered_as_prose',
      renderedAsProse(items.find((i) => i.slug === archSlug).body, block.selection) === vector.expected.rendered_as_prose,
      'the selection block reached the rendered prose'],
    ['findings', matched.ok, matched.detail],
  ]);
}

/** compose-0013 — the multi-source breadth-first path, and the path it must NOT record. */
function runCompose0013(vector) {
  const result = compose(vector.input.items, vector.input.selection);
  const added = plain(result.added);
  const wrong = vector.expected.wrong_path_if_depth_first_or_per_item_union;
  const recordedWrong = added.some((a) => deepEqual(wrong, a.path));
  return checks([
    ['added', deepEqual(vector.expected.added, added), JSON.stringify(added)],
    ['not the depth-first path', !recordedWrong, `recorded ${JSON.stringify(wrong)}`],
  ]);
}

/** compose-0017 — the tie-break is the walk's own order, not the least slug sequence. */
function runCompose0017(vector) {
  const result = compose(vector.input.items, vector.input.selection);
  const added = plain(result.added);
  const wrong = vector.expected.wrong_path_if_least_slug_sequence;
  return checks([
    ['added', deepEqual(vector.expected.added, added), JSON.stringify(added)],
    ['not the least slug sequence', !added.some((a) => deepEqual(wrong, a.path)), `recorded ${JSON.stringify(wrong)}`],
  ]);
}

/**
 * compose-0015 — AGSC-07-12: the Harness directory name.
 *
 * `<name>` is the first sixteen lowercase-hex characters of the SELECTION DIGEST, the
 * SHA-256 of the JCS form of `verdict.selection[]`. The digest is derived in the
 * portable algebra so that the CLI and the `/compose/` page agree (AGSC-07-13); the
 * HASH itself is the host's, which here is `node:crypto` — the page uses
 * `crypto.subtle` over the same bytes.
 *
 * Note what the vector pins deliberately: the input selection is `["b", "a"]` and the
 * verdict's is `["a", "b"]`, so the authored order never reaches the digest.
 */
function runCompose0015(vector) {
  const result = compose(vector.input.items, vector.input.selection);
  const selection = plain(verdictOf(result).selection);
  const input = selectionDigestInput(result);
  const digest = crypto.createHash('sha256').update(input, 'utf8').digest('hex');
  return checks([
    ['selection', deepEqual(vector.expected.selection, selection), JSON.stringify(selection)],
    ['selection_digest', digest === vector.expected.selection_digest, `${digest} over ${JSON.stringify(input)}`],
    ['harness_dir', harnessName(digest) === vector.expected.harness_dir, harnessName(digest)],
    // The name is a function of the digest ALONE: a different selection is a
    // different directory, and nothing else may reach it (AGSC-07-12, AGSC-07-13).
    ['the name is the digest prefix', vector.expected.harness_dir === vector.expected.selection_digest.slice(0, 16),
      'the vector states a name that is not the digest prefix'],
  ]);
}

/**
 * compose-0016 — AGSC-07-13a: the bytes of the archive
 * `--zip` writes (AGSC-09-09) and the name it writes them under (AGSC-04-25's
 * tenth stamping place).
 *
 * Everything asserted here is a BYTE fact, because that is what the rule is for: a
 * second implementation that reads only the rule must reach the same 237 bytes, and
 * the SHA-256 a page shows beside a download link says nothing otherwise. The
 * vector's input hands the two files in the WRONG order on purpose, so the storage
 * order proves it is the rule's ordering and not the caller's.
 *
 * The header fields are read back out of the emitted bytes rather than out of the
 * module, so that a change to the writer that keeps the API and breaks the format
 * is caught here.
 */
function runCompose0016(vector) {
  const expected = vector.expected;
  const input = vector.input;
  const result = archive.archiveBytes(input.files, { instant: input.instant });
  const bytes = Buffer.from(result.bytes);
  const u16 = (at) => bytes.readUInt16LE(at);
  const u32 = (at) => bytes.readUInt32LE(at);
  // The first central-directory record, at the offset the vector states.
  const cd = expected.central_directory_at;
  const fields = expected.fields;
  const entries = result.entries.map((row, i) => {
    const at = expected.entries[i].local_header_at;
    return {
      crc32: u32(at + 14).toString(16).padStart(8, '0'),
      local_header_at: at,
      name: row.path,
      size: row.bytes.length,
    };
  });

  return checks([
    ['entry order', deepEqual(result.entries.map((r) => r.path), expected.entry_order),
      JSON.stringify(result.entries.map((r) => r.path))],
    ['entries', deepEqual(entries, expected.entries), JSON.stringify(entries)],
    ['total bytes', bytes.length === expected.total_bytes, String(bytes.length)],
    ['base64', bytes.toString('base64') === expected.base64, bytes.toString('base64')],
    ['sha256', crypto.createHash('sha256').update(bytes).digest('hex') === expected.sha256,
      crypto.createHash('sha256').update(bytes).digest('hex')],
    ['violations', deepEqual(plain(result.violations), expected.violations),
      JSON.stringify(result.violations)],
    // Local file header (APPNOTE.TXT section 4.3.7) of the first entry.
    ['local signature', u32(0) === 0x04034b50, u32(0).toString(16)],
    ['version needed', u16(4) === fields.version_needed_to_extract, String(u16(4))],
    ['bit flag', u16(6) === fields.general_purpose_bit_flag, String(u16(6))],
    ['method', u16(8) === fields.compression_method, String(u16(8))],
    ['dos time', u16(10) === fields.dos_time, String(u16(10))],
    ['dos date', u16(12) === fields.dos_date, String(u16(12))],
    ['stored size equals uncompressed size', u32(18) === u32(22), `${u32(18)} vs ${u32(22)}`],
    ['extra field length', u16(28) === fields.extra_field_length, String(u16(28))],
    // Central-directory record (section 4.3.12) of the first entry.
    ['central directory at', u32(cd) === 0x02014b50, `${cd}: ${u32(cd).toString(16)}`],
    ['version made by', u16(cd + 4) === fields.version_made_by, String(u16(cd + 4))],
    ['central extra field length', u16(cd + 30) === fields.extra_field_length, String(u16(cd + 30))],
    ['file comment length', u16(cd + 32) === fields.file_comment_length, String(u16(cd + 32))],
    ['disk number start', u16(cd + 34) === 0, String(u16(cd + 34))],
    ['internal attributes', u16(cd + 36) === fields.internal_file_attributes, String(u16(cd + 36))],
    ['external attributes', u32(cd + 38) === fields.external_file_attributes, String(u32(cd + 38))],
    ['local header offset', u32(cd + 42) === expected.entries[0].local_header_at, String(u32(cd + 42))],
    // End of central directory (section 4.3.16).
    ['end record', u32(bytes.length - 22) === 0x06054b50, u32(bytes.length - 22).toString(16)],
    ['entry count', u16(bytes.length - 22 + 8) === expected.entries.length
      && u16(bytes.length - 22 + 10) === expected.entries.length, String(u16(bytes.length - 12))],
    ['central directory bytes', u32(bytes.length - 22 + 12) === expected.central_directory_bytes,
      String(u32(bytes.length - 22 + 12))],
    ['central directory offset', u32(bytes.length - 22 + 16) === expected.central_directory_at,
      String(u32(bytes.length - 22 + 16))],
    ['archive comment length', u16(bytes.length - 2) === fields.archive_comment_length,
      String(u16(bytes.length - 2))],
    // AGSC-04-25's tenth stamping place.
    ['archive name', archive.archiveName(input.archive_name_stem, input.bundle_version)
      === expected.archive_name, archive.archiveName(input.archive_name_stem, input.bundle_version)],
    ['a version outside the grammar names no state',
      archive.archiveName(input.archive_name_stem, input.bundle_version_outside_the_grammar)
      === expected.archive_name_when_version_is_outside_the_grammar,
      archive.archiveName(input.archive_name_stem, input.bundle_version_outside_the_grammar)],
  ]);
}

const HANDLERS = {
  'compose-0001': runVerdictVector,
  'compose-0002': runVerdictVector,
  'compose-0011': runCompose0011,
  'compose-0012': runCompose0012,
  'compose-0013': runCompose0013,
  'compose-0017': runCompose0017,
  'compose-0014': runCompose0014,
  'compose-0015': runCompose0015,
  'compose-0016': runCompose0016,
};

module.exports.run = function run(vector) {
  const handler = HANDLERS[vector.id];
  if (!handler) return { status: 'fail', detail: `compose.js has no handler for ${vector.id}` };
  return handler(vector);
};
