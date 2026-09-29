'use strict';
// AGSC-06-02 with AGSC-05-06: `/pages/<slug>.jsonld` is "the same JSON-LD the graph
// carries, restricted to that one item", and every view of the graph expresses the
// same triples. A view built from the item alone dropped every typed Link, every
// computed inverse, every `asc:mentions` edge and a cluster's `skos:member` list,
// because a Link's target is resolved against the items the view holds. These tests
// build the minimal fixture and compare each per-item node with its node in
// `/graph.jsonld`.

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

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const BASE = 'https://minimal.example/';

/** Build a copy of the minimal fixture, after `edit(dir)` has changed it. */
function buildFixture(edit = () => {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-item-jsonld-'));
  try {
    fs.cpSync(FIXTURE, dir, { recursive: true });
    edit(dir);
    const port = createFileSystem(dir);
    const bundle = loadBundle(port, { schemas: validate.schemas(readSchemas(ROOT)) });
    const clock = createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } });
    return site.build(bundle, { clock, fs: port }, { specVersion: '1.0.0-rc.6', version: '0.0.0' });
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
}

const json = (built, route) => JSON.parse(String(built.files.get(route)));
const nodeOf = (doc, id) => doc['@graph'].find((node) => node['@id'] === id);
/** The IRIs a node states under a term, whether the context names the term or not. */
function iris(node, term) {
  const key = Object.keys(node).find((k) => k === term || k.endsWith(`#${term}`));
  const values = key === undefined ? [] : [node[key]].flat();
  return values.map((value) => (typeof value === 'string' ? value : value['@id']));
}

test('AGSC-06-02: every per-item node is the node /graph.jsonld carries for it', () => {
  const built = buildFixture();
  const whole = json(built, '/graph.jsonld');
  const routes = [...built.files.keys()].filter((route) => /^\/pages\/[^/]+\.jsonld$/u.test(route));
  assert.deepStrictEqual(routes.sort(), ['/pages/agent-patterns.jsonld', '/pages/handoff.jsonld', '/pages/supervisor.jsonld']);
  for (const route of routes) {
    const page = json(built, route);
    assert.strictEqual(page['@context'], whole['@context'], route);
    for (const node of page['@graph']) assert.deepStrictEqual(node, nodeOf(whole, node['@id']), `${route} ${node['@id']}`);
  }
});

test('AGSC-05-06: the per-item view keeps the item\'s typed Links, mentions and cluster members', () => {
  const built = buildFixture();
  const supervisor = nodeOf(json(built, '/pages/supervisor.jsonld'), `${BASE}concepts/supervisor/`);
  assert.deepStrictEqual(iris(supervisor, 'uses'), [`${BASE}concepts/handoff/`]);
  assert.deepStrictEqual(iris(supervisor, 'mentions'), [`${BASE}concepts/handoff/`]);
  const cluster = nodeOf(json(built, '/pages/agent-patterns.jsonld'), `${BASE}clusters/agent-patterns/`);
  assert.deepStrictEqual(iris(cluster, 'member'), [`${BASE}concepts/handoff/`, `${BASE}concepts/supervisor/`]);
});

test('AGSC-06-02: a Link to an item the node does not publish contributes no triple to the per-item view', () => {
  const built = buildFixture((dir) => {
    const draft = path.join(dir, 'content', 'concepts', 'unpublished.md');
    fs.writeFileSync(draft, fs.readFileSync(path.join(dir, 'content', 'concepts', 'handoff.md'), 'utf8')
      .replace('title: Handoff', 'title: Unpublished').replace('type: concept\n', 'type: concept\nstatus: draft\n'));
    const file = path.join(dir, 'content', 'concepts', 'supervisor.md');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('uses:\n  - handoff\n', 'uses:\n  - handoff\n  - unpublished\n'));
  });
  assert.ok(!built.files.has('/pages/unpublished.jsonld'), 'a draft has no per-item view');
  const text = String(built.files.get('/pages/supervisor.jsonld'));
  assert.doesNotMatch(text, /unpublished/u);
  const supervisor = nodeOf(JSON.parse(text), `${BASE}concepts/supervisor/`);
  assert.deepStrictEqual(iris(supervisor, 'uses'), [`${BASE}concepts/handoff/`]);
});
