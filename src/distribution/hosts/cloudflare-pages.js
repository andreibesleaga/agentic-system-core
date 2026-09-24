'use strict';
// CONTEXT Distribution (Emission) — the `cloudflare-pages` deployment profile, the
// reference (AGSC-06-01, AGSC-06-17). `agsc build` already writes its two files,
// `_headers` and `_redirects` (`headers.js`), so this profile writes nothing more: it
// checks that both are there, and it gives the reference its name in a claim.

const rules = require('./rules.js');
const { define, nothing } = require('./profile.js');
const { finding } = require('../../knowledge/validate.js');

function emit(input) {
  const findings = [];
  for (const [present, file] of [[input.hasHeadersFile, rules.HEADERS_FILE], [input.hasRedirectsFile, rules.REDIRECTS_FILE]]) {
    if (!present) findings.push(finding('AGSC-E901', `the build directory has no ${file}; run agsc build first (AGSC-06-04)`, { file }));
  }
  return nothing(findings);
}

module.exports = define({
  claim: 'cloudflare-pages (the reference profile: _headers and _redirects as agsc build writes them)',
  emit,
  limits: [
    'The reference host documents at most 100 header rules and 2,100 redirects per site; a build that needs more is not deployable there as one site.',
    'Entity tags are the host\'s own; AGSC-11-05 as amended at rc.6 admits that, and the discovery document\'s digest is the integrity statement.',
  ],
  name: 'cloudflare-pages',
  title: 'Cloudflare Pages, the reference',
});
