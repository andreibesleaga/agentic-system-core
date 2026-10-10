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
//   * a request whose `Host` names another host than localhost, a loopback address
//     or the address the server is bound to is 421 (Misdirected Request), and one
//     with no usable `Host` is 400 — so a web page that points a name of its own at
//     the loopback address cannot read what the server serves;
//   * only GET and HEAD are answered — the server is read-only;
//   * a path that does not decode, or carries a NUL, a backslash or a `.`/`..`
//     segment, is 400 and touches no file;
//   * redirects come before files, as on the reference host ("redirects are applied
//     before headers");
//   * the host-configuration files are never served (the reference host "will not
//     itself" serve `_redirects`), their names compared without case, because on a
//     case-insensitive file system `_HEADERS` is `_headers`; nor is any path with a
//     segment that begins with a dot, except `.well-known` (a build writes no other
//     dot-file, and one put there by hand, such as `.git/` or `.htaccess`, is not a
//     route of the node);
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

/** The names every server answers: the loopback name and the IPv6 loopback address. */
const LOOPBACK_NAMES = Object.freeze(['localhost', '[::1]']);

/** An IPv4 loopback address (127.0.0.0/8), written as four decimal octets. */
const LOOPBACK_V4 = /^127(?:\.(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}$/u;

/** One name as a `Host` header writes it: lower case, an IPv6 address in brackets. */
function asHostName(name) {
  const text = String(name).toLowerCase();
  return text.includes(':') && !text.startsWith('[') ? `[${text}]` : text;
}

/**
 * The names a server answers to: the loopback names, and each name or address it
 * was bound to (the `--bind` value, the address the socket reports).
 * @param {...(string|undefined)} bound
 * @returns {Array<string>}
 */
function hostNames(...bound) {
  const names = [...LOOPBACK_NAMES];
  for (const name of bound) {
    if (typeof name !== 'string' || name === '') continue;
    const host = asHostName(name);
    if (!names.includes(host)) names.push(host);
  }
  return names;
}

/**
 * The host a `Host` header names, lower case and without its port, or `null` when
 * the header is absent or is not a host and an optional port (RFC 9110 §7.2).
 * @param {string|undefined} value
 * @returns {string|null}
 */
function hostName(value) {
  const m = /^(\[[0-9a-f:.]+\]|[a-z0-9._~!$&'()*+,;=%-]+)(?::[0-9]*)?$/u.exec(String(value === undefined ? '' : value).toLowerCase());
  return m === null ? null : m[1];
}

/** Does a `Host` header name the server: an IPv4 loopback address, or one of `names`? */
function allowedHost(value, names) {
  const host = hostName(value);
  return host !== null && Array.isArray(names) && (LOOPBACK_V4.test(host) || names.includes(host));
}

/** The host-configuration files, compared without case. */
const CONFIG_NAMES = Object.freeze(rules.CONFIG_FILES.map((name) => name.toLowerCase()));

/**
 * Is a site-relative path one the server never serves: a host-configuration file
 * at the root, or a path with a segment that begins with a dot other than
 * `.well-known`?
 * @param {string} rel
 * @returns {boolean}
 */
function hidden(rel) {
  return CONFIG_NAMES.includes(rel.toLowerCase())
    || rel.split('/').some((part) => part.startsWith('.') && part !== '.well-known');
}

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
 * @param {{method:string, path:string, host?:string, ifNoneMatch?:string}} request
 *   `path` without the query string; `host` the `Host` header.
 * @param {{sets:Array, redirects:Array, hosts:Array<string>, isFile:(rel:string)=>boolean,
 *   isDirectory:(rel:string)=>boolean, sha256:(rel:string)=>string}} site `hosts`
 *   the names the server answers (`hostNames`); without it no request is answered.
 * @returns {{status:number, headers:Array<[string,string]>, file:(string|null)}}
 */
function respond(request, site) {
  if (hostName(request.host) === null) return { file: null, headers: [], status: 400 };
  if (!allowedHost(request.host, site.hosts)) return { file: null, headers: [], status: 421 };
  const method = String(request.method || '').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return { file: null, headers: [['Allow', 'GET, HEAD']], status: 405 };
  }
  const path = decoded(request.path);
  if (path === null) return { file: null, headers: [], status: 400 };
  const redirect = rules.redirectFor(site.redirects, path);
  if (redirect !== null) return { file: null, headers: [['Location', redirect.to]], status: redirect.status };

  const rel = path.endsWith('/') ? `${path.slice(1)}index.html` : path.slice(1);
  const shown = !hidden(rel);
  let file = null;
  let status = 404;
  if (shown && site.isFile(rel)) {
    file = rel;
    status = 200;
  } else if (shown && !path.endsWith('/') && site.isDirectory(rel) && site.isFile(`${rel}/index.html`)) {
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
    'It answers only a request whose Host header names localhost, a loopback address or the address it is bound to (421 otherwise), so a TLS terminator in front passes that address as the Host; it never serves a dot-file other than those under .well-known.',
    'It sends no Date header, because the engine reads no clock at run time; RFC 9110 section 6.6.1 asks an origin server that has a clock to send one, so the TLS terminator in front should add it.',
  ],
  name: 'local',
  title: 'The node\'s own machine or device (agsc-host serve)',
  with: { TYPES, allowedHost, decoded, hidden, hostName, hostNames, respond, typeOf },
});
