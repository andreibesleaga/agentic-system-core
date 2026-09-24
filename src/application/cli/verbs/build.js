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
  const bundle = helpers.bundleOf(ctx);
  const built = site.build(bundle, ctx.ports, helpers.buildOptions(ctx));
  // AGSC-04-09: the Clock reports when the build instant defaulted to 0
  // (AGSC-E606); that is a build fact, so it is reported by the verbs that emit.
  const clockFindings = ctx.ports.clock && typeof ctx.ports.clock.findings === 'function'
    ? ctx.ports.clock.findings() : [];
  const out = (ctx.config && ctx.config.build && ctx.config.build.out) || site.DEFAULT_OUT;

  // AGSC-09-08: a build with an error emits nothing — a half-written output
  // directory would be worse than none.
  if (built.findings.every((f) => f.severity === 'warn')) {
    site.write(built.files, { fs: outPort(ctx.ports.fs, out) });
    helpers.note(ctx, `wrote: ${built.files.size} files under ${out}`);
  }
  for (const route of built.skipped) helpers.note(ctx, `skipped: ${route}`);
  return { findings: [...clockFindings, ...built.findings] };
}

module.exports = { name: 'build', outPort, run };
