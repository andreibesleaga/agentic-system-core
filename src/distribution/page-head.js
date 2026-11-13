'use strict';
// CONTEXT Distribution (Emission) — what the build hands `html.js` for the head of every page:
// the node's icon and the preview image of a shared link (`og:image`, The Open Graph protocol,
// ogp.me). The title and the other Open Graph properties are the template's own (`html.js`).
//
// Neither is named by a rule of the specification or by a key of `agsc.config.json`, whose
// schema closes `site`: the icon is linked only when the build already publishes it, as an
// authored asset a published body references (AGSC-06-01 `/assets/<path>`), so no route is
// added; the image is a build option of `site.build`, which the command line never sets.
//
// Pure: a constant and two functions, no I/O.

/** The icons a page links when the build publishes one, the first found in this order. */
const ICONS = Object.freeze([['/assets/favicon.svg', 'image/svg+xml'], ['/assets/favicon.png', 'image/png']]);

/**
 * The node's icon `{href, type}` among the routes written so far, or `null`.
 *
 * @param {Map<string, *>} files the routes the build has written
 * @returns {{href:string, type:string}|null}
 */
function iconOf(files) {
  const found = ICONS.find(([route]) => files.has(route));
  return found === undefined ? null : { href: found[0], type: found[1] };
}

/**
 * The `ogImage` build option as the absolute address a page announces as `og:image`, or
 * `null` when none is given: an `https://` address as given, or a site path (one leading
 * `/`) prefixed with the site base. Anything else is refused with an `Error` — a caller's
 * mistake, never a Bundle's — so no page names another scheme or a protocol-relative address.
 *
 * @param {{url:string, alt?:string}|undefined|null} option
 * @param {string} base the site base, without its trailing slash
 * @returns {{url:string, alt?:string}|null}
 */
function ogImageOf(option, base) {
  if (option == null) return null;
  const { url, alt } = typeof option === 'object' ? option : {};
  const https = typeof url === 'string' && /^https:\/\/[^\x00-\x20"<>]+$/u.test(url);
  const sitePath = typeof url === 'string' && /^\/(?!\/)[^\x00-\x20"<>]*$/u.test(url);
  if (!https && !sitePath) throw new Error(`ogImage.url must be an https:// address or a site path beginning with one /, not ${JSON.stringify(url)}`);
  if (alt !== undefined && typeof alt !== 'string') throw new Error('ogImage.alt must be a string');
  return { url: https ? url : `${base}${url}`, ...(alt === undefined ? {} : { alt }) };
}

module.exports = { iconOf, ogImageOf };
