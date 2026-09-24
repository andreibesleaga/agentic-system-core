'use strict';
// CONTEXT Distribution (Emission) — the deployment-profile kind of AGSC-00-24: the
// semantics every hosting profile translates.
//
// AGSC-06-01 (as amended at rc.5) makes the header set of AGSC-06-17, AGSC-11-03 and
// AGSC-11-05 and the redirect of AGSC-06-17 the normative content, and the file
// format the host's. The reference profile is Cloudflare Pages: `agsc build` writes
// `_headers` and `_redirects` for it (`headers.js`). This module reads those two
// generated files back as DATA and answers, for one request path, exactly what that
// host would send, so that every other profile can be compared with the reference
// route by route instead of by eye.
//
// The semantics are the host's own documentation (read 2026-09-24,
// https://developers.cloudflare.com/pages/configuration/headers/):
//   * "a splat pattern — signified by an asterisk (`*`) — will greedily match all
//     characters";
//   * "An incoming request which matches multiple rules' URL patterns will inherit
//     all rules' headers";
//   * "If a header is applied twice in the `_headers` file, the values are joined
//     with a comma separator".
// Only the grammar `agsc build` writes is read: a URL pattern of literal characters
// and `*`, indented `Name: value` lines, `#` comments and blank lines. Anything else
// is reported, never guessed at.
//
// Pure: no file system, no network, no clock. The application layer reads the files.

const { finding } = require('../../knowledge/validate.js');

/** The two host-configuration files of the reference profile (AGSC-06-17). */
const HEADERS_FILE = '_headers';
const REDIRECTS_FILE = '_redirects';

/**
 * Every host-configuration file a profile may place in the build directory. None of
 * them is a route: each profile keeps them from being served.
 */
const CONFIG_FILES = Object.freeze([HEADERS_FILE, REDIRECTS_FILE, '.htaccess', '.nojekyll']);

/** A header field name: RFC 9110 §5.1's token. */
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u;

/**
 * `_headers` text → the header sets, in file order.
 *
 * @param {string} text
 * @returns {{sets:Array<{route:string, headers:Array<[string,string]>}>, findings:Array<object>}}
 */
function parseHeaders(text) {
  const sets = [];
  const findings = [];
  let current = null;
  String(text == null ? '' : text).split('\n').forEach((raw, index) => {
    const line = raw.replace(/\r$/u, '');
    if (line.trim() === '' || line.trim().startsWith('#')) return;
    const where = { file: HEADERS_FILE, line: index + 1 };
    if (!/^\s/u.test(line)) {
      if (!line.startsWith('/')) {
        findings.push(finding('AGSC-E204', `"${line}" is not a path pattern this reader handles`, where));
        current = null;
        return;
      }
      current = { headers: [], route: line.trim() };
      sets.push(current);
      return;
    }
    const cut = line.indexOf(':');
    const name = cut === -1 ? '' : line.slice(0, cut).trim();
    if (current === null || !TOKEN.test(name)) {
      findings.push(finding('AGSC-E204', `"${line.trim()}" is not a "Name: value" line under a path pattern`, where));
      return;
    }
    current.headers.push([name, line.slice(cut + 1).trim()]);
  });
  return { findings, sets };
}

/**
 * `_redirects` text → the redirect rules, in file order. `from to [status]`, the
 * status defaulting to 302 as the reference host documents.
 *
 * @param {string} text
 * @returns {{rules:Array<{from:string, to:string, status:number}>, findings:Array<object>}}
 */
function parseRedirects(text) {
  const rules = [];
  const findings = [];
  String(text == null ? '' : text).split('\n').forEach((raw, index) => {
    const line = raw.replace(/\r$/u, '').trim();
    if (line === '' || line.startsWith('#')) return;
    const words = line.split(/\s+/u);
    const status = words[2] === undefined ? 302 : Number(words[2]);
    if (words.length > 3 || !words[0].startsWith('/') || words[1] === undefined
      || !Number.isInteger(status) || status < 200 || status > 599) {
      findings.push(finding('AGSC-E204', `"${line}" is not a "from to [status]" redirect line`,
        { file: REDIRECTS_FILE, line: index + 1 }));
      return;
    }
    rules.push({ from: words[0], status, to: words[1] });
  });
  return { findings, rules };
}

/** A pattern of literal characters and greedy `*` splats, as an anchored RegExp. */
function patternRegExp(pattern) {
  const body = String(pattern).split('*').map((part) => part.replace(/[.+?^${}()|[\]\\/]/gu, '\\$&')).join('.*');
  return new RegExp(`^${body}$`, 'u');
}

/** Does `pattern` match the request path `path`? */
function matches(pattern, path) {
  return patternRegExp(pattern).test(String(path));
}

/**
 * What the reference host sends for one request path: every matching rule's
 * headers, in file order, a repeated name joined with ", " at its first position.
 *
 * @param {Array<{route:string, headers:Array<[string,string]>}>} sets
 * @param {string} path
 * @returns {Array<[string,string]>}
 */
function headersFor(sets, path) {
  const out = [];
  for (const set of sets || []) {
    if (!matches(set.route, path)) continue;
    for (const [name, value] of set.headers) {
      const at = out.findIndex(([seen]) => seen.toLowerCase() === name.toLowerCase());
      if (at === -1) out.push([name, value]);
      else out[at] = [out[at][0], `${out[at][1]}, ${value}`];
    }
  }
  return out;
}

/** The first redirect rule whose `from` is this path, or `null`. */
function redirectFor(rules, path) {
  return (rules || []).find((rule) => matches(rule.from, path)) || null;
}

/**
 * The request path a build file answers: `a/index.html` is `/a/`, every other file
 * is served at its own path. A host-configuration file at the top of the directory is
 * not a route: the reference host "will not itself" serve `_redirects`, and every
 * profile keeps its own configuration from being served.
 *
 * @param {string} file a site-relative path with `/` separators.
 * @returns {string|null}
 */
function routeOf(file) {
  const rel = String(file);
  if (CONFIG_FILES.includes(rel)) return null;
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return `/${rel.slice(0, -'index.html'.length)}`;
  return `/${rel}`;
}

/** The served routes of a build's file list, sorted by code point. */
function routesOf(files) {
  return (files || []).map((f) => routeOf(typeof f === 'string' ? f : f.path))
    .filter((r) => r !== null)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

module.exports = {
  CONFIG_FILES,
  HEADERS_FILE,
  REDIRECTS_FILE,
  headersFor,
  matches,
  parseHeaders,
  parseRedirects,
  patternRegExp,
  redirectFor,
  routeOf,
  routesOf,
};
