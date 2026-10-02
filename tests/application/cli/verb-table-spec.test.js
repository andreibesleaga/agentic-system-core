'use strict';
// AGSC-09-07 (amended 2026-10-02 for 1.0.0) carries the table of what each verb takes and
// does. This test holds it to the engine: the same sixteen verbs, the positional arguments
// of each verb's own usage line, and the six `compose --emit` target names.
//
// Deterministic: reads files of this repository only.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { VERBS, VERB_USAGE } = require('../../../src/application/cli/main.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const SPEC = fs.readFileSync(path.join(ROOT, 'spec', '09-conformance.md'), 'utf8');

function rows() {
  const out = new Map();
  // Exactly three cells: the verb table's shape (the tool table of AGSC-09-13 has four).
  for (const m of SPEC.matchAll(/^\s*\| `([a-z]+)` \| ([^|]*) \| ([^|]*) \|\s*$/gmu)) {
    if (VERBS.includes(m[1])) out.set(m[1], { args: m[2], does: m[3] });
  }
  return out;
}

test('AGSC-09-07: the table lists exactly the sixteen verbs', () => {
  assert.deepEqual([...rows().keys()].sort(), [...VERBS].sort());
});

test('AGSC-09-07: every positional argument of a verb\'s usage line is in its row, and no other', () => {
  for (const [verb, row] of rows()) {
    // A flag and its value (with any `[,<value>…]` repetition) are not positional arguments.
    const usage = VERB_USAGE[verb].replace(/--[a-z-]+(?: <[^>]+>(?:\[,<[^>]+>…\])?)?/gu, '');
    const fromUsage = new Set([...usage.matchAll(/<([a-z.-]+)>/gu)].map((m) => m[1]));
    const fromRow = new Set([...row.args.matchAll(/<([a-z.-]+)>/gu)].map((m) => m[1]));
    assert.deepEqual([...fromRow].sort(), [...fromUsage].sort(), verb);
  }
});

test('AGSC-07-18 / AGSC-09-07: the six compose --emit names are the engine\'s', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src', 'application', 'cli', 'verbs', 'compose.js'), 'utf8');
  const engine = JSON.parse(`[${/const EMITTERS = Object\.freeze\(\[([\s\S]*?)\]\)/u.exec(source)[1].replace(/'/gu, '"')}]`);
  const row = rows().get('compose').does;
  const named = [...row.matchAll(/`([a-z][a-z0-9-]*)`/gu)].map((m) => m[1]);
  assert.deepEqual(named.sort(), [...engine].sort());
});
