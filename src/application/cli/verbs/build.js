'use strict';
// src/application/cli/verbs/build.js — `build` (AGSC-09-07): the route set of
// AGSC-06-01 emitted into `build.out` (AGSC-01-19), deterministically
// (AGSC-04-01/02/09). The rules are `distribution/site.js`'s; this module only
// loads the Bundle, hands the port bag over and writes the result.
//
// The output goes through the BUNDLE's own FileSystem port, prefixed with
// `build.out`: AGSC-01-19 makes `build.out` a path relative to the Bundle root,
// and a Bundle-rooted port refuses anything that escapes it (AGSC-E902), so the
// build can never write outside the Bundle.

const site = require('../../../distribution/site.js');
const lintVerb = require('./lint.js');
const helpers = require('./_helpers.js');

/** A FileSystem port whose every path is placed under `build.out`. */
function outPort(fs, out) {
  const prefix = `${String(out).replace(/\/+$/u, '')}/`;
  return {
    mkdirp: (p) => fs.mkdirp(`${prefix}${p}`),
    writeFile: (p, data) => fs.writeFile(`${prefix}${p}`, data),
  };
}

function run(ctx) {
  const refused = helpers.levelRefusal(ctx);
  if (refused !== null) return refused;
  const bundle = helpers.bundleOf(ctx);
  // The configuration and the Bundle root are checked as `lint` checks them: a build
  // never publishes what `lint` rejects there (an `http://` peer into the discovery
  // document, a root missing `spec_version`). The item and attachment checks already
  // run inside the build.
  const gate = lintVerb.configAndRoot(bundle, { ownVersion: ctx.specVersion }).filter((f) => !(f.code === 'AGSC-E901' && f.file === 'agsc.config.json'));
  // AGSC-04-09: the Clock reports when the build instant defaulted to 0
  // (AGSC-E606); that is a build fact, so it is reported by the verbs that emit.
  const clockFindings = ctx.ports.clock && typeof ctx.ports.clock.findings === 'function'
    ? ctx.ports.clock.findings() : [];
  let built;
  try {
    built = site.build(bundle, ctx.ports, helpers.buildOptions(ctx));
  } catch (e) {
    // AGSC-09-11: a fault with a registered code stops the build and writes nothing
    // (AGSC-09-08), and it is reported BESIDE everything found before it — the
    // configuration gate's findings and the build's own (`e.findings`) — never
    // instead of them. A fault with no registered code stays an internal error.
    if (!(e && typeof e.code === 'string' && /^AGSC-E\d{3}$/u.test(e.code))) throw e;
    const fault = { code: e.code, file: typeof e.file === 'string' ? e.file : '', message: String(e.message || e.code), severity: 'error' };
    return { status: 'fail', findings: dedupe([...clockFindings, ...gate, ...(Array.isArray(e.findings) ? e.findings : []), fault]) };
  }
  const out = (ctx.config && ctx.config.build && ctx.config.build.out) || site.DEFAULT_OUT;

  // AGSC-09-08: a build with an error emits nothing — a half-written output
  // directory would be worse than none.
  if ([...gate, ...built.findings].every((f) => f.severity === 'warn')) {
    site.write(built.files, { fs: outPort(ctx.ports.fs, out) });
    helpers.note(ctx, `wrote: ${built.files.size} files under ${out}`);
  }
  for (const route of built.skipped) helpers.note(ctx, `skipped: ${route}`);
  return { findings: dedupe([...clockFindings, ...gate, ...built.findings]) };
}

/** One fault is counted once (AGSC-09-11): the build may report what the gate did. */
function dedupe(findings) {
  const seen = new Set();
  return findings.filter((f) => {
    const key = `${f.code}\u0000${f.file || ''}\u0000${f.line || ''}\u0000${f.message || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { name: 'build', run };
