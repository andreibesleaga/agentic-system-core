'use strict';
// verifies AGSC-06-39, AGSC-06-01, AGSC-06-17, AGSC-06-19, AGSC-06-21, AGSC-06-05, AGSC-01-18
// The `/query/` page as the build writes it (src/distribution/query-page.js, wired by
// site.js), over the minimal fixture at its fixed instant:
//   * the page, its script, its worker, its stylesheet and the engine's files under
//     `/query/`, the engine byte for byte as vendored;
//   * the markup of the rules (a) to (f) of AGSC-06-39, the way build-0030 reads them;
//   * the sitemap entry, the navigation link on every generated page, and the one
//     `_headers` block of `/query/*`, the only place `'wasm-unsafe-eval'` is admitted;
//   * the two scripts, pinned by SHA-256 like the other page scripts, so a change to what
//     every node ships is a deliberate one;
//   * `site.query_page: false`: no route, no file under it, no link, no sitemap entry, and
//     every other file byte-identical to a build that has no query page at all;
//   * two builds byte-identical; the page within its budget.
// Deterministic: fixed build instant, no network.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const helpers = require('../../src/application/cli/verbs/_helpers.js');
const site = require('../../src/distribution/site.js');
const queryPage = require('../../src/distribution/query-page.js');
const hostRules = require('../../src/distribution/hosts/rules.js');
const { RELATIONS } = require('../../src/knowledge/relations.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const QUESTIONS = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'ontology-questions.json'), 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** The minimal fixture built at its instant, with `config` merged over its configuration. */
function build({ config = {}, input = helpers.queryPageInput() } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-query-page-'));
  try {
    fs.cpSync(FIXTURE, dir, { recursive: true });
    const base = JSON.parse(fs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8'));
    fs.writeFileSync(path.join(dir, 'agsc.config.json'), `${JSON.stringify({ ...base, site: { ...base.site, ...config } }, null, 2)}\n`);
    const files = createFileSystem(dir);
    const bundle = loadBundle(files, { schemas: validate.schemas(readSchemas(ROOT)) });
    const clock = createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } });
    const options = helpers.buildOptions({ ports: { fs: files }, root: dir, specVersion: '1.0.0', version: '0.0.2' });
    return site.build(bundle, { clock, fs: files }, { ...options, queryPage: input === null ? undefined : input });
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
}

const BUILT = build();
const page = () => String(BUILT.files.get('/query/index.html'));

test('the page and its assets are built under /query/, the engine byte for byte as vendored', () => {
  const under = [...BUILT.files.keys()].filter((route) => route.startsWith('/query/')).sort();
  assert.deepStrictEqual(under, ['/query/agsc-query-worker.js', '/query/agsc-query.css', '/query/agsc-query.js', '/query/index.html',
    '/query/vendor/oxigraph-0.5.13/LICENSE-APACHE.txt', '/query/vendor/oxigraph-0.5.13/LICENSE-MIT.txt',
    '/query/vendor/oxigraph-0.5.13/THIRD-PARTY.txt', '/query/vendor/oxigraph-0.5.13/web.js', '/query/vendor/oxigraph-0.5.13/web_bg.wasm']);
  for (const file of queryPage.ENGINE.files) {
    const bytes = BUILT.files.get(`${queryPage.ENGINE.route}${file.served}`);
    assert.ok(Buffer.isBuffer(bytes), `${file.served} is written as bytes`);
    assert.strictEqual(sha256(bytes), file.sha256, file.served);
  }
  assert.deepStrictEqual(BUILT.findings.filter((f) => f.severity === 'error'), []);
});

test('(a) the page names the four forms it answers and the two it refuses, and loads only its own files', () => {
  const html = page();
  assert.match(html, /<section id="query" class="query"[^>]* data-answers="SELECT ASK CONSTRUCT DESCRIBE" data-refuses="update SERVICE" hidden>/u);
  assert.match(html, /<script src="\/query\/agsc-query\.js" defer><\/script>/u);
  assert.match(html, /<link rel="stylesheet" href="\/query\/agsc-query\.css">/u);
  for (const [, ref] of html.matchAll(/\b(?:src|href)="([^"]*)"/gu)) {
    assert.ok(ref.startsWith('/') || ref.startsWith('#') || ref.startsWith('https://minimal.example/'), `${ref} is outside the node`);
    assert.ok(!ref.startsWith('//'), ref);
  }
  const worker = String(BUILT.files.get(queryPage.WORKER_ROUTE));
  assert.match(worker, /^import \* as oxigraph from '\.\/vendor\/oxigraph-0\.5\.13\/web\.js';$/mu);
  assert.match(worker, /queryWorkerMain\(self, oxigraph, "\/graph\.nq"\);\n$/u);
});

test('(b) the ten questions are offered as named examples, each with the query that defines it', () => {
  const html = page();
  for (const q of QUESTIONS.questions) {
    const block = html.slice(html.indexOf(`<li id="example-${q.number}">`), html.indexOf('</li>', html.indexOf(`<li id="example-${q.number}">`)));
    assert.ok(block.includes(`${q.number}. ${q.question}`.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;')), q.question);
    assert.ok(block.includes(`data-example="example-${q.number}-query"`), `example ${q.number} has no button`);
    const query = /<code id="example-\d+-query">([^]*?)<\/code>/u.exec(block)[1];
    assert.ok(query.replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&quot;/gu, '"').replace(/&#39;/gu, '\'').replace(/&amp;/gu, '&').endsWith(q.sparql), `example ${q.number}`);
  }
  assert.strictEqual([...html.matchAll(/<li id="example-\d+">/gu)].length, 10);
});

test('(c)(d)(e) the result has a table, a picture, two downloads; the share link holds the query in its fragment', () => {
  const html = page();
  assert.match(html, /<div id="query-table" class="table-wrap"><\/div>/u);
  assert.match(html, /<figure id="query-picture" class="query-picture" hidden><\/figure>/u);
  assert.match(html, /<a id="query-csv" data-format="csv" download="query-result\.csv" hidden>/u);
  assert.match(html, /<a id="query-json" data-format="json" download="query-result\.json" hidden>/u);
  const share = /<a id="query-share" href="([^"]+)">/u.exec(html)[1];
  assert.ok(share.startsWith('#query='), share);
  assert.strictEqual(decodeURIComponent(share.slice('#query='.length)), queryPage.FIRST_QUERY);
});

test('(f) the vocabulary explorer lists the classes and the fourteen keys with their meaning', () => {
  const html = page();
  const relations = html.slice(html.indexOf('id="vocabulary-relation-table"'), html.indexOf('</table>', html.indexOf('id="vocabulary-relation-table"')));
  const rows = [...relations.matchAll(/<tr><td><code>([a-z-]+)<\/code><\/td><td><code>([^<]+)<\/code><\/td><td>([^<]*)<\/td><\/tr>/gu)];
  assert.deepStrictEqual(rows.map((m) => [m[1], m[2], m[3]]), RELATIONS.map((r) => [r.key, r.property, r.meaning.replace(/'/gu, '&#39;')]));
  const classes = html.slice(html.indexOf('id="vocabulary-class-table"'), html.indexOf('</table>', html.indexOf('id="vocabulary-class-table"')));
  assert.ok(classes.includes('<code>asc:Concept</code>') && classes.includes('<code>asc:Cluster</code>'));
});

test('AGSC-06-05: neither script reads or writes a store or a cookie, and each reads only routes of this origin', () => {
  for (const route of [queryPage.SCRIPT_ROUTE, queryPage.WORKER_ROUTE]) {
    const text = String(BUILT.files.get(route));
    assert.doesNotMatch(text, /localStorage|sessionStorage|indexedDB|document\.cookie|caches\.|sendBeacon|XMLHttpRequest|WebSocket|EventSource/u, route);
    // An absolute address is only a name: the namespaces of the page's prefixes and keys,
    // SVG's namespace and the datatype of a plain string, none of them fetched.
    const names = text.replace(/^ {4}(?:KEYS|PREFIXES): .*$/gmu, '')
      .replace(/'http:\/\/www\.w3\.org\/(?:2000\/svg|2001\/XMLSchema#string)'/gu, '');
    assert.doesNotMatch(names, /https?:\/\//u, route);
  }
  const worker = String(BUILT.files.get(queryPage.WORKER_ROUTE));
  assert.deepStrictEqual([...worker.matchAll(/\bfetch\(([^)]*)\)/gu)].map((m) => m[1]), ['graphRoute']);
  assert.deepStrictEqual([...String(BUILT.files.get(queryPage.SCRIPT_ROUTE)).matchAll(/new win\.Worker\(([^,]*),/gu)].map((m) => m[1]), ['api.WORKER_ROUTE']);
});

test('AGSC-06-19 and the navigation: /query/ is in the sitemap and linked from every generated page', () => {
  assert.match(String(BUILT.files.get('/sitemap.xml')), /<loc>https:\/\/minimal\.example\/query\/<\/loc>/u);
  const pages = [...BUILT.files.keys()].filter((route) => route.endsWith('.html'));
  assert.ok(pages.length > 10);
  for (const route of pages) assert.ok(String(BUILT.files.get(route)).includes('<li><a href="/query/"'), `${route} has no link to /query/`);
  assert.match(page(), /<li><a href="\/query\/" aria-current="page">Query<\/a><\/li>/u);
});

test('AGSC-06-17: one _headers block for /query/*, the only one with wasm-unsafe-eval; one policy reaches the page', () => {
  const { sets } = hostRules.parseHeaders(String(BUILT.files.get('/_headers')));
  const query = sets.filter((s) => s.route === '/query/*');
  assert.strictEqual(query.length, 1);
  assert.deepStrictEqual(query[0].headers[0], ['!', 'Content-Security-Policy']);
  for (const set of sets) {
    const policy = set.headers.filter(([name]) => name === 'Content-Security-Policy').map(([, value]) => value).join(' ');
    assert.strictEqual(policy.includes('\'wasm-unsafe-eval\''), set.route === '/query/*', set.route);
    assert.doesNotMatch(policy, /'unsafe-eval'|'unsafe-inline'/u, set.route);
  }
  for (const route of ['/query/', '/query/agsc-query-worker.js', '/query/vendor/oxigraph-0.5.13/web_bg.wasm']) {
    const served = hostRules.headersFor(sets, route).filter(([name]) => name === 'Content-Security-Policy');
    assert.strictEqual(served.length, 1, route);
    assert.strictEqual(served[0][1], "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  }
  const other = hostRules.headersFor(sets, '/concepts/handoff/').filter(([name]) => name === 'Content-Security-Policy');
  assert.strictEqual(other.length, 1);
  assert.ok(!other[0][1].includes('wasm-unsafe-eval'));
});

test('the two scripts and the stylesheet are pinned: a change to what every node ships is a deliberate one', () => {
  // The SHA-256 of each file as built for the fixture (spec_version 1.0.0). A change to any
  // function under src/distribution/query/, to the explorer functions the page carries or to
  // the stylesheet changes these: update the pin in the same commit, and say in CHANGELOG.md
  // which bytes of every node change.
  const pins = {
    [queryPage.SCRIPT_ROUTE]: '6931d4117ce7d210dcfee8500e375fd9a1c1328561c93cd40f365c004c31a1c4',
    [queryPage.WORKER_ROUTE]: '7f8ec0307d01981d8680794950f32bdca96f23f5d5b803c9e72b409716c146ab',
    [queryPage.STYLESHEET_ROUTE]: '2b5f1945f77110a853946311597013e67176a1a4044d83d1fd5b453483032bde',
  };
  for (const [route, pin] of Object.entries(pins)) assert.strictEqual(sha256(String(BUILT.files.get(route))), pin, route);
});

test('AGSC-06-21: the page keeps the budget of 100 KB; the engine is outside it', () => {
  assert.ok(Buffer.byteLength(page(), 'utf8') <= 100000);
  assert.deepStrictEqual(BUILT.findings.filter((f) => f.code === 'AGSC-E904'), []);
});

test('AGSC-04-02: two builds give the same bytes', () => {
  const again = build();
  assert.deepStrictEqual([...again.files.keys()], [...BUILT.files.keys()]);
  for (const [route, bytes] of BUILT.files) assert.ok(Buffer.from(bytes).equals(Buffer.from(again.files.get(route))), route);
});

test('site.query_page false: no /query/, no file under it, no link, no sitemap entry, every other byte as without the page', () => {
  const off = build({ config: { query_page: false } });
  const without = build({ input: null });
  assert.ok(![...off.files.keys()].some((route) => route.startsWith('/query/')));
  for (const [route, bytes] of off.files) {
    assert.ok(!String(bytes).includes('/query/'), `${route} names /query/`);
  }
  assert.deepStrictEqual([...off.files.keys()], [...without.files.keys()]);
  for (const [route, bytes] of off.files) assert.ok(Buffer.from(bytes).equals(Buffer.from(without.files.get(route))), route);
  assert.ok(without.skipped.some((line) => line.startsWith('/query/ (')), 'a build with no engine says why /query/ is not there');
  assert.ok(off.skipped.some((line) => line.startsWith('/query/ (')), 'a build with the switch off says why /query/ is not there');
});

test('AGSC-06-39: when a build writes /query/, and the line that says why it does not', () => {
  const input = helpers.queryPageInput();
  assert.deepStrictEqual(queryPage.decision({ graphServed: true, input, pages: true, site: {} }), { on: true, skipped: null });
  assert.deepStrictEqual(queryPage.decision({ graphServed: true, input, pages: false, site: {} }), { on: false, skipped: null });
  assert.match(queryPage.decision({ graphServed: true, input, pages: true, site: { query_page: false } }).skipped, /^\/query\/ \(site\.query_page is false/u);
  assert.match(queryPage.decision({ graphServed: false, input, pages: true, site: {} }).skipped, /^\/query\/ \(the node serves no \/graph\.nq/u);
  assert.match(queryPage.decision({ graphServed: true, input: undefined, pages: true, site: {} }).skipped, /^\/query\/ \(the build was given no query engine/u);
  assert.strictEqual(queryPage.decision({ graphServed: true, input, pages: true, site: { query_page: true } }).on, true);
});

test('(f) the vocabulary explorer of a build given no vocabulary terms still lists the fourteen keys', () => {
  const html = queryPage.vocabularySection(undefined);
  assert.match(html, /<caption>The 0 classes of the vocabulary\.<\/caption>/u);
  assert.strictEqual([...html.matchAll(/<tr><td><code>[a-z-]+<\/code><\/td><td><code>/gu)].length, RELATIONS.length);
});
