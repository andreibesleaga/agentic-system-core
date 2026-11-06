'use strict';
// tests/conformance/areas/_cli-mcp-revisions.js — `cli` cases of AGSC-09-19, the two MCP
// revisions the tool server speaks over standard input and output, exchanged as JSON-RPC
// frames with the real `agsc mcp` (the exchange of _cli-mcp-primitives.js: one synchronous
// child process, a scratch copy of the fixture, the fixed build instant).
//
//   cli-0032 (AGSC-09-19 (1))          `server/discover` under 2026-07-28, no handshake.
//   cli-0033 (AGSC-09-19 (2) (3) (6))  `resultType`, `ttlMs`, `cacheScope`, the tool order and
//                                      the annotations; `resources/templates/list` is empty.
//   cli-0034 (AGSC-09-19 (3) (4) (5))  the errors of each revision, case by case: `modern`
//                                      (per-request `_meta`) and `legacy` (`initialize`).
//   cli-0035 (AGSC-09-19 with AGSC-11-16) one declared surface version, the newest revision.

const { exchange, responseProblems, verdict } = require('./_cli-mcp-primitives.js');
const surfaces = require('../../../src/boundary/surfaces.js');

/** cli-0032, cli-0033: each expected response is a subset of the response of the same id. */
function runResponses(vector, ctx) {
  return verdict(responseProblems(vector.expected.responses, exchange(vector, ctx)));
}

/** cli-0034: each named case is its own server process, so each opens the way its frames say. */
function runCli0034(vector, ctx) {
  const problems = [];
  const wanted = new Map(vector.expected.cases.map((c) => [c.name, c.responses]));
  for (const input of vector.input.cases) {
    const got = exchange({ input: { bundle: vector.input.bundle, frames: input.frames } }, ctx);
    if (!wanted.has(input.name)) problems.push(`${input.name}: no expected responses`);
    for (const line of responseProblems(wanted.get(input.name), got)) problems.push(`${input.name}: ${line}`);
  }
  if (wanted.size !== vector.input.cases.length) problems.push('the expected and input case lists differ');
  return verdict(problems);
}

/**
 * cli-0035: the `mcp` surface of a node that serves the tool server declares the newest revision
 * its stdio server lists in `supportedVersions`, and that value is the distribution's constant.
 */
function runCli0035(vector, ctx) {
  const got = exchange(vector, ctx);
  const problems = responseProblems(vector.expected.responses, got);
  const mcp = surfaces.declare({ base: 'https://minimal.example/', mcpServed: vector.input.mcp_served === true })
    .find((link) => link['agsc-surface'][0] === 'mcp');
  const declared = mcp === undefined ? [] : [...mcp['agsc-surface-version']];
  if (JSON.stringify(declared) !== JSON.stringify(vector.expected.declared_surface_version)) {
    problems.push(`declared ${JSON.stringify(declared)}`);
  }
  const discovered = got.byId.get(1);
  const newest = discovered && discovered.result && discovered.result.supportedVersions
    ? discovered.result.supportedVersions[0] : undefined;
  if ((declared[0] === newest) !== vector.expected.declared_equals_newest_supported) {
    problems.push(`declared ${String(declared[0])}, newest supported ${String(newest)}`);
  }
  if (surfaces.MCP_PROTOCOL_VERSION !== vector.expected.protocol_version_constant) {
    problems.push(`the protocol version constant is ${surfaces.MCP_PROTOCOL_VERSION}`);
  }
  return verdict(problems);
}

module.exports = { runCli0034, runCli0035, runResponses };
