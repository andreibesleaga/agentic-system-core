'use strict';
/**
 * CONTEXT Distribution (Emission) — Surface: WebMCP, the browser transport.
 * Implements AGSC-09-16: where a browser exposes `document.modelContext`, the
 * `/compose/` and item pages register the SAME seven tools as AGSC-09-13,
 * with identical names, identical argument names and results byte-identical to
 * the local MCP server's for the same input and Bundle. Registration is
 * FEATURE-DETECTED: with no `document.modelContext` the page works unchanged
 * and registers nothing. On this transport `propose` and `remember` are
 * LOCAL-ONLY — they return the Proposal payload, perform no network write, do
 * not read or honour `channels[].publish`, and the `auto` mode of AGSC-01-31
 * is unavailable (AGSC-08-04, AGSC-08-26(f)). The annotation hints are the
 * security floor in WebMCP's own vocabulary (AGSC-11-18).
 * Requirements: PRD-051.
 *
 * The emitted script contains NO tool logic: it registers the manifest of
 * `distribution/mcp-tools.js` and dispatches to the very same `call`
 * implementation, reached through `globalThis.AGSC_TOOLS`. That is why the two
 * manifests and the two results cannot drift — there is one implementation,
 * not two (`cli-0003`). It contains no network call, no key and no server
 * (AGSC-09-16), and no third-party origin (AGSC-06-05); it is a separate file
 * so that the `script-src 'self'` policy of AGSC-06-17 admits it.
 */

const { manifest } = require('./mcp-tools.js');

/** AGSC-09-16: the two tools that are local-only on this transport. */
const LOCAL_ONLY_TOOLS = Object.freeze(['propose', 'remember']);

/**
 * script(options) -> the JavaScript text the page loads.
 * options: { manifest } — defaults to `mcp-tools.js#manifest()`, so the
 * emitted registration and the stdio server's `tools/list` are one object.
 */
function script(options) {
  const opts = options || {};
  const list = opts.manifest || manifest();
  return `'use strict';
// SPDX-License-Identifier: Apache-2.0 (the engine's code; the prose it carries keeps its own terms)
// AgenticSystemCore WebMCP registration (AGSC-09-16). Generated; do not edit.
// One tool contract, two transports: the manifest below is the stdio server's
// manifest, and every handler dispatches to the same pure implementation.
(function () {
  var MANIFEST = ${JSON.stringify(list)};
  var LOCAL_ONLY = ${JSON.stringify(LOCAL_ONLY_TOOLS)};
  var state = { localOnlyCalls: 0, manifest: MANIFEST, registered: 0, transport: 'webmcp' };
  globalThis.AGSC_WEBMCP = state;

  function invoke(name, args) {
    // AGSC-08-18: the result is the envelope the shared implementation
    // returns, unchanged. AGSC-09-16: no network call, no key, no server.
    var tools = globalThis.AGSC_TOOLS;
    if (!tools || typeof tools.call !== 'function') {
      return { body: { code: 'AGSC-E901', message: 'tool implementation not loaded' },
        license: 'LicenseRef-AgenticSystemCore-Content-Use-1.0',
        source: name, trust: 'untrusted', type: 'error' };
    }
    if (LOCAL_ONLY.indexOf(name) !== -1) state.localOnlyCalls += 1;
    return tools.call(name, args);
  }
  state.invoke = invoke;

  // Feature detection (AGSC-09-16): with no document.modelContext the page
  // keeps working in plain JavaScript and registers nothing at all.
  var context = (typeof document !== 'undefined' && document) ? document.modelContext : null;
  if (!context || typeof context.registerTool !== 'function') return;

  for (var i = 0; i < MANIFEST.tools.length; i += 1) {
    (function (tool) {
      context.registerTool({
        annotations: tool.annotations,
        description: tool.description,
        execute: function (args) { return invoke(tool.name, args); },
        inputSchema: tool.inputSchema,
        name: tool.name
      });
      state.registered += 1;
    }(MANIFEST.tools[i]));
  }
}());
`;
}

module.exports = { LOCAL_ONLY_TOOLS, script };
