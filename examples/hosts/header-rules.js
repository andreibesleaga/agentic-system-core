'use strict';
// examples/hosts/header-rules.js — a MINIMAL hosting profile written outside
// the engine, to be read and copied. It is a plugin of the `deployment-profile` kind
// (AGSC-00-24), loaded by path:
//
//   agsc-host emit ./examples/hosts/header-rules.js
//
// It hands a CDN or a proxy that takes a JSON rule list the reference rules exactly as
// they are — no translation, so nothing to get wrong — and says in its limits what the
// proxy must do with them. Like every sample, it requires nothing: it is given data
// and answers data, and the engine checks every path before it writes.
//
// The hook: `emit(input)` → `{site, server, findings}`.
//   input.sets       the header sets of `_headers`, in order: [{route, headers: [[name, value]]}]
//   input.redirects  the redirects of `_redirects`: [{from, to, status}]
//   input.files      every file of the build: [{path, size, sha256}]
//   input.discoveryText  the discovery document, or null
//   `site` files land in the build directory beside the routes (never on a route);
//   `server` files under `dist/hosts/<name>/` or `--out`.

module.exports = {
  agsc_spec_version: '1.0.0',
  claim: 'header-rules (a proxy applying server/header-rules.json in front of the files)',
  kind: 'deployment-profile',
  limits: [
    'The proxy must apply every rule whose pattern matches, in order, `*` matching any characters, and join a repeated header name with ", ".',
  ],
  name: 'header-rules',
  plugin_api_version: '1.0.0',

  emit(input) {
    const body = {
      redirects: input.redirects,
      rules: input.sets.map((set) => ({ headers: set.headers, pattern: set.route })),
    };
    return { findings: [], server: [{ path: 'header-rules.json', text: `${JSON.stringify(body, null, 2)}\n` }], site: [] };
  },
};
