'use strict';
// AGSC-04-01 / AGSC-04-02: the build is a function of the Bundle and
// `SOURCE_DATE_EPOCH` alone. Two builds of the fixture produce identical bytes, and
// the route set is the one AGSC-06-01 names. No network, no wall clock: the clock
// is fixed at 2026-01-01T00:00:00Z and nothing here reaches outside the repository.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const site = require('../../src/distribution/site.js');
const ci = require('../../src/distribution/ci.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
/** 2026-01-01T00:00:00Z — the fixed instant of `tests/fixtures/minimal/README.md`. */
const EPOCH = '1767225600';

function load() {
  const fs = createFileSystem(FIXTURE);
  const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(ROOT)) });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } });
  return { bundle, ports: { fs, clock }, options: { specVersion: '1.0.0-rc.4', version: '0.0.2' } };
}

test('the fixture builds twice to identical bytes (AGSC-04-02)', () => {
  const { bundle, ports, options } = load();
  const first = site.build(bundle, ports, options);
  const second = site.build(bundle, ports, options);
  assert.deepStrictEqual([...first.files.keys()], [...second.files.keys()],
    'the route set differs between two builds');
  for (const [route, bytes] of first.files) {
    assert.strictEqual(bytes, second.files.get(route), `${route} differs between two builds`);
  }
  assert.deepStrictEqual(site.verify(bundle, ports, options), [],
    'verify reported a non-reproducible build');
});

test('the route set carries the machine artefacts of AGSC-06-01', () => {
  const { bundle, ports, options } = load();
  const { files } = site.build(bundle, ports, options);
  for (const route of ['/llms.txt', '/llms-full.txt', '/search.json', '/chunks.jsonl',
    '/graph.jsonld', '/graph.nq', '/graph.ttl', '/ns/context.jsonld', '/now.md',
    '/sitemap.xml', '/robots.txt', '/.well-known/tdmrep.json', '/.well-known/security.txt',
    '/.well-known/knowledge-linkset', '/_headers', '/_redirects', '/404.html']) {
    assert.ok(files.has(route), `${route} is missing from the build`);
  }
  // AGSC-06-02: every published item carries its two machine views.
  for (const item of bundle.items) {
    assert.ok(files.has(`/pages/${item.slug}.md`), `/pages/${item.slug}.md is missing`);
  }
  // AGSC-10-13: the fixture holds no task, so nothing is emitted under /boards/.
  assert.ok(![...files.keys()].some((r) => r.startsWith('/boards/')),
    'a Bundle with no task emitted a board');
});

test('every emitted JSON artefact is JCS-canonical with one trailing LF (AGSC-04-04)', () => {
  const { bundle, ports, options } = load();
  const { files } = site.build(bundle, ports, options);
  const { canonicalize } = require('../../src/knowledge/jcs.js');
  for (const [route, bytes] of files) {
    if (!route.endsWith('.json') && route !== '/.well-known/knowledge-linkset') continue;
    assert.ok(bytes.endsWith('\n') && !bytes.endsWith('\n\n'), `${route} has no single trailing LF`);
    assert.strictEqual(`${canonicalize(JSON.parse(bytes))}\n`, bytes, `${route} is not JCS-canonical`);
  }
});

test('a Level-0 emission omits every artefact AGSC-10-02 does not ask for', () => {
  const { bundle, ports, options } = load();
  const { files } = site.build(bundle, ports, { ...options, level: 0 });
  for (const route of ['/.well-known/knowledge-linkset', '/graph.jsonld', '/llms.txt']) {
    assert.ok(files.has(route), `${route} is a Level-0 artefact and must be emitted`);
  }
  for (const route of ['/chunks.jsonl', '/graph.nq', '/graph.ttl', '/ns/context.jsonld', '/now.md']) {
    assert.ok(!files.has(route), `${route} is a Level-≥2 artefact and must not be emitted at Level 0`);
  }
});

test('ci runs lint, build and verify and exits 0 on the fixture (AGSC-09-08)', () => {
  const { bundle, ports, options } = load();
  const result = ci.ci(bundle, ports, options);
  // AGSC-08-12 added the `forge` lane after `verify`; a Bundle whose gate items
  // enforce nothing compiles nothing and the lane says so.
  assert.deepStrictEqual(result.lanes.map((l) => l.split(' ')[0]), ['lint', 'build', 'verify', 'forge']);
  assert.strictEqual(result.counts.error, 0,
    `errors: ${JSON.stringify(result.findings.filter((f) => f.severity !== 'warn'))}`);
  assert.strictEqual(result.exit, 0);
});

test('a lint lane may be injected and its findings reach the exit code', () => {
  const { bundle, ports, options } = load();
  const result = ci.ci(bundle, ports, {
    ...options,
    lint: () => [{ code: 'AGSC-E403', col: 1, file: 'x.md', line: 1, message: 'a secret', severity: 'error' }],
  });
  assert.strictEqual(result.exit, 1);
  assert.strictEqual(result.counts.error, 1);
});

test('write() maps routes onto the FileSystem port without a leading slash', () => {
  const { bundle, ports, options } = load();
  const { files } = site.build(bundle, ports, options);
  const written = [];
  const fake = { fs: { mkdirp: () => {}, writeFile: (p) => written.push(p) } };
  site.write(files, fake);
  assert.ok(written.every((p) => !p.startsWith('/')), 'a written path kept its leading slash');
  assert.ok(written.includes('llms.txt'));
  assert.ok(written.includes('.well-known/knowledge-linkset'));
});

test('a ledger is emitted when a git-log file is supplied, and published in the linkset', () => {
  const { bundle, ports, options } = load();
  const gitLog = [{ sha: 'a'.repeat(40), committed_at: '2026-01-01T00:00:00Z', parents: [], trailers: {} }];
  const { files, ledgerHead } = site.build(bundle, ports, { ...options, gitLog, contentTree: 'b'.repeat(40) });
  assert.ok(files.has('/ledger.jsonl'));
  const doc = JSON.parse(files.get('/.well-known/knowledge-linkset'));
  const link = doc.linkset[0]['https://w3id.org/agentic-system-core/rel#ledger'][0];
  assert.deepStrictEqual(link['agsc-ledger-head'], [ledgerHead]);
  assert.ok(Array.isArray(link.digest), 'the ledger link carries no digest at Level ≥ 2');
});

test('switching off the RDF views and the renderer names them in `skipped`', () => {
  const { bundle, ports, options } = load();
  const built = site.build(bundle, ports, { ...options, graph: null, render: null });
  // Every route this build did not produce is NAMED — the switched-off
  // collaborators AND the AGSC-06-01 routes no module produces yet
  // (site.UNPRODUCED_ROUTES). Silence is never a pass.
  for (const fragment of ['the RDF views were switched off', '/pages/<slug>.jsonld',
    'the Markdown renderer was switched off', '/ledger.jsonl']) {
    assert.ok(built.skipped.some((s) => s.includes(fragment)), `${fragment} is not named in skipped`);
  }
  for (const [route] of site.UNPRODUCED_ROUTES) {
    assert.ok(built.skipped.some((s) => s.startsWith(route)), `${route} is not named in skipped`);
  }
  assert.ok(!built.files.has('/graph.jsonld'));
  assert.ok(![...built.files.keys()].some((r) => r.endsWith('index.html') || r === '/404.html'));
});

test('AGSC-06-01: the index, tag and search routes are emitted (AGSC-06-02 both item views)', () => {
  const { bundle, ports, options } = load();
  const { files } = site.build(bundle, ports, options);
  for (const route of ['/index.html', '/concepts/index.html', '/clusters/index.html',
    '/search/index.html', '/tags/agents/index.html', '/tags/patterns/index.html',
    '/pages/supervisor.md', '/pages/supervisor.jsonld']) {
    assert.ok(files.has(route), `${route} is missing from the build`);
  }
});

test('AGSC-06-21: an index route of more than 500 entries is paginated from page-2', () => {
  const entries = Array.from({ length: 501 }, (_, i) => ({ href: `/concepts/c${i}/`, title: `c${i}` }));
  const pages = site.paginate('/concepts/', entries);
  assert.deepStrictEqual(pages.map((p) => p.route), ['/concepts/', '/concepts/page-2/']);
  assert.deepStrictEqual(pages.map((p) => p.entries.length), [500, 1]);
  // At or below the bound there is exactly one page, and it IS the route.
  assert.deepStrictEqual(site.paginate('/concepts/', entries.slice(0, 500)).map((p) => p.route), ['/concepts/']);
});

test('a board is emitted only when the Bundle holds a task (AGSC-10-13)', () => {
  const { bundle, ports, options } = load();
  const withTask = {
    ...bundle,
    items: [...bundle.items, {
      path: 'content/concepts/t.md', slug: 't', type: 'concept', body: '',
      frontmatter: { type: 'concept', kind: 'task', title: 'T', task_state: 'TASK_STATE_WORKING', clusters: ['agent-patterns'] },
    }],
  };
  const { files } = site.build(withTask, ports, options);
  assert.ok(files.has('/boards/index.json'));
  assert.ok(files.has('/boards/agent-patterns.json'));
  assert.strictEqual(JSON.parse(files.get('/boards/agent-patterns.json')).done, false);
});

test('a non-reproducible build is AGSC-E602 (AGSC-04-02)', () => {
  const { bundle, ports, options } = load();
  let call = 0;
  // A renderer that changes between two runs is the fault AGSC-E602 names; it can
  // only be produced deliberately, because everything in the build is a function.
  const result = ci.ci(bundle, ports, {
    ...options,
    render: (body) => { call += 1; return { html: `<p>${call}${body.length}</p>`, headings: [], anchors: [] }; },
  });
  assert.ok(result.findings.some((f) => f.code === 'AGSC-E602'), 'AGSC-E602 was not reported');
  assert.strictEqual(result.exit, 1);
});

test('verify() names the differing route, not only the fact (AGSC-04-02)', () => {
  const { bundle, ports, options } = load();
  let call = 0;
  const findings = site.verify(bundle, ports, {
    ...options,
    render: (body) => { call += 1; return { html: `<p>${call}${body.length}</p>`, headings: [], anchors: [] }; },
  });
  assert.ok(findings.length > 0);
  assert.ok(findings.every((f) => f.code === 'AGSC-E602' && f.file.endsWith('index.html')),
    JSON.stringify(findings.map((f) => f.file)));
});

// F27-08: AGSC-06-19 has two halves and only `sitemap.xml` was implemented. The
// Schema.org JSON-LD was emitted nowhere, named in no `skipped` entry, and both
// module headers cited the rule as implemented.
test('AGSC-06-19: item and index pages embed Schema.org JSON-LD', () => {
  const { bundle, ports, options } = load();
  const built = site.build(bundle, ports, options);
  const blocks = new Map();
  for (const [route, bytes] of built.files) {
    if (!route.endsWith('index.html')) continue;
    const m = /<script type="application\/ld\+json">(.*?)<\/script>/su.exec(bytes);
    if (m) blocks.set(route, JSON.parse(m[1]));
  }
  const types = new Map([...blocks].map(([route, value]) => [route, value['@type']]));
  assert.strictEqual(types.get('/index.html'), 'Dataset', 'the Bundle index is a Dataset');
  assert.strictEqual(types.get('/concepts/index.html'), 'Dataset');
  assert.strictEqual(types.get('/concepts/handoff/index.html'), 'DefinedTerm', 'a concept item is a DefinedTerm');
  assert.strictEqual(types.get('/clusters/agent-patterns/index.html'), 'TechArticle',
    'every other item is a TechArticle');
  // Exactly the three types AGSC-06-19 names, and no fourth.
  assert.deepStrictEqual([...new Set(types.values())].sort(), ['Dataset', 'DefinedTerm', 'TechArticle']);
  for (const [route, value] of blocks) {
    assert.strictEqual(value['@context'], 'https://schema.org', route);
    assert.strictEqual(typeof value.url, 'string', route);
    assert.ok(value.url.startsWith('https://'), route);
  }
  // Every item page and every index page carries one — none is silently missing.
  for (const route of built.files.keys()) {
    if (!route.endsWith('index.html')) continue;
    // AGSC-06-19 names ITEM and INDEX pages. `/compose/` is a tool surface and
    // `/legal/` is the Content Use Terms text; neither is an item and neither is an
    // index, so neither carries a `TechArticle`, a `DefinedTerm` or a `Dataset`.
    if (['/about/index.html', '/compose/index.html', '/legal/index.html',
      '/now/index.html', '/search/index.html'].includes(route)) continue;
    assert.ok(blocks.has(route), `${route} carries no AGSC-06-19 JSON-LD`);
  }
  assert.ok(![...built.skipped || []].some((s) => /06-19/u.test(String(s))),
    'AGSC-06-19 is implemented, so it is not in skipped');
});

test('AGSC-06-05: a hostile title cannot close the JSON-LD script element', () => {
  const { bundle, ports, options } = load();
  const hostile = { ...bundle, items: bundle.items.map((i, n) => (n === 0
    ? { ...i, title: '</script><script>alert(1)</script>' }
    : i)) };
  const built = site.build(hostile, ports, options);
  for (const [route, bytes] of built.files) {
    if (!route.endsWith('index.html')) continue;
    const block = /<script type="application\/ld\+json">(.*?)<\/script>/su.exec(bytes);
    if (block) assert.ok(!/<script>/u.test(block[1]), `${route} let a raw script element into the JSON-LD`);
    assert.ok(!/<script>alert\(1\)<\/script>/u.test(bytes), `${route} rendered a raw script element`);
  }
});
