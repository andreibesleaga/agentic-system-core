'use strict';
// AGSC-08-20a/20b, AGSC-08-21, AGSC-08-22 and AGSC-08-23 beyond ledger-0001…0004:
// the trailer grammar, the instant rendering without a clock, and the two ways the
// chain can be broken.

const test = require('node:test');
const assert = require('node:assert');
const ledger = require('../../src/governance/ledger.js');

const HEAD_OF = (head) => ({
  linkset: [{
    anchor: 'https://a.example/',
    'https://w3id.org/agentic-system-core/rel#ledger': [{ 'agsc-ledger-head': [head], href: 'https://a.example/ledger.jsonl' }],
  }],
});

test('the instant is rendered from an integer, with no clock (AGSC-04-10)', () => {
  assert.strictEqual(ledger.instantFromEpoch(0), '1970-01-01T00:00:00Z');
  assert.strictEqual(ledger.instantFromEpoch(1767225600), '2026-01-01T00:00:00Z');
  assert.strictEqual(ledger.instantFromEpoch(1709164800), '2024-02-29T00:00:00Z');
  for (const value of [0, 1, 951782400, 1767225600, 4102444800]) {
    assert.strictEqual(ledger.epochFromInstant(ledger.instantFromEpoch(value)), value);
  }
});

test('the trailer block is the LAST contiguous run, last occurrence winning (AGSC-08-20b)', () => {
  const trailers = ledger.parseTrailers('Subject\n\nProse: not a trailer block, it has prose.\n\nKey: one\nkey: two\nOther: a\n  continued\n');
  assert.deepStrictEqual({ ...trailers }, { key: 'two', Other: 'a continued' });
  assert.strictEqual(Object.getPrototypeOf(trailers), null, 'a commit message must not reach Object.prototype');
});

test('a message whose last paragraph is prose has no trailers', () => {
  assert.deepStrictEqual({ ...ledger.parseTrailers('Subject\n\nJust prose.\n') }, {});
});

test('kind is release, then merge, then commit (AGSC-08-20a)', () => {
  const log = [
    { sha: 'a'.repeat(40), committed_at: '2026-01-01T00:00:00Z', parents: [], trailers: {} },
    { sha: 'b'.repeat(40), committed_at: '2026-01-02T00:00:00Z', parents: ['x', 'y'], trailers: {} },
    { sha: 'c'.repeat(40), committed_at: '2026-01-03T00:00:00Z', parents: ['b'], trailers: { Proposal: '1' } },
    { sha: 'd'.repeat(40), committed_at: '2026-01-04T00:00:00Z', parents: ['c'], tag: 'v1.0.0', trailers: { 'Channel-Auto': 'telegram' } },
  ];
  const { entries } = ledger.derive(log, 'e'.repeat(40), '0.1.0', { epoch: 1767225600 });
  assert.deepStrictEqual(entries.map((e) => e.kind), ['commit', 'merge', 'merge', 'release', 'build']);
  // AGSC-08-21: `mode: auto` rides on a release when the tagged commit is itself an auto merge.
  assert.strictEqual(entries[3].mode, 'auto');
  assert.strictEqual(entries[0].actor, 'human:unknown');
});

test('a truncated tail and a rewritten line are both reported (AGSC-08-23)', () => {
  const log = [{ sha: 'a'.repeat(40), committed_at: '2026-01-01T00:00:00Z', parents: [], trailers: {} }];
  const { ledger: text, head } = ledger.derive(log, 'e'.repeat(40), '0.1.0', { epoch: 1767225600 });
  assert.deepStrictEqual(ledger.verify(text, HEAD_OF(head)), []);
  const truncated = `${text.split('\n')[0]}\n`;
  assert.deepStrictEqual(ledger.verify(truncated, HEAD_OF(head)).map((f) => f.code), ['AGSC-E701']);
  const rewritten = text.replace('"kind":"commit"', '"kind":"merge"');
  assert.deepStrictEqual(ledger.verify(rewritten, HEAD_OF(head)).map((f) => f.code), ['AGSC-E701']);
  assert.deepStrictEqual(ledger.verify('not json\n', HEAD_OF(head)).map((f) => f.code), ['AGSC-E702']);
});

test('the genesis prev is 64 zeros and every hash is 64 lowercase hex (AGSC-08-22)', () => {
  const { entries } = ledger.derive([], 'e'.repeat(40), '0.1.0', { epoch: 0 });
  assert.strictEqual(entries[0].prev, ledger.GENESIS);
  assert.match(entries[0].hash, /^[0-9a-f]{64}$/u);
  assert.strictEqual(entries[0].actor, 'process:agsc/0.1.0');
});

test('the greatest v* tag wins and a non-version tag is ignored (AGSC-08-20b)', () => {
  const [produced] = ledger.produce([{
    sha: 'a'.repeat(40), parents: [], committer_timestamp: '2026-01-01T00:00:00Z',
    message: 'x\n\nSigned-off-by: A <a@example.org>\n', tags: ['v1.0.0', 'v1.0.10', 'v1.0.2', 'release'],
  }]);
  assert.strictEqual(produced.tag, 'v1.0.2', 'tags sort by CODE POINT, not by semantic version');
});

test('a reserved kind and unknown members still verify (AGSC-08-21)', () => {
  const entry = { actor: 'human:a', kind: 'refresh', prev: ledger.GENESIS, ref: 'x', ts: '2026-01-01T00:00:00Z', future: 1 };
  entry.hash = ledger.hashEntry(ledger.GENESIS, entry);
  const { canonicalize } = require('../../src/knowledge/jcs.js');
  assert.deepStrictEqual(ledger.verify(`${canonicalize(entry)}\n`, {}), []);
});

test('publishedHead reads the attribute in either serialisation, else null', () => {
  assert.strictEqual(ledger.publishedHead(undefined), null);
  assert.strictEqual(ledger.publishedHead({ linkset: [{ anchor: 'x' }] }), null);
  assert.strictEqual(ledger.publishedHead(HEAD_OF('abc')), 'abc');
  assert.strictEqual(ledger.publishedHead({
    linkset: [{ 'https://w3id.org/agentic-system-core/rel#ledger': [{ 'agsc-ledger-head': 'abc' }] }],
  }), 'abc');
});

test('an actor with no e-mail, and one with no usable local part, are human:unknown', () => {
  assert.strictEqual(ledger.actorOf(undefined), 'human:unknown');
  assert.strictEqual(ledger.actorOf('Nobody'), 'human:unknown');
  assert.strictEqual(ledger.actorOf('A <a@example.org>'), 'human:a');
});

test('a committer timestamp that is not an AGSC-04-10 instant is kept verbatim', () => {
  const [produced] = ledger.produce([{ sha: 'a', parents: [], committer_timestamp: '2026-01-01 00:00 +0200', message: 'x', tags: [] }]);
  assert.strictEqual(produced.committed_at, '2026-01-01 00:00 +0200');
  assert.ok(!('tag' in produced));
  assert.deepStrictEqual(ledger.produce(undefined), []);
});

test('a broken prev link is reported before any hash is recomputed (AGSC-08-23)', () => {
  const { canonicalize } = require('../../src/knowledge/jcs.js');
  const first = { actor: 'human:a', kind: 'commit', prev: ledger.GENESIS, ref: 'r1', ts: '2026-01-01T00:00:00Z' };
  first.hash = ledger.hashEntry(first.prev, first);
  const second = { actor: 'human:a', kind: 'commit', prev: 'f'.repeat(64), ref: 'r2', ts: '2026-01-02T00:00:00Z' };
  second.hash = ledger.hashEntry(second.prev, second);
  const text = `${canonicalize(first)}\n${canonicalize(second)}\n`;
  const findings = ledger.verify(text, {});
  assert.deepStrictEqual(findings.map((f) => [f.code, f.line]), [['AGSC-E701', 2]]);
});
