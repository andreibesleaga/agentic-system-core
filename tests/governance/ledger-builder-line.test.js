'use strict';
// AGSC-08-20a / AGSC-08-23 (1.1): the trailing `build` entry is the fixed `process:agsc`, so every
// writer derives one ledger from one history. A ledger written under 1.0 names its builder,
// `process:agsc/<version>` (amended 2026-10-02 for 1.0.0); a 1.1 verifier accepts it as a published
// file, held to its own chain and the published head, and any other difference is still `AGSC-E702`.
//
// Deterministic: a fixed history, a fixed tree id and a fixed SOURCE_DATE_EPOCH.

const test = require('node:test');
const assert = require('node:assert/strict');

const ledger = require('../../src/governance/ledger.js');

const HISTORY = [
  { committed_at: '2026-01-01T00:00:00Z', parents: [], sha: 'a'.repeat(40), trailers: { 'Signed-off-by': 'Ana <ana@example.org>' } },
  { committed_at: '2026-01-02T00:00:00Z', parents: ['a'.repeat(40)], sha: 'b'.repeat(40), tag: 'v1.0.0', trailers: {} },
];
const TREE = 'c'.repeat(40);
const EPOCH = { epoch: 1767225600 };

const built = () => ledger.derive(HISTORY, TREE, EPOCH);

/** The ledger a 1.0 writer of `version` published: the same lines, the builder named in the last. */
function as10(version) {
  const lines = built().ledger.split('\n').filter((l) => l !== '');
  const last = JSON.parse(lines[lines.length - 1]);
  last.actor = `process:agsc/${version}`;
  last.hash = ledger.hashEntry(last.prev, last);
  lines[lines.length - 1] = JSON.stringify(last);
  return { head: last.hash, ledger: `${lines.join('\n')}\n` };
}

const wellknown = (head) => ({
  linkset: [{ anchor: 'https://a.example/', 'https://w3id.org/agentic-system-core/rel#ledger': [{ 'agsc-ledger-head': [head] }] }],
});
const codes = (findings) => findings.map((f) => f.code);

test('AGSC-08-20a: the trailing entry is process:agsc and the version of the builder changes nothing', () => {
  const lines = built().ledger.split('\n').filter((l) => l !== '').map((l) => JSON.parse(l));
  assert.equal(lines[lines.length - 1].actor, 'process:agsc');
  assert.equal(ledger.BUILD_ACTOR, 'process:agsc');
  assert.equal(ledger.derive(HISTORY, TREE, { ...EPOCH, version: '9.9.9' }).ledger, built().ledger);
});

test('AGSC-08-23: a 1.1 verifier accepts a ledger written under 1.0, which names its builder', () => {
  const published = as10('1.0.1');
  assert.notEqual(published.ledger, built().ledger);
  assert.ok(ledger.differsOnlyInBuilder(published.ledger, built().ledger));
  assert.deepEqual(ledger.compare(published.ledger, wellknown(published.head), built()), []);
});

test('AGSC-08-23: the published head must still be the published chain\'s own head', () => {
  const published = as10('1.0.0');
  assert.deepEqual(codes(ledger.compare(published.ledger, wellknown('0'.repeat(64)), built())), ['AGSC-E701']);
});

test('AGSC-08-23: a changed commit line, or a changed tree id in the build line, is still AGSC-E702', () => {
  const derived = built();
  const otherHistory = ledger.derive([{ ...HISTORY[0], sha: 'd'.repeat(40) }, HISTORY[1]], TREE, EPOCH);
  assert.ok(codes(ledger.compare(otherHistory.ledger, wellknown(otherHistory.head), derived)).includes('AGSC-E702'));
  const otherTree = ledger.derive(HISTORY, 'e'.repeat(40), EPOCH);
  assert.ok(codes(ledger.compare(otherTree.ledger, wellknown(otherTree.head), derived)).includes('AGSC-E702'));
  assert.equal(ledger.differsOnlyInBuilder(otherTree.ledger, derived.ledger), false);
});

test('AGSC-08-23: a builder name that is not a process is not accepted as the builder', () => {
  const lines = as10('1.0.0').ledger.split('\n').filter((l) => l !== '');
  const last = JSON.parse(lines[lines.length - 1]);
  last.actor = 'human:mallory';
  lines[lines.length - 1] = JSON.stringify(last);
  assert.equal(ledger.differsOnlyInBuilder(`${lines.join('\n')}\n`, built().ledger), false);
});

// AGSC-08-20a (1.1): a commit with no sign-off takes its actor from ledger.actors, by author address.
const ACTORS = { 'ada@example.org': 'human:ada' };
const commit = (extra) => ({ committed_at: '2026-01-01T00:00:00Z', parents: [], sha: 'a'.repeat(40), trailers: {}, ...extra });

test('AGSC-08-20a: the sign-off wins, then the map by author address, then human:unknown', () => {
  const actor = (c, actors) => ledger.commitActor(c, actors);
  assert.equal(actor(commit({ author_email: 'ada@example.org', trailers: { 'Signed-off-by': 'Bob <bob@example.org>' } }), ACTORS), 'human:bob');
  assert.equal(actor(commit({ author_email: 'ada@example.org' }), ACTORS), 'human:ada');
  assert.equal(actor(commit({ author_email: 'eve@example.org' }), ACTORS), 'human:unknown');
  assert.equal(actor(commit({}), ACTORS), 'human:unknown');
  // Without the map the result is the 1.0 one.
  assert.equal(actor(commit({ author_email: 'ada@example.org' }), undefined), 'human:unknown');
  assert.equal(actor(commit({ author_email: 'ada@example.org' }), null), 'human:unknown');
});

test('AGSC-08-20a: an address that names an inherited property is not in the map', () => {
  assert.equal(ledger.commitActor(commit({ author_email: 'constructor' }), ACTORS), 'human:unknown');
  assert.equal(ledger.commitActor(commit({ author_email: 'ADA@Example.org' }), ACTORS), 'human:ada', 'the look-up is on the lower-case address');
});

test('AGSC-08-20a: the address is used for the look-up only and appears in no ledger byte', () => {
  const derived = ledger.derive([commit({ author_email: 'ada@example.org' })], TREE, { ...EPOCH, actors: ACTORS });
  assert.equal(derived.ledger.includes('example.org'), false);
  assert.equal(JSON.parse(derived.ledger.split('\n')[0]).actor, 'human:ada');
});

test('AGSC-08-20b: produce keeps author_email in ASCII lower case and nothing else about it', () => {
  const [one, none] = ledger.produce([
    { sha: 'a'.repeat(40), parents: [], committer_timestamp: '2026-01-01T00:00:00Z', message: 'x\n', author_email: 'Ada@Example.ORG' },
    { sha: 'b'.repeat(40), parents: ['a'.repeat(40)], committer_timestamp: '2026-01-02T00:00:00Z', message: 'x\n' },
  ]);
  assert.equal(one.author_email, 'ada@example.org');
  assert.equal('author_email' in none, false, 'a commit with no address yields no member');
});
