'use strict';
// tests/distribution/page-tools.test.js —.
//
// AGSC-09-16 asks for ONE tool contract over two transports. This file proves the
// browser half against the reference Bundle: the page corpus assembled from the
// PUBLISHED routes answers every one of the seven tools exactly as the local server
// answers it, the readers the page needs (the failsafe frontmatter reader, the
// typed-scalar table, the Link-edge algebra) agree with the Knowledge context's own
// implementations, and the writer declares and links what the rules require.
//
// Deterministic throughout: a fixed clock, no network, no wall clock, no randomness.

const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const path = require('node:path');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const yaml = require('../../src/knowledge/yaml.js');
const links = require('../../src/knowledge/links.js');
const adopt = require('../../src/knowledge/adopt.js');
const { loadBundle } = require('../../src/application/bundle.js');
const site = require('../../src/distribution/site.js');
const html = require('../../src/distribution/html.js');
const mcpTools = require('../../src/distribution/mcp-tools.js');
const pageTools = require('../../src/distribution/page-tools.js');
const surfaces = require('../../src/boundary/surfaces.js');
const visibility = require('../../src/boundary/visibility.js');
const itemSchema = require('../../schema/item.schema.json');

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

/** The emitted script, run as a page runs it, over the build's own published bytes. */
function pageToolset(files, config) {
  const sources = {};
  for (const [route, text] of files) sources[route] = String(text);
  const context = vm.createContext({ TextEncoder });
  vm.runInContext(String(files.get('/compose/agsc-core.js')), context, { filename: 'agsc-core.js' });
  vm.runInContext(String(files.get('/compose/agsc-page-tools.js')), context, { filename: 'agsc-page-tools.js' });
  const api = vm.runInContext('globalThis.AGSC_PAGE_TOOLS', context);
  const core = vm.runInContext('globalThis.AGSC_CORE', context);
  assert.strictEqual(api.BUNDLE_ID, (config.bundle || {}).id,
    'the emitted script carries a different bundle id from the Bundle it was built from');
  return api.pageToolset(api.pageCorpus(sources, { bundleId: api.BUNDLE_ID }), core);
}

/**
 * The SAME functions, called as the module exports them. One implementation, two
 * hosts: every assertion below is made against both, so a divergence between what
 * Node runs and what the page runs is a failing test and not a surprise in a browser.
 */
function moduleToolset(files, config) {
  const sources = {};
  for (const [route, text] of files) sources[route] = String(text);
  const compose = require('../../src/composition/compose.js');
  const corpus = pageTools.pageCorpus(sources, { bundleId: (config.bundle || {}).id });
  return pageTools.pageToolset(corpus, { compose: compose.compose });
}

// --------------------------------------------------------------- the readers

test('AGSC-02-03: the page reads back exactly what knowledge/yaml.js reads', () => {
  const { bundle } = built();
  let checked = 0;
  for (const item of bundle.items) {
    const source = adopt.serialize(item.frontmatter);
    const split = pageTools.pageSplitFrontmatter(source);
    assert.notStrictEqual(split.block, '', `${item.slug}: no frontmatter block was recognised`);
    assert.deepStrictEqual(pageTools.pageParseFrontmatter(split.yamlText), yaml.parse(split.yamlText),
      `${item.slug}: the page reader and knowledge/yaml.js disagree`);
    checked += 1;
  }
  assert.ok(checked >= 3, `only ${checked} items were read; the sweep is broken`);
});

test('AGSC-02-03: a sequence of mappings, a nested map and a quoted scalar round-trip', () => {
  const frontmatter = {
    type: 'episode',
    title: 'A run: with a colon',
    sources: [
      { resource: 'https://a.example/x', title: 'First', year: '2026' },
      { resource: 'https://b.example/y', title: 'Second' },
    ],
    prov: { origin: 'human', operator: 'human:andrei' },
    usage: { tokens_in: 12, cost_usd: 0.5, estimate: true },
    tags: ['one', 'two'],
  };
  const split = pageTools.pageSplitFrontmatter(adopt.serialize(frontmatter));
  assert.deepStrictEqual(pageTools.pageParseFrontmatter(split.yamlText), yaml.parse(split.yamlText));
  // AGSC-02-04: and the typed scalars come back as numbers and booleans.
  const typed = pageTools.pageApplyTypes(pageTools.pageParseFrontmatter(split.yamlText), null);
  assert.strictEqual(typed.usage.tokens_in, 12);
  assert.strictEqual(typed.usage.cost_usd, 0.5);
  assert.strictEqual(typed.usage.estimate, true);
  assert.strictEqual(typed.sources[0].year, '2026', 'an untyped key was coerced');
});

test('AGSC-02-03: the typed-scalar table is the schema\'s, not a second list', () => {
  const found = Object.create(null);
  const walk = (node) => {
    if (node === null || typeof node !== 'object') return;
    for (const [name, property] of Object.entries(node.properties || {})) {
      const declared = property.type === undefined
        ? [] : (Array.isArray(property.type) ? property.type : [property.type]);
      for (const type of declared) {
        if (['integer', 'number', 'boolean'].includes(type)) found[name] = type;
      }
      walk(property);
    }
    for (const key of ['items', 'additionalProperties']) walk(node[key]);
    for (const key of ['oneOf', 'allOf', 'anyOf']) for (const branch of node[key] || []) walk(branch);
    for (const branch of Object.values(node.$defs || {})) walk(branch);
    for (const branch of Object.values(node.patternProperties || {})) walk(branch);
  };
  walk(itemSchema);
  assert.deepStrictEqual(pageTools.pageTypedScalars(), { ...found },
    'page-tools.js and schema/item.schema.json disagree about which scalars are typed');
});

test('AGSC-03: the page edge algebra is the Knowledge resolver\'s, edge for edge', () => {
  const { bundle } = built();
  const items = bundle.items.map((i) => ({
    body: i.body, frontmatter: i.frontmatter, path: i.path, slug: i.slug, type: i.type,
  }));
  const expected = links.resolve(bundle.items, {}).edges
    .map((e) => ({ computed: e.computed, key: e.key, source: e.source, target: e.target }));
  assert.deepStrictEqual(pageTools.pageEdges(items), expected);
  assert.ok(expected.some((e) => e.key === 'mentions'),
    'the fixture produces no body-reference edge; the comparison proves too little');
});

test('AGSC-03-11: the inline-reference scan skips fenced blocks and code spans', () => {
  const body = ['See [a](alpha).', '', '```js', 'const x = "[b](beta)";', '```', '',
    'And `[c](gamma)` is code, but ![d](delta.png) is an image.'].join('\n');
  assert.deepStrictEqual(pageTools.pageInlineTargets(body), ['alpha', 'delta.png']);
});

test('AGSC-03-13: the page anchors are the heading anchors of the Knowledge renderer', () => {
  const markdown = require('../../src/knowledge/markdown.js');
  const body = ['# One', '', '## Two words', '', '## Two words', '', '## ***', '', '```', '# Not a heading', '```'].join('\n');
  assert.deepStrictEqual(pageTools.pageAnchors(body), markdown.anchors(body).anchors);
});

// ------------------------------------------------------- the seven page tools

test('AGSC-09-16: the page tools answer exactly what the local server answers', () => {
  const { bundle, files } = built();
  const page = pageToolset(files, bundle.config);
  const here = moduleToolset(files, bundle.config);
  const local = mcpTools.tools(bundle, {});
  const calls = [
    ['search', { query: 'supervisor' }],
    ['search', { query: 'nothing at all here' }],
    ['search', {}],
    ['ask', { question: 'handoff' }],
    ['ask', { question: 'zzqqxx' }],
    ['compose', { selection: ['supervisor'] }],
    ['compose', { selection: [] }],
    ['remember', { at: '2026-01-01T00:00:00Z', body: 'A note.', actor: 'process:ci', kind: 'episode', operator: 'human:tester', title: 'A Recorded Run' }],
    ['remember', { body: 'x', kind: 'concept', operator: 'human:tester', sources: [{ id: 's1', resource: 'nonsense' }], title: 'Handoff' }],
    ['read', { slug: 'no-such-item' }],
    ['links', { iri: 'memory://other-bundle/concepts/x' }],
    ['links', { iri: 'https://minimal.example/concepts/handoff/' }],
    ['nosuchtool', {}],
    ['read', {}],
  ];
  for (const item of bundle.items) {
    calls.push(['read', { slug: item.slug }], ['links', { slug: item.slug }], ['propose', { slug: item.slug }]);
  }
  for (const [name, args] of calls) {
    const expected = JSON.parse(JSON.stringify(local.call(name, args)));
    assert.deepStrictEqual(JSON.parse(JSON.stringify(page.call(name, args))), expected,
      `${name}(${JSON.stringify(args)}) differs between the EMITTED page script and the local server`);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(here.call(name, args))), expected,
      `${name}(${JSON.stringify(args)}) differs between the module and the local server`);
  }
  assert.ok(calls.length >= 20, `only ${calls.length} calls were compared`);
});

test('AGSC-09-13: the page implements exactly the seven tools Boundary names', () => {
  const { bundle, files } = built();
  for (const page of [pageToolset(files, bundle.config), moduleToolset(files, bundle.config)]) {
    for (const name of surfaces.TOOL_NAMES) {
      assert.notStrictEqual(page.call(name, {}).body.message, 'no such tool', `${name} is not implemented`);
    }
    for (const name of ['list', 'write', 'delete', 'compose ', 'READ']) {
      assert.strictEqual(page.call(name, {}).body.code, 'AGSC-E001', `${name} is answered as a tool`);
    }
    // AGSC-01-16: the 1 MiB cap on every text argument a tool parses.
    const oversized = page.call('search', { query: 'x'.repeat(1024 * 1024 + 1) });
    assert.strictEqual(oversized.body.code, 'AGSC-E904');
  }
});

test('AGSC-08-18 / AGSC-11-18: every page answer is untrusted and no page tool writes', () => {
  const { bundle, files } = built();
  const page = moduleToolset(files, bundle.config);
  for (const name of surfaces.TOOL_NAMES) {
    assert.strictEqual(page.call(name, { question: 'x', query: 'x', selection: [], slug: 'handoff', body: 'b', kind: 'concept', title: 'T' }).trust,
      'untrusted', `${name} did not mark its answer untrusted`);
  }
  // AGSC-08-04 / AGSC-11-14: `propose` and `remember` hand back a payload and stop.
  const proposal = page.call('propose', { slug: 'handoff' });
  assert.strictEqual(proposal.type, 'proposal');
  assert.match(proposal.body.markdown, /^---\n/u, 'the proposal carries no frontmatter block');
  const remembered = page.call('remember', { body: 'x', kind: 'lesson', title: 'A Lesson Learned Here' });
  assert.strictEqual(remembered.type, 'proposal');
  assert.match(remembered.body.path, /^content\/lessons\//u);
  // AGSC-09-14b (2026-09-25): the page has no identity to declare, so a call with no
  // operator comes back with `prov.operator` absent and the warning that says so;
  // with one declared, no such warning.
  assert.strictEqual(remembered.body.frontmatter.prov.operator, undefined);
  assert.deepStrictEqual(remembered.body.findings.map((f) => f.code), ['AGSC-E506']);
  assert.deepStrictEqual(page.call('remember', { body: 'x', kind: 'lesson', operator: 'human:tester', title: 'A Lesson Learned Here' })
    .body.findings, []);
  // the same default on this transport (AGSC-09-16 mirrors AGSC-09-14b).
  assert.strictEqual(remembered.body.frontmatter.severity, 'info');
  // and none on an episode, whose schema branch has no such key (AGSC-09-14b, 2026-09-24).
  const rememberedEpisode = page.call('remember', { actor: 'process:x', at: '2026-01-01T00:00:00Z', body: 'x', kind: 'episode', title: 'An Episode Here' });
  assert.strictEqual(rememberedEpisode.body.frontmatter.severity, undefined);
  // AGSC-02-09: an actor outside the grammar would make the item non-conforming.
  assert.strictEqual(page.call('remember', { actor: 'agent:x', at: '2026-01-01T00:00:00Z', body: 'x', kind: 'episode', title: 'An Episode Here' }).body.code, 'AGSC-E204');
  // AGSC-09-14b: an episode with no `at` is AGSC-E003; `usage` reaches the episode verbatim.
  assert.strictEqual(page.call('remember', { actor: 'process:x', body: 'x', kind: 'episode', title: 'No Instant' }).body.code, 'AGSC-E003');
  const usage = { cost_usd: 0.25, estimate: false, model: 'm', tokens_in: 10, tokens_out: 5 };
  const spent = page.call('remember', { actor: 'process:x', at: '2026-09-02T10:00:00Z', body: 'x', kind: 'episode', title: 'A Spend', usage });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(spent.body.frontmatter.usage)), usage);
  assert.ok(mcpTools.ARGUMENTS.remember.includes('usage'), 'the MCP manifest does not publish the usage argument');
  // AGSC-09-14b, on this transport too: no Gate, and an episode
  // names its actor — the argument both manifests publish.
  assert.strictEqual(page.call('remember', { body: 'x', kind: 'gate', title: 'A Gate Here' }).body.code, 'AGSC-E203');
  assert.strictEqual(page.call('remember', { at: '2026-01-01T00:00:00Z', body: 'x', kind: 'episode', title: 'A Run' }).body.code, 'AGSC-E003');
  const episode = page.call('remember', { actor: 'process:ci', at: '2026-01-01T00:00:00Z', body: 'x', kind: 'episode', title: 'A Run' });
  assert.strictEqual(episode.body.frontmatter.actor, 'process:ci');
  assert.ok(mcpTools.ARGUMENTS.remember.includes('actor'), 'the MCP manifest does not publish the actor argument');
  // AGSC-11-18, the WebMCP vocabulary: the hints on the writing tools.
  assert.strictEqual(surfaces.WEBMCP_ANNOTATIONS.propose.consequentialHint, true);
  assert.strictEqual(surfaces.WEBMCP_ANNOTATIONS.remember.consequentialHint, true);
  assert.strictEqual(surfaces.WEBMCP_ANNOTATIONS.search.readOnlyHint, true);
});

// -------------------------------------------------------------- the writer

test('AGSC-05-07: /pages/<slug>.md is the lint-normalized SOURCE FILE', () => {
  const { bundle, files } = built();
  for (const item of bundle.items) {
    const published = String(files.get(`/pages/${item.slug}.md`));
    assert.strictEqual(published, `${adopt.serialize(item.frontmatter)}${item.body}`,
      `/pages/${item.slug}.md is not the normalized source file`);
    const split = pageTools.pageSplitFrontmatter(published);
    assert.strictEqual(split.body, item.body, 'the body half does not round-trip');
  }
});

test('AGSC-11-16/11-19: the build DECLARES the webmcp surface it emits', () => {
  const { files } = built();
  const linkset = JSON.parse(files.get('/.well-known/knowledge-linkset'));
  const declared = linkset.linkset[0]['https://w3id.org/agentic-system-core/rel#surface'];
  const names = declared.map((l) => l['agsc-surface'][0]).sort();
  assert.deepStrictEqual(names, ['chunks', 'llms-txt', 'webmcp']);
  const webmcp = declared.find((l) => l['agsc-surface'][0] === 'webmcp');
  assert.strictEqual(webmcp.href, 'https://minimal.example/compose/');
  assert.deepStrictEqual(webmcp['agsc-access'], ['consent']);
  assert.match(webmcp['agsc-surface-version'][0], surfaces.WEBMCP_VERSION_RE);
  // AGSC-11-16: the declaration is DERIVED — a build that emits no page declares none.
  const withoutPages = site.declaredSurfaces({
    base: 'https://x.example', config: {}, emitted: ['/llms.txt'],
  });
  assert.deepStrictEqual(withoutPages.map((s) => s.surface), ['llms-txt']);
  // And the version an operator targets is an option, not a hard-coded constant.
  const targeted = site.declaredSurfaces({
    base: 'https://x.example', config: {}, emitted: ['/compose/'], webmcpVersion: '2026-09-17',
  });
  assert.deepStrictEqual(targeted, [{
    access: 'consent', surface: 'webmcp', target: 'https://x.example/compose/', version: '2026-09-17',
  }]);
});

test('AGSC-09-16: every item page loads the three shared page-tool scripts', () => {
  const { bundle, files } = built();
  for (const item of bundle.items) {
    const route = `/${item.type === 'cluster' ? 'clusters' : `${item.type}s`}/${item.slug}/index.html`;
    const page = String(files.get(route));
    for (const src of ['/compose/agsc-core.js', '/compose/agsc-page-tools.js', '/compose/webmcp.js']) {
      assert.ok(page.includes(`<script src="${src}" defer></script>`), `${route} does not load ${src}`);
    }
    // AGSC-06-17: nothing inline beyond the structured-data block the templates
    // already carry, and nothing from another origin.
    assert.strictEqual((page.match(/<script(?![^>]*(?:\bsrc=|type="application\/ld\+json"))/gu) || []).length, 0,
      `${route} carries an inline script`);
    assert.ok(!/<script src="(?:https?:)?\/\//u.test(page), `${route} loads a third-party script`);
    // AGSC-06-21: the shared files are referenced, never inlined, so the budget pays
    // for three elements.
    assert.ok(Buffer.byteLength(page, 'utf8') <= site.BUDGET_HTML_BYTES,
      `${route} is above the 100 KB page budget`);
  }
});

// --------------------------------------------- the contribution channel

test('AGSC-11-14: the edit link is derived from contribute[] and from nothing else', () => {
  const at = (target, path_) => site.contributeEditUrl({ contribute: [{ mode: 'pr', target }] }, path_);
  assert.strictEqual(at('https://github.com/a/b', 'content/concepts/x.md'),
    'https://github.com/a/b/edit/HEAD/content/concepts/x.md');
  // The `pr` target of the specification's own example names a compare view.
  assert.strictEqual(at('https://github.com/example/node/compare', 'content/concepts/x.md'),
    'https://github.com/example/node/edit/HEAD/content/concepts/x.md');
  assert.strictEqual(at('https://gitlab.com/a/b.git', 'content/lessons/y.md'),
    'https://gitlab.com/a/b/-/edit/HEAD/content/lessons/y.md');
  assert.strictEqual(at('https://codeberg.org/a/b/', 'content/gates/g.md'),
    'https://codeberg.org/a/b/_edit/HEAD/content/gates/g.md');
  // A forge whose edit view this engine cannot state is never guessed at: the link is
  // the configured contribution target, unchanged.
  assert.strictEqual(at('https://forge.example/a/b', 'content/concepts/x.md'), 'https://forge.example/a/b');
  // a host that happens to name a member of `Object.prototype` is not a
  // forge this engine states the edit view of; the lookup used to answer a FUNCTION
  // and the href carried "function Object() { [native code] }".
  for (const host of ['constructor', '__proto__', 'valueOf', 'hasOwnProperty', 'toString']) {
    assert.strictEqual(at(`https://${host}/a/b`, 'content/concepts/x.md'),
      `https://${host}/a/b`, `the host ${host} must fall through to the configured target`);
  }
  // No `pr` channel, no link — and a `channel` entry is not a repository.
  assert.strictEqual(site.contributeEditUrl({}, 'content/concepts/x.md'), null);
  assert.strictEqual(site.contributeEditUrl(
    { contribute: [{ channel: 'mail', mode: 'channel', target: 'mailto:a@b.example' }] },
    'content/concepts/x.md'), null);
});

test('AGSC-11-14: the item page carries a plain "Propose an edit" anchor, and no form', () => {
  const page = html.itemPage(
    { body: 'Body.', description: 'A description.', slug: 'x', title: 'Ex', type: 'concept' },
    { editUrl: 'https://github.com/a/b/edit/HEAD/content/concepts/x.md', render: (b) => ({ html: `<p>${b}</p>` }) },
  );
  assert.ok(page.includes('rel="noopener"'), 'the edit link carries no rel="noopener"');
  assert.ok(page.includes('aria-label="Propose an edit to Ex"'), 'the edit link has no accessible name');
  assert.ok(page.includes('>Propose an edit</a>'));
  assert.ok(!/<form/u.test(page), 'the item page carries a form');
  // AGSC-06-17 sets `form-action \'none\'`: a form could never submit anywhere.
  const without = html.itemPage(
    { body: 'Body.', slug: 'x', title: 'Ex', type: 'concept' },
    { render: (b) => ({ html: `<p>${b}</p>` }) },
  );
  assert.ok(!without.includes('Propose an edit'), 'an unconfigured node still offers an edit link');
});

test('AGSC-11-14: the discovery document carries the contribute relation', () => {
  const discovery = require('../../src/distribution/discovery.js');
  const doc = discovery.linkset({
    contribute: [{ mode: 'pr', target: 'https://github.com/a/b' }],
    site: { base: 'https://x.example' },
  }, { routes: [] });
  const relation = doc.linkset[0]['https://w3id.org/agentic-system-core/rel#contribute'];
  assert.deepStrictEqual(relation, [{ 'agsc-contribute-mode': ['pr'], href: 'https://github.com/a/b' }]);
});

test('AGSC-11-14: lint refuses a malformed contribution channel with AGSC-E209', () => {
  const codes = (config) => visibility.checkBoundaryConfig(config).map((f) => f.code);
  assert.deepStrictEqual(codes({ contribute: [{ mode: 'pr', target: 'http://a.example' }] }), ['AGSC-E209']);
  assert.deepStrictEqual(codes({ contribute: [{ mode: 'post', target: 'https://a.example' }] }), ['AGSC-E209']);
  assert.deepStrictEqual(codes({ contribute: [{ mode: 'channel', target: 'mailto:a@b.example' }] }), ['AGSC-E209']);
  assert.deepStrictEqual(codes({
    channels: [{ name: 'mail', publish: 'auto' }],
    contribute: [{ channel: 'mail', mode: 'channel', target: 'mailto:a@b.example' }],
  }), ['AGSC-E209']);
  assert.deepStrictEqual(codes({ contribute: [{ mode: 'pr', target: 'https://github.com/a/b' }] }), []);
});

// ----------------------------------------------- the edges of the page readers

test('AGSC-02-02…04: the failsafe reader covers the forms the emitted profile uses', () => {
  const read = (text) => pageTools.pageParseFrontmatter(text);
  // A literal block scalar, a folded one with the strip indicator, and both quotings.
  assert.deepStrictEqual(read('when: |\n  one\n  two\n'), { when: 'one\ntwo\n' });
  assert.deepStrictEqual(read('when: >-\n  one\n  two\n'), { when: 'one two' });
  assert.deepStrictEqual(read('a: \'it\'\'s\'\nb: "a: b"\n'), { a: "it's", b: 'a: b' });
  assert.deepStrictEqual(read('"a: b": x\n'), { 'a: b': 'x' });
  assert.deepStrictEqual(read('"a\\"b": x\n'), { 'a"b': 'x' });
  // A quote that never closes is no mapping key, and the line is skipped.
  assert.deepStrictEqual(read('"unterminated\nb: x\n'), { b: 'x' });
  assert.deepStrictEqual(read('\'q\' x\nb: x\n'), { b: 'x' });
  assert.deepStrictEqual(read('a: "x\\ty\\n"\n'), { a: 'x\ty\n' });
  // A comment, a blank line and a line that is no mapping at all are skipped, never
  // guessed at: a page never invents content.
  assert.deepStrictEqual(read('# note\n\nnonsense\na: 1\n'), { a: '1' });
  // An empty document, an empty block scalar and an empty sequence entry.
  assert.deepStrictEqual(read(''), {});
  assert.deepStrictEqual(read('a: |\n'), { a: '' });
  assert.deepStrictEqual(read('a:\n  -\n  - two\n'), { a: ['', 'two'] });
  assert.deepStrictEqual(read('a:\nb: x\n'), { a: '', b: 'x' });
  // A file with no closed frontmatter block is all body (AGSC-02-91).
  assert.deepStrictEqual(pageTools.pageSplitFrontmatter('# Title\n'), { block: '', body: '# Title\n', yamlText: '' });
  assert.deepStrictEqual(pageTools.pageSplitFrontmatter('---\nunclosed\n'),
    { block: '', body: '---\nunclosed\n', yamlText: '' });
});

test('AGSC-02-04: a typed scalar is coerced, and only in its written form', () => {
  assert.strictEqual(pageTools.pageApplyTypes('12', 'order'), 12);
  assert.strictEqual(pageTools.pageApplyTypes('0.25', 'cost_usd'), 0.25);
  assert.strictEqual(pageTools.pageApplyTypes('true', 'signature'), true);
  assert.strictEqual(pageTools.pageApplyTypes('false', 'estimate'), false);
  assert.strictEqual(pageTools.pageApplyTypes('012', 'order'), '012', 'a non-canonical integer was coerced');
  assert.strictEqual(pageTools.pageApplyTypes('yes', 'signature'), 'yes');
  assert.strictEqual(pageTools.pageApplyTypes(7, 'order'), 7);
  assert.strictEqual(pageTools.pageApplyTypes('1', 'title'), '1', 'an untyped key was coerced');
});

test('a corpus assembled from unreadable published bytes degrades, and never throws', () => {
  const corpus = pageTools.pageCorpus({
    '/.well-known/knowledge-linkset': 'not json',
    '/search.json': 'not json either',
    '/pages/a.md': '---\ntype: concept\ntitle: A\n---\n\nBody.\n',
    '/pages/b.jsonld': '{}',
    '/robots.txt': 'x',
  }, {});
  assert.strictEqual(corpus.base, '/');
  assert.strictEqual(corpus.index, null);
  assert.deepStrictEqual(corpus.items.map((i) => i.slug), ['a']);
  const toolset = pageTools.pageToolset(corpus, {});
  // AGSC-09-14a: with no index there is nothing to match, and the answer is the
  // FIXED refusal string rather than an invention.
  assert.strictEqual(toolset.call('ask', { question: 'anything' }).body, 'no answer in this memory');
  assert.deepStrictEqual(toolset.call('search', { query: 'anything' }).body.hits, []);
  assert.strictEqual(toolset.call('read', { slug: 'a' }).body.iri, '/concepts/a/');
  // An anchor the discovery document does carry is the base.
  assert.strictEqual(pageTools.pageCorpus({
    '/.well-known/knowledge-linkset': JSON.stringify({ linkset: [{ anchor: 'https://x.example/' }] }),
  }, {}).base, 'https://x.example/');
  // A toolset over nothing at all still answers the envelope.
  assert.strictEqual(pageTools.pageToolset(null, {}).call('read', { slug: 'x' }).body.code, 'AGSC-E301');
});

test('AGSC-03-06: an edge authored in both directions is one edge, and it is authored', () => {
  const items = [
    { body: '', frontmatter: { broader: ['parent'], type: 'cluster' }, path: 'content/clusters/child.md', slug: 'child', type: 'cluster' },
    { body: 'See [child](child) and [nothing](../assets/x.png) and [up](../../escape).',
      frontmatter: { narrower: ['child'], type: 'cluster' }, path: 'content/clusters/parent.md', slug: 'parent', type: 'cluster' },
  ];
  const edges = pageTools.pageEdges(items);
  const parentNarrower = edges.filter((e) => e.source === 'parent' && e.key === 'narrower');
  assert.strictEqual(parentNarrower.length, 1);
  assert.strictEqual(parentNarrower[0].computed, false, 'an authored edge was recorded as computed');
  assert.ok(edges.some((e) => e.key === 'mentions' && e.source === 'parent' && e.target === 'child'));
  // A reference that escapes the Bundle root, or names no item, produces no edge.
  assert.strictEqual(edges.filter((e) => e.key === 'mentions').length, 1);
  // A Link value naming an anchor that does not exist produces no edge either.
  assert.deepStrictEqual(pageTools.pageEdges([
    { body: '', frontmatter: { related: ['b#nope'], type: 'concept' }, path: 'content/concepts/a.md', slug: 'a', type: 'concept' },
    { body: '## Here\n', frontmatter: { type: 'concept' }, path: 'content/concepts/b.md', slug: 'b', type: 'concept' },
  ]), []);
  // And one that does exist produces both directions.
  assert.strictEqual(pageTools.pageEdges([
    { body: '', frontmatter: { related: ['b#here'], type: 'concept' }, path: 'content/concepts/a.md', slug: 'a', type: 'concept' },
    { body: '## Here\n', frontmatter: { type: 'concept' }, path: 'content/concepts/b.md', slug: 'b', type: 'concept' },
  ]).length, 2);
});

test('AGSC-05-04b: memory:// resolves for this Bundle only, and never over the network', () => {
  const { bundle, files } = built();
  const page = moduleToolset(files, bundle.config);
  const id = bundle.config.bundle.id;
  assert.strictEqual(page.call('links', { iri: `memory://${id}/concepts/handoff` }).body.slug, 'handoff');
  assert.strictEqual(page.call('links', { iri: `memory://${id}/handoff` }).body.slug, 'handoff');
  assert.strictEqual(page.call('links', { iri: 'memory://elsewhere/handoff' }).body.code, 'AGSC-E309');
  assert.strictEqual(page.call('links', { iri: 'https://other.example/concepts/handoff/' }).body.code, 'AGSC-E301');
  assert.strictEqual(page.call('links', { iri: 'https://minimal.example/handoff' }).body.code, 'AGSC-E301');
});

test('AGSC-09-14b: remember keeps a well-formed source and drops the rest', () => {
  const { bundle, files } = built();
  const page = moduleToolset(files, bundle.config);
  const kept = page.call('remember', {
    actor: 'human:andrei',
    body: 'A note.',
    kind: 'concept',
    operator: 'human:andrei',
    origin: 'human',
    sources: [{ id: 's1', resource: 'https://a.example/x' }, { id: 's2', resource: 'nonsense' }],
    title: 'A Remembered Thing',
  });
  assert.deepStrictEqual(kept.body.frontmatter.sources, [{ id: 's1', resource: 'https://a.example/x' }]);
  assert.deepStrictEqual(kept.body.findings, [{ code: 'AGSC-E506', message: 'source dropped', severity: 'warn' }]);
  assert.strictEqual(kept.body.frontmatter.prov.origin, 'human');
  assert.strictEqual(kept.body.frontmatter.actor, 'human:andrei');
  // AGSC-01-23: a title whose slug is taken takes `-2`.
  assert.strictEqual(page.call('remember', { body: 'x', kind: 'concept', title: 'Handoff' }).body.slug, 'handoff-2');
  // A kind outside the closed map is read as a Concept, because this tool never refuses.
  assert.strictEqual(page.call('remember', { body: 'x', kind: 'nonsense', title: 'Another Thing' }).body.path,
    'content/concepts/another-thing.md');
});
