'use strict';
// verifies AGSC-06-01
// The route set of AGSC-06-01, read from the specification text itself and
// compared with a real build in BOTH directions: every file the build emits is a
// route of the rule (or one of the page assets the rule names as part of a page),
// and every route of the rule is emitted — or, for a conditional route, the build
// says why it was not. The fixture is tests/standard/_fixture.js.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT, richBuild } = require('./_fixture.js');

const SPEC = fs.readFileSync(path.join(ROOT, 'spec', '06-surfaces.md'), 'utf8');
const RULE = SPEC.slice(SPEC.indexOf('- **AGSC-06-01**'), SPEC.indexOf('- **AGSC-06-02**'));
const [LIST, SECOND, CONDITIONS] = RULE.split('\n\n');

/** The first paragraph without its dated amendment notes, which quote old wording. */
const NORMATIVE = LIST.replace(/\*\((?:amended|added|stated)[^]*?\)\*/gu, '');
/** The routes the namespace document site publishes alone (not a content node's). */
const NAMESPACE_SITE = (() => {
  const at = NORMATIVE.indexOf('the vocabulary documents');
  const end = NORMATIVE.indexOf('namespace document site alone');
  return at < 0 || end < 0 ? [] : [...NORMATIVE.slice(at, end).matchAll(/`(\/[^`]*)`/gu)].map((m) => m[1]);
})();

/** Every route template the first paragraph names for a content node, in its order. */
function templates() {
  const out = [];
  for (const m of NORMATIVE.matchAll(/`((?:\/|_headers|_redirects)[^`]*)`/gu)) {
    const t = m[1];
    if (!out.includes(t) && !NAMESPACE_SITE.includes(t)) out.push(t);
  }
  // "`/procedures/`, `/lessons/`, `/episodes/`, `/gates/` with their item pages".
  for (const plural of ['procedures', 'lessons', 'episodes', 'gates']) out.push(`/${plural}/<slug>/`);
  return out;
}

/** Routes emitted once per instance ("for every language variant", "for every attachment"). */
const PER_INSTANCE = ['/<type-plural>/<slug>/<lang>/', '/attachments/<slug>/<file>', '/assets/<path>'];

/** A template as a regular expression over a route (`/concepts/<slug>/`, `/graph/fragments/**`). */
function pattern(template) {
  const body = template.split(/(<[a-z-]+>|\*\*)/u).map((part) => {
    if (part === '**') return '.+';
    if (part === '<path>') return '[^\\s]+';
    if (/^<[a-z-]+>$/u.test(part)) return '[^/]+';
    return part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  }).join('');
  return new RegExp(`^${body}$`, 'u');
}

/** The route a built file serves: `concepts/a/index.html` → `/concepts/a/`. */
function routeOf(file) {
  if (file === '_headers' || file === '_redirects') return file;
  if (file === 'index.html') return '/';
  if (file.endsWith('/index.html')) return `/${file.slice(0, -'index.html'.length)}`;
  return `/${file}`;
}

const TEMPLATES = templates();
/** `/boards/**` and the other conditional names of the third paragraph. */
const CONDITIONAL = [...CONDITIONS.matchAll(/`(\/[^`]*)`/gu)].map((m) => m[1]);
/**
 * The page assets the second paragraph names as parts of a page, not routes — the `/search/`
 * page's own script, its one same-origin asset, and the files under `/query/` other than its
 * page (the page script, the query engine and its licence text, AGSC-06-39).
 */
const PAGE_ASSETS = [/^\/compose\/[a-z-]+\.js$/u, /^\/search\/[a-z-]+\.js$/u, /^\/assets\/site\.css$/u, /^\/assets\/theme\.js$/u,
  /^\/query\/(?!$)[^]+$/u];

test('the rule text yields the route list this test reads (a vacuous parse would prove nothing)', () => {
  assert.ok(NAMESPACE_SITE.includes('/ns/agsc.ttl'), 'the namespace-site sentence was not found');
  assert.ok(TEMPLATES.length >= 40, `only ${TEMPLATES.length} templates were read from AGSC-06-01`);
  for (const t of ['/', '/concepts/<slug>/', '/.well-known/knowledge-linkset', '/ledger.jsonl', '_headers']) {
    assert.ok(TEMPLATES.includes(t), `${t} was not read from AGSC-06-01`);
  }
  assert.ok(CONDITIONAL.includes('/boards/**') && CONDITIONAL.includes('/legal/'));
  assert.match(SECOND, /are emitted as part of the page that names them/u);
  assert.match(SECOND, /The files under `\/query\/` other than its index page \(AGSC-06-39\)[^.]* are page assets of that page/u);
});

/**
 * The `.js` and `.css` files some emitted page loads by a `<script src>` or a stylesheet
 * `<link>`: the second paragraph's "same-origin script assets a page of this set loads
 * … are emitted as part of the page that names them" (case build-0029,
 * `other_files_are_page_assets`). `/clusters/` loads the explorer's two (AGSC-06-38).
 */
function loadedByAPage(out, files) {
  const loaded = new Set();
  for (const file of files.filter((f) => f.endsWith('.html'))) {
    const text = fs.readFileSync(path.join(out, file), 'utf8');
    for (const m of text.matchAll(/<script src="([^"]+)"|<link rel="stylesheet" href="([^"]+)"/gu)) loaded.add(m[1] || m[2]);
  }
  return loaded;
}

test('every file the build emits is a route of AGSC-06-01 or a page asset it names', () => {
  const { files, out } = richBuild();
  const all = [...TEMPLATES, ...CONDITIONAL].map(pattern);
  const loaded = loadedByAPage(out, files);
  const stray = files.map(routeOf).filter((route) => !all.some((re) => re.test(route))
    && !PAGE_ASSETS.some((re) => re.test(route)) && !(/\.(?:js|css)$/u.test(route) && loaded.has(route)));
  assert.deepStrictEqual(stray, [], `emitted outside the route set: ${stray.join(', ')}`);
  assert.ok(loaded.has('/clusters/agsc-explorer.js') && loaded.has('/clusters/agsc-explorer.css'), 'the page-asset scan found nothing');
});

test('every route of AGSC-06-01 is emitted, or is conditional and the build says why not', () => {
  const { files, skipped } = richBuild();
  const routes = files.map(routeOf);
  const conditional = CONDITIONAL.map(pattern);
  // The routes each "skipped:" line of the build names, before its reason.
  const said = skipped.flatMap((line) => line.slice(0, line.indexOf(' (')).split(', '));
  const missing = [];
  for (const t of TEMPLATES) {
    const re = pattern(t);
    if (routes.some((r) => re.test(r))) continue;
    // Size-driven shards and index pages appear only above the bounds of AGSC-06-21/06-31.
    if (/<nn>|page-<n>/u.test(t)) continue;
    const instance = t.replace(/<[a-z-]+>/gu, 'x');
    const isConditional = CONDITIONAL.includes(t) || PER_INSTANCE.includes(t)
      || conditional.some((c) => c.test(instance));
    const accounted = said.some((s) => s === t || pattern(s).test(instance))
      || (PER_INSTANCE.includes(t) && t !== '/assets/<path>');
    if (!(isConditional && accounted)) missing.push(t);
  }
  assert.deepStrictEqual(missing, [], `neither emitted nor accounted for: ${missing.join(', ')}`);
});

test('/graph.rdf and /feed.xml are not emitted at 1.x', () => {
  const { files } = richBuild();
  assert.ok(!files.includes('graph.rdf'));
  assert.ok(!files.includes('feed.xml'));
});

test('the note on /feed.xml says the route is reserved to a later MINOR, as AGSC-00-20 amended for 1.1.0 says', () => {
  const site = require('../../src/distribution/site.js');
  const [, note] = site.UNPRODUCED_ROUTES.find(([route]) => route === '/feed.xml');
  assert.match(note, /^reserved to a later MINOR \(planned for 1\.2, AGSC-00-20 as amended for 1\.1\.0\)/u);
  assert.match(note, /a 1\.0 or 1\.1 tool rejects/u);
  assert.doesNotMatch(note, /reserved to 1\.1/u);
  // The engine's own reference and the comments that state the same reservation.
  for (const rel of ['src/REFERENCE.md', 'src/application/config/load.js', 'src/knowledge/validate.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, rel), 'utf8'), /reserved to 1\.1/u, rel);
  }
});
