'use strict';
// src/distribution/internal-links.js — the build's dangling-link check (AGSC-06-01):
// every internal link a built page carries resolves to a route the same build emits.
// It lives beside the rule that an AUTHORED body
// reference that resolves to nothing is the `AGSC-E310` of AGSC-03-11, reported once,
// on the item's own file, exactly as `lint` reports it (AGSC-09-11).

const { compareCodePoint } = require('../knowledge/unicode.js');
const { finding } = require('../knowledge/validate.js');
const linksModule = require('../knowledge/links.js');
const { withoutTrailingSlashes } = require('../shared/trailing.js');

/**
 * The DIRECTORY a relative href on `route` is resolved against — what a browser
 * uses as the base URL. `/a/b/index.html` is served at `/a/b/`, so its base is
 * `/a/b/`; `/pages/x.md` is served at itself, so its base is `/pages/`.
 */
function baseDirOf(route) {
  const r = String(route);
  const withoutIndex = r.endsWith('/index.html') ? r.slice(0, -'index.html'.length) : r;
  return withoutIndex.endsWith('/') ? withoutIndex : withoutIndex.slice(0, withoutIndex.lastIndexOf('/') + 1);
}

/**
 * Resolve a relative site path against a base directory, `/`-separated, with `.`
 * and `..` applied. `null` when it climbs above the site root — which is itself a
 * link to nothing, and is reported as one.
 */
function resolveRelative(baseDir, relative) {
  const out = baseDir.split('/').filter((s) => s !== '');
  for (const segment of String(relative).split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(segment);
  }
  const trailing = String(relative).endsWith('/') || String(relative) === '' ? '/' : '';
  return `/${out.join('/')}${trailing}`;
}

/**
 * Every internal link the emitted HTML, `robots.txt` and `security.txt` carry, with
 * the route each one resolves to. A build that links a route it does not emit ships
 * a dangling internal link — the defect found on `/legal/` — so this is a
 * function the suite asserts over, not a promise in a comment.
 *
 * RELATIVE hrefs are resolved against the page's own route: a guard that read
 * site-absolute hrefs only would be blind to exactly the class of link an import
 * produces. External targets (a scheme, a protocol-relative `//`), fragment-only
 * and query-only targets are not internal links and are not collected.
 *
 * An absolute URL in one of the two text dialects is an INTERNAL link only when it
 * is under this node's own base: `security.txt` carries a `Contact:`
 * field, which is by definition somewhere else (RFC 9116 section 2.5.3 — "a web page
 * with contact information"), and reading it as a route of this build would report
 * every valid security contact as a dangling link. Without a `base` the function
 * keeps its earlier behaviour, which is what its own unit test states.
 *
 * @param {Map<string,string>} files
 * @param {object} [options] `{base}` — this node's base (AGSC-01-19), no trailing slash.
 * @returns {Array<{from:string, href:string, route:(string|null)}>}
 */
function internalLinks(files, options = {}) {
  const base = typeof options.base === 'string' && options.base !== '' ? withoutTrailingSlashes(options.base) : null;
  const out = [];
  const add = (from, href) => {
    const raw = String(href);
    if (raw === '' || raw.startsWith('#') || raw.startsWith('?')) return;
    if (linksModule.isExternalTarget(raw)) return;
    const clean = raw.split('#')[0].split('?')[0];
    if (clean === '') return;
    out.push({
      from,
      href: raw,
      route: clean.startsWith('/') ? clean : resolveRelative(baseDirOf(from), clean),
    });
  };
  for (const route of [...files.keys()].sort(compareCodePoint)) {
    const text = String(files.get(route));
    if (route.endsWith('.html')) {
      const attribute = /(?:href|src)="([^"]*)"/gu;
      let m = attribute.exec(text);
      while (m !== null) {
        add(route, m[1]);
        m = attribute.exec(text);
      }
    }
    if (route === '/robots.txt' || route === '/.well-known/security.txt') {
      const absolute = /https?:\/\/[^\s]+/gu;
      let m = absolute.exec(text);
      while (m !== null) {
        // The two text dialects carry ABSOLUTE URLs; the path of one under this
        // node's own base is what must resolve. Another origin is somebody else's.
        if (base === null || m[0] === base || m[0].startsWith(`${base}/`)) {
          const path = m[0].replace(/^https?:\/\/[^/]*/u, '');
          add(route, path === '' ? '/' : path);
        }
        m = absolute.exec(text);
      }
    }
  }
  return out;
}

/**
 * The emitted route a site-absolute path is served from: `/x/` is `/x/index.html`,
 * `/x.json` is itself. `null` when the build emits nothing for it.
 */
function resolvesTo(files, route) {
  if (route === null || route === undefined) return null;
  if (files.has(route)) return route;
  const asIndex = route.endsWith('/') ? `${route}index.html` : `${route}/index.html`;
  if (files.has(asIndex)) return asIndex;
  return null;
}

/**
 * The findings for every internal link of `files` that resolves to no emitted route.
 * A link to a refused attachment is already reported under its own code. A link that
 * is an authored body reference the Links module cannot resolve is that reference's
 * `AGSC-E310` (or `AGSC-E902` for a path outside the grammar), on the item's source
 * file and line; every other dangling link is the build's own `AGSC-E901`. The
 * resolver runs only when a page has a dangling link, so a clean build pays nothing.
 *
 * @param {Map<string,string>} files the emitted routes.
 * @param {{base:string, items:Array<object>, assets:Array<string>,
 *   pageRoutes:Map<string,string>, refusedAttachments:Set<string>}} options
 *   `pageRoutes` maps the slug of each item with a page to its `index.html` route.
 * @returns {Array<object>}
 */
function danglingFindings(files, options) {
  const out = [];
  let bodyFaults = null;
  const bodyFaultOf = (link) => {
    if (bodyFaults === null) {
      bodyFaults = new Map();
      for (const f of linksModule.resolve(options.items || [], { assets: options.assets }).errors) {
        const m = /^body reference "(.*)" /u.exec(String(f.message));
        const route = options.pageRoutes.get(String(f.slug));
        if (m !== null && route !== undefined) bodyFaults.set(`${route}\u0000${m[1]}`, f);
      }
    }
    return bodyFaults.get(`${link.from}\u0000${link.href}`);
  };
  const reported = new Set();
  for (const link of internalLinks(files, { base: options.base })) {
    if (resolvesTo(files, link.route) !== null) continue;
    if (options.refusedAttachments.has(link.href)) continue;
    const authored = bodyFaultOf(link);
    if (authored !== undefined) {
      if (!reported.has(authored)) out.push(authored);
      reported.add(authored);
      continue;
    }
    out.push(finding('AGSC-E901',
      `${link.from} links ${link.href}, and this build emits no route for it (AGSC-06-01)`,
      { file: link.from }));
  }
  return out;
}

module.exports = { baseDirOf, danglingFindings, internalLinks, resolveRelative, resolvesTo };
