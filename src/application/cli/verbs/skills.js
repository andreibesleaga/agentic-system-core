'use strict';
/**
 * src/application/cli/verbs/skills.js — `skills` (AGSC-09-07, spec/07 §7.4).
 *
 *   agsc skills                     emit every pack into `dist/skills/`
 *   agsc skills install [<target>]  install them under one of AGSC-07-21's three
 *                                   targets (default `.agents/skills`), verifying
 *                                   the lockfile first and showing a diff on update
 *   agsc skills import <file>       map a `SKILL.md` to a `procedure` item (AGSC-07-22)
 *
 * The rules are `composition/skills.js`'s; this module is the port wiring. The
 * published routes `/skills/`, `/skills/index.json` and `/skills/<cluster>/SKILL.md`
 * are emitted by `build` from the same module, so the two never differ.
 *
 * `install` and `import` are POSITIONAL arguments, not flags: AGSC-09-09 closes the
 * flag set of every verb and named none for `skills`, so a flag would be
 * `AGSC-E002`. The one exception is `--zip`, which
 * writes the emitted packs as a single archive beside `dist/skills/`; AGSC-09-09's
 * list does not yet name it and the proposed wording is on the specification items
 * list.
 *
 *
 */

const { createTwoFilesPatch } = require('diff');
const site = require('../../../distribution/site.js');
const skills = require('../../../composition/skills.js');
const fix = require('../../../governance/fix.js');
const { serialize } = require('../../../knowledge/adopt.js');
const { readSchemas } = require('../../../adapters/node-fs.js');
const { finding } = require('../../../knowledge/validate.js');
const helpers = require('./_helpers.js');

const { instantOf } = helpers;
const archiveWriter = require('./_archive.js');

/** AGSC-01-08: the generated directory the verb writes into, never `build.out`. */
const SKILLS_DIR = 'dist/skills';

/**
 * Every pack of this Bundle, as data — the same call `distribution/site.js` makes,
 * so the emitted routes and the written directory are the same bytes.
 *
 * @param {object} ctx
 * @param {object} bundle
 * @returns {{files:Array<object>, findings:Array<object>, index:object}}
 */
function packsOf(ctx, bundle) {
  const config = bundle.config || {};
  return site.skillPacks(bundle, {
    // AGSC-07-19 / AGSC-04-25: `/skills/index.json` carries the content version, and
    // `build` emits the same object from the same call — so the value is derived by
    // the same helper in both lanes or the two would differ by one member.
    bundleVersion: archiveWriter.bundleVersionOf(ctx),
    generatedAt: instantOf(ctx),
    sha256: helpers.sha256,
    specVersion: ctx.specVersion,
  }, config);
}

/** Emit into `dist/skills/`. */
function emit(ctx, bundle) {
  const produced = packsOf(ctx, bundle);
  if (produced.findings.some((f) => f.severity === 'error')) return produced.findings;
  for (const file of produced.files) {
    const at = `${SKILLS_DIR}/${file.path}`;
    const slash = at.lastIndexOf('/');
    if (slash !== -1) ctx.ports.fs.mkdirp(at.slice(0, slash));
    ctx.ports.fs.writeFile(at, file.text);
    helpers.note(ctx, `wrote: ${at} sha256:${helpers.sha256(file.text)}`);
  }
  helpers.note(ctx, `skills: ${produced.index.packs.length} pack`
    + `${produced.index.packs.length === 1 ? '' : 's'} under ${SKILLS_DIR}/`
    + ' (one per Cluster, AGSC-07-19; index.json is the lockfile of AGSC-07-20)');
  // the packs and their lockfile belong together, so `--zip` writes them as
  // one archive beside the directory — the same builder, and the same bytes, as the
  // Harness archive and the page's "download all" link (AGSC-07-13).
  if (ctx.verbFlags && ctx.verbFlags.zip === true) {
    const zipped = archiveWriter.writeArchive(ctx, {
      bundleVersion: archiveWriter.bundleVersionOf(ctx),
      files: produced.files,
      instant: instantOf(ctx),
      stem: SKILLS_DIR,
    });
    return [...produced.findings, ...zipped.findings];
  }
  return produced.findings;
}

/** AGSC-07-21: install under one of the three targets, idempotently. */
function installPacks(ctx, bundle, requested) {
  const target = requested === undefined ? skills.INSTALL_TARGETS[0] : String(requested);
  if (!skills.INSTALL_TARGETS.includes(target)) {
    return [finding('AGSC-E003',
      `"${target}" is not an install target; AGSC-07-21 names ${skills.INSTALL_TARGETS.join(', ')}`,
      { file: '', severity: 'error' })];
  }
  const produced = packsOf(ctx, bundle);
  if (produced.findings.some((f) => f.severity === 'error')) return produced.findings;

  // AGSC-07-20: the lockfile an install verifies is the one beside the packs a person
  // can read — `dist/skills/index.json`, written by `agsc skills` — and the files it
  // verifies are the ones on disk beside it, so a pack edited after it was emitted
  // is refused (AGSC-E413). With no emitted packs the install takes the packs this
  // Bundle yields now, and says so: that lock is computed over the same bytes.
  const onDisk = emittedPacks(ctx);
  const index = onDisk === null ? produced.index : onDisk.index;
  const available = new Map();
  if (onDisk === null) {
    for (const file of produced.files) {
      if (file.path !== 'index.json') available.set(file.path, file.text);
    }
    helpers.note(ctx, `skills install: no ${SKILLS_DIR}/index.json, so the packs of this Bundle as it is now`
      + ' were installed (run `agsc skills` first to review them and have the install verify those files)');
  } else {
    for (const [at, text] of onDisk.files) available.set(at, text);
    helpers.note(ctx, `skills install: verifying ${SKILLS_DIR}/ against its index.json lockfile (AGSC-07-20)`);
  }
  const installed = new Map();
  for (const pack of index.packs) {
    const at = `${target}/${pack.name}/${skills.PACK_FILE}`;
    try {
      if (ctx.ports.fs.exists(at)) installed.set(at, String(ctx.ports.fs.readFile(at, 'utf8')));
    } catch (e) {
      // An unreadable installed file is treated as absent and is overwritten.
    }
  }
  const plan = skills.install(index, available, installed, {
    sha256: helpers.sha256, target,
  });
  if (plan.findings.some((f) => f.severity === 'error')) {
    helpers.note(ctx, 'skills install: nothing was installed — a pack does not match its lockfile (AGSC-07-20)');
    return [...produced.findings, ...plan.findings];
  }
  // AGSC-07-20: "MUST show a diff on update" — the unified diff of every updated pack.
  for (const at of plan.updated) {
    const next = plan.writes.find((w) => w.path === at);
    helpers.note(ctx, createTwoFilesPatch(`a/${at}`, `b/${at}`, installed.get(at), next.text, '', '').trimEnd());
  }
  for (const write of plan.writes) {
    const slash = write.path.lastIndexOf('/');
    if (slash !== -1) ctx.ports.fs.mkdirp(write.path.slice(0, slash));
    ctx.ports.fs.writeFile(write.path, write.text);
    helpers.note(ctx, `installed: ${write.path}`);
  }
  helpers.note(ctx, `skills install: ${plan.writes.length} written, ${plan.unchanged.length} unchanged`
    + ` under ${target} (AGSC-07-21; the lockfile of index.json was verified first)`);
  return [...produced.findings, ...plan.findings];
}

/**
 * The packs `agsc skills` wrote under `dist/skills/`: its `index.json` and every
 * pack file the index names, read from disk. `null` when there is no index.
 *
 * @returns {{index:object, files:Map<string,string>}|null}
 */
function emittedPacks(ctx) {
  const fs = ctx.ports.fs;
  let index;
  try {
    if (!fs.exists(`${SKILLS_DIR}/index.json`)) return null;
    index = JSON.parse(String(fs.readFile(`${SKILLS_DIR}/index.json`, 'utf8')));
  } catch (e) {
    return null;
  }
  if (!index || !Array.isArray(index.packs)) return null;
  const files = new Map();
  for (const pack of index.packs) {
    const at = `${String(pack && pack.name)}/${skills.PACK_FILE}`;
    try {
      if (fs.exists(`${SKILLS_DIR}/${at}`)) files.set(at, String(fs.readFile(`${SKILLS_DIR}/${at}`, 'utf8')));
    } catch (e) {
      // absent: `skills.install` reports the pack as listed and missing (AGSC-E901).
    }
  }
  return { files, index };
}

/** AGSC-07-22: a `SKILL.md` back to a `procedure` item. */
function importPack(ctx, bundle, file) {
  if (file === undefined) {
    return [finding('AGSC-E003', 'skills import needs the SKILL.md path as its argument (AGSC-07-22)',
      { file: '', severity: 'error' })];
  }
  let text;
  try {
    text = String(ctx.ports.fs.readFile(String(file), 'utf8'));
  } catch (e) {
    return [finding('AGSC-E901', `${file} could not be read (AGSC-07-22)`,
      { file: String(file), severity: 'error' })];
  }
  const operator = ((bundle.config || {}).bundle || {}).operator;
  const identity = { operator: operator === undefined ? 'human:unknown' : operator };
  // AGSC-07-22 over a pack of this format (AGSC-07-19): split it into its member
  // procedures; any other SKILL.md is one foreign skill, one procedure.
  const split = skills.splitPack(text, identity);
  const mapped = split === null ? skills.importPack(text, identity) : null;
  if (mapped !== null && mapped.path === null) return mapped.findings;
  const planned = split === null ? [mapped] : split.items;
  const findings = split === null ? [...mapped.findings] : [...split.findings];
  // The written bytes go through the ONE writer (`governance/fix.js` over
  // `adopt.js#serialize`), so the imported item is already lint-normalized
  // (AGSC-04-19) and a second import of the same pack writes the same file
  // (AGSC-01-23).
  const itemSchema = readSchemas(helpers.ENGINE_ROOT).item;
  let written = 0;
  for (const one of planned) {
    const ordered = fix.orderKeys(one.frontmatter,
      fix.declaredOrder(itemSchema, 'procedure'), itemSchema, 'procedure', null);
    const out = fix.normaliseText(`${serialize(fix.quoteTemporal(ordered))}${one.body.startsWith('\n') ? '' : '\n'}${one.body}`);
    // AGSC-01-23: an import never writes over an item the Bundle already holds.
    let existing = null;
    try {
      if (ctx.ports.fs.exists(one.path)) existing = String(ctx.ports.fs.readFile(one.path, 'utf8'));
    } catch (e) {
      // Present and unreadable is still present: never written over.
      existing = '';
    }
    if (existing === out) {
      helpers.note(ctx, `skills import: ${one.path} unchanged`);
      continue;
    }
    if (existing !== null) {
      findings.push(finding('AGSC-E206', `${one.path} already exists with other bytes; an import never writes`
        + ' over an item the Bundle holds (AGSC-01-23) — move it aside or edit it by hand',
      { file: one.path, severity: 'error' }));
      continue;
    }
    ctx.ports.fs.mkdirp('content/procedures');
    ctx.ports.fs.writeFile(one.path, out);
    written += 1;
    helpers.note(ctx, `skills import: wrote ${one.path} (AGSC-07-22)`);
  }
  if (split !== null) {
    helpers.note(ctx, `skills import: a pack of this format — ${split.items.length} procedure(s),`
      + ` ${written} written (AGSC-07-19, AGSC-07-22)`);
  }
  return findings;
}

function run(ctx) {
  const argv = ctx.argv || [];
  // `--zip` archives what `skills` EMITS; `install` writes into a target tree and
  // `import` reads one file, and neither produces a set to package.
  if (argv[0] !== undefined && ctx.verbFlags && ctx.verbFlags.zip === true) {
    return {
      status: 'fail',
      findings: [finding('AGSC-E003',
        `--zip archives the packs \`skills\` emits under ${SKILLS_DIR}/ and has no meaning with`
        + ` "${argv[0]}"; run \`agsc skills --zip\` on its own`,
        { file: '', severity: 'error' })],
    };
  }
  const outside = helpers.outsideBundle(ctx, argv[0] === undefined ? 'skills' : `skills ${argv[0]}`);
  if (outside !== null) return { status: 'fail', findings: [outside] };
  const bundle = helpers.bundleOf(ctx);
  if (argv[0] === 'install') return { findings: installPacks(ctx, bundle, argv[1]) };
  if (argv[0] === 'import') return { findings: importPack(ctx, bundle, argv[1]) };
  if (argv[0] !== undefined) {
    return {
      status: 'fail',
      findings: [finding('AGSC-E003',
        `skills takes no argument, or "install [<target>]" or "import <file>"; "${argv[0]}" is`
        + ' neither (spec/07 §7.4)', { file: '', severity: 'error' })],
    };
  }
  return { findings: emit(ctx, bundle) };
}

module.exports = {
  emit, importPack, instantOf, name: 'skills', packsOf, run,
};
