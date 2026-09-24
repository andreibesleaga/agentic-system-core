'use strict';
// index.js — the package's main entry. `require('agentic-system-core')` gives
// the discovery constants of the specification, the package and specification
// versions, and `run()`, the command line of `bin/agsc.js` (AGSC-09-07).
//
// The package version is read from `package.json` and the specification version
// from the command line's own constant, never typed here, so the entry cannot fall
// behind the package it ships in.

const fs = require('node:fs');
const path = require('node:path');

/** The well-known suffix: the discovery document is `/.well-known/knowledge-linkset` (AGSC-06-07). */
const WELLKNOWN_SUFFIX = 'knowledge-linkset';
/** The link relation that points at the discovery document (AGSC-06-17). */
const LINK_RELATION = 'agentic-knowledge';
/** The Profile URI the discovery document's media type carries (AGSC-06-07). */
const PROFILE_URI = 'https://w3id.org/agentic-system-core/profile/agentic-knowledge';

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

/** Run the `agsc` command line with `process.argv`; resolves when it has finished. */
function run() {
  return require('./bin/agsc.js').run();
}

module.exports = {
  LINK_RELATION,
  PROFILE_URI,
  WELLKNOWN_SUFFIX,
  run,
  specVersion: require('./src/application/cli/main.js').SPEC_VERSION,
  version: pkg.version,
};
