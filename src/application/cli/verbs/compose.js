'use strict';
// src/application/cli/verbs/compose.js — `compose` (AGSC-09-07).
// The five steps of AGSC-07-04…07-08 in their normative order and the
// AGSC-07-09 verdict are `composition/compose.js`'s; `--from <slug>` reads the
// saved composition of AGSC-02-97/07-24; `--emit <target>` is AGSC-07-18.
// Owner: B (shell); wired at integration (WP-10-G).

const compose = require('../../../composition/compose.js');
const architecture = require('../../../composition/architecture.js');
const harness = require('../../../composition/harness.js');
const { canonicalize } = require('../../../knowledge/jcs.js');
const helpers = require('./_helpers.js');

/** The flat item record the Composition context reads (slug, type, frontmatter). */
function flatten(items) {
  return (items || []).map((i) => Object.assign({ slug: i.slug, type: i.type }, i.frontmatter));
}

function run(ctx) {
  const bundle = helpers.bundleOf(ctx);
  const items = flatten(bundle.items);
  const from = ctx.verbFlags && ctx.verbFlags.from;

  let findings = [];
  let result;
  if (from !== undefined) {
    const saved = architecture.composeFrom(items, String(from));
    findings = [...saved.findings];
    result = saved.result;
  } else {
    result = compose.compose(items, ctx.argv || []);
  }

  if (result === null || result === undefined) return { findings };
  // AGSC-09-11: a Composition warning is a domain record; the application layer
  // is what turns it into a Finding, and every Finding carries a severity.
  findings.push(...(result.warnings || []).map((w) => ({ severity: 'warn', ...w })));
  for (const conflict of result.conflicts || []) {
    findings.push({
      code: conflict.code,
      message: `composition conflict on ${conflict.key}: ${(conflict.pair || []).join(' / ')} (AGSC-07-06)`,
      severity: 'error',
    });
  }
  helpers.note(ctx, `verdict: ${canonicalize(compose.verdictOf(result))}`);

  // AGSC-07-12: the seven Harness files are NOT written at this milestone (see
  // `composition/harness.js`); `--emit` renders none of the AGSC-07-18 targets
  // either, because a target rendering IS a rendering of those seven files.
  // The verdict is honest about it rather than silently emitting nothing.
  const emit = ctx.verbFlags && ctx.verbFlags.emit;
  if (emit !== undefined || harness.isEmitted(result)) {
    helpers.note(ctx, 'harness_emitted: false');
  }
  if (emit !== undefined) {
    findings.push({
      code: 'AGSC-E001',
      message: `compose --emit ${emit} is named by AGSC-07-18 but is not implemented at this milestone:`
        + ' the seven Harness files of AGSC-07-12 are not written yet, and every --emit target is a'
        + ' rendering of them — no conformance Level is claimed before 1.0.0 (AGSC-10-05)',
      severity: 'error',
    });
  }
  return { findings };
}

module.exports = { name: 'compose', flatten, run };
