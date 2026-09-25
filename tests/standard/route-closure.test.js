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
/** The page assets the second paragraph names as parts of a page, not routes — and the `/search/` page's own script, its one same-origin asset. */
const PAGE_ASSETS = [/^\/compose\/[a-z-]+\.js$/u, /^\/search\/[a-z-]+\.js$/u, /^\/assets\/site\.css$/u, /^\/assets\/theme\.js$/u];

test('the rule text yields the route list this test reads (a vacuous parse would prove nothing)', () => {
  assert.ok(NAMESPACE_SITE.includes('/ns/agsc.ttl'), 'the namespace-site sentence was not found');
  assert.ok(TEMPLATES.length >= 40, `only ${TEMPLATES.length} templates were read from AGSC-06-01`);
  for (const t of ['/', '/concepts/<slug>/', '/.well-known/knowledge-linkset', '/ledger.jsonl', '_headers']) {
    assert.ok(TEMPLATES.includes(t), `${t} was not read from AGSC-06-01`);
  }
  assert.ok(CONDITIONAL.includes('/boards/**') && CONDITIONAL.includes('/legal/'));
  assert.match(SECOND, /are emitted as part of the page that names them/u);
});

test('every file the build emits is a route of AGSC-06-01 or a page asset it names', () => {
  const { files } = richBuild();
  const all = [...TEMPLATES, ...CONDITIONAL].map(pattern);
  const stray = files.map(routeOf).filter((route) => !all.some((re) => re.test(route))
    && !PAGE_ASSETS.some((re) => re.test(route)));
  assert.deepStrictEqual(stray, [], `emitted outside the route set: ${stray.join(', ')}`);
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
