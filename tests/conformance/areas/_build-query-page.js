'use strict';
// The `build` cases of the query page (AGSC-06-39) and of the 1.1 route set (AGSC-06-01):
//
//   build-0029  the whole route set of the minimal fixture at 1.1: the routes, exactly, and
//               the page assets beside them; the files under `/query/` other than its page
//               (the page script, the query engine and its licence text) are page assets of
//               that page, as the second paragraph of AGSC-06-01 says;
//   build-0030  `/query/` by default and with `site.query_page: false`. The rules (a) to (f)
//               are read through the page's markup and the content security policy of
//               AGSC-06-17 only, never through the engine, as AGSC-06-39 says: the forms the
//               page names (`data-answers`, `data-refuses`), the ten examples, the result's
//               table and picture, the two download links, the share link's fragment, the
//               vocabulary explorer, the scripts' use of no store, the page's addresses, its
//               bytes, the sitemap entry, the link on every page, and the policy each
//               address under `/query/` is served with, applied the way the reference host
//               applies `_headers` (`hosts/rules.js#headersFor`: matching blocks in order, a
//               detach line removing what came before).
//
// Each run builds a scratch copy of the fixture with the real command line (`onBuild`).

const path = require('node:path');
const nodeFs = require('node:fs');
const rules = require('../../../src/distribution/hosts/rules.js');
const { RELATIONS } = require('../../../src/knowledge/relations.js');
const { checks, deepEqual } = require('./_assert.js');
const { fileOf, onBuild, pageAssets, surfaceChecks } = require('./_build-surfaces.js');

/** AGSC-06-01, second paragraph: the folders whose files, other than the page, are page assets of the page. */
const PAGE_ASSET_FOLDERS = Object.freeze(['/query/']);

/** build-0029 (AGSC-06-01): the route set, exactly, and the page assets beside it. */
function routeSetCase(vector, ctx) {
  return onBuild(vector, ctx, null, (run) => {
    const expected = vector.expected;
    const routeOf = (file) => (file.endsWith('/index.html') ? file.slice(0, -'index.html'.length) : file);
    const loaded = pageAssets(run.files);
    const underPage = (file) => PAGE_ASSET_FOLDERS.some((folder) => file.startsWith(folder) && file !== `${folder}index.html`);
    const assets = [...run.files.keys()].filter((f) => (/\.(js|css)$/u.test(f) && loaded.has(f)) || underPage(f));
    const optional = new Set(expected.optional_routes);
    const routes = [...run.files.keys()].filter((f) => !assets.includes(f)).map(routeOf).filter((r) => !optional.has(r)).sort();
    const list = surfaceChecks(expected, run);
    const want = [...expected.routes].sort();
    list.push(['the route set', deepEqual(routes, want),
      `extra ${JSON.stringify(routes.filter((r) => !want.includes(r)))} missing ${JSON.stringify(want.filter((r) => !routes.includes(r)))}`]);
    for (const route of expected.absent_routes) list.push([`no ${route}`, !run.files.has(fileOf(route)), route]);
    for (const asset of expected.page_assets_required) list.push([`emits ${asset}`, assets.includes(asset), JSON.stringify(assets)]);
    list.push(['other files are page assets', expected.other_files_are_page_assets === true
      && assets.every((a) => a.endsWith('.js') || a.endsWith('.css') || underPage(a)), JSON.stringify(assets)]);
    list.push(['deployment profile', vector.input.deployment_profile === 'cloudflare-pages',
      'this writer emits the Cloudflare Pages profile (AGSC-06-17)']);
    return checks(list);
  });
}

const text = (files, route) => (files.has(route) ? files.get(route).toString('utf8') : null);

/** A policy as directives: name → its sources. */
function directives(policy) {
  return new Map(String(policy).split(';').map((part) => part.trim().split(/\s+/u)).filter((p) => p[0] !== '')
    .map(([name, ...sources]) => [name.toLowerCase(), sources]));
}

/**
 * Whether a policy loosens nothing of the site-wide one: the same directives with the same
 * sources, except that `script-src` may add `'wasm-unsafe-eval'` (AGSC-06-39). Any other
 * added source, removed directive or new directive is a difference.
 */
function onlyWasmAdded(policy, siteWide) {
  const have = directives(policy);
  const base = directives(siteWide);
  const sorted = (list) => [...list].sort().join(' ');
  const same = (name) => sorted(have.get(name) || []) === sorted(base.get(name) || [])
    || (name === 'script-src' && sorted(have.get(name) || []) === sorted([...(base.get(name) || []), '\'wasm-unsafe-eval\'']));
  return have.size === base.size && [...base.keys()].every((name) => have.has(name) && same(name));
}

/** The checks of the policy every address under `/query/` is served with, and of every other block. */
function policyChecks(want, run) {
  const list = [];
  const sets = rules.parseHeaders(text(run.files, '/_headers')).sets;
  const siteWide = rules.headersFor(sets, '/').filter(([name]) => name.toLowerCase() === 'content-security-policy').map(([, v]) => v).join(', ');
  const under = [...run.files.keys()].filter((f) => f.startsWith('/query/')).map((f) => (f.endsWith('/index.html') ? f.slice(0, -'index.html'.length) : f));
  for (const route of under) {
    const served = rules.headersFor(sets, route).filter(([name]) => name.toLowerCase() === 'content-security-policy');
    list.push([`${route} policy count`, served.length === want.csp_count_on_route, JSON.stringify(served)]);
    const policy = served.map(([, value]) => value).join(', ');
    const have = directives(policy);
    for (const directive of want.csp_contains) {
      const [name, ...sources] = directive.split(/\s+/u);
      list.push([`${route} policy contains ${directive}`, sources.every((s) => (have.get(name) || []).includes(s)), policy]);
    }
    for (const word of want.csp_forbids) list.push([`${route} policy has no ${word}`, !policy.includes(word), policy]);
    // No host source: every source of every directive is a quoted keyword.
    const hosts = [...have.values()].flat().filter((source) => !/^'[a-z-]+'$/u.test(source));
    list.push([`${route} policy names no host`, hosts.length === 0, JSON.stringify(hosts)]);
    // AGSC-06-39: nothing is loosened but 'wasm-unsafe-eval' in script-src.
    list.push([`${route} policy is the site-wide one, at most with 'wasm-unsafe-eval' added to script-src`, onlyWasmAdded(policy, siteWide),
      `${policy} | site-wide: ${siteWide}`]);
  }
  for (const set of sets) {
    const values = set.headers.filter(([name]) => name.toLowerCase() === 'content-security-policy').map(([, v]) => v).join(' ');
    list.push([`${set.route} wasm-unsafe-eval only on /query/*`, !values.includes('\'wasm-unsafe-eval\'') || set.route === '/query/*', values]);
  }
  return list;
}

/** The checks of the page's own markup, the rules (a) to (f). */
function markupChecks(want, run, ctx) {
  const list = [];
  const page = text(run.files, '/query/index.html') || '';
  const attribute = (id, name) => {
    const tag = new RegExp(`<[a-z]+ id="${id}"[^>]*>`, 'u').exec(page);
    const value = tag === null ? null : new RegExp(` ${name}="([^"]*)"`, 'u').exec(tag[0]);
    return value === null ? null : value[1];
  };
  list.push(['html bytes', Buffer.byteLength(page, 'utf8') <= want.html_bytes_at_most, `${Buffer.byteLength(page, 'utf8')} bytes`]);
  list.push(['answers', deepEqual(String(attribute('query', 'data-answers')).split(' '), want.answers), attribute('query', 'data-answers')]);
  list.push(['refuses', deepEqual(String(attribute('query', 'data-refuses')).split(' ').sort(), [...want.refuses].sort()), attribute('query', 'data-refuses')]);
  const questions = JSON.parse(nodeFs.readFileSync(path.join((ctx && ctx.root) || '.', 'docs', 'ontology-questions.json'), 'utf8')).questions;
  const offered = [...page.matchAll(/<p class="question" id="example-\d+-question">\d+\. ([^<]*)<\/p>/gu)].map((m) => m[1].replace(/&#39;/gu, '\''));
  const buttons = [...page.matchAll(/<button type="button" data-example="example-\d+-query"/gu)].length;
  list.push(['the ten questions as examples', (questions.every((q) => offered.includes(q.question)) && buttons >= questions.length && questions.length === 10)
    === want.examples_include_the_ten_questions, JSON.stringify(offered)]);
  list.push(['a table and a picture', /<div id="query-table"/u.test(page) && /<figure id="query-picture"/u.test(page), 'the result containers']);
  const downloads = [...page.matchAll(/<a id="query-[a-z]+" data-format="([a-z]+)" download="[^"]+"/gu)].map((m) => m[1]).sort();
  list.push(['downloads', deepEqual(downloads, [...want.downloads].sort()), JSON.stringify(downloads)]);
  const share = attribute('query-share', 'href');
  list.push(['share link', want.share_link_holds_query_in === 'fragment' && share !== null && share.startsWith('#query='), share]);
  const vocabulary = page.slice(page.indexOf('<section id="vocabulary"'), page.indexOf('</section>', page.indexOf('<section id="vocabulary"')));
  list.push(['vocabulary explorer', RELATIONS.every((r) => vocabulary.includes(`<code>${r.key}</code>`)) === want.vocabulary_explorer, 'the fourteen keys']);
  const scripts = [...run.files.keys()].filter((f) => f.startsWith('/query/') && f.endsWith('.js')).map((f) => text(run.files, f)).join('\n');
  list.push(['stores nothing', !/localStorage|sessionStorage|indexedDB|document\.cookie|caches\./u.test(scripts) === want.stores_nothing, 'a storage API']);
  const origins = [...new Set([...page.matchAll(/\b(?:src|href|action)="([^"]*)"/gu)].map((m) => m[1])
    .filter((ref) => /^[a-z][a-z0-9+.-]*:|^\/\//iu.test(ref) && !ref.startsWith('https://minimal.example/'))
    .map((ref) => { try { return new URL(ref, 'https://minimal.example/').origin; } catch (e) { return ref; } }))];
  list.push(['origins outside the node', deepEqual(origins, want.origins_outside_the_node), JSON.stringify(origins)]);
  return list;
}

/** The checks both sub-cases state over the whole build: the route, the sitemap, the links. */
function presenceChecks(want, run) {
  const sitemap = text(run.files, '/sitemap.xml') || '';
  const pages = [...run.files.keys()].filter((f) => f.endsWith('.html'));
  const linking = pages.filter((f) => text(run.files, f).includes('href="/query/"'));
  const list = [[`${want.name} route present`, run.files.has('/query/index.html') === want.route_present, 'the page'],
    [`${want.name} in sitemap`, /<loc>[^<]*\/query\/<\/loc>/u.test(sitemap) === want.in_sitemap, 'the sitemap entry']];
  if (want.linked_from_every_generated_page !== undefined) {
    list.push([`${want.name} linked from every page`, (linking.length === pages.length) === want.linked_from_every_generated_page,
      JSON.stringify(pages.filter((f) => !linking.includes(f)))]);
  }
  if (want.linked_from_any_page !== undefined) list.push([`${want.name} linked from any page`, (linking.length > 0) === want.linked_from_any_page, JSON.stringify(linking)]);
  if (want.files_under_route !== undefined) {
    const under = [...run.files.keys()].filter((f) => f.startsWith('/query/'));
    list.push([`${want.name} files under /query/`, deepEqual(under, want.files_under_route), JSON.stringify(under)]);
  }
  return list;
}

/** build-0030 (AGSC-06-39): the page by default, and nothing of it with the switch off. */
function queryPageCase(vector, ctx) {
  const list = [];
  const byName = new Map((vector.expected.cases || []).map((c) => [c.name, c]));
  for (const sub of vector.input.cases || []) {
    const want = byName.get(sub.name);
    if (want === undefined) { list.push([sub.name, false, 'the vector states no expected case of this name']); continue; }
    onBuild(vector, ctx, sub, (run) => {
      list.push([`${sub.name} built`, run.exit === 0, `exit ${run.exit}`]);
      list.push(...presenceChecks(want, run));
      if (want.route_present) list.push(...policyChecks(want, run), ...markupChecks(want, run, ctx));
    });
  }
  list.push(['deployment profile', vector.input.deployment_profile === 'cloudflare-pages', 'the reference profile (AGSC-06-17)']);
  return checks(list);
}

module.exports = { HANDLERS: { 'build-0029': routeSetCase, 'build-0030': queryPageCase } };
