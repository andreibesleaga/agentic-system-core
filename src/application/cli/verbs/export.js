'use strict';
/**
 * src/application/cli/verbs/export.js — `export` (AGSC-09-07, AGSC-09-09).
 *
 * Three of the six flags of AGSC-01-26…28 are implemented here; the other three
 * say so and exit 1 rather than emit something a caller could mistake for a
 * lossless export.
 *
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
 * Owner: ENG-2 (WP-10/s28). The byte-preserving folder exports of AGSC-01-26 and the
 * steer bundles of AGSC-01-28 remain the Interchange package's (WP-12).
 */

const site = require('../../../distribution/site.js');
const { canonicalize } = require('../../../knowledge/jcs.js');
const { compareCodePoint } = require('../../../knowledge/unicode.js');
const { instantFromEpoch } = require('../../../governance/ledger.js');
const helpers = require('./_helpers.js');

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
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return { module: require(`../../../interchange/adapters/${id}.js`), reason: null };
  } catch (e) {
    return { module: null, reason: `no adapter named "${id}" is installed (AGSC-01-26a)` };
  }
}

/** The build instant, from the Clock port and never from a wall clock (AGSC-04-11). */
function instantOf(ctx) {
  const clock = ctx.ports && ctx.ports.clock;
  if (clock && typeof clock.iso === 'function') return clock.iso();
  return instantFromEpoch(clock ? clock.now() : 0);
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

/** AGSC-01-26a: run one memory adapter and write what it produced. */
function adapterExport(ctx, bundle, name) {
  const found = adapterOf(name);
  if (found.module === null || typeof found.module.run !== 'function') {
    return {
      findings: [{
        code: 'AGSC-E001', severity: 'error',
        message: `export --to ${name}: ${found.reason === null ? 'the adapter exports no run() entry point' : found.reason}`,
      }],
      written: [],
    };
  }
  const produced = found.module.run(bundle, {
    instant: instantOf(ctx),
    sha256: helpers.sha256,
    specVersion: ctx.specVersion,
  });
  const written = [];
  for (const file of produced.files) written.push(writeExport(ctx, `${name}/${file.path}`, file.text));
  helpers.note(ctx, `adapter: ${name} (${written.length} files, outside build.out — declare them with a`
    + ' related[] link, rel "alternate" (AGSC-06-35))');
  return { findings: [...(produced.findings || [])], written };
}

function run(ctx) {
  const flags = ctx.verbFlags || {};
  const chosen = ['markdown', 'okf', 'jsonld', 'jsonl', 'steer'].filter((f) => flags[f] === true);
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
  for (const flag of chosen) {
    if (flag === 'jsonld' || flag === 'jsonl') continue;
    findings.push({
      code: 'AGSC-E001', severity: 'error',
      message: `export --${flag} is named by AGSC-01-26/01-28 but is not implemented at this`
        + ' milestone: the byte-preserving folder exports and the steer bundles belong to the'
        + ' Interchange package — no conformance Level is claimed before 1.0.0 (AGSC-10-05)',
    });
  }
  const bundle = helpers.bundleOf(ctx);
  if (flags.jsonld === true || flags.jsonl === true) {
    findings.push(...graphExports(ctx, bundle, flags).findings);
  }
  if (flags.to !== undefined) findings.push(...adapterExport(ctx, bundle, String(flags.to)).findings);
  return { findings };
}

module.exports = {
  EXPORT_DIR, adapterExport, adapterOf, graphExports, graphFiles, instantOf, name: 'export', run, writeExport,
};
