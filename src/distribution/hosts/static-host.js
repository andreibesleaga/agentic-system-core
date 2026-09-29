'use strict';
// CONTEXT Distribution (Emission) — the `static-host` deployment profile: any web
// server that serves a directory of files. It emits the equivalent of the reference
// `_headers` and `_redirects` (AGSC-06-01, AGSC-06-17) for the two most common
// servers:
//
//   * `server/nginx.conf` — a snippet to `include` inside a `server {}` block whose
//     `root` is the build directory;
//   * `site/.htaccess` — Apache httpd per-directory configuration, placed in the
//     build directory itself.
//
// The two servers match a request differently from the reference host, so the
// translation is not line by line:
//
//   * nginx picks ONE location per request ("If an exact match is found, the search
//     terminates", https://nginx.org/en/docs/http/ngx_http_core_module.html), and an
//     `add_header` is inherited "if and only if there are no add_header directives
//     defined on the current level" (ngx_http_headers_module). So the snippet carries,
//     for every route whose headers differ from the site-wide set, one exact
//     `location = <route>` block holding that route's COMPLETE merged set, and one
//     `location /` block with the site-wide set for everything else — HTML pages and
//     the 404 page. `always` is set so the headers ride on every status. The content
//     type is set with an emptied `types { }` and `default_type`, the documented way
//     to force one type in one location; `add_header Content-Type` would send two.
//   * Apache applies every `<If>` section whose expression is true, so each
//     reference rule becomes one `<If "%{REQUEST_URI} =~ m#…#">` section — the same
//     pattern, the same order. `Header always set` replaces a value where the
//     reference host joins two, so the profile proves, route by route, that no route
//     is given one header name by two rules; if one were, it would refuse rather than
//     emit a configuration that sends something else. The content type is set with
//     `Header always set Content-Type` too, not `ForceType`: run against Apache httpd
//     2.4.58, `ForceType` lower-cased the parameter value and served
//     `variant=gfm` where AGSC-06-17 writes `variant=GFM`.
//
// Both refuse a value their grammar would re-interpret: `$` starts an nginx variable
// and `%` a mod_headers format sequence.

const rules = require('./rules.js');
const { banner, define, nothing } = require('./profile.js');
const { finding } = require('../../knowledge/validate.js');

/** A route an unquoted nginx location and an Apache pattern can both carry. */
const SAFE_ROUTE = /^\/[A-Za-z0-9._~!*+,=:@/-]*$/u;

/** A double-quoted string in either server's configuration grammar. */
function quoted(value) {
  return `"${String(value).replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')}"`;
}

function sameHeaders(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The site-wide set: the merged headers of the rules that match every path. */
function siteWide(sets) {
  return rules.headersFor((sets || []).filter((s) => s.route === '/*'), '/');
}

/** Values neither grammar may carry, as findings. */
function unsafeValues(sets) {
  const out = [];
  for (const set of sets) {
    if (!SAFE_ROUTE.test(set.route)) {
      out.push(finding('AGSC-E204', `the path pattern "${set.route}" cannot be carried by an nginx location or an Apache pattern`, { file: 'static-host' }));
    }
    for (const [name, value] of set.headers) {
      if (/[$%]/u.test(value)) {
        out.push(finding('AGSC-E204', `${name} on ${set.route} carries "$" or "%", which nginx or Apache would re-interpret`, { file: 'static-host' }));
      }
    }
  }
  return out;
}

/** What Apache sends for one path: every true `<If>` in order, a later `set` winning. */
function apacheHeadersFor(sets, path) {
  const out = [];
  for (const set of sets || []) {
    if (!rules.matches(set.route, path)) continue;
    for (const [name, value] of set.headers) {
      const at = out.findIndex(([seen]) => seen.toLowerCase() === name.toLowerCase());
      if (at === -1) out.push([name, value]);
      else out[at] = [out[at][0], value];
    }
  }
  return out;
}

function nginxLines(headers) {
  const lines = [];
  const type = headers.find(([n]) => n.toLowerCase() === 'content-type');
  if (type !== undefined) lines.push('    types { }', `    default_type ${quoted(type[1])};`);
  for (const [n, v] of headers) {
    if (n.toLowerCase() !== 'content-type') lines.push(`    add_header ${n} ${quoted(v)} always;`);
  }
  return lines;
}

function nginx(input, routes) {
  const wide = siteWide(input.sets);
  const out = [
    banner('static-host', '#'),
    '# Include inside a server {} block whose root is the build directory, for example:',
    '#   server { listen 443 ssl; server_name example.org; root /srv/node/www; include nginx.conf; }',
    '# Regenerate it after every build: it names every route whose headers differ from the site-wide set.',
    'index index.html;',
    'error_page 404 /404.html;',
    '# A relative Location, so that a redirect keeps the scheme and port a TLS terminator in front answered on.',
    'absolute_redirect off;',
    '',
    'location / {',
    ...nginxLines(wide),
    '    try_files $uri $uri/ =404;',
    '}',
  ];
  for (const route of routes) {
    const headers = rules.headersFor(input.sets, route);
    if (sameHeaders(headers, wide)) continue;
    out.push('', `location = ${route} {`, ...nginxLines(headers));
    if (route.endsWith('/')) out.push(`    try_files ${route}index.html =404;`);
    out.push('}');
  }
  for (const rule of input.redirects) {
    out.push('', `location = ${rule.from} {`, `    return ${rule.status} ${rule.to};`, '}');
  }
  for (const file of rules.CONFIG_FILES) {
    out.push('', `location = /${file} {`, '    return 404;', '}');
  }
  return `${out.join('\n')}\n`;
}

/**
 * A reference pattern as an Apache regular expression. SAFE_ROUTE leaves `.` and `+`
 * as the only regular-expression characters a pattern can hold, and each becomes a
 * one-character class, so the expression needs no backslash inside the quoted
 * directive. A pattern ending in `/` also matches its `index.html`: mod_dir answers a
 * directory by an internal redirect, and `%{REQUEST_URI}` is then the index file's
 * path (observed with Apache httpd 2.4.58, 2026-09-24).
 */
function apacheRegExp(pattern) {
  const body = String(pattern).split('*')
    .map((part) => part.replace(/[.+]/gu, (c) => `[${c}]`)).join('.*');
  return `^${body}${String(pattern).endsWith('/') ? '(?:index[.]html)?' : ''}$`;
}

function apache(input) {
  const out = [
    banner('static-host', '#'),
    '# Place this file in the build directory. It needs mod_headers and mod_alias, and',
    '# AllowOverride All for the directory (the <If> section is admitted in .htaccess at "Override: All").',
    'DirectoryIndex index.html',
    'ErrorDocument 404 /404.html',
  ];
  for (const rule of input.redirects) {
    out.push(`RedirectMatch ${rule.status} ${quoted(apacheRegExp(rule.from))} ${quoted(rule.to)}`);
  }
  out.push(`RedirectMatch 404 ${quoted(`^/(?:${rules.CONFIG_FILES.map((f) => f.replace(/[.]/gu, '[.]')).join('|')})$`)}`);
  for (const set of input.sets) {
    out.push('', `<If ${quoted(`%{REQUEST_URI} =~ m#${apacheRegExp(set.route)}#`)}>`);
    for (const [name, value] of set.headers) {
      out.push(`    Header always set ${name} ${quoted(value)}`);
    }
    out.push('</If>');
  }
  return `${out.join('\n')}\n`;
}

function emit(input) {
  const findings = unsafeValues(input.sets);
  for (const rule of input.redirects) {
    if (!SAFE_ROUTE.test(rule.from) || rule.from.includes('*') || !SAFE_ROUTE.test(rule.to)) {
      findings.push(finding('AGSC-E204', `the redirect ${rule.from} → ${rule.to} is not one exact path to one path`, { file: 'static-host' }));
    }
  }
  const routes = rules.routesOf(input.files);
  for (const route of routes) {
    if (!sameHeaders(apacheHeadersFor(input.sets, route), rules.headersFor(input.sets, route))) {
      findings.push(finding('AGSC-E204', `${route} is given one header name by two rules; Apache would send the last value, not the joined one`, { file: 'static-host' }));
    }
  }
  if (findings.length > 0) return nothing(findings);
  return {
    findings: [],
    server: [{ path: 'nginx.conf', text: nginx(input, routes) }],
    site: [{ path: '.htaccess', text: apache(input) }],
  };
}

module.exports = define({
  claim: 'static-host (the nginx or Apache httpd configuration agsc-host emits, serving the build directory over HTTPS)',
  emit,
  limits: [
    'The server must terminate HTTPS itself or sit behind something that does: conformance is claimed for an HTTPS origin.',
    'The nginx snippet names every route whose headers differ from the site-wide set, so it is regenerated after every build; a file added later gets the site-wide headers only.',
    'Apache needs mod_headers and mod_alias enabled and AllowOverride All for the directory; without them the file is ignored or refused. Its redirects carry an absolute Location built from ServerName, so behind a TLS terminator ServerName must name the https origin.',
    'Entity tags are the server\'s own (nginx and Apache derive them from the file\'s time and size); AGSC-11-05 admits that, and the discovery document\'s digest is the integrity statement.',
  ],
  name: 'static-host',
  title: 'Any web server: nginx or Apache httpd',
  with: { apacheHeadersFor, siteWide },
});
