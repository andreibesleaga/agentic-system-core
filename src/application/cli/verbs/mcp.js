'use strict';
// src/application/cli/verbs/mcp.js — `mcp` (AGSC-09-07, AGSC-09-13): the seven
// tools over stdio JSON-RPC. A STREAMING verb: stdout carries protocol frames
// and nothing else, which `application/cli/main.js` guarantees by printing no
// diagnostic line and no envelope for it.
//
// The application layer loads the Bundle and hands it to the Surface; the
// Surface reads no file (the context map). Owner: B (shell); wired at
// integration (WP-10-G).

const stdio = require('../../../distribution/mcp-stdio.js');
const helpers = require('./_helpers.js');

function run(ctx) {
  return stdio.serve({
    bundle: helpers.bundleOf(ctx),
    config: ctx.config,
    stdin: ctx.stdin,
    stdout: ctx.stdout,
    version: ctx.version,
  });
}

module.exports = { name: 'mcp', run };
