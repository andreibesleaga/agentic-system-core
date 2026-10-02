'use strict';
// AGSC-06-08 (amended 2026-10-02 for 1.0.0): the rule's table names every link the
// discovery document carries, when it is present, and which links carry `digest`. These
// tests hold the reference writer (`distribution/discovery.js#linkset`) to that table,
// and check on a real build that every digest the table asks for is the SHA-256 of the
// bytes the node serves at that route.
//
// Deterministic: fixed build instant, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const site = require('../../src/distribution/site.js');
const discovery = require('../../src/distribution/discovery.js');

const ROOT = path.resolve(__dirname, '..', '..');
const SPEC = fs.readFileSync(path.join(ROOT, 'spec', '06-surfaces.md'), 'utf8');
const BASE = 'https://a.example';

/** The table of AGSC-06-08: [{ relation, routes, digest }], `routes` empty for a target that is not a route. */
function specTable() {
  const start = SPEC.indexOf('| Relation | Target | Present when | `digest` |');
  assert.ok(start >= 0, 'the link table of AGSC-06-08 was not found');
  const lines = SPEC.slice(start).split('\n');
  const rows = [];
  for (const line of lines.slice(2)) {
    if (!/^\s*\|/u.test(line)) break;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    const relation = (/^`([^`]+)`$/u.exec(cells[0]) || [])[1];
    if (relation === undefined) continue; // the related-system row names no one relation
    const full = relation.startsWith('rel#') ? `${discovery.REL}${relation.slice(4)}` : relation;
    const routes = [...cells[1].matchAll(/`(\/[^`]*)`/gu)].map((m) => m[1]);
    rows.push({ digest: cells[3] === 'yes', relation: full, routes });
  }
  return rows;
}

const ROUTES = ['/graph.jsonld', '/llms.txt', '/legal/', '/specs/', '/graph.nq', '/graph.ttl', '/ns/context.jsonld',
  '/ns/agsc.ttl', '/now.md', '/skills/index.json', '/boards/index.json', '/ledger.jsonl'];

/** A Level-2 link set with every optional link of the table present. */
function everything(visibility) {
  const digests = {};
  for (const route of ROUTES) digests[route] = discovery.digestOf(route);
  const config = {
    access: `${BASE}/access/`,
    contribute: [{ mode: 'pull-request', target: 'https://forge.example/a/pulls' }],
    peers: ['https://b.example/.well-known/knowledge-linkset'],
    site: { base: BASE },
    visibility,
  };
  return discovery.linkset(config, {
    bundleHash: digests['/graph.nq'], bundleVersion: 'v1', counts: ['concepts=1'], digests,
    generatedAt: '2026-01-01T00:00:00Z', ledgerHead: '0'.repeat(64), level: 2, routes: ROUTES,
    specVersion: '1.0.0', successor: 'https://c.example/.well-known/knowledge-linkset',
    surfaces: [{ surface: 'mcp', target: `${BASE}/specs/mcp/`, version: '2025-11-25' }],
  }).linkset[0];
}

test('AGSC-06-08: every route-targeted row of the table is a link the writer emits, with a digest exactly where the table says', () => {
  const context = everything('public');
  const rows = specTable();
  assert.ok(rows.length >= 15, `${rows.length} rows`);
  for (const row of rows) {
    const links = context[row.relation] || [];
    for (const route of row.routes) {
      const one = links.find((l) => l.href === `${BASE}${route}`);
      assert.ok(one, `${row.relation} -> ${route} is not emitted`);
      assert.equal(one.digest !== undefined, row.digest, `${row.relation} -> ${route}: digest ${row.digest ? 'missing' : 'present'}`);
    }
    if (row.routes.length === 0) {
      for (const one of links.filter((l) => !l.href.startsWith(BASE))) {
        assert.equal(one.digest, undefined, `${row.relation} -> ${one.href} carries a digest the table does not ask for`);
      }
    }
  }
});

test('AGSC-06-08: the writer emits no relation the table does not name', () => {
  const named = new Set(specTable().map((r) => r.relation));
  for (const relation of Object.keys(everything('public'))) {
    if (relation === 'anchor') continue;
    assert.ok(named.has(relation), `${relation} is emitted but not in the table`);
  }
});

test('AGSC-06-08 / AGSC-11-20: a restricted node digests only describedby and /llms.txt, and publishes no ledger link', () => {
  const context = everything('restricted');
  for (const [relation, links] of Object.entries(context)) {
    if (relation === 'anchor') continue;
    for (const one of links) {
      const open = one.href === `${BASE}/graph.jsonld` || one.href === `${BASE}/llms.txt`;
      assert.equal(one.digest !== undefined, open, `${relation} -> ${one.href}`);
    }
  }
  assert.equal(context[`${discovery.REL}ledger`], undefined);
});

test('AGSC-06-08: on a real build every digest the table asks for is the SHA-256 of the served bytes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-link-table-'));
  let files;
  try {
    fs.cpSync(path.join(ROOT, 'tests', 'fixtures', 'minimal'), dir, { recursive: true });
    const port = createFileSystem(dir);
    const bundle = loadBundle(port, { schemas: validate.schemas(readSchemas(ROOT)) });
    const clock = createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } });
    files = site.build(bundle, { clock, fs: port }, { specVersion: '1.0.0', version: '0.0.0' }).files;
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
  const context = JSON.parse(String(files.get(discovery.WELLKNOWN_PATH))).linkset[0];
  const base = context.anchor.replace(/\/$/u, '');
  let checked = 0;
  for (const row of specTable().filter((r) => r.digest)) {
    for (const one of context[row.relation] || []) {
      const route = one.href.slice(base.length);
      if (!files.has(route)) continue;
      assert.deepEqual(one.digest, [discovery.digestOf(files.get(route))], `${row.relation} -> ${route}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 5, `only ${checked} digests checked`);
});
