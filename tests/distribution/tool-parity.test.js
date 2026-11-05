'use strict';
// verifies AGSC-09-13, AGSC-09-16
// One tool contract over two transports, for the ten tools of 1.1: every call of the
// committed call list (`bench/corpus/parity-calls.json`, which covers the ten tools) is asked
// of the real `agsc mcp` process over standard input and output, of the emitted page script
// in a fresh `vm` context with Web Crypto (so the page's `brief` takes the promise path a
// browser takes), of the page-tools module and of the in-process server, and the answers are
// compared as values (bench/parity.js). Over a Bundle that holds more than 100 matching
// items, the bound of `search` and `ask` is the same on both transports.
//
// Deterministic: fixed SOURCE_DATE_EPOCH (bench/parity.js), scratch Bundles under the system
// temporary directory, removed afterwards; no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const parity = require('../../bench/parity.js');
const { TOOL_NAMES } = require('../../src/boundary/surfaces.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const SPEC = JSON.parse(fs.readFileSync(path.join(ROOT, 'bench', 'corpus', 'parity-calls.json'), 'utf8'));

const scratch = [];
test.after(() => {
  for (const dir of scratch) fs.rmSync(dir, { force: true, recursive: true });
});

/** A copy of the minimal fixture with `files` (Bundle-relative path -> text) written over it. */
function bundleWith(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-tool-parity-'));
  scratch.push(dir);
  fs.cpSync(FIXTURE, dir, { recursive: true });
  for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), text);
  return dir;
}

const concept = (slug, lines, body) => [`content/concepts/${slug}.md`,
  ['---', `title: ${slug}`, 'type: concept', 'kind: explainer', ...lines, '---', '', body, ''].join('\n')];

test('AGSC-09-16: the ten tools answer as values alike on both transports, a draft hidden from the page', async () => {
  const dir = bundleWith(Object.fromEntries([
    concept('draft-note', ['status: draft', 'description: A draft about the handoff.', 'related: [handoff]'], 'A draft.'),
    concept('old-handoff', ['description: An older handoff.', 'related: [handoff]'], '## Intent\n\nThe old way.'),
    concept('new-handoff', ['description: The newer handoff.', 'supersedes: [old-handoff]', 'requires: [old-handoff]'], 'The new way.'),
  ]));
  const r = await parity.run(dir, SPEC);
  for (const name of TOOL_NAMES) assert.ok(r.per_tool[name] && r.per_tool[name].calls > 0, `the call list does not reach ${name}`);
  assert.deepEqual(r.differing, [], JSON.stringify(r.differing));
  assert.equal(r.stdio_exit, 0);
  assert.equal(r.stdio_stderr_bytes, 0);
  assert.equal(r.unpublished_answered_e301, r.unpublished_calls);
  assert.equal(r.required_difference.every((d) => d.tool === 'remember'), true);
  // The added items give `check` and `explain` something to find on every host.
  assert.equal(r.answer_types.findings > 0 && r.answer_types.explanation > 0 && r.answer_types.brief > 0, true,
    JSON.stringify(r.answer_types));
});

test('AGSC-09-13: the bound on search and ask is the same on both transports', async () => {
  const many = {};
  for (let n = 1; n <= 120; n += 1) {
    const [file, text] = concept(`w-${String(n).padStart(3, '0')}`, ['description: A widget of the shop.'], 'A widget.');
    many[file] = text;
  }
  const dir = bundleWith(many);
  const spec = {
    calls: [['search', { query: 'widget' }], ['ask', { question: 'widget' }], ['search', { query: 'handoff' }]],
    per_item: [],
  };
  const r = await parity.run(dir, spec);
  assert.deepEqual(r.differing, [], JSON.stringify(r.differing));
  assert.equal(r.equal, 3);
  const hosts = parity.inProcess(dir, {});
  const local = hosts.local.call('search', { query: 'widget' });
  assert.equal(local.body.hits.length, 100);
  assert.equal(local.body.total, 120);
  assert.equal(local.body.hits[99].slug, 'w-100');
  assert.deepEqual(JSON.parse(JSON.stringify(hosts.page.call('search', { query: 'widget' }))), JSON.parse(JSON.stringify(local)));
  assert.ok(hosts.local.call('ask', { question: 'widget' }).citations.length <= 100);
  // At or under the bound the body has the members of 1.0 only.
  assert.deepEqual(Object.keys(hosts.local.call('search', { query: 'handoff' }).body), ['hits']);
});
