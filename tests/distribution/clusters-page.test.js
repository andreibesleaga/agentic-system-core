'use strict';
// Requirement: PRD-077 (docs/PRD.md).
// verifies AGSC-06-38, AGSC-06-01, AGSC-06-17, AGSC-06-21
// The `/clusters/` page of a build (src/distribution/clusters-page.js): below the list of
// clusters, the overview of how they connect with its relation filter, the legend of the
// fourteen keys, and the explorer, which only its script shows. The page loads two
// same-origin files of its own, `/clusters/agsc-explorer.css` and
// `/clusters/agsc-explorer.js`; no other page loads them, and no route is added.
// Whole builds of the minimal fixture and of a small Bundle; deterministic.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const site = require('../../src/distribution/site.js');
const clustersPage = require('../../src/distribution/clusters-page.js');
const explorer = require('../../src/distribution/explorer/page.js');
const graphView = require('../../src/distribution/graph-view.js');
const { explorerGraph } = require('../../src/distribution/explorer/graph-data.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');

function build(options = {}) {
  const port = createFileSystem(FIXTURE);
  const bundle = loadBundle(port, { schemas: validate.schemas(readSchemas(ROOT)) });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } });
  return site.build(bundle, { clock, fs: port }, { specVersion: '1.0.0', version: '0.0.0', ...options });
}

test('/clusters/ carries the list, the overview, the legend and the explorer, in that order', () => {
  const page = String(build().files.get('/clusters/index.html'));
  const main = page.slice(page.indexOf('<main'), page.indexOf('</main>'));
  const at = (text) => main.indexOf(text);
  assert.ok(at('<a href="/clusters/agent-patterns/">Agent patterns</a>') > 0);
  assert.ok(at('<a href="/clusters/agent-patterns/">') < at('<h2 id="overview">'), 'the list comes first');
  assert.ok(at('<h2 id="overview">') < at('<h2 id="legend">'));
  assert.ok(at('<h2 id="legend">') < at('<section id="explorer"'));
  // One cluster: no relation between two clusters, said in a sentence.
  assert.match(main, /No relation joins the members of two different clusters/u);
  assert.match(main, /<section id="explorer" class="explorer" aria-labelledby="explorer-heading" hidden>/u);
  assert.match(main, /<script src="\/clusters\/agsc-explorer\.js" defer><\/script>/u);
  assert.match(page, /<link rel="stylesheet" href="\/assets\/site\.css">\n<link rel="stylesheet" href="\/clusters\/agsc-explorer\.css">/u,
    'the page\'s own stylesheet comes right after the theme, so it can build on it');
  // AGSC-06-17: no inline style, no inline script, no handler.
  assert.doesNotMatch(main, /style=|<script>|<script(?![^>]*\ssrc=)|\son[a-z]+=/u);
});

test('the two files are emitted, and only /clusters/ loads them', () => {
  const { files } = build();
  assert.strictEqual(String(files.get(explorer.STYLESHEET_ROUTE)), explorer.stylesheet());
  const script = String(files.get(explorer.SCRIPT_ROUTE));
  assert.match(script, /^'use strict';\n/u);
  assert.match(script, /spec_version: 1\.0\.0/u);
  for (const [route, bytes] of files) {
    if (!route.endsWith('.html') || route === '/clusters/index.html') continue;
    assert.ok(!String(bytes).includes('agsc-explorer'), `${route} loads the explorer`);
  }
});


test('without a graph view there is no explorer, and the overview and the legend stay', () => {
  const built = build({ graph: null });
  assert.ok(!built.files.has(explorer.SCRIPT_ROUTE));
  assert.ok(built.files.has(explorer.STYLESHEET_ROUTE), 'the relation filter still needs its rules');
  const page = String(built.files.get('/clusters/index.html'));
  assert.doesNotMatch(page, /id="explorer"|agsc-explorer\.js/u);
  assert.match(page, /<h2 id="legend">/u);
});

test('a later page of a long /clusters/ list carries the list only', () => {
  const k = { slug: 'k', title: 'Kilo', type: 'cluster' };
  const view = clustersPage.view({ contextObject: null, graphEmitted: true, items: [k], specVersion: '1.1.0', views: graphView.index([k], () => '/clusters/k/') });
  const page = { description: 'Every published cluster of this node.', entries: [{ href: '/clusters/k/', title: 'Kilo' }], title: 'Clusters' };
  const later = view.render(page, { route: '/clusters/page-2/' });
  assert.doesNotMatch(later, /id="overview"|id="legend"|id="explorer"|agsc-explorer/u);
  assert.match(view.render(page, { route: '/clusters/' }), /id="legend"/u);
});

test('the overview on a built node: a relation across two clusters is a row of the filtered table', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-clusters-page-'));
  try {
    fs.cpSync(FIXTURE, dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'content', 'clusters', 'protocols.md'), ['---', 'type: cluster', 'title: Protocols',
      'description: How agents and their tools talk to each other across a network.', 'date: 2026-01-01', 'prov:', '  origin: human', '  operator: human:andreibesleaga', '---', '', 'Protocols.', ''].join('\n'));
    const mcp = ['---', 'type: concept', 'kind: pattern', 'title: Model Context Protocol', 'description: A protocol through which an agent reaches the tools a host offers.',
      'date: 2026-01-01', 'clusters:', '  - protocols', 'prov:', '  origin: human', '  operator: human:andreibesleaga', '---', '', 'MCP.', ''];
    fs.writeFileSync(path.join(dir, 'content', 'concepts', 'mcp.md'), mcp.join('\n'));
    const handoff = fs.readFileSync(path.join(dir, 'content', 'concepts', 'handoff.md'), 'utf8');
    fs.writeFileSync(path.join(dir, 'content', 'concepts', 'handoff.md'), handoff.replace('---\n', '---\nuses:\n  - mcp\n'));
    const port = createFileSystem(dir);
    const bundle = loadBundle(port, { schemas: validate.schemas(readSchemas(ROOT)) });
    const clock = createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } });
    const built = site.build(bundle, { clock, fs: port }, { specVersion: '1.0.0', version: '0.0.0' });
    assert.deepStrictEqual(built.findings.filter((f) => f.severity === 'error'), []);
    const page = String(built.files.get('/clusters/index.html'));
    assert.match(page, /<tr data-relation="uses"><td><a href="\/clusters\/agent-patterns\/">Agent patterns<\/a><\/td><td>uses<\/td><td><a href="\/clusters\/protocols\/">Protocols<\/a><\/td><td>1<\/td>/u);
    assert.match(page, /id="relation-filter-uses"/u);
    assert.ok(Buffer.byteLength(page) <= site.BUDGET_HTML_BYTES);
    // The script reads each key under the member name the node's own graph.jsonld uses:
    // the explorer, run over the built graph with the terms the build gave it, finds the link.
    const context = JSON.parse(String(built.files.get('/ns/context.jsonld')));
    const relations = explorer.relationTerms(context);
    assert.ok(String(built.files.get(explorer.SCRIPT_ROUTE)).includes(`RELATIONS: ${JSON.stringify(relations.map((r) => ({ key: r.key, symmetric: r.symmetric, term: r.term })))}`));
    const graph = explorerGraph(JSON.parse(String(built.files.get('/graph.jsonld'))), relations, explorer.MAX_NODES);
    const named = (id) => graph.nodes.find((n) => n.id === id).label;
    assert.ok(graph.links.some((l) => l.key === 'uses' && named(l.source) === 'Handoff' && named(l.target) === 'Model Context Protocol'),
      JSON.stringify(graph.links));
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});
