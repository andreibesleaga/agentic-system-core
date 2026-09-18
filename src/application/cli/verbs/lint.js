'use strict';
// src/application/cli/verbs/lint.js — the `lint` verb (AGSC-09-07, AGSC-09-12).
//
// The lint lane is the whole read path of a Bundle, in one place, so that
// `lint` and `ci` cannot disagree: the parse and schema findings the loader
// already produced, the Bundle root and the configuration (AGSC-01-04,
// AGSC-01-17/18 and the agent lane of AGSC-01-36…38), placement and slug
// uniqueness (AGSC-01-03, AGSC-01-11), the Link graph (AGSC-03) and the four
// N9 lints with the structural lints beside them (`governance/lint.js`,
// AGSC-08-13…17).
//
// Owner: B; the item-level lane was wired at integration (WP-10-G).

const validate = require('../../../knowledge/validate.js');
const links = require('../../../knowledge/links.js');
const slug = require('../../../knowledge/slug.js');
const govLint = require('../../../governance/lint.js');
const { checkAgents } = require('../../../governance/agents.js');
const helpers = require('./_helpers.js');

/**
 * lane(ctx, bundle) -> { findings, lanes }
 * The findings the LOADER already produced (parse and schema faults) are NOT
 * repeated here: `distribution/ci.js` starts its pipeline from them, and one
 * fault must be counted once (AGSC-09-11). `run()` adds them for the standalone
 * verb. `lanes` names every lane that ran AND every lane that could not, so a
 * caller never mistakes an unrunnable check for a green one.
 */
function lane(ctx, bundle) {
  const findings = [];
  const lanes = ['parse', 'schema'];
  const schemas = helpers.schemas();

  // AGSC-01-17/18 + AGSC-01-36…38: the configuration, closed, with the agent
  // lane INJECTED (Knowledge never requires Governance).
  findings.push(...validate.config(bundle.config || {}, {
    checkAgents, file: 'agsc.config.json', schemas,
  }));
  lanes.push('config');

  // AGSC-01-04: the Bundle root.
  if (bundle.index) {
    findings.push(...validate.index(bundle.index.frontmatter || {}, {
      file: 'content/index.md', schemas,
    }));
  }
  lanes.push('root');

  // AGSC-01-03 placement and AGSC-01-11 uniqueness.
  for (const item of bundle.items || []) {
    findings.push(...validate.placement(item.path, item.frontmatter || {}));
  }
  findings.push(...slug.check((bundle.items || []).map((i) => i.slug),
    { files: (bundle.items || []).map((i) => i.path) }));
  lanes.push('placement');

  // AGSC-03: the Link graph, its inverses, its cycles and its body references.
  findings.push(...links.resolve(bundle.items || [], { config: bundle.config }).errors);
  lanes.push('links');

  // AGSC-08-13…17 and the structural lints. Every file fact is injected.
  const facts = helpers.attachmentFacts(ctx, bundle);
  const tracked = helpers.trackedPaths(ctx);
  findings.push(...govLint.lint(bundle, {
    attachmentBytes: facts.attachmentBytes,
    filesPresent: facts.filesPresent,
    sha256: helpers.sha256,
    trackedPaths: tracked === null ? undefined : tracked,
  }));
  lanes.push(tracked === null
    ? 'governance (without the tracked-file check of AGSC-01-37: no ProcessRunner port)'
    : 'governance');

  return { findings: validate.sortFindings(findings), lanes };
}

function run(ctx) {
  const bundle = helpers.bundleOf(ctx);
  const result = lane(ctx, bundle);
  for (const name of result.lanes) helpers.note(ctx, `lane: ${name}`);
  return { findings: validate.sortFindings([...(bundle.findings || []), ...result.findings]) };
}

module.exports = { name: 'lint', lane, run };
