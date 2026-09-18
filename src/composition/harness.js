'use strict';
/**
 * CONTEXT Composition — aggregate: Harness.
 * Implements the part of spec/07-composition.md that the compose vectors
 * assert today: AGSC-07-17 (an invalid composition emits no Harness — the
 * `harness_emitted` member of `compose-0001`/`compose-0002`) and the wiring
 * renderings of AGSC-07-23 (the Structurizr relationship lines of
 * `workspace.dsl` and the equivalent `diagram.mmd` edges, both ordered by
 * (producer, consumer, port), every comparison by code point).
 * Requirements: PRD-037, D67 Q56.
 *
 * PURE.
 *
 * NOT IMPLEMENTED HERE, deliberately and with no pretending stub: the seven
 * Harness file kinds of AGSC-07-12 (`harness.jsonld`, `AGENTS.md`,
 * `workspace.dsl`, `diagram.mmd`, `arc42.md`, `decisions/NNNN-<slug>.md`,
 * `skills/<slug>/SKILL.md`), their CC0/Content-Use statement (AGSC-07-16),
 * the no-executable-content closure (AGSC-07-15), the browser/CLI byte
 * identity of AGSC-07-13 and the `--emit <target>` renderings of AGSC-07-18.
 * No `compose/` vector asserts a Harness byte at 1.0.0-rc.4, and a stub that
 * emitted plausible-looking files would make an unproved claim. They belong
 * to the Harness package (WP-10 follow-on); this module gives it the two
 * renderings the wiring rule already pins, so that package adds files, not
 * algorithms.
 */

const { compareCodePoint } = require('./compose.js');

/** Every producer/consumer/port triple of a verdict's wiring, in AGSC-07-23 order. */
function pairs(result) {
  const out = [];
  for (const edge of (result && result.wiring) || []) {
    for (const producer of edge.producers) {
      out.push(Object.freeze({ consumer: edge.consumer, port: edge.port, producer }));
    }
  }
  return out.sort((a, b) => compareCodePoint(a.producer, b.producer)
    || compareCodePoint(a.consumer, b.consumer)
    || compareCodePoint(a.port, b.port));
}

/** AGSC-07-23: one Structurizr relationship per producer-consumer pair. */
function dslRelationships(result) {
  return Object.freeze(pairs(result).map((p) => `${p.producer} -> ${p.consumer} "produces ${p.port}"`));
}

/** AGSC-07-23: the equivalent Mermaid flowchart edge, same order. */
function mermaidEdges(result) {
  return Object.freeze(pairs(result).map((p) => `  ${p.producer} -->|produces ${p.port}| ${p.consumer}`));
}

/** AGSC-07-17: a Harness is emitted only for a valid composition. */
function isEmitted(result) {
  return Boolean(result && result.valid);
}

module.exports = {
  dslRelationships,
  isEmitted,
  mermaidEdges,
  pairs,
};
