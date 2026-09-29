'use strict';
// A cluster page lists its PUBLISHED members, and every page carries exactly one <h1>
// (AGSC-06-20's WCAG 2.2 AA semantics): a body that opens with its own "# Title"
// repeating the page title does not add a second one.

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

function build() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-clusters-'));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  // A draft that names the cluster: it has no route, so it is never listed.
  fs.writeFileSync(path.join(dir, 'content', 'concepts', 'unfinished.md'), [
    '---', 'type: concept', 'title: Unfinished', 'description: A draft that names the cluster and must not be listed.',
    'status: draft', 'clusters:', '  - agent-patterns', 'date: "2026-01-01"', 'prov:', '  origin: human',
    '  operator: human:andreibesleaga', '---', '', 'Not yet.', '',
  ].join('\n'));
  const port = createFileSystem(dir);
  const bundle = loadBundle(port, { schemas: validate.schemas(readSchemas(ROOT)) });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } });
  const built = site.build(bundle, { clock, fs: port }, { specVersion: '1.0.0-rc.6', version: '0.0.0' });
  fs.rmSync(dir, { force: true, recursive: true });
  return built.files;
}

test('a cluster page lists every published member, linked, with its description; drafts never', () => {
  const page = String(build().get('/clusters/agent-patterns/index.html'));
  assert.match(page, /<h2 id="members">Members<\/h2>/u);
  assert.match(page, /<li><a href="\/concepts\/handoff\/">Handoff<\/a>: The transfer of control/u);
  assert.match(page, /<li><a href="\/concepts\/supervisor\/">Supervisor<\/a>/u);
  assert.ok(page.indexOf('/concepts/handoff/') < page.indexOf('/concepts/supervisor/'), 'members in slug order');
  assert.doesNotMatch(page, /Unfinished|\/concepts\/unfinished\//u);
});

test('the /clusters/ index shows each cluster\'s published-member count', () => {
  const page = String(build().get('/clusters/index.html'));
  assert.match(page, /<a href="\/clusters\/agent-patterns\/">Agent patterns<\/a> \(2 items\)/u);
});

test('every HTML page carries exactly one <h1>', () => {
  for (const [route, bytes] of build()) {
    if (!route.endsWith('.html')) continue;
    const count = (String(bytes).match(/<h1[\s>]/gu) || []).length;
    assert.strictEqual(count, 1, `${route} has ${count} <h1>`);
  }
});

test('item pages carry the Summary block and the metadata list of AgenticSystemCore.com', () => {
  const files = build();
  const page = String(files.get('/concepts/handoff/index.html'));
  assert.match(page, /<h1>Handoff<\/h1>\n<p class="summary"><strong>Summary<\/strong>The transfer of control/u);
  assert.match(page, /<dl class="meta">\n<dt>Type<\/dt><dd>concept · kind <code>pattern<\/code><\/dd>/u);
  assert.match(page, /<dt>Cluster<\/dt><dd><a href="\/clusters\/agent-patterns\/">Agent patterns<\/a><\/dd>/u);
  assert.match(page, /<dt>IRI<\/dt><dd><code>https:\/\/minimal\.example\/concepts\/handoff\/<\/code><\/dd>/u);
  assert.match(page, /<dt>Provenance<\/dt><dd>Written by a person \(origin <code>human<\/code>, operator <code>human:andreibesleaga<\/code>\)<\/dd>/u);
  // Index pages carry their own description as the Summary.
  assert.match(String(files.get('/clusters/index.html')), /<p class="summary"><strong>Summary<\/strong>Every published cluster of this node\.<\/p>/u);
  assert.match(String(files.get('/clusters/index.html')), /<h1>Clusters<\/h1>/u);
});

test('a cluster page lists at most 500 members and says where the complete membership is', () => {
  // A cluster of 1,000 members listed in full measured 158 KB, over the 100 KB page
  // budget of AGSC-06-21, and an item page is never paginated: the list stops at the
  // bound every other list uses, and the page names the index and the graph.
  assert.strictEqual(site.CLUSTER_MEMBERS_SHOWN, 500);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-clusters-big-'));
  require('../../bench/gen-bundle.js').run(['--items', '501', '--out', dir], { err: () => {}, out: () => {} });
  const port = createFileSystem(dir);
  const bundle = loadBundle(port, { schemas: validate.schemas(readSchemas(ROOT)) });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } });
  const built = site.build(bundle, { clock, fs: port }, { specVersion: '1.0.0-rc.6', version: '0.0.0' });
  fs.rmSync(dir, { force: true, recursive: true });
  assert.deepStrictEqual(built.findings.filter((f) => f.severity === 'error'), []);
  const page = String(built.files.get('/clusters/bench-cluster/index.html'));
  const list = page.slice(page.indexOf('<ul class="members">'), page.indexOf('</ul>', page.indexOf('<ul class="members">')));
  assert.strictEqual((list.match(/<li><a href="\/concepts\//gu) || []).length, 500);
  assert.match(page, /<p class="members-more">The first 500 of 501 members are listed, in the published order; every member names this cluster in <a href="\/search\.json">the search index<\/a> and in <a href="\/graph\.jsonld">the graph<\/a>\.<\/p>/u);
  assert.ok(Buffer.byteLength(page) <= site.BUDGET_HTML_BYTES, `${Buffer.byteLength(page)} bytes`);
  assert.match(String(built.files.get('/clusters/index.html')), /\(501 items\)/u);
  // A small cluster carries no such note.
  assert.doesNotMatch(String(build().get('/clusters/agent-patterns/index.html')), /members-more/u);
});
