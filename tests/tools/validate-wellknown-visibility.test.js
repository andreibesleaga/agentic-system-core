'use strict';
// tests/tools/validate-wellknown-visibility.test.js — AGSC-11-20 and AGSC-00-23 in
// the independent checker of AGSC-09-93.
//
// Until rc.6 this tool knew nothing about visibility: it required every `agsc-*`
// attribute at Level ≥ 2 and reported nothing when a gated node published the four
// AGSC-11-20 forbids it to. A validator that cannot tell a conforming restricted
// node from a leaking one is not checking the rule that matters most there.
//
// Driven as an operator drives it — a real process over a real file — so the
// envelope and the exit code are what is asserted, not an internal. No network.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { describe, it } = require('node:test');

const { REPO, tmpdir } = require('./helpers');

const REL = 'https://w3id.org/agentic-system-core/rel#';
const BASE = 'https://example.org/';
const DIGEST = 'sha-256=:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=:';

/** A Level-2 document that passes, as the starting point for each case. */
function document(over) {
  const describedby = {
    'agsc-bundle-hash': [DIGEST],
    'agsc-bundle-version': ['v1.4.0'],
    'agsc-counts': ['clusters=0', 'concepts=1', 'episodes=0', 'gates=0', 'lessons=0', 'procedures=0'],
    'agsc-generated-at': ['2026-09-16T00:00:00Z'],
    'agsc-spec-version': ['1.0.0-rc.6'],
    digest: [DIGEST],
    href: `${BASE}graph.jsonld`,
    type: 'application/ld+json',
    ...(over || {}),
  };
  for (const key of Object.keys(describedby)) {
    if (describedby[key] === null) delete describedby[key];
  }
  return {
    linkset: [{
      anchor: BASE,
      describedby: [describedby],
      license: [{ href: `${BASE}legal/` }],
    }],
  };
}

/** Run the checker over one document and return its envelope. */
function check(doc) {
  const dir = tmpdir();
  fs.mkdirSync(path.join(dir, '.well-known'), { recursive: true });
  const at = path.join(dir, '.well-known', 'knowledge-linkset');
  fs.writeFileSync(at, `${JSON.stringify(doc)}\n`);
  const run = spawnSync(process.execPath,
    [path.join(REPO, 'tools', 'validate-wellknown'), at, '--level', '2', '--json'],
    { encoding: 'utf8' });
  const envelope = JSON.parse(run.stdout.split('\n').filter(Boolean).pop());
  return { codes: envelope.findings.map((f) => f.code), envelope, status: run.status };
}

/** The findings that are about this rule, not about a scratch directory. */
const mine = (result, pattern) => result.envelope.findings.filter((f) => pattern.test(f.message));

describe('validate-wellknown: visibility and version (rc.6)', () => {
  it('AGSC-11-20: a restricted node publishing the four content facts is AGSC-E210', () => {
    const result = check(document({ 'agsc-visibility': ['restricted'] }));
    const leaks = mine(result, /a restricted node must omit/u);
    assert.deepEqual(leaks.map((f) => f.code), ['AGSC-E210', 'AGSC-E210', 'AGSC-E210']);
    for (const name of ['agsc-bundle-hash', 'agsc-bundle-version', 'agsc-counts']) {
      assert.ok(leaks.some((f) => f.message.includes(name)), `${name} was not reported`);
    }
    assert.equal(result.status, 1);
  });

  it('AGSC-11-20: the same node WITHOUT them is accepted, absences and all', () => {
    const result = check(document({
      'agsc-bundle-hash': null,
      'agsc-bundle-version': null,
      'agsc-counts': null,
      'agsc-visibility': ['restricted'],
    }));
    // The four absences are exactly what AGSC-06-08a would otherwise require, and
    // the checker must accept them here rather than demand them.
    assert.deepEqual(mine(result, /is required at Level ≥ 2/u), []);
    assert.deepEqual(mine(result, /a restricted node must omit/u), []);
  });

  it('a restricted node publishes no rel#ledger link', () => {
    // `agsc-ledger-head` rides on the `rel#ledger` link and not on the anchor, so
    // the rule is enforced where the value actually is: a gated node that carries
    // the LINK is already reported, and the head cannot be published without it.
    const base = document({
      'agsc-bundle-hash': null, 'agsc-bundle-version': null, 'agsc-counts': null,
      'agsc-visibility': ['restricted'],
    });
    const context = base.linkset[0];
    // The link context's members are ordered as JSON member names (AGSC-04-05), so
    // the ledger relation is inserted in its place rather than appended.
    base.linkset[0] = {
      anchor: context.anchor,
      describedby: context.describedby,
      [`${REL}ledger`]: [{
        'agsc-ledger-head': ['a'.repeat(64)], digest: [DIGEST], href: `${BASE}ledger.jsonl`,
      }],
      license: context.license,
    };
    const result = check(base);
    assert.deepEqual(mine(result, /publishes no rel#ledger link/u).map((f) => f.code), ['AGSC-E210']);
    // And the required-attribute check does not then demand the head back.
    assert.deepEqual(mine(result, /is required at Level ≥ 2/u), []);
  });

  it('AGSC-06-08a: a PUBLIC node still has to carry all five, the new one included', () => {
    const result = check(document({ 'agsc-bundle-version': null }));
    const missing = mine(result, /agsc-bundle-version is required at Level ≥ 2/u);
    assert.deepEqual(missing.map((f) => f.code), ['AGSC-E202']);
  });

  it('AGSC-04-25: a value outside the grammar is AGSC-E204, and one value only', () => {
    assert.deepEqual(
      mine(check(document({ 'agsc-bundle-version': ['v2.0/final'] })), /outside the grammar/u)
        .map((f) => f.code), ['AGSC-E204'],
    );
    assert.deepEqual(
      mine(check(document({ 'agsc-bundle-version': ['v1.4.0', 'v1.5.0'] })), /carries exactly one value/u)
        .map((f) => f.code), ['AGSC-E210'],
    );
  });

  it('AGSC-00-23: publishing a member the node\'s own declared version does not define', () => {
    const result = check(document({ 'agsc-spec-version': ['2.0.0'] }));
    const said = mine(result, /which does not define it/u);
    assert.deepEqual(said.map((f) => f.code), ['AGSC-E210']);
    // The conforming case says nothing.
    assert.deepEqual(mine(check(document()), /which does not define it/u), []);
  });
});
