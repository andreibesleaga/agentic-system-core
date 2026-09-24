'use strict';
// CONTEXT Distribution (Emission) — the `local` deployment profile: a node served
// from its own build directory by `agsc-host serve`, on a laptop, a small device or
// an appliance.
//
// It emits no configuration: the server reads the reference `_headers` and
// `_redirects` of the build directory itself and answers every request exactly as the
// reference host would (`rules.js`). This module is that answer, as data: given a
// request and a view of the directory, it says which status, which headers and which
// file. The application layer only reads bytes and writes them to the socket.
//
// Decisions it makes, each for a reason:
//   * only GET and HEAD are answered — the server is read-only;
//   * a path that does not decode, or carries a NUL, a backslash or a `.`/`..`
//     segment, is 400 and touches no file;
//   * redirects come before files, as on the reference host ("redirects are applied
//     before headers");
//   * the host-configuration files are never served (the reference host "will not
//     itself" serve `_redirects`);
//   * a directory asked for without its trailing slash is 301 to the slash form, and
//     a missing path is the node's own `/404.html` with status 404, sent as HTML;
//   * the entity tag is the file's lowercase-hex SHA-256 in double quotes — the value
//     AGSC-11-05 names where the writer sets it — and `If-None-Match` with that value
//     is 304;
//   * a content type the reference headers do not set comes from the file extension,
//     over the closed list of file kinds a build writes.

const rules = require('./rules.js');
const { define, nothing } = require('./profile.js');

/** The file kinds a build writes, and the type each is served with. */
const TYPES = Object.freeze({
  css: 'text/css; charset=utf-8',
  gif: 'image/gif',
  html: 'text/html; charset=utf-8',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  jsonl: 'application/jsonl',
  jsonld: 'application/ld+json; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  nq: 'application/n-quads; charset=utf-8',
  nt: 'application/n-triples; charset=utf-8',
  pdf: 'application/pdf',
  png: 'image/png',
  rdf: 'application/rdf+xml; charset=utf-8',
  svg: 'image/svg+xml',
  ttl: 'text/turtle; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  webp: 'image/webp',
  xml: 'application/xml; charset=utf-8',
});

/** The type a file is served with when no reference header names one. */
function typeOf(rel) {
  const m = /\.([A-Za-z0-9]+)$/u.exec(String(rel).split('/').pop());
  return (m && TYPES[m[1].toLowerCase()]) || 'application/octet-stream';
}

/** A request path as a site-relative file path, or `null` when it is refused. */
function decoded(path) {
  let text;
  try {
    text = decodeURIComponent(String(path));
  } catch (e) {
    return null;
  }
  if (!text.startsWith('/') || /[\0\\]/u.test(text)) return null;
  if (text.slice(1).split('/').some((part) => part === '.' || part === '..')) return null;
  return text;
}

/**
 * The response to one request.
 *
 * @param {{method:string, path:string, ifNoneMatch?:string}} request `path` without
 *   the query string.
 * @param {{sets:Array, redirects:Array, isFile:(rel:string)=>boolean,
 *   isDirectory:(rel:string)=>boolean, sha256:(rel:string)=>string}} site
 * @returns {{status:number, headers:Array<[string,string]>, file:(string|null)}}
 */
function respond(request, site) {
  const method = String(request.method || '').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return { file: null, headers: [['Allow', 'GET, HEAD']], status: 405 };
  }
  const path = decoded(request.path);
  if (path === null) return { file: null, headers: [], status: 400 };
  const redirect = rules.redirectFor(site.redirects, path);
  if (redirect !== null) return { file: null, headers: [['Location', redirect.to]], status: redirect.status };

  const hidden = (rel) => rules.CONFIG_FILES.includes(rel);
  const rel = path.endsWith('/') ? `${path.slice(1)}index.html` : path.slice(1);
  let file = null;
  let status = 404;
  if (!hidden(rel) && site.isFile(rel)) {
    file = rel;
    status = 200;
  } else if (!path.endsWith('/') && site.isDirectory(rel) && site.isFile(`${rel}/index.html`)) {
    return { file: null, headers: [['Location', `${path}/`]], status: 301 };
  } else if (site.isFile('404.html')) {
    file = '404.html';
  }
  // The 404 page is HTML whatever the path asked for, so a reference content type
  // meant for the missing file is not sent with it.
  const headers = rules.headersFor(site.sets, path)
    .filter(([name]) => status === 200 || name.toLowerCase() !== 'content-type');
  if (file !== null) {
    if (!headers.some(([name]) => name.toLowerCase() === 'content-type')) headers.push(['Content-Type', typeOf(file)]);
    const tag = `"${site.sha256(file)}"`;
    headers.push(['ETag', tag]);
    if (status === 200 && request.ifNoneMatch === tag) return { file: null, headers, status: 304 };
  }
  return { file, headers, status };
}

module.exports = define({
  claim: 'local (agsc-host serve on the node\'s own machine, behind a TLS terminator for any origin other than loopback)',
  emit: () => nothing(),
  limits: [
    'agsc-host serve speaks plain HTTP. On loopback that is the development origin the configuration admits (http://localhost); any other origin needs a TLS terminator in front, because conformance is claimed for an HTTPS origin.',
    'It binds the loopback name localhost unless told otherwise, answers GET and HEAD only, and is meant for one machine or a small device, not for heavy traffic.',
    'It sends no Date header, because the engine reads no clock at run time; RFC 9110 section 6.6.1 asks an origin server that has a clock to send one, so the TLS terminator in front should add it.',
  ],
  name: 'local',
  title: 'The node\'s own machine or device (agsc-host serve)',
  with: { TYPES, decoded, respond, typeOf },
});
