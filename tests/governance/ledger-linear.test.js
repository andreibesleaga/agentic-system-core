'use strict';
// AGSC-08-20a: the ledger reads a commit's actor from its `Signed-off-by` value and
// its trailers from the message, and both reads are linear in the length of the
// message. A commit message has no size cap and reaches `build` and `ci` from any
// contributor's history, so one long trailer must not stall them.
//
// Steps are counted, not timed (tests/_linear-kit.js): a scan of the old shape needed
// about a million times the bound on these inputs.

const test = require('node:test');
const assert = require('node:assert/strict');
const ledger = require('../../src/governance/ledger.js');
const { MIB, assertLinear } = require('../_linear-kit.js');

const AT = '@';

test('the actor of a Signed-off-by value that is a 1 MiB run of "<" is read in linear steps', () => {
  const value = '<'.repeat(MIB);
  assert.equal(assertLinear('actorOf, a run of <', ledger.actorOf, value, 4), 'human:unknown');
});

test('a long run of "<" before a real address still yields the address', () => {
  const value = `${'<'.repeat(MIB)}<ada${AT}example.org>`;
  assert.equal(assertLinear('actorOf, a run of < then an address', ledger.actorOf, value, 4), 'human:ada');
  const empty = `${'<>'.repeat(MIB / 2)}<ada${AT}example.org>`;
  assert.equal(assertLinear('actorOf, empty brackets then an address', ledger.actorOf, empty, 4), 'human:ada');
});

test('a trailer block of many distinct keys is parsed in linear steps', () => {
  const lines = [];
  for (let i = 0; lines.length * 12 < MIB; i += 1) lines.push(`K${i}: v`);
  const message = `subject\n\n${lines.join('\n')}\n`;
  const parsed = assertLinear('parseTrailers, distinct keys', ledger.parseTrailers, message, 4);
  assert.equal(Object.keys(parsed).length, lines.length);
  assert.equal(parsed.K0, 'v');
});

test('the ledger derived from a commit with a hostile trailer names an unknown actor', () => {
  const message = `hostile\n\nSigned-off-by: ${'<'.repeat(MIB)}\n`;
  const log = ledger.produce([{
    sha: 'a'.repeat(40), parents: [], committer_timestamp: '2026-01-01T00:00:00Z', message, tags: [],
  }]);
  const derived = ledger.derive(log, 'b'.repeat(40), { epoch: 1767225600 });
  assert.equal(derived.entries[0].actor, 'human:unknown');
  assert.equal(derived.entries[0].kind, 'commit');
});
