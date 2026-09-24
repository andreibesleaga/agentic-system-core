'use strict';
/**
 * src/application/cli/verbs/export.js — `export` (AGSC-09-07, AGSC-09-09).
 *
 * All six flags of AGSC-01-26…28 are implemented here, plus `--to <adapter>`
 * (AGSC-01-26a).
 *
 *   `--markdown` AGSC-01-26: the lint-normalized Bundle itself, one `.md` file per
 *   `--okf`      published item, lossless over every authored frontmatter key;
 *                `--okf` adds `content/index.md`'s `okf_version` and the
 *                OKF-reserved `content/log.md`. The rules of both are
 *                `interchange/export-bundle.js`'s.
 *   `--steer`    AGSC-01-28: the eleven-target closed registry, derived only from
 *                NOW state and from `concept`, `procedure`, `gate` and `lesson`
 *                items. The rules are `interchange/steer.js`'s; the NOW state is
 *                computed here, because the Interchange context may not require
 *                the Distribution context that owns it.
 *   `--jsonld`  AGSC-01-27: "byte-identical to the `graph.jsonld` of the same
 *               build". Byte-identity is obtained by CONSTRUCTION — the bytes are
 *               the ones `distribution/site.js#build` just produced, taken out of
 *               its own file map — and not by a second serialiser that would have
 *               to be kept in step with the first.
 *   `--jsonl`   AGSC-01-27: one JCS-canonical object per LF-terminated line, one
 *               line per item, in slug order, each line "exactly the per-item
 *               JSON-LD node of `pages/<slug>.jsonld`" — again taken from the build.
 *   `--to <adapter>`
 *               AGSC-01-26a: a memory adapter, "a single module discovered by
 *               directory convention … and never by a configuration key". The
 *               convention is `src/interchange/adapters/<adapter>.js`; the name is
 *               matched against a strict grammar before it reaches `require`, so no
 *               caller-supplied string can traverse a path.
 *
 * Everything is written under `dist/export/` — a GENERATED directory (AGSC-01-08),
 * deliberately OUTSIDE `build.out`, whose route set AGSC-06-01 closes; an adapter's
 * output is a product of `export` and never of `build`. The SHA-256 of every written
 * file is printed on stderr (AGSC-09-10), so an operator can pin what they copied.
 *
 * EVERY FORM HAS AN EXPORT ROOT. AGSC-01-26 names one ("the export root carries a
 * `LICENSE-CONTENT` file"), and the paths the rules pin — `content/<type-plural>/…`,
 * `content/index.md`, `content/log.md`, `AGENTS.md`, `.cursor/rules/agsc.mdc` — are
 * relative to it. This verb's export roots are `dist/export/markdown/`,
 * `dist/export/okf/`, `dist/export/steer/` and `dist/export/<adapter>/`. A steer
 * bundle is therefore NEVER written over the `AGENTS.md` of the repository the
 * command was run in: the operator copies it where they want it, which is also the
 * only behaviour that keeps `export` free of a destructive side effect.
 *
 * `--markdown`, `--okf` and `--steer` are the three export forms added last.
 */

const site = require('../../../distribution/site.js');
const now = require('../../../distribution/now.js');
const exportBundle = require('../../../interchange/export-bundle.js');
const steer = require('../../../interchange/steer.js');
const { canonicalize } = require('../../../knowledge/jcs.js');
const { compareCodePoint } = require('../../../knowledge/unicode.js');
const { readSchemas } = require('../../../adapters/node-fs.js');
const chunks = require('../../../knowledge/chunks.js');
const loader = require('../../plugin-loader.js');
const helpers = require('./_helpers.js');

const { instantOf } = helpers;
const archiveWriter = require('./_archive.js');

/** AGSC-01-08: the generated directory this verb writes into, never `build.out`. */
const EXPORT_DIR = 'dist/export';

/**
 * AGSC-01-26a's directory convention, as a total function. The grammar is the slug
 * grammar of AGSC-01-10, which admits no `.`, no `/` and no `\`, so a name that
 * passes it cannot leave `src/interchange/adapters/` (`docs/SECURITY-CONSIDERATIONS.md`
 * T7, path traversal).
 *
 * @param {string} name
 * @returns {{module:(object|null), reason:(string|null)}}
 */
function adapterOf(name) {
  const id = String(name == null ? '' : name);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/u.test(id)) {
    return { module: null, reason: `"${id}" is not an adapter name (AGSC-01-10 grammar, AGSC-01-26a)` };
  }
  try {
    return { module: require(`../../../interchange/adapters/${id}.js`), reason: null };
  } catch (e) {
    return { module: null, reason: `no adapter named "${id}" is installed (AGSC-01-26a)` };
  }
}

/** Write one file under `dist/export/` and note its SHA-256 (AGSC-09-10). */
function writeExport(ctx, path, text) {
  const at = `${EXPORT_DIR}/${path}`;
  const slash = at.lastIndexOf('/');
  if (slash !== -1) ctx.ports.fs.mkdirp(at.slice(0, slash));
  ctx.ports.fs.writeFile(at, text);
  helpers.note(ctx, `wrote: ${at} sha256:${helpers.sha256(text)}`);
  return at;
}

/**
 * AGSC-01-27: the two graph exports, taken out of the build that produced them.
 *
 * @returns {{findings:Array<object>, written:Array<string>}}
 */
function graphFiles(files, flags) {
  const findings = [];
  const writes = [];
  if (flags.jsonld === true) {
    const graph = files.get('/graph.jsonld');
    if (graph === undefined) {
      findings.push({
        code: 'AGSC-E001', severity: 'error',
        message: 'export --jsonld: this build emitted no /graph.jsonld, so there is nothing'
          + ' the export could be byte-identical to (AGSC-01-27, AGSC-05-06)',
      });
    } else {
      writes.push(['graph.jsonld', graph]);
    }
  }
  if (flags.jsonl === true) {
    const routes = [...files.keys()]
      .filter((route) => route.startsWith('/pages/') && route.endsWith('.jsonld'))
      .sort(compareCodePoint);
    if (routes.length === 0) {
      findings.push({
        code: 'AGSC-E001', severity: 'error',
        message: 'export --jsonl: this build emitted no per-item JSON-LD view, and AGSC-01-27'
          + ' defines each line as exactly that node (AGSC-06-02)',
      });
    } else {
      // Each `/pages/<slug>.jsonld` is already JCS with one trailing LF; the line IS
      // that node, so it is re-canonicalised from the parsed value rather than
      // string-trimmed, which would be a second serialisation rule.
      const lines = routes.map((route) => canonicalize(JSON.parse(files.get(route))));
      writes.push(['items.jsonl', `${lines.join('\n')}\n`]);
    }
  }
  return { findings, writes };
}

function graphExports(ctx, bundle, flags) {
  const built = site.build(bundle, ctx.ports, helpers.buildOptions(ctx));
  const planned = graphFiles(built.files, flags);
  return {
    findings: [...built.findings, ...planned.findings],
    written: planned.writes.map(([at, text]) => writeExport(ctx, at, text)),
  };
}

/**
 * AGSC-00-24 / AGSC-01-26a: `export --to <path|package>` — a memory-adapter PLUGIN.
 * Its `exportFiles(items, context)` hook receives a detached copy of the published
 * items and answers `{files: [{path, text}], findings?}`; every path is checked
 * before anything is written, and the files land under `dist/export/<name>/`, the
 * same place a built-in adapter's go. A plugin that breaks a path rule writes
 * nothing at all.
 */
function pluginExport(ctx, bundle, plugin) {
  const config = bundle.config || {};
  const items = (bundle.items || []).map(steer.flatten)
    .filter((item) => chunks.isPublished(item, config.releases))
    .sort((a, b) => compareCodePoint(String(a.slug), String(b.slug)));
  const label = `export --to ${plugin.name}`;
  const called = loader.call(plugin, 'exportFiles', [loader.detached(items), loader.detached({
    bundleVersion: helpers.bundleVersionOf(ctx, helpers.gitLog(ctx)).version,
    instant: instantOf(ctx),
    specVersion: ctx.specVersion,
  })], label);
  if (called.findings.length > 0) return { files: [], findings: called.findings, root: null, written: [] };
  const findings = loader.pluginFindings(called.value);
  const files = called.value && Array.isArray(called.value.files) ? called.value.files : [];
  for (const file of files) {
    const why = file && typeof file.text === 'string' ? loader.unsafePath(file.path) : 'a file with no text';
    if (why !== null) {
      findings.push({ code: 'AGSC-E902', file: '', severity: 'error',
        message: `${label}: the plugin asked to write ${JSON.stringify(String(file && file.path))}, ${why};`
          + ' a plugin writes only inside its own export directory (AGSC-00-24), so nothing was written' });
    }
  }
  if (findings.some((f) => f.severity === 'error')) return { files: [], findings, root: null, written: [] };
  const written = files.map((file) => writeExport(ctx, `${plugin.name}/${file.path}`, file.text));
  helpers.note(ctx, `adapter: ${plugin.name} (a plugin; ${written.length} files, outside build.out)`);
  return { files, findings, root: plugin.name, written };
}

/** AGSC-01-26a: run one memory adapter and write what it produced. */
function adapterExport(ctx, bundle, name) {
  const found = adapterOf(name);
  if (found.module === null) {
    // Not one of the engine's own adapters: a local path or an installed package,
    // resolved through the memory-adapter registry (AGSC-00-24); a remote one is
    // AGSC-E905. A bare name that no package answers keeps its old message.
    const loaded = loader.load('memory-adapter', name, { flag: 'export --to', root: ctx.root, specVersion: ctx.specVersion });
    if (loaded.plugin !== null) return pluginExport(ctx, bundle, loaded.plugin);
    if (!loaded.missing) return { files: [], findings: loaded.findings, root: null, written: [] };
  }
  if (found.module === null || typeof found.module.run !== 'function') {
    // AGSC-01-26a (as stated 2026-09-24): a name no shipped adapter and no installed
    // plugin answers is AGSC-E203 — a value outside a closed operator list — and
    // exit 1, the same code `export --steer --target` gives an unregistered name.
    // Until then this line said AGSC-E001, the code registered for an unknown verb.
    return {
      files: [],
      findings: [{
        code: 'AGSC-E203', severity: 'error',
        message: `export --to ${name}: ${found.reason === null ? 'the adapter exports no run() entry point' : found.reason} (AGSC-01-26a)`,
      }],
      root: null,
      written: [],
    };
  }
  // AGSC-04-25 / AGSC-06-15: the content version every adapter's provenance header
  // states, derived once here from the same inputs the build uses.
  // an adapter that writes steering text (the `gabbe` adapter's
  // `steering.md`) needs what `--steer` needs — the NOW state, computed HERE because
  // Interchange may not require Distribution. Adapters that ignore it are unaffected.
  const instant = instantOf(ctx);
  // an adapter may declare flags of its own (AGSC-09-09's adapter exception,
  // e.g. the skills adapter's `--layout`), and an adapter that re-lays the published
  // skill packs out (`NEEDS_SKILL_PACKS`) is handed exactly the packs `agsc skills`
  // emits — computed HERE, because Interchange may not require Composition.
  const produced = found.module.run(bundle, {
    bundleVersion: helpers.bundleVersionOf(ctx, helpers.gitLog(ctx)).version,
    flags: ctx.verbFlags || {},
    instant,
    nowState: nowStateOf(bundle, instant),
    sha256: helpers.sha256,
    ...(found.module.NEEDS_SKILL_PACKS === true ? { skillPacks: require('./skills.js').packsOf(ctx, bundle) } : {}),
    specVersion: ctx.specVersion,
  });
  // AGSC-09-08: a run with an error finding writes nothing.
  if ((produced.findings || []).some((f) => f.severity === 'error')) {
    return { files: [], findings: [...produced.findings], root: null, written: [] };
  }
  const written = [];
  for (const file of produced.files) written.push(writeExport(ctx, `${name}/${file.path}`, file.text));
  helpers.note(ctx, `adapter: ${name} (${written.length} files, outside build.out — declare them with a`
    + ' related[] link, rel "alternate" (AGSC-06-35))');
  return { files: produced.files, findings: [...(produced.findings || [])], root: name, written };
}

/**
 * The authored bytes of every item, through the FileSystem port. `lint --fix`'s
 * normalisation — which AGSC-01-26 calls "the lint-normalized Bundle" — compares
 * against what is ON DISK and never against a re-serialisation of what it parsed,
 * so the bytes must come from the port and not from the loaded Bundle.
 *
 * @param {object} ctx
 * @param {object} bundle
 * @returns {Map<string,string>}
 */
function sourcesOf(ctx, bundle) {
  const fs = ctx.ports && ctx.ports.fs;
  const sources = new Map();
  for (const item of (bundle && bundle.items) || []) {
    try {
      sources.set(String(item.path), String(fs.readFile(String(item.path), 'utf8')));
    } catch (e) {
      // A file the loader saw and the port cannot re-read is the loader's finding.
    }
  }
  return sources;
}

/** The bytes of one optional file at the Bundle root, or `null` when it is absent. */
function readOptional(ctx, path) {
  const fs = ctx.ports && ctx.ports.fs;
  try {
    if (!fs.exists(path)) return null;
    return String(fs.readFile(path, 'utf8'));
  } catch (e) {
    return null;
  }
}

/** The Bundle's own `LICENSE-CONTENT`, or `null` when its root carries none. */
function licenseContentOf(ctx) {
  return readOptional(ctx, exportBundle.LICENSE_FILE);
}

/**
 * AGSC-01-26: `--markdown` and `--okf`, into `dist/export/<form>/`.
 *
 * @returns {{findings:Array<object>, written:Array<string>}}
 */
function bundleExport(ctx, bundle, form) {
  // AGSC-01-26 / AGSC-04-25: the content version is derived once, here, from the
  // same two inputs the build uses, and written into the export's root document.
  const derived = helpers.bundleVersionOf(ctx, helpers.gitLog(ctx));
  const planned = exportBundle.plan(bundle, {
    bundleVersion: derived.version,
    generatedAt: instantOf(ctx),
    indexSource: readOptional(ctx, exportBundle.INDEX_FILE) || '',
    itemSchema: readSchemas(helpers.ENGINE_ROOT).item,
    licenseContent: licenseContentOf(ctx),
    licenseProse: (bundle.config && bundle.config.bundle || {}).license_prose,
    okf: form === 'okf',
    sources: sourcesOf(ctx, bundle),
  });
  // AGSC-09-08: a run with an error finding writes nothing — a partial export would
  // read as a complete one.
  if ([...derived.findings, ...planned.findings].some((f) => f.severity === 'error')) {
    helpers.note(ctx, `export --${form}: nothing written — the export has an error finding`);
    return { files: [], findings: [...derived.findings, ...planned.findings], root: null, written: [] };
  }
  const written = planned.files.map((file) => writeExport(ctx, `${form}/${file.path}`, file.text));
  helpers.note(ctx, `export --${form}: ${written.length} files under ${EXPORT_DIR}/${form}/`
    + ` (AGSC-01-26; the export root carries ${exportBundle.LICENSE_FILE})`);
  if (planned.withheld.length > 0) {
    helpers.note(ctx, `export --${form}: ${planned.withheld.length} unpublished item`
      + `${planned.withheld.length === 1 ? '' : 's'} withheld (draft, retired or release-gated,`
      + ` AGSC-06-30): ${planned.withheld.join(', ')}`);
  }
  return { files: planned.files, findings: [...derived.findings, ...planned.findings], root: form, written };
}

/**
 * AGSC-01-28: `--steer [--target <name>…]`, into `dist/export/steer/`.
 *
 * The NOW state is computed HERE, from `distribution/now.js`, and handed to the
 * Interchange module as a value: Interchange may not require Distribution, and the
 * application layer is the one layer that wires across contexts.
 *
 * @returns {{findings:Array<object>, written:Array<string>}}
 */
/** The NOW state of AGSC-06-22, as `--steer` and the steering-writing adapters read it. */
function nowStateOf(bundle, instant) {
  const config = (bundle && bundle.config) || {};
  const items = site.publishedItems((bundle && bundle.items) || [], config.releases);
  const allItems = ((bundle && bundle.items) || []).map((item) => (item && item.frontmatter
    ? { ...item.frontmatter, body: item.body, path: item.path, slug: item.slug, type: item.type }
    : item));
  return now.state(items, config, { allItems, instant });
}

function steerExport(ctx, bundle, targets) {
  const instant = instantOf(ctx);
  const nowState = nowStateOf(bundle, instant);
  // AGSC-06-15: every steer target carries the provenance header, so it carries
  // the content version (AGSC-01-29 routes them all through one writer).
  // One read of the git-log file feeds both the content version and AGSC-01-28's
  // withholding of an item whose latest commit came through the auto lane.
  const log = helpers.gitLog(ctx);
  const derived = helpers.bundleVersionOf(ctx, log);
  const planned = steer.plan(bundle, {
    bundleVersion: derived.version,
    generatedAt: instant,
    gitLog: log,
    nowState,
    specVersion: ctx.specVersion,
    targets,
  });
  if (planned.findings.some((f) => f.severity === 'error')) {
    return { files: [], findings: planned.findings, root: null, written: [] };
  }
  const written = planned.files.map((file) => writeExport(ctx, `steer/${file.path}`, file.text));
  helpers.note(ctx, `export --steer: ${written.length} target`
    + `${written.length === 1 ? '' : 's'} (${planned.files.map((f) => f.target).join(', ')}),`
    + ` identical bytes at each path (AGSC-01-28)`);
  for (const lane of planned.lanes) helpers.note(ctx, `steer lane: ${lane}`);
  return { files: planned.files, findings: [...derived.findings, ...planned.findings], root: 'steer', written };
}

/**
 * AGSC-01-28's `--target <name>…`. The rule's ellipsis admits several names and
 * AGSC-09-09 types the flag as one value, so a comma-separated list is accepted and
 * a repeated flag takes the last occurrence, which is how every other value flag of
 * this CLI behaves.
 */
function targetsOf(flags) {
  if (flags.target === undefined) return undefined;
  return String(flags.target).split(',').map((name) => name.trim()).filter((name) => name !== '');
}

/**
 * one archive per multi-file export ROOT this invocation produced, written
 * beside the root — `dist/export/markdown-<version>.zip` beside
 * `dist/export/markdown/`. The entry bytes are the plan's, not a re-read of the
 * disk, so the archive is the same builder and the same bytes as the Harness
 * archive and the `/compose/` page's "download all" link (AGSC-07-13).
 *
 * @param {object} ctx
 * @param {Array<{files:Array<object>, root:string}>} roots
 * @returns {Array<object>} findings
 */
function zipRoots(ctx, roots) {
  const findings = [];
  const version = archiveWriter.bundleVersionOf(ctx);
  const instant = instantOf(ctx);
  for (const produced of roots) {
    const zipped = archiveWriter.writeArchive(ctx, {
      bundleVersion: version,
      files: produced.files,
      instant,
      stem: `${EXPORT_DIR}/${produced.root}`,
    });
    findings.push(...zipped.findings);
  }
  return findings;
}

function run(ctx) {
  const flags = ctx.verbFlags || {};
  const chosen = ['markdown', 'okf', 'jsonld', 'jsonl', 'steer'].filter((f) => flags[f] === true);
  if (flags.target !== undefined && flags.steer !== true) {
    return {
      status: 'fail',
      findings: [{
        code: 'AGSC-E003', severity: 'error',
        message: '--target names a steer target and has no meaning without --steer (AGSC-01-28,'
          + ' AGSC-09-09)',
      }],
    };
  }
  // `--zip` packages an export ROOT, and `--jsonld`/`--jsonl` are each a
  // single file at `dist/export/` rather than a root of their own (AGSC-01-27), so
  // an invocation that asks for nothing but those two has no set to archive.
  if (flags.zip === true && !['markdown', 'okf', 'steer'].some((f) => flags[f] === true)
    && flags.to === undefined) {
    return {
      status: 'fail',
      findings: [{
        code: 'AGSC-E003', severity: 'error',
        message: '--zip archives an export root and has no meaning without --markdown, --okf,'
          + ' --steer or --to <adapter>; --jsonld and --jsonl each write one file'
          + ' (AGSC-01-26…27)',
      }],
    };
  }
  if (chosen.length === 0 && flags.to === undefined) {
    return {
      status: 'fail',
      findings: [{
        code: 'AGSC-E003', severity: 'error',
        message: 'export needs one of --markdown, --okf, --jsonld, --jsonl, --steer or'
          + ' --to <adapter> (AGSC-01-26…28, AGSC-01-26a, AGSC-09-09)',
      }],
    };
  }
  const findings = [];
  const bundle = helpers.bundleOf(ctx);
  const roots = [];
  const collect = (produced) => {
    findings.push(...produced.findings);
    if (produced.root !== null && produced.root !== undefined) roots.push(produced);
    return produced;
  };
  if (flags.markdown === true) collect(bundleExport(ctx, bundle, 'markdown'));
  if (flags.okf === true) collect(bundleExport(ctx, bundle, 'okf'));
  if (flags.steer === true) collect(steerExport(ctx, bundle, targetsOf(flags)));
  if (flags.jsonld === true || flags.jsonl === true) {
    findings.push(...graphExports(ctx, bundle, flags).findings);
  }
  if (flags.to !== undefined) collect(adapterExport(ctx, bundle, String(flags.to)));
  if (flags.zip === true) findings.push(...zipRoots(ctx, roots));
  return { findings };
}

module.exports = {
  adapterOf,
  graphFiles,
  instantOf,
  licenseContentOf,
  name: 'export',
  readOptional,
  run,
  sourcesOf,
  targetsOf,
};
