'use strict';
// src/application/cli/verbs/compose.js — `compose` (AGSC-09-07).
// The five steps of AGSC-07-04…07-08 in their normative order and the
// AGSC-07-09 verdict are `composition/compose.js`'s; `--from <slug>` reads the
// saved composition of AGSC-02-97/07-24; `--emit <target>` is AGSC-07-18.

const compose = require('../../../composition/compose.js');
const architecture = require('../../../composition/architecture.js');
const harness = require('../../../composition/harness.js');
const { canonicalize } = require('../../../knowledge/jcs.js');
const { instantFromEpoch } = require('../../../governance/ledger.js');
const loader = require('../../plugin-loader.js');
const helpers = require('./_helpers.js');
const archiveWriter = require('./_archive.js');

/**
 * The flat item record the Composition context reads (slug, type, frontmatter) — and
 * the BODY, which two rules need: AGSC-02-97's `yaml agsc-selection` fence lives in
 * the body, so `compose --from` finds no selection without it, and AGSC-07-12's `skills/<slug>/SKILL.md` quotes the
 * Procedure's own prose, so the CLI emitted an empty skill file while the page — which
 * fetches `/pages/<slug>.md` — emitted the real one, breaking AGSC-07-13's
 * byte-identity in the one place it is hardest to notice.
 */
function flatten(items) {
  return (items || []).map((i) => Object.assign({ body: i.body, slug: i.slug, type: i.type }, i.frontmatter));
}

/**
 * One sentence per conflict kind, each citing the rule that raises it and saying
 * what a person can do about it. The four kinds are not one rule:
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
 * One sentence per Composition WARNING kind. The verdict's
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
 * AGSC-07-18: the emitter registry, CLOSED at 1.x. The rule names its six rows in
 * its own first sentence ("GABBE, kaiban-distributed, CrewAI, LangGraph, ADK/MS-AF,
 * n8n"), and AGSC-00-24 states that no extension point exists beyond the eight
 * plugin kinds — so a name this list does not hold is not a plugin a caller may
 * bring, it is a change to the specification.
 */
const EMITTERS = Object.freeze(['gabbe', 'kaiban-distributed', 'crewai', 'langgraph',
  'adk-msaf', 'n8n']);

/**
 * AGSC-00-25: the target names this specification RESERVES to a later version.
 * `executable` is reserved together with the optimisation step that produces it.
 * They are refused with the same code as any other unregistered value — the reason
 * differs and the fault does not (AGSC-09-15: no code is minted where one fits).
 */
const RESERVED_EMITTERS = Object.freeze(['executable']);

/**
 * AGSC-00-23: `--emit <target>` is a KNOWN flag carrying a value the closed
 * registry does not hold, so the fault is `AGSC-E203` at exit 1 — a finding — and
 * not `AGSC-E002` at exit 2, which AGSC-09-08 reserves for an unknown flag, an
 * unknown verb or a missing argument.
 *
 * @param {*} target the value of `--emit`.
 * @returns {object|null} the finding, or `null` when the registry holds the name.
 */
function emitterRefusal(target) {
  const name = String(target === undefined || target === null ? '' : target);
  if (EMITTERS.includes(name)) return null;
  const reserved = RESERVED_EMITTERS.includes(name);
  return {
    code: 'AGSC-E203',
    col: 1,
    file: '',
    line: 1,
    message: `compose --emit ${JSON.stringify(name)} is not in the closed emitter registry of`
      + ` AGSC-07-18; the six names are ${EMITTERS.join(', ')}`
      + (reserved
        ? `. ${JSON.stringify(name)} is RESERVED to a later version of this specification`
        + ' (AGSC-00-25), so a 1.0 tool refuses it rather than inventing a rendering for it'
        : ''),
    severity: 'error',
  };
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
    // `--zip` too: an archive of nothing would be a download that says a Harness
    // exists (adds the archive beside the files, never instead of them).
    if (ctx.verbFlags && ctx.verbFlags.zip === true) {
      helpers.note(ctx, 'harness missing: the archive of --zip, for the same reason (AGSC-07-17)');
    }
    return { archive: null, dir: null, emitted: false, files: [], findings, missing: ['every file: the composition is invalid (AGSC-07-17)'] };
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
    // AGSC-04-25 / AGSC-07-12: `harness.jsonld` and the provenance header of every
    // `AGENTS.md` and `SKILL.md` carry the content version. It is DERIVED HERE and
    // handed in, because AGSC-07-13 obliges the CLI and the `/compose/` page to emit
    // the same bytes and a page has no git history to derive it from.
    bundleVersion: archiveWriter.bundleVersionOf(ctx),
    instant,
    items,
    licenseProse: (config.bundle && config.bundle.license_prose) || harness.terms(),
    name,
    selectionDigest,
    specVersion: ctx.specVersion,
  });
  for (const violation of emission.violations) findings.push({ ...violation, severity: 'error' });
  // A Harness whose own files break a rule is not written at all: files that were
  // refused are not a Harness, and a partial one on disk would read as a valid one.
  if (emission.violations.length > 0) {
    return { archive: null, dir: null, emitted: false, files: [], findings, missing: ['every file: the emission broke a rule (AGSC-07-17)'] };
  }
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
  // `--zip` packages exactly the bytes that were just written, BESIDE the
  // directory — AGSC-07-12 closes the Harness at seven file kinds, so the archive is
  // never inside it. The entry bytes are the emission's, not a re-read of the disk,
  // which is what lets the `/compose/` page — which has no disk — build the same
  // archive (AGSC-07-13).
  const zipped = ctx.verbFlags && ctx.verbFlags.zip === true
    ? archiveWriter.writeArchive(ctx, {
      bundleVersion: archiveWriter.bundleVersionOf(ctx),
      files: emission.files,
      instant,
      stem: dir,
    })
    : { findings: [], path: null };
  findings.push(...zipped.findings);

  return {
    archive: zipped.path,
    dir,
    emitted: emission.emitted,
    files: written,
    findings,
    missing: [...emission.missing],
    texts: new Map(emission.files),
  };
}

/**
 * `compose --emit <target>`: the target this invocation names. A name of the closed
 * registry of AGSC-07-18 is refused as not implemented (this distribution ships no
 * template), a reserved or unknown name is `AGSC-E203`, and a local path or an
 * installed package is a composition-emitter PLUGIN resolved through its registry
 * (AGSC-00-24) — a remote one is `AGSC-E905`.
 *
 * @returns {{plugin:(object|null), findings:Array<object>}}
 */
function emitTarget(ctx, emit) {
  const name = String(emit);
  if (EMITTERS.includes(name) || RESERVED_EMITTERS.includes(name)) {
    const refusal = emitterRefusal(emit);
    return {
      findings: [refusal === null ? {
        code: 'AGSC-E001',
        message: `compose --emit ${emit} is named by AGSC-07-18 but is not implemented at this milestone:`
          + ' a target rendering is a single template plus a registry row, and this distribution ships'
          + ' neither — no conformance Level is claimed before 1.0.0 (AGSC-10-05)',
        severity: 'error',
      } : refusal],
      plugin: null,
    };
  }
  const shape = loader.classify(name);
  if (shape === 'remote' || shape === 'path' || shape === 'package') {
    const loaded = loader.load('composition-emitter', name, { flag: 'compose --emit', root: ctx.root, specVersion: ctx.specVersion });
    if (loaded.plugin !== null) return { findings: [], plugin: loaded.plugin };
    if (!loaded.missing) return { findings: loaded.findings, plugin: null };
  }
  return { findings: [emitterRefusal(emit)], plugin: null };
}

/**
 * Run an admitted composition-emitter plugin over the Harness just written. Its
 * `emit(harnessFiles, harnessDir)` hook answers one `{path, text}` or a list of
 * them; each path is Bundle-relative, outside the Harness directory and outside
 * `content/` (AGSC-07-18, AGSC-00-24(ii)), or nothing of it is written.
 */
function runEmitter(ctx, plugin, emission) {
  const label = `compose --emit ${plugin.name}`;
  const called = loader.call(plugin, 'emit', [new Map(emission.texts), emission.dir], label);
  if (called.findings.length > 0) return called.findings;
  const outputs = Array.isArray(called.value) ? called.value : [called.value];
  const findings = [];
  for (const out of outputs) {
    const at = out && typeof out.text === 'string' ? String(out.path) : null;
    let why = at === null ? 'an output with no text' : loader.unsafePath(at);
    if (why === null && at.startsWith(emission.dir)) why = 'a path inside the Harness directory, which AGSC-07-12 closes at seven file kinds';
    if (why === null && at.startsWith('content/')) why = 'a path inside content/ (AGSC-08-02)';
    if (why !== null) {
      findings.push({ code: 'AGSC-E902', message: `${label}: the plugin asked to write ${JSON.stringify(String(out && out.path))}, ${why}; nothing was written`, severity: 'error' });
    }
  }
  if (findings.length > 0) return findings;
  for (const out of outputs) {
    const at = String(out.path);
    const slash = at.lastIndexOf('/');
    if (slash !== -1) ctx.ports.fs.mkdirp(at.slice(0, slash));
    ctx.ports.fs.writeFile(at, out.text);
    helpers.note(ctx, `emit: ${at} (${plugin.name}, a plugin)`);
  }
  return [];
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
  // for this member set is present and nothing AGSC-07-15 forbids is. A run that has
  // already found an error (a `--from` item with no selection fence, a conflict)
  // writes nothing — no Harness and no archive.
  // AGSC-07-18: the `--emit` target is decided BEFORE anything is written, so a
  // target this run cannot render stops the whole run rather than leaving a Harness
  // behind it.
  const emit = ctx.verbFlags && ctx.verbFlags.emit;
  const target = emit === undefined ? { findings: [], plugin: null } : emitTarget(ctx, emit);
  findings.push(...target.findings);
  const failed = findings.some((f) => f.severity === 'error');
  if (failed && ctx.verbFlags && ctx.verbFlags.zip === true) {
    helpers.note(ctx, 'harness missing: the archive of --zip, for the same reason (AGSC-07-17)');
  }
  const emission = failed
    ? { dir: null, emitted: false, files: [], findings: [], missing: [harness.isEmitted(result)
      ? 'every file: the run found an error, so nothing was written'
      : 'every file: the composition is invalid (AGSC-07-17)'] }
    : emitHarness(ctx, bundle, result, items);
  findings.push(...emission.findings);
  helpers.note(ctx, `harness_emitted: ${emission.emitted}`);
  if (emission.dir !== null) helpers.note(ctx, `harness: ${emission.dir} (${emission.files.length} files)`);
  for (const missing of emission.missing) helpers.note(ctx, `harness missing: ${missing}`);

  // AGSC-07-18: a target rendering IS a rendering of those seven files, written
  // outside the Harness directory, and only of a Harness that was emitted.
  if (target.plugin !== null && emission.emitted) findings.push(...runEmitter(ctx, target.plugin, emission));
  return { findings };
}

module.exports = {
  name: 'compose', conflictMessage, emitHarness, emitterRefusal,
  flatten, run, warningMessage,
};
