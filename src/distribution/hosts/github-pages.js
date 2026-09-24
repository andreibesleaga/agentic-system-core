'use strict';
// CONTEXT Distribution (Emission) — the `github-pages` deployment profile.
//
// GitHub Pages serves a directory of files and lets its owner set no response header
// and no server redirect. What it can be given, this profile gives it:
//
//   * `site/.nojekyll` — an empty file, so that a branch-published site is not run
//     through Jekyll, which "doesn't build files or folders that … Start with `_`,
//     `.`, or `#`" (https://docs.github.com/en/pages/setting-up-a-github-pages-site-with-jekyll/about-github-pages-and-jekyll,
//     read 2026-09-24) — that is, it would drop `/.well-known/` and with it the
//     discovery document;
//   * `server/headers.json` — the reference header and redirect sets resolved route
//     by route, for the proxy or CDN that has to stand in front of Pages to set them.
//
// What it cannot give it is stated in `limits`, and it is the reason this profile's
// claim always names the proxy: Pages takes the content type from the file
// extension, from a list "generated from the mime-db project" (GitHub Docs, "MIME
// types on GitHub Pages"), and mime-db lists `application/linkset+json` with no file
// extension, so the discovery document can never carry the media type or the
// profile header AGSC-06-07 requires from Pages alone.

const rules = require('./rules.js');
const { define } = require('./profile.js');

function table(input) {
  const routes = rules.routesOf(input.files);
  const body = {
    note: 'The response headers and redirects of the reference profile (AGSC-06-17, AGSC-11-03, AGSC-11-05),'
      + ' resolved per route. GitHub Pages cannot set them: the proxy or CDN in front of it must.',
    redirects: input.redirects.map((r) => ({ from: r.from, status: r.status, to: r.to })),
    routes: routes.map((route) => ({
      headers: rules.headersFor(input.sets, route).map(([name, value]) => ({ name, value })),
      route,
    })),
  };
  return `${JSON.stringify(body, null, 2)}\n`;
}

function emit(input) {
  return {
    findings: [],
    server: [{ path: 'headers.json', text: table(input) }],
    site: [{ path: '.nojekyll', text: '' }],
  };
}

module.exports = define({
  claim: 'github-pages behind a header-setting proxy (GitHub Pages serves the files; the proxy named in the claim sets the headers and the redirect of server/headers.json)',
  emit,
  limits: [
    'GitHub Pages lets a site owner set no response header: the security policy, the CORS pair, the profile Link header and the no-cache routes cannot be set by Pages itself.',
    'The discovery document is served with whatever type Pages derives from a file with no extension; mime-db maps no extension to application/linkset+json, so AGSC-06-07 is not met without a proxy in front, and no Level can be claimed for the bare Pages origin.',
    'There is no server-side redirect: the 301 from /.well-known/agentic-knowledge (AGSC-06-17) must be set by the proxy.',
    'Published sites may be no larger than 1 GB and have a soft bandwidth limit of 100 GB a month (GitHub Docs, "GitHub Pages limits").',
  ],
  name: 'github-pages',
  title: 'GitHub Pages, with a proxy in front for the headers',
});
