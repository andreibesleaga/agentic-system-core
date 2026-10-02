'use strict';
// AGSC-08-20a / AGSC-08-23 (amended 2026-10-02 for 1.0.0): the ledger's trailing `build`
// entry names its builder, `process:agsc/<version>`, so a verifier at another version
// re-derives that one line differently. A published ledger that differs from the
// recomputation in that entry's `actor` alone is held to its own chain and the published
// head; any other difference is still `AGSC-E702`.
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

const built = (version) => ledger.derive(HISTORY, TREE, version, EPOCH);
const wellknown = (head) => ({
  linkset: [{ anchor: 'https://a.example/', 'https://w3id.org/agentic-system-core/rel#ledger': [{ 'agsc-ledger-head': [head] }] }],
});
const codes = (findings) => findings.map((f) => f.code);

test('AGSC-08-20a: two versions of one implementation differ in the trailing line only', () => {
  const a = built('1.0.0').ledger.split('\n');
  const b = built('1.0.1').ledger.split('\n');
  assert.equal(a.length, b.length);
  assert.deepEqual(a.slice(0, -2), b.slice(0, -2), 'the per-commit lines are the same');
  assert.notEqual(a[a.length - 2], b[b.length - 2], 'the trailing build line names its builder');
  assert.ok(ledger.differsOnlyInBuilder(built('1.0.0').ledger, built('1.0.1').ledger));
});

test('AGSC-08-23: a verifier at another version accepts a ledger that differs only in the builder', () => {
  const published = built('1.0.0');
  assert.deepEqual(ledger.compare(published.ledger, wellknown(published.head), built('1.0.1')), []);
});

test('AGSC-08-23: the published head must still be the published chain\'s own head', () => {
  const published = built('1.0.0');
  assert.deepEqual(codes(ledger.compare(published.ledger, wellknown('0'.repeat(64)), built('1.0.1'))), ['AGSC-E701']);
});

test('AGSC-08-23: a changed commit line, or a changed tree id in the build line, is still AGSC-E702', () => {
  const derived = built('1.0.1');
  const otherHistory = ledger.derive([{ ...HISTORY[0], sha: 'd'.repeat(40) }, HISTORY[1]], TREE, '1.0.0', EPOCH);
  assert.ok(codes(ledger.compare(otherHistory.ledger, wellknown(otherHistory.head), derived)).includes('AGSC-E702'));
  const otherTree = ledger.derive(HISTORY, 'e'.repeat(40), '1.0.0', EPOCH);
  assert.ok(codes(ledger.compare(otherTree.ledger, wellknown(otherTree.head), derived)).includes('AGSC-E702'));
  assert.equal(ledger.differsOnlyInBuilder(otherTree.ledger, derived.ledger), false);
});

test('AGSC-08-23: a builder name that is not a process is not accepted as the builder', () => {
  const derived = built('1.0.1');
  const lines = built('1.0.0').ledger.split('\n').filter((l) => l !== '');
  const last = JSON.parse(lines[lines.length - 1]);
  last.actor = 'human:mallory';
  lines[lines.length - 1] = JSON.stringify(last);
  assert.equal(ledger.differsOnlyInBuilder(`${lines.join('\n')}\n`, derived.ledger), false);
});
