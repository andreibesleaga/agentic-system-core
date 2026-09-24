'use strict';
// CONTEXT Distribution (Emission) — the built-in hosting profiles, in the order a
// reader meets them: the reference first, then from the most common host to the most
// unusual substrate. Each is a plugin of the `deployment-profile` kind (AGSC-00-24);
// the application layer registers them through the same capability check a plugin
// written elsewhere passes.
//
// A Solid pod is not here on purpose: AGSC-11-21 makes `solid` a surface a node may
// DECLARE, holding a copy of the Bundle, and declaration-only at 1.0, so there is no
// host configuration for a profile to emit.

module.exports = Object.freeze([
  require('./cloudflare-pages.js'),
  require('./static-host.js'),
  require('./github-pages.js'),
  require('./local.js'),
  require('./git-clone.js'),
  require('./ipfs.js'),
  require('./ledger-anchor.js'),
]);
