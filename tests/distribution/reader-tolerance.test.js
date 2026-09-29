'use strict';
// AGSC-00-21 with AGSC-06-29: a 1.x reader ignores a member it does not know in a
// published JSON or JSONL artefact written by a later MINOR — the search index and
// its shards, a board, the skills index, a ledger line — and never fails on it. These
// tests hand the engine's own readers such artefacts, with one unknown member at every
// level, and assert that they read exactly what they read without it.
// Deterministic: no clock, no network.

const test = require('node:test');
const assert = require('node:assert');
const { createHash } = require('node:crypto');

const pageTools = require('../../src/distribution/page-tools.js');
const skills = require('../../src/composition/skills.js');
const search = require('../../src/distribution/search.js');

const plain = (value) => JSON.parse(JSON.stringify(value));

/** The same object with an unknown member added at every object level. */
function withUnknown(value) {
  if (Array.isArray(value)) return value.map(withUnknown);
  if (value === null || typeof value !== 'object') return value;
  const out = { later_member: { added: 'by a newer MINOR' } };
  for (const [key, member] of Object.entries(value)) out[key] = withUnknown(member);
  return out;
}

test('AGSC-00-21: the page reads a search index carrying unknown members exactly as without them', () => {
  const index = search.index([
    { description: 'Hands work over.', slug: 'handoff', title: 'Handoff', type: 'concept' },
    { description: 'Routes work.', slug: 'supervisor', title: 'Supervisor', type: 'concept' },
  ]);
  const known = pageTools.pageIndexOf({ '/search.json': JSON.stringify(index) });
  const later = pageTools.pageIndexOf({ '/search.json': JSON.stringify({ ...index, later_member: [1, 2] }) });
  assert.deepStrictEqual(plain(later.docs), plain(known.docs));
  assert.deepStrictEqual(plain(later.terms), plain(known.terms));
  // A shard manifest with an unknown member still names only its shard routes.
  assert.deepStrictEqual(pageTools.pageShardRoutes({ docs_total: 2, later_member: true, shards: ['/search-00.json'] }),
    ['/search-00.json']);
});

test('AGSC-00-21: a board with unknown members still yields every claimant', () => {
  const board = { cluster: 'delivery', tasks: [{ claimed_by: 'human:ada', slug: 'ship', state: 'doing' }] };
  const read = (value) => plain(pageTools.pageClaimants({ '/boards/delivery.json': JSON.stringify(value) }));
  assert.deepStrictEqual(read(withUnknown(board)), read(board));
  assert.deepStrictEqual(read(withUnknown(board)), { ship: 'human:ada' });
});

test('AGSC-00-21: the skills index is installed the same with unknown members', () => {
  const text = '---\nname: delivery\n---\n\nBody.\n';
  const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
  const index = { packs: [{ lock: { 'SKILL.md': sha256(text) }, name: 'delivery' }] };
  const run = (value) => skills.install(value, { 'delivery/SKILL.md': text }, {}, { sha256, target: 'skills' });
  const known = run(index);
  const later = run(withUnknown(index));
  assert.deepStrictEqual(plain(later), plain(known));
  assert.deepStrictEqual(later.writes.map((w) => w.path), ['skills/delivery/SKILL.md']);
  assert.ok(later.findings.every((f) => f.severity !== 'error'));
});
