'use strict';
// Conformance area `ledger` (owner:) — AGSC-08-20a, AGSC-08-20b, AGSC-08-23.
// ledger-0001 the truncated tail (the published head is not the recomputed one),
// ledger-0002 the derivation, ledger-0003 the empty history, ledger-0004 the
// production of the git-log file. A vector whose input names `published` compares a
// published ledger with its history (`ledger.compare`).

const ledger = require('../../../src/governance/ledger.js');
const { canonicalize } = require('../../../src/knowledge/jcs.js');
const { checks, deepEqual } = require('./_assert.js');

module.exports.run = (vector) => {
  const input = vector.input;
  const expected = vector.expected;
  const result = [];

  // AGSC-08-23: a PUBLISHED ledger against the recomputation of its history
  // (`input.git_log` present) or, with no history, against its published head.
  if (input.published !== undefined) {
    const derived = input.git_log === undefined ? null
      : ledger.derive(input.git_log, input.content_tree, input.version, { epoch: vector.options.source_date_epoch });
    const findings = ledger.compare(input.published, input.wellknown || null, derived);
    result.push(['code', findings.some((f) => f.code === expected.error), JSON.stringify(findings.map((f) => f.code))]);
    if (expected.line !== undefined) {
      result.push(['line', findings.some((f) => f.code === expected.error && f.line === expected.line),
        JSON.stringify(findings.map((f) => f.line))]);
    }
    return checks(result);
  }

  // Negative case: exactly one error CODE, never a message (AGSC-09-05).
  if (expected.error !== undefined) {
    const findings = ledger.verify(input.ledger, input.wellknown);
    result.push(['code', findings.some((f) => f.code === expected.error),
      JSON.stringify(findings.map((f) => f.code))]);
    return checks(result);
  }

  // AGSC-08-20b: the production of the git-log file.
  if (expected.git_log !== undefined) {
    const produced = ledger.produce(input.commits);
    result.push(['git-log file', canonicalize(produced) === canonicalize(expected.git_log),
      canonicalize(produced)]);
    if (expected.side_branch_excluded !== undefined) {
      const side = new Set(input.side_branch || []);
      const excluded = produced.every((e) => !side.has(e.sha));
      result.push(['side branch excluded', excluded === expected.side_branch_excluded,
        JSON.stringify(produced.map((e) => e.sha))]);
    }
    return checks(result);
  }

  // AGSC-08-20a: the derivation, byte for byte.
  const derived = ledger.derive(input.git_log, input.content_tree, input.version,
    { epoch: vector.options.source_date_epoch });
  result.push(['ledger bytes', derived.ledger === expected.ledger, JSON.stringify(derived.ledger)]);
  result.push(['head', derived.head === expected.head, derived.head]);
  // The derived file must verify against the head it publishes (AGSC-08-23).
  const wellknown = {
    linkset: [{
      anchor: 'https://example.org/',
      'https://w3id.org/agentic-system-core/rel#ledger': [
        { 'agsc-ledger-head': [derived.head], href: 'https://example.org/ledger.jsonl', type: 'application/jsonl' },
      ],
    }],
  };
  result.push(['the derived ledger verifies', deepEqual(ledger.verify(derived.ledger, wellknown), []),
    JSON.stringify(ledger.verify(derived.ledger, wellknown))]);

  return checks(result);
};
