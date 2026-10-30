'use strict';
// AGSC-09-14b and AGSC-09-16 from 1.1: `remember` answers the same on the two
// transports for the cases the rule names — the slug of a title with punctuation or
// letters outside ASCII, the order in which two faults are reported, the `id` of a
// `sources[]` entry, and a call that declares an operator alone under the default
// `ai-generated` origin (the two AGSC-E202 of AGSC-08-01 in `findings`).
//
// The page tools run as the emitted script runs them (a `node:vm` context over the
// build's own published bytes); the local server is the stdio server's tool set over the
// same Bundle. Deterministic: a fixed clock, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const site = require('../../src/distribution/site.js');
const { tools } = require('../../src/distribution/mcp-tools.js');
const slugs = require('../../src/knowledge/slug.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const OPERATOR = 'human:someone';

/** Both transports over the fixture Bundle: `{local, page}`, each with `.call(name, args)`. */
function transports() {
  const fs = createFileSystem(FIXTURE);
  const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(ROOT)) });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } });
  const built = site.build(bundle, { clock, fs }, { specVersion: '1.0.0', version: '0.0.2' });
  const sources = {};
  for (const [route, text] of built.files) sources[route] = String(text);
  const context = vm.createContext({ TextEncoder });
  vm.runInContext(String(built.files.get('/compose/agsc-core.js')), context);
  vm.runInContext(String(built.files.get('/compose/agsc-page-tools.js')), context);
  const api = vm.runInContext('globalThis.AGSC_PAGE_TOOLS', context);
  const core = vm.runInContext('globalThis.AGSC_CORE', context);
  const page = api.pageToolset(api.pageCorpus(sources, { bundleId: api.BUNDLE_ID }), core);
  return { local: tools(bundle, {}), page };
}

/** A value out of the vm realm, as a consumer receives it. */
const plain = (value) => JSON.parse(JSON.stringify(value));

/** The same call on both transports; the two answers must be equal as values. */
function both(args) {
  const { local, page } = transports();
  const a = plain(local.call('remember', args));
  const b = plain(page.call('remember', args));
  assert.deepEqual(b, a, `the transports differ for ${JSON.stringify(args)}`);
  return a;
}

const base = { body: 'x', kind: 'concept', operator: OPERATOR };

test('AGSC-09-14b: the slug of a title is the AGSC-02-91 slug on both transports', () => {
  const titles = ['Hello, World!', 'foo.bar baz', 'Café au lait', 'Ünïcode — dash', '  spaced   out  ',
    'x'.repeat(70), `${'ab '.repeat(30)}end`, 'İstanbul Notes', '日本語のタイトル', 'Version 2.0 (final)'];
  for (const title of titles) {
    const answer = both({ ...base, title });
    assert.equal(answer.type, 'proposal', title);
    assert.equal(answer.body.slug, slugs.slugify(title), `slug of ${JSON.stringify(title)}`);
    assert.ok(slugs.isValid(answer.body.slug), answer.body.slug);
  }
});

test('AGSC-09-14b: a slug already taken gets the -2 suffix inside the 64 code points on both transports', () => {
  const answer = both({ ...base, title: 'Handoff' });
  assert.equal(answer.body.slug, 'handoff-2');
  const long = 'a'.repeat(64);
  assert.equal(both({ ...base, title: long }).body.slug, long);
});

test('AGSC-09-14b: an unknown kind is reported before a malformed actor, on both transports', () => {
  for (const kind of ['constructor', 'story', '__proto__']) {
    const answer = both({ ...base, actor: 'not a valid actor', kind, title: 'A Plain Note' });
    assert.equal(answer.type, 'error', kind);
    assert.equal(answer.body.code, 'AGSC-E203', kind);
  }
  // The kind that is a Gate is refused before the actor too.
  assert.equal(both({ ...base, actor: 'nope', kind: 'gate', title: 'A Plain Note' }).body.code, 'AGSC-E203');
  // A known kind with a malformed actor still reports the actor.
  assert.equal(both({ ...base, actor: 'nope nope', title: 'A Plain Note' }).body.code, 'AGSC-E204');
  // An episode without its actor, then without its instant.
  assert.equal(both({ ...base, kind: 'episode', title: 'A Plain Note' }).body.code, 'AGSC-E003');
  assert.equal(both({ ...base, actor: 'process:x', kind: 'episode', title: 'A Plain Note' }).body.code, 'AGSC-E003');
});

test('AGSC-09-14b: the id of a sources[] entry is held to its bound and one-line form', () => {
  const resource = 'https://example.org/a';
  const base = { agent: 'writer', body: 'x', kind: 'concept', model: 'm-1', operator: OPERATOR };
  const dropped = [5, '', 'two\nlines', 'x'.repeat(201), ['a'], { a: 1 }, 'tab\there'];
  for (const id of dropped) {
    const answer = both({ ...base, sources: [{ id, resource }], title: 'A Plain Note' });
    assert.equal(answer.type, 'proposal', JSON.stringify(id));
    assert.equal(answer.body.frontmatter.sources, undefined, `${JSON.stringify(id)} was kept`);
    assert.deepEqual(answer.body.findings.map((f) => f.code), ['AGSC-E506'], JSON.stringify(id));
  }
  const kept = both({ ...base, sources: [{ id: 'x'.repeat(200), resource }, { resource: `${resource}2` }], title: 'A Plain Note' });
  assert.deepEqual(kept.body.frontmatter.sources, [{ id: 'x'.repeat(200), resource }, { resource: `${resource}2` }]);
  assert.deepEqual(kept.body.findings, []);
});

test('AGSC-09-14b: an operator alone under the default origin is answered with the two AGSC-E202', () => {
  const alone = both({ ...base, title: 'A Plain Note' });
  assert.equal(alone.type, 'proposal');
  assert.deepEqual(alone.body.findings.map((f) => f.code), ['AGSC-E202', 'AGSC-E202']);
  assert.deepEqual(alone.body.findings.map((f) => f.severity), ['error', 'error']);
  assert.ok(alone.body.findings[0].message.includes('agent'));
  assert.ok(alone.body.findings[1].message.includes('model'));
  // The one missing member is the one named.
  const noModel = both({ ...base, agent: 'writer', title: 'A Plain Note' });
  assert.deepEqual(noModel.body.findings.map((f) => f.code), ['AGSC-E202']);
  assert.ok(noModel.body.findings[0].message.includes('model'));
  // Both given, or a human origin: nothing to report.
  assert.deepEqual(both({ ...base, agent: 'writer', model: 'm-1', title: 'A Plain Note' }).body.findings, []);
  assert.deepEqual(both({ ...base, origin: 'human', title: 'A Plain Note' }).body.findings, []);
});

test('AGSC-09-16: with no operator the page returns the item and says so; the local server refuses', () => {
  const { local, page } = transports();
  const args = { body: 'x', kind: 'concept', title: 'A Plain Note' };
  assert.equal(plain(local.call('remember', args)).body.code, 'AGSC-E003');
  const answer = plain(page.call('remember', args));
  assert.equal(answer.type, 'proposal');
  assert.deepEqual(answer.body.findings.map((f) => f.code), ['AGSC-E506', 'AGSC-E202', 'AGSC-E202']);
});
