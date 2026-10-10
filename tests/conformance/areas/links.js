'use strict';
// Conformance area `links` — AGSC-03-02…03-13 and AGSC-01-35 where a
// body reference carries a path.
//
// The vectors carry two input shapes: `input.items` (flat frontmatter objects,
// optionally with a `body`) drives `knowledge/links.js#resolve`; `input.markdown`
// drives the AGSC-03-13 anchor algorithm alone. `expected.warnings` is the whole
// list of warnings the Link checks report, each `{code, slug}`, in slug order
// (`links-0009`, the AGSC-03-10 orphans). The handler is guarded, so a pass that
// left a member of `expected` unread is a fail.

const links = require('../../../src/knowledge/links.js');
const { deepEqual, checks } = require('./_assert.js');
const { guarded } = require('./_expected-reads.js');
const { compareCodePoint } = require('../../../src/knowledge/unicode.js');

/** links-0004: anchor totality, `section-<n>` numbering and collision confluence. */
function runAnchors(vector) {
  const result = links.anchors(vector.input.markdown);
  const list = [];
  if (Array.isArray(vector.expected.anchors)) {
    list.push(['anchors', deepEqual(result.anchors, vector.expected.anchors),
      JSON.stringify(result.anchors)]);
  }
  if (Array.isArray(vector.expected.errors)) {
    list.push(['errors', result.errors.length === vector.expected.errors.length,
      JSON.stringify(result.errors)]);
  }
  return checks(list);
}

/** Every other links vector: the Link graph of a small Bundle. */
function runGraph(vector) {
  const result = links.resolve(vector.input.items);
  const errors = result.errors.filter((f) => f.severity === 'error');
  const { expected } = vector;
  const list = [];

  if (Array.isArray(expected.edges)) {
    list.push(['edges', deepEqual(result.edges, expected.edges), JSON.stringify(result.edges)]);
  }
  if (Array.isArray(expected.errors)) {
    // A vector stating `errors: []` states that nothing is an ERROR; AGSC-03-10
    // orphan warnings are warnings and are counted nowhere.
    list.push(['errors', errors.length === expected.errors.length,
      JSON.stringify(errors.map((f) => f.code))]);
  }
  if (typeof expected.error === 'string') {
    list.push(['error', errors.some((f) => f.code === expected.error),
      JSON.stringify(errors.map((f) => f.code))]);
  }
  for (const key of ['cycle', 'chain', 'parents', 'resolved', 'unresolved', 'skipped_external']) {
    if (expected[key] === undefined) continue;
    list.push([key, deepEqual(result[key], expected[key]), JSON.stringify(result[key])]);
  }
  if (Array.isArray(expected.warnings)) {
    const warnings = result.findings.filter((f) => f.severity === 'warn')
      .map((f) => ({ code: f.code, slug: f.slug }))
      .sort((a, b) => compareCodePoint(String(a.slug), String(b.slug)) || compareCodePoint(a.code, b.code));
    list.push(['warnings', deepEqual(warnings, expected.warnings), JSON.stringify(warnings)]);
  }
  return checks(list);
}

module.exports.run = guarded((vector) => {
  if (typeof vector.input.markdown === 'string') return runAnchors(vector);
  if (Array.isArray(vector.input.items)) return runGraph(vector);
  return { status: 'fail', detail: `no handler for this input shape in area links (${vector.id})` };
});
