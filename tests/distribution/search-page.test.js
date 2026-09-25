'use strict';
// verifies AGSC-06-23
// tests/distribution/search-page.test.js — the `/search/` page and its one script.
//
// AGSC-06-23 says two conforming engines emit byte-identical `search.json` because
// there is exactly one tokenizer. A search box that tokenized a query with a SECOND
// spelling of that tokenizer would find postings the writer never produced, or miss
// the ones it did — silently. So the page's script carries the SOURCE TEXT of
// `distribution/search.js#tokenize` and `#query` (the pattern of
// `composition/browser.js`), and this file proves it the only way that does not
// decay: the emitted script is evaluated in a `node:vm` context that holds nothing
// but the language, and its tokenizer is compared with this process's — its bytes,
// and its output over generated strings.
//
// The page itself is then RUN, under a minimal DOM and a `fetch` that serves the
// build's own bytes and refuses everything else: a query typed into the box lists
// title, description and link; the AGSC-06-21 manifest is followed to its shards;
// a shard that cannot be read is AGSC-E901 and no answer, as the rule requires.
//
// Deterministic: a fixed clock, no network, seeded generation.

const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const path = require('node:path');
const fc = require('fast-check');
const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const site = require('../../src/distribution/site.js');
const search = require('../../src/distribution/search.js');
const searchPage = require('../../src/distribution/search-page.js');
const pageTools = require('../../src/distribution/page-tools.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
/** 2026-01-01T00:00:00Z — the fixed instant of `tests/fixtures/minimal/README.md`. */
const EPOCH = '1767225600';

function built() {
  const fs = createFileSystem(FIXTURE);
  const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(ROOT)) });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } });
  return { bundle, ...site.build(bundle, { clock, fs }, { specVersion: '1.0.0-rc.6', version: '0.0.2' }) };
}

/** A value flattened out of the vm realm (a cross-realm array has another prototype). */
function plain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** The script in a context that holds nothing but the language: no document, no fetch. */
function bareContext(text) {
  const context = vm.createContext({});
  vm.runInContext(text, context, { filename: 'agsc-search.js' });
  return context;
}

/** The smallest DOM the controller touches. */
function fakeDocument() {
  const nodes = new Map();
  const make = (id) => {
    const node = {
      children: [], hidden: false, id, listeners: [], value: '',
      addEventListener(type, handler) { node.listeners.push([type, handler]); },
      appendChild(child) { node.children.push(child); return child; },
      set textContent(value) { node.text = String(value); node.children.length = 0; },
      get textContent() { return node.text === undefined ? '' : node.text; },
    };
    return node;
  };
  for (const id of ['search-form', 'q', 'results', 'search-status', 'site-index']) nodes.set(id, make(id));
  nodes.get('search-form').hidden = true;
  return {
    createElement: (tag) => Object.assign(make(''), { tag }),
    createTextNode: (text) => ({ text: String(text), tag: '#text' }),
    getElementById: (id) => (nodes.has(id) ? nodes.get(id) : null),
    nodes,
  };
}

/**
 * The page, opened: the emitted script over a `fetch` that serves the given route
 * map and refuses everything else, recording every URL asked for.
 */
function openPage(text, files, options = {}) {
  const document = fakeDocument();
  const asked = [];
  const sandbox = {
    document,
    location: { search: options.search === undefined ? '' : options.search },
    fetch: (url) => {
      asked.push(String(url));
      if (!String(url).startsWith('/')) return Promise.reject(new Error(`off-origin: ${url}`));
      const body = files.get(String(url));
      if (body === undefined) return Promise.resolve({ ok: false, text: () => Promise.resolve('') });
      return Promise.resolve({ ok: true, text: () => Promise.resolve(String(body)) });
    },
    Promise,
    clearTimeout,
    setTimeout,
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(text, context, { filename: 'agsc-search.js' });
  const api = sandbox.AGSC_SEARCH;
  const submit = () => {
    const [, handler] = document.nodes.get('search-form').listeners.find(([type]) => type === 'submit');
    handler({ preventDefault() {} });
    return api.pending;
  };
  return { api, asked, document, submit };
}

const SAMPLES = ['', 'a', 'ÉCOLE Σigma ABC', 'x² Ⅷ a-b', 'नमस्ते दुनिया', 'Handoff, supervisor!', 'école école',
  '𝔘𝔫𝔦𝔠𝔬𝔡𝔢 text', 'tab\tand\nnewline'];

// ------------------------------------------------------------- the tokenizer, twice

test('AGSC-06-23: the page script carries the SOURCE TEXT of the tokenizer the index was built with', () => {
  const text = searchPage.script({ specVersion: '1.0.0-rc.6' });
  for (const name of search.PORTABLE) {
    const source = String(search[name]);
    assert.ok(source.startsWith(`function ${name}(`), `${name} is not a plain function declaration`);
    assert.ok(!source.includes('require('), `${name} requires a module; a page cannot`);
    assert.ok(text.includes(source), `the script does not carry ${name}'s own source text`);
  }
  for (const name of ['pageShardRoutes', 'pageIndexOf']) {
    assert.ok(text.includes(String(pageTools[name])), `the script does not carry ${name}'s own source text`);
  }
  assert.ok(text.endsWith('}());\n') && !text.endsWith('\n\n'), 'the script does not end in exactly one LF');
  assert.strictEqual(text, searchPage.script({ specVersion: '1.0.0-rc.6' }), 'the script is not deterministic');
  assert.ok(text.includes('spec_version: 1.0.0-rc.6') && searchPage.script().includes('spec_version: unset'));
});

test('AGSC-06-23: in a context with nothing but the language, the page tokenizes byte for byte as the writer did', () => {
  const context = bareContext(searchPage.script());
  const api = context.AGSC_SEARCH;
  assert.ok(api && typeof api.tokenize === 'function', 'the script installed no AGSC_SEARCH');
  assert.strictEqual(String(api.tokenize), String(search.tokenize), 'the two tokenizers are not the same bytes');
  assert.strictEqual(String(api.query), String(search.query));
  for (const sample of SAMPLES) {
    assert.deepStrictEqual(plain(api.tokenize(sample)), search.tokenize(sample), JSON.stringify(sample));
  }
  fc.assert(fc.property(fc.string(), (s) => {
    assert.deepStrictEqual(plain(api.tokenize(s)), search.tokenize(s));
  }), { numRuns: 300, seed: 20260925 });
  // Without a document the script installs the API and touches nothing else.
  assert.strictEqual(api.run, undefined);
});

test('AGSC-06-23: the page tool tokenizes a query exactly as the page and the writer do', () => {
  // `page-tools.js#pageTokenize` is the query half the seven tools use; a hit from the
  // `search` tool and a hit from the search box must mean the same thing.
  for (const sample of SAMPLES) assert.deepStrictEqual(pageTools.pageTokenize(sample), search.tokenize(sample));
  fc.assert(fc.property(fc.string(), (s) => {
    assert.deepStrictEqual(pageTools.pageTokenize(s), search.tokenize(s));
  }), { numRuns: 300, seed: 20260925 });
});

// ----------------------------------------------------------------- the ranking

const ITEMS = [
  { slug: 'b-two', title: 'Agent handoff', description: 'A handoff between agents.', body: 'The reason travels with the task.', clusters: ['patterns'] },
  { slug: 'a-one', title: 'Supervisor', description: 'Routes work to agents.', body: '' },
  { slug: 'c-three', title: 'Ledger', description: 'A hash chain.', body: 'nothing about agents here', tags: ['audit'] },
];

test('query scores one point per distinct query token, orders by score then slug, and answers nothing to an empty query', () => {
  const index = search.index(ITEMS);
  assert.deepStrictEqual(search.query(index, 'agents handoff').map((h) => [h.slug, h.score]),
    [['b-two', 2], ['a-one', 1], ['c-three', 1]]);
  // A repeated token counts once; a token of one code point is not a token at all.
  assert.deepStrictEqual(search.query(index, 'handoff HANDOFF handoff a').map((h) => [h.slug, h.score]), [['b-two', 1]]);
  assert.deepStrictEqual(search.query(index, ''), []);
  assert.deepStrictEqual(search.query(index, ' - '), []);
  assert.deepStrictEqual(search.query(index, 'nothingmatches'), []);
  assert.deepStrictEqual(search.query(null, 'agents'), []);
  assert.deepStrictEqual(search.query({ docs: 'no' }, 'agents'), []);
  // A hit carries the doc's members as emitted: no empty description, no empty cluster.
  assert.deepStrictEqual(search.query(index, 'ledger'),
    [{ score: 1, slug: 'c-three', title: 'Ledger', description: 'A hash chain.' }]);
  assert.deepStrictEqual(search.query(index, 'reason')[0].cluster, 'patterns');
  // A query naming an inherited property is not a hit on every document.
  assert.deepStrictEqual(search.query(index, 'constructor __proto__ hasOwnProperty'), []);
});

test('AGSC-06-21: over a manifest and its shards the page reads the whole index, and the hits are the unsharded ones', () => {
  const many = [];
  for (let i = 1; i <= 12; i += 1) {
    many.push({ slug: `item-${String(i).padStart(2, '0')}`, title: `Item ${i}`, body: i % 4 === 0 ? 'quartzbridge' : 'plain' });
  }
  const emitted = search.files(many, { itemsPerShard: 5 });
  assert.deepStrictEqual(emitted.manifest, { docs_total: 12, shards: ['/search-01.json', '/search-02.json', '/search-03.json'] });
  const sources = {};
  for (const file of emitted.files) sources[file.path] = JSON.stringify(file.value);
  const merged = pageTools.pageIndexOf(sources);
  assert.notStrictEqual(merged.incomplete, true);
  assert.deepStrictEqual(search.query(merged, 'quartzbridge').map((h) => h.slug), ['item-04', 'item-08', 'item-12']);
  assert.deepStrictEqual(search.query(merged, 'quartzbridge'), search.query(search.index(many), 'quartzbridge'));
  // One shard missing: the merged index says so, and the page (below) answers nothing.
  delete sources['/search-02.json'];
  const partial = pageTools.pageIndexOf(sources);
  assert.strictEqual(partial.incomplete, true);
  assert.deepStrictEqual(partial.missing, ['/search-02.json']);
});

// -------------------------------------------------------------------- the page

test('AGSC-06-01 / AGSC-06-17: /search/ is a form over /search.json with the item list beneath it, and loads one same-origin script', () => {
  const { bundle, files } = built();
  const page = String(files.get('/search/index.html'));
  assert.ok(page.includes('<form class="search" id="search-form" hidden>'), 'no form, or the form is not hidden until the script shows it');
  assert.ok(page.includes('<label for="q">Search this node</label>'), 'the box has no label');
  assert.ok(page.includes('<input id="q" name="q" type="search" autocomplete="off" spellcheck="false">'));
  assert.ok(page.includes('<p id="search-status" role="status" aria-live="polite"></p>'), 'no live region for the result count');
  assert.ok(page.includes('<ol id="results" aria-label="Results"></ol>'));
  assert.ok(page.includes('<section id="site-index" aria-labelledby="index-heading">'), 'no fallback list');
  for (const item of bundle.items) {
    assert.ok(page.includes(`<a href="${site.routeOf(item)}">`), `${item.slug} is not in the fallback list`);
  }
  assert.ok(page.includes(`<script src="${searchPage.SCRIPT_ROUTE}"></script>`), 'the page does not load its script');
  // AGSC-06-17's `script-src 'self'` and `style-src 'self'`: nothing inline.
  assert.strictEqual((page.match(/<script(?![^>]*\b(?:src=|type="application\/ld\+json"))/gu) || []).length, 0, 'an inline script');
  assert.ok(!/ style="/u.test(page), 'an inline style');
  assert.ok(!/ on[a-z]+="/u.test(page), 'an inline handler');
  assert.ok(page.includes('<a href="/search/" aria-current="page">Search</a>'), 'the navigation does not mark the page');
  // The script is emitted at its route, and is exactly the module's own text.
  const script = String(files.get(searchPage.SCRIPT_ROUTE));
  assert.strictEqual(script, searchPage.script({ plurals: searchPage.pluralsOf(bundle.items), specVersion: '1.0.0-rc.6' }));
  assert.ok(script.includes('"agent-patterns":"clusters"'), 'the cluster is not in the plural table');
  assert.ok(!script.includes('"handoff"'), 'a concept is in the plural table, which lists only what is not a concept');
});

test('the page runs: a query typed into the box lists title, description and link, and nothing leaves the origin', async () => {
  const { files } = built();
  const { api, asked, document, submit } = openPage(String(files.get(searchPage.SCRIPT_ROUTE)), files);
  const form = document.nodes.get('search-form');
  assert.strictEqual(form.hidden, false, 'the script did not show the form');
  assert.deepStrictEqual(asked, [], 'the script fetched before any query');

  // Both concepts of the fixture name a handoff (the supervisor's body links to it);
  // equal scores are ordered by slug.
  document.nodes.get('q').value = 'Handoff';
  const hits = plain(await submit());
  assert.deepStrictEqual(hits.map((h) => [h.slug, h.score]), [['handoff', 1], ['supervisor', 1]]);
  const results = document.nodes.get('results');
  assert.strictEqual(results.children.length, 2);
  const [a, description] = results.children[0].children;
  assert.strictEqual(a.href, '/concepts/handoff/');
  assert.strictEqual(a.textContent, 'Handoff');
  assert.ok(description.text.startsWith(': The transfer of control'), description.text);
  assert.strictEqual(document.nodes.get('search-status').textContent, '2 results');
  // Three distinct tokens, all in one item and none in the other.
  document.nodes.get('q').value = 'transfer control audited';
  assert.deepStrictEqual(plain(await submit()).map((h) => [h.slug, h.score]), [['handoff', 3]]);
  assert.strictEqual(document.nodes.get('search-status').textContent, '1 result');
  assert.strictEqual(document.nodes.get('site-index').hidden, true, 'the fallback list stayed visible beside results');
  assert.deepStrictEqual(asked, ['/search.json'], 'the page fetched something other than the index');

  // A cluster links to its own route family (AGSC-05-01), and a token in several
  // items ranks them by score then slug.
  document.nodes.get('q').value = 'agents';
  const several = plain(await submit());
  assert.ok(several.length >= 2, JSON.stringify(several));
  assert.ok(results.children.some((li) => li.children[0].href === '/clusters/agent-patterns/'), 'the cluster hit does not link to /clusters/');
  assert.strictEqual(document.nodes.get('search-status').textContent, `${several.length} results`);
  assert.deepStrictEqual(asked, ['/search.json'], 'the index was fetched twice');

  // No hit: the page says so, in the live region.
  document.nodes.get('q').value = 'nothingmatchesthis';
  assert.deepStrictEqual(plain(await submit()), []);
  assert.strictEqual(document.nodes.get('search-status').textContent, 'No results for “nothingmatchesthis”.');
  assert.strictEqual(results.children.length, 0);

  // An empty box: the list of every item is the page again.
  document.nodes.get('q').value = '   ';
  assert.deepStrictEqual(plain(await submit()), []);
  assert.strictEqual(document.nodes.get('site-index').hidden, false);
  assert.strictEqual(document.nodes.get('search-status').textContent, '');
  assert.strictEqual(typeof api.routeOf, 'function');
});

test('a link of the form /search/?q=<words> opens with the words already searched', async () => {
  const { files } = built();
  const { api, document } = openPage(String(files.get(searchPage.SCRIPT_ROUTE)), files, { search: '?q=routes%20workers+supervisor' });
  assert.strictEqual(document.nodes.get('q').value, 'routes workers supervisor');
  const hits = plain(await api.ready);
  assert.deepStrictEqual(hits.map((h) => [h.slug, h.score]), [['supervisor', 3], ['handoff', 1]]);
  assert.strictEqual(document.nodes.get('results').children[0].children[0].href, '/concepts/supervisor/');
});

test('AGSC-06-21: a manifest whose shard is not served is AGSC-E901 in the live region and no answer', async () => {
  const many = [];
  for (let i = 1; i <= 12; i += 1) many.push({ slug: `item-${String(i).padStart(2, '0')}`, title: `Item ${i}`, body: 'quartzbridge' });
  const emitted = search.files(many, { itemsPerShard: 5 });
  const files = new Map(emitted.files.map((f) => [f.path, JSON.stringify(f.value)]));
  const whole = openPage(searchPage.script(), files);
  whole.document.nodes.get('q').value = 'quartzbridge';
  assert.strictEqual(plain(await whole.submit()).length, 12);
  assert.deepStrictEqual(whole.asked, ['/search.json', '/search-01.json', '/search-02.json', '/search-03.json']);
  assert.strictEqual(whole.document.nodes.get('search-status').textContent, '12 results');

  files.delete('/search-02.json');
  const partial = openPage(searchPage.script(), files);
  partial.document.nodes.get('q').value = 'quartzbridge';
  assert.deepStrictEqual(plain(await partial.submit()), []);
  assert.match(partial.document.nodes.get('search-status').textContent, /^AGSC-E901: the search index is incomplete \(\/search-02\.json could not be read\)/u);
  assert.strictEqual(partial.document.nodes.get('results').children.length, 0);
  assert.strictEqual(partial.document.nodes.get('site-index').hidden, false);

  // No index at all: the page says so and the list stays.
  const none = openPage(searchPage.script(), new Map());
  none.document.nodes.get('q').value = 'quartzbridge';
  assert.deepStrictEqual(plain(await none.submit()), []);
  assert.strictEqual(none.document.nodes.get('search-status').textContent, 'The search index could not be loaded; the list below is still available.');
});

test('more hits than the page shows: the first forty are listed and the status says so', async () => {
  const many = [];
  for (let i = 1; i <= 45; i += 1) many.push({ slug: `item-${String(i).padStart(2, '0')}`, title: `Item ${i}`, body: 'quartzbridge' });
  const files = new Map([['/search.json', JSON.stringify(search.index(many))]]);
  const { document, submit } = openPage(searchPage.script(), files);
  document.nodes.get('q').value = 'quartzbridge';
  assert.strictEqual(plain(await submit()).length, 45);
  assert.strictEqual(document.nodes.get('results').children.length, searchPage.SHOWN);
  assert.strictEqual(document.nodes.get('search-status').textContent, '45 results, showing the first 40');
});

test('pluralsOf lists every item that is not a concept, in code-point order of slug', () => {
  assert.deepStrictEqual(searchPage.pluralsOf([
    { slug: 'z', type: 'procedure' }, { slug: 'a', type: 'concept' }, { slug: 'm', type: 'cluster' },
    { slug: 'b', type: 'lesson' }, { slug: 'c', type: 'unknown-type' },
  ]), { b: 'lessons', m: 'clusters', z: 'procedures' });
  assert.deepStrictEqual(searchPage.pluralsOf([]), {});
});
