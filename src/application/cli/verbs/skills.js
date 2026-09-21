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
 * flag set of every verb and names none for `skills`, so a flag would be
 * `AGSC-E002`.
 *
 * Owner: ENG-5 (WP-12).
 */

const site = require('../../../distribution/site.js');
const skills = require('../../../composition/skills.js');
const fix = require('../../../governance/fix.js');
const { serialize } = require('../../../knowledge/adopt.js');
const { readSchemas } = require('../../../adapters/node-fs.js');
const { instantFromEpoch } = require('../../../governance/ledger.js');
const { finding } = require('../../../knowledge/validate.js');
const helpers = require('./_helpers.js');

/** AGSC-01-08: the generated directory the verb writes into, never `build.out`. */
const SKILLS_DIR = 'dist/skills';

/** The build instant, from the Clock port and never from a wall clock (AGSC-04-11). */
function instantOf(ctx) {
  const clock = ctx.ports && ctx.ports.clock;
  if (clock && typeof clock.iso === 'function') return clock.iso();
  return instantFromEpoch(clock ? clock.now() : 0);
}

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

  const available = new Map();
  for (const file of produced.files) {
    if (file.path !== 'index.json') available.set(file.path, file.text);
  }
  const installed = new Map();
  for (const pack of produced.index.packs) {
    const at = `${target}/${pack.name}/${skills.PACK_FILE}`;
    try {
      if (ctx.ports.fs.exists(at)) installed.set(at, String(ctx.ports.fs.readFile(at, 'utf8')));
    } catch (e) {
      // An unreadable installed file is treated as absent and is overwritten.
    }
  }
  const plan = skills.install(produced.index, available, installed, {
    sha256: helpers.sha256, target,
  });
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
  const mapped = skills.importPack(text, { operator: operator === undefined ? 'human:unknown' : operator });
  if (mapped.path === null) return mapped.findings;
  // The written bytes go through the ONE writer (`governance/fix.js` over
  // `adopt.js#serialize`), so the imported item is already lint-normalized
  // (AGSC-04-19) and a second import of the same pack writes the same file
  // (AGSC-01-23).
  const itemSchema = readSchemas(helpers.ENGINE_ROOT).item;
  const ordered = fix.orderKeys(mapped.frontmatter,
    fix.declaredOrder(itemSchema, 'procedure'), itemSchema, 'procedure', null);
  const out = fix.normaliseText(`${serialize(fix.quoteTemporal(ordered))}${mapped.body}`);
  ctx.ports.fs.mkdirp('content/procedures');
  ctx.ports.fs.writeFile(mapped.path, out);
  helpers.note(ctx, `skills import: wrote ${mapped.path} (AGSC-07-22)`);
  return mapped.findings;
}

function run(ctx) {
  const argv = ctx.argv || [];
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
  SKILLS_DIR, emit, importPack, installPacks, instantOf, name: 'skills', packsOf, run,
};
