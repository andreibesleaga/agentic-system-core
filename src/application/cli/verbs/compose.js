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
const { instantFromEpoch } = require('../../../governance/ledger.js');
const helpers = require('./_helpers.js');

/**
 * The flat item record the Composition context reads (slug, type, frontmatter) — and
 * the BODY, which two rules need and which this function used to drop: AGSC-02-97's
 * `yaml agsc-selection` fence lives in the body, so `compose --from` found no
 * selection at all without it, and AGSC-07-12's `skills/<slug>/SKILL.md` quotes the
 * Procedure's own prose, so the CLI emitted an empty skill file while the page — which
 * fetches `/pages/<slug>.md` — emitted the real one, breaking AGSC-07-13's
 * byte-identity in the one place it is hardest to notice.
 */
function flatten(items) {
  return (items || []).map((i) => Object.assign({ body: i.body, slug: i.slug, type: i.type }, i.frontmatter));
}

/**
 * One sentence per conflict kind, each citing the rule that raises it and saying
 * what a person can do about it (R64). The four kinds are not one rule:
 * AGSC-07-03 (a selected slug absent from the graph, or retired), AGSC-07-05a
 * (a surviving item requires an item Step 2 hid — the rule fixes the message
 * form "required item superseded — select `<superseding>`"), and AGSC-07-06
 * (a surviving `excludes` pair). The conflict record itself is the Composition
 * context's (AGSC-07-09); only its wording is decided here.
 *
 * @param {{code: string, key: string, pair?: string[], superseding?: string}} conflict
 * @returns {string}
 */
function conflictMessage(conflict) {
  const pair = conflict.pair || [];
  const [a, b] = pair;
  if (conflict.code === 'AGSC-E801') {
    return `composition invalid: \`${a}\` and \`${b}\` exclude each other;`
      + ' drop one of the two from the selection (AGSC-07-06)';
  }
  if (conflict.key === 'selection') {
    return `no item with slug \`${a}\` is in the graph; check the spelling,`
      + ' or `agsc lint` the Bundle to see which slugs exist (AGSC-07-03)';
  }
  if (conflict.key === 'status') {
    return `\`${a}\` is retired and cannot be selected (AGSC-07-03, AGSC-11-22)`;
  }
  if (conflict.key === 'requires' && conflict.superseding !== undefined) {
    return `required item superseded — select \`${conflict.superseding}\`:`
      + ` \`${a}\` requires \`${b}\`, which Step 2 hid (AGSC-07-05a)`;
  }
  if (conflict.key === 'requires') {
    return `\`${a}\` requires \`${b}\`, which is not in the graph (AGSC-07-03, AGSC-07-04)`;
  }
  return `composition conflict on ${conflict.key}: ${pair.join(' / ')} (AGSC-07-09)`;
}

/**
 * One sentence per Composition WARNING kind (R64, F27-11). The verdict's
 * `warnings[]` entries are domain records — `{code, key, source, target}` — and
 * carried no `message`, so `agsc compose` printed a blank diagnostic line
 * (`warn: AGSC-E803 `) for the commonest outcome there is. The two kinds are
 * AGSC-07-07's `AGSC-E803` (a Link key that does not close, `uses` above all) and
 * AGSC-07-23's `AGSC-E804` (a `consumes[]` port with no producer among the
 * survivors); neither invalidates the composition, and both are worth a sentence.
 *
 * @param {{code:string, key:string, source?:string, target?:string}} warning
 * @returns {string}
 */
function warningMessage(warning) {
  const source = warning.source === undefined ? '' : warning.source;
  const target = warning.target === undefined ? '' : warning.target;
  if (warning.code === 'AGSC-E804') {
    return `\`${source}\` consumes the port \`${target}\`, and no selected item produces it;`
      + ' the composition is still valid (AGSC-07-23)';
  }
  if (warning.code === 'AGSC-E803') {
    return `\`${source}\` names \`${target}\` under \`${warning.key}\`, which does not close a`
      + ' selection — only `requires` does, so it was not added (AGSC-07-05, AGSC-07-07)';
  }
  return `composition warning on ${warning.key}: ${source} → ${target} (${warning.code})`;
}

/**
 * AGSC-07-12 / AGSC-07-13 / AGSC-07-17: write the seven Harness files.
 *
 * The bytes are `composition/harness.js#emit`'s and are computed from the verdict,
 * the items, the build instant and the selection digest alone — never from where
 * they are written, which is what lets the `/compose/` page produce the same bytes
 * with no filesystem at all. The digest is hashed HERE, because the Composition
 * context is pure and `node:crypto` is the host's (AGSC-05-29).
 *
 * The location is AGSC-07-12's `dist/harness/<name>/`, `<name>` being the selection
 * key of `harness.harnessName`; `--out <dir>` overrides it. `dist/` is a generated
 * directory (AGSC-01-08) and is never read back as build input.
 *
 * @param {object} ctx the verb context.
 * @param {object} bundle the loaded Bundle.
 * @param {object} result the verdict.
 * @param {Array<object>} items the flattened items.
 * @returns {{emitted:boolean, dir:(string|null), files:Array<string>,
 *   findings:Array<object>, missing:Array<string>}}
 */
function emitHarness(ctx, bundle, result, items) {
  const findings = [];
  // AGSC-07-17: "An invalid composition MUST NOT emit a Harness."
  if (!harness.isEmitted(result)) {
    return { dir: null, emitted: false, files: [], findings, missing: ['every file: the composition is invalid (AGSC-07-17)'] };
  }
  const config = bundle.config || {};
  const site = config.site || {};
  const clock = ctx.ports && ctx.ports.clock;
  const instant = clock && typeof clock.iso === 'function'
    ? clock.iso()
    : instantFromEpoch(clock ? clock.now() : 0);
  const selectionDigest = helpers.sha256(harness.selectionDigestInput(result));
  const name = harness.harnessName(selectionDigest);
  const emission = harness.emit(result, {
    base: `${String(site.base || '').replace(/\/+$/u, '')}/`,
    instant,
    items,
    licenseProse: (config.bundle && config.bundle.license_prose) || harness.terms(),
    name,
    selectionDigest,
    specVersion: ctx.specVersion,
  });
  for (const violation of emission.violations) findings.push({ ...violation, severity: 'error' });
  const raw = ctx.verbFlags && ctx.verbFlags.out;
  const dir = `${String(raw === undefined || raw === '' ? `dist/harness/${name}` : raw).replace(/\/+$/u, '')}/`;
  const written = [];
  for (const [path, text] of emission.files) {
    const at = `${dir}${path}`;
    const slash = at.lastIndexOf('/');
    if (slash !== -1) ctx.ports.fs.mkdirp(at.slice(0, slash));
    ctx.ports.fs.writeFile(at, text);
    written.push(at);
  }
  return { dir, emitted: emission.emitted, files: written, findings, missing: [...emission.missing] };
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
  findings.push(...(result.warnings || []).map((w) => ({ severity: 'warn', message: warningMessage(w), ...w })));
  for (const conflict of result.conflicts || []) {
    findings.push({ code: conflict.code, message: conflictMessage(conflict), severity: 'error' });
  }
  helpers.note(ctx, `verdict: ${canonicalize(compose.verdictOf(result))}`);

  // AGSC-07-12/07-17: the seven Harness files, written for a valid composition and
  // for no other. `harness_emitted` is true only when every file kind the rule names
  // for this member set is present and nothing AGSC-07-15 forbids is.
  const emission = emitHarness(ctx, bundle, result, items);
  findings.push(...emission.findings);
  helpers.note(ctx, `harness_emitted: ${emission.emitted}`);
  if (emission.dir !== null) helpers.note(ctx, `harness: ${emission.dir} (${emission.files.length} files)`);
  for (const missing of emission.missing) helpers.note(ctx, `harness missing: ${missing}`);

  // AGSC-07-18: a target rendering IS a rendering of those seven files, and this
  // milestone ships no target template and no registry row. Honest, never silent.
  const emit = ctx.verbFlags && ctx.verbFlags.emit;
  if (emit !== undefined) {
    findings.push({
      code: 'AGSC-E001',
      message: `compose --emit ${emit} is named by AGSC-07-18 but is not implemented at this milestone:`
        + ' a target rendering is a single template plus a registry row, and this distribution ships'
        + ' neither — no conformance Level is claimed before 1.0.0 (AGSC-10-05)',
      severity: 'error',
    });
  }
  return { findings };
}

module.exports = { name: 'compose', conflictMessage, emitHarness, flatten, run, warningMessage };
