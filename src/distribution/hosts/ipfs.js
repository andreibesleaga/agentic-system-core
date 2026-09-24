'use strict';
// CONTEXT Distribution (Emission) — the `ipfs` deployment profile: the build
// directory added to IPFS and served by an HTTP gateway.
//
// What an IPFS gateway can be told, it is told through one file, and this profile
// writes it:
//
//   * `site/_redirects` — the IPFS web redirects file ("MUST be named `_redirects`
//     and stored underneath the root CID of the website", lines `from to [status]`,
//     https://specs.ipfs.tech/http-gateways/web-redirects-file/, read 2026-09-24).
//     Its grammar is the reference host's, so it carries the same 301 of AGSC-06-17
//     and adds `/* /404.html 404`, the gateway's way to answer a missing path with
//     the node's own 404 page ("All redirect logic MUST only be evaluated if the
//     requested path is not present in the DAG", so the catch-all never hides a
//     route). It replaces the reference `_redirects` in the build
//     directory: a directory is deployed to one host.
//   * `server/manifest.json` — every file with its size and SHA-256, so that whoever
//     adds the directory can check that the gateway serves the bytes that were built.
//     The root CID is whatever `ipfs add` answers for the directory; it is recorded in
//     the ledger anchor (`ledger-anchor`), never computed here.
//
// A gateway sets the other headers itself: it performs "content type sniffing based
// on file name … and magic bytes" and its entity tag "should be based on requested
// CID" (https://specs.ipfs.tech/http-gateways/path-gateway/). The web redirects file
// is the only publisher-controlled input the specification defines; a manifest for
// custom headers is an open proposal (https://github.com/ipfs/specs/issues/257).

const { banner, define } = require('./profile.js');
const { finding } = require('../../knowledge/validate.js');

/** "The file size MUST NOT exceed 64 KiB" (web redirects file specification). */
const MAX_REDIRECTS_BYTES = 65536;

function emit(input) {
  const lines = [banner('ipfs', '#'), ...input.redirects.map((r) => `${r.from} ${r.to} ${r.status}`)];
  lines.push('/* /404.html 404');
  const redirects = `${lines.join('\n')}\n`;
  if (Buffer.byteLength(redirects, 'utf8') > MAX_REDIRECTS_BYTES) {
    return {
      findings: [finding('AGSC-E904', 'the IPFS _redirects file would exceed 64 KiB', { file: '_redirects' })],
      server: [],
      site: [],
    };
  }
  const manifest = {
    files: input.files.map((f) => ({ path: f.path, sha256: f.sha256, size: f.size })),
    note: 'Every file of the build directory. After `ipfs add -r --cid-version 1 <dir>`, record the root CID'
      + ' in the ledger anchor; a gateway serving that CID serves these bytes.',
  };
  return {
    findings: [],
    server: [{ path: 'manifest.json', text: `${JSON.stringify(manifest, null, 2)}\n` }],
    site: [{ path: '_redirects', text: redirects }],
  };
}

module.exports = define({
  claim: 'ipfs behind a header-setting web interface (the build directory served by an IPFS gateway, with the headers of AGSC-06-17 set in front of it)',
  emit,
  limits: [
    'A gateway chooses the content type by sniffing the file name and bytes; the discovery document has no extension and cannot carry application/linkset+json or the profile Link header from the gateway alone, so AGSC-06-07 is met only by a web interface in front that sets them.',
    'No publisher-set response header exists on a gateway today: the security policy, the CORS pair and the no-cache routes come from the web interface in front, or not at all.',
    'The web redirects file is evaluated only where origin isolation per root CID is possible — a subdomain or DNSLink gateway — not on a path gateway (/ipfs/<cid>/).',
    'Content is immutable per CID: every build is a new CID, so the name a reader uses must be a DNSLink or another mutable pointer, and conformance is claimed for that HTTPS origin.',
  ],
  name: 'ipfs',
  title: 'IPFS through an HTTP gateway',
});
