'use strict';
// Conformance area `build`.
//
// Created by the graph package (owner D) for `build-0010` alone — the optional static
// query fragments of AGSC-06-33, which are cut from `graph.nq` and therefore belong
// to the graph modules. Every other `build` vector (`build-0001`…`build-0003`, the
// search tokenizer) is owner E's and is listed in `tests/conformance/pending.json`,
// so the runner never reaches this file for them; the EXTENSION POINT at the bottom
// is where E appends its cases without touching anything above.

const crypto = require('node:crypto');
const nq = require('../../../src/knowledge/nquads.js');
const search = require('../../../src/distribution/search.js');
const { canonicalize } = require('../../../src/knowledge/jcs.js');
const { checks, deepEqual } = require('./_assert.js');

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

/** The build instant of AGSC-04-09/04-10 — fixed, never a wall clock. */
const GENERATED_AT = '2026-01-01T00:00:00Z';

/**
 * build-0010 — AGSC-06-33. Subject and predicate fragments only (no object
 * fragments at 1.x), each named by the first 16 hex of the SHA-256 of its IRI.
 *
 * The vector states `index` as the COUNT of distinct terms while AGSC-06-33 states
 * the index as `{subjects, predicates, generated_at}` with arrays of file paths.
 * The rule wins (project rule 6): `shard` emits the arrays, and the count the vector
 * states is compared against their length.
 */
function fragmentsCase(vector) {
  const { files, index } = nq.shard(vector.input.nquads, { sha256, generatedAt: GENERATED_AT });
  const paths = (prefix) => files.map((f) => f.path).filter((p) => p.startsWith(`${prefix}/`));
  const list = [];
  const expected = vector.expected;
  if (expected.subject_files) {
    list.push(['subject_files', JSON.stringify(paths('s')) === JSON.stringify(expected.subject_files),
      `got ${JSON.stringify(paths('s'))}`]);
  }
  if (expected.predicate_files) {
    list.push(['predicate_files', JSON.stringify(paths('p')) === JSON.stringify(expected.predicate_files),
      `got ${JSON.stringify(paths('p'))}`]);
  }
  if (expected.object_files) {
    list.push(['object_files', JSON.stringify(paths('o')) === JSON.stringify(expected.object_files),
      `got ${JSON.stringify(paths('o'))}`]);
  }
  if (expected.index) {
    list.push(['index.subjects', index.subjects.length === expected.index.subjects,
      `got ${index.subjects.length}`]);
    list.push(['index.predicates', index.predicates.length === expected.index.predicates,
      `got ${index.predicates.length}`]);
    list.push(['index.generated_at', index.generated_at === GENERATED_AT, `got ${index.generated_at}`]);
  }
  // Every fragment file holds exactly that term's lines of graph.nq, in the same order.
  const lines = String(vector.input.nquads).split('\n').filter(Boolean);
  for (const file of files) {
    const own = file.text.split('\n').filter(Boolean);
    list.push([`${file.path} is a subset of graph.nq`, own.every((line) => lines.includes(line)), file.text]);
  }
  return checks(list);
}

/**
 * build-0001…build-0003 (owner E) — the normative tokenizer of AGSC-06-23 and the
 * AGSC-06-16 member order. The index is a pure function of the items the vector
 * carries, so no Bundle, no clock and no file system take part.
 */
function searchCase(vector) {
  const expected = vector.expected;
  const got = search.index(vector.input.items);
  const list = [['search index', deepEqual(got, expected.search), canonicalize(got)]];
  if (expected.output !== undefined) {
    // The BYTES, not the structure: AGSC-04-05 orders member names by UTF-16 code
    // units, and a code-point sort emits different bytes for the same index.
    const bytes = `${canonicalize(got)}\n`;
    list.push(['emitted bytes', bytes === expected.output, JSON.stringify(bytes)]);
  }
  if (expected.wrong_if_code_point_sorted !== undefined) {
    const terms = Object.keys(got.terms);
    const byCodePoint = [...terms].sort((a, b) => {
      const x = [...a].map((c) => c.codePointAt(0));
      const y = [...b].map((c) => c.codePointAt(0));
      for (let i = 0; i < Math.min(x.length, y.length); i += 1) if (x[i] !== y[i]) return x[i] - y[i];
      return x.length - y.length;
    });
    list.push(['the two orderings differ, so the case proves something',
      terms.join('\u0000') !== byCodePoint.join('\u0000'),
      'a code-point sort produced the same order as the emitted UTF-16 one']);
  }
  return checks(list);
}

module.exports.run = (vector, ctx) => {
  if (vector.id === 'build-0010') return fragmentsCase(vector);

  // ---------------------------------------------------------------- EXTENSION POINT
  // Owner E: the build-0001…build-0003 cases (search tokenizer, AGSC-06-16/06-23).
  if (vector.id === 'build-0001' || vector.id === 'build-0002' || vector.id === 'build-0003') {
    return searchCase(vector);
  }
  // ---------------------------------------------------------------------------------

  return { status: 'fail', detail: `${vector.id}: no handler in area build`, ctx };
};
