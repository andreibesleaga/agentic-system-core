'use strict';
// src/application/cli/verbs/mcp.js — `mcp` (AGSC-09-07, AGSC-09-13): the seven
// tools over stdio JSON-RPC. A STREAMING verb: stdout carries protocol frames
// and nothing else, which `application/cli/main.js` guarantees by printing no
// diagnostic line and no envelope for it.
//
// The application layer loads the Bundle and hands it to the Surface; the
// Surface reads no file (the context map). Owner: B (shell); wired at
// integration (WP-10-G).
//
// AGSC-09-14b also obliges the server to expose every item, `graph.jsonld` and
// `llms.txt` as MCP RESOURCES. Their bytes must be the ones the node publishes,
// so this verb runs the ordinary site build IN MEMORY — the same call the
// `build` verb makes, with the same options — and hands the route map over
// (`site.write` is never called, so nothing is written to disk). That is the
// only way the two can be the same bytes by construction rather than by two
// renderings agreeing; and it keeps Distribution free of file reads.
//
// A build that fails must never stop the tool server: the seven tools read the
// loaded Bundle and need no artefact. In that case the resource list is empty
// and no byte is invented.

const site = require('../../../distribution/site.js');
const stdio = require('../../../distribution/mcp-stdio.js');
const helpers = require('./_helpers.js');

/** The published route map, or an empty one. Never throws, never writes, never prints. */
function artifactsOf(ctx, bundle) {
  try {
    const built = site.build(bundle, ctx.ports, helpers.buildOptions(ctx));
    return built.files;
  } catch (e) {
    return new Map();
  }
}

function run(ctx) {
  const bundle = helpers.bundleOf(ctx);
  return stdio.serve({
    artifacts: artifactsOf(ctx, bundle),
    bundle,
    config: ctx.config,
    stdin: ctx.stdin,
    stdout: ctx.stdout,
    version: ctx.version,
  });
}

module.exports = { artifactsOf, name: 'mcp', run };
