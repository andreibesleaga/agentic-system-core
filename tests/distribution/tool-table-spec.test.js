'use strict';
// AGSC-09-13 (amended 2026-10-02 for 1.0.0) carries the tool table: each tool's arguments,
// the required ones in bold, and the `type` of a success. This test holds the table to the
// tool server's own argument lists and to the type each tool actually returns on the
// minimal fixture, so that the text and the engine cannot drift apart.
//
// Deterministic: fixed SOURCE_DATE_EPOCH, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const tools = require('../../src/distribution/mcp-tools.js');

const ROOT = path.join(__dirname, '..', '..');

function table() {
  const text = fs.readFileSync(path.join(ROOT, 'spec', '09-conformance.md'), 'utf8');
  const out = new Map();
  for (const m of text.matchAll(/^\s*\| `([a-z]+)` \| (.*?) \| `([a-z]+)` \|/gmu)) {
    const args = [...m[2].matchAll(/(\*\*)?`([a-z_]+)`/gu)].map((a) => ({ name: a[2], required: a[1] === '**' }));
    out.set(m[1], { args, type: m[3] });
  }
  return out;
}

test('AGSC-09-13: the table names the seven tools with exactly the tool server\'s arguments', () => {
  const rows = table();
  assert.deepEqual([...rows.keys()].sort(), ['ask', 'compose', 'links', 'propose', 'read', 'remember', 'search']);
  for (const [name, row] of rows) {
    assert.deepEqual(row.args.map((a) => a.name).sort(), [...tools.ARGUMENTS[name]].sort(), name);
    assert.deepEqual(row.args.filter((a) => a.required).map((a) => a.name).sort(), [...tools.REQUIRED_ARGUMENTS[name]].sort(), `${name} required`);
  }
});

test('AGSC-09-13: each tool returns the type the table gives', () => {
  process.env.SOURCE_DATE_EPOCH = '1767225600';
  const { inProcess } = require('../../bench/parity.js');
  const host = inProcess(path.join(ROOT, 'tests', 'fixtures', 'minimal'), {});
  const calls = {
    ask: { question: 'what is a handoff' },
    compose: { selection: ['supervisor'] },
    links: { slug: 'handoff' },
    propose: { slug: 'handoff' },
    read: { slug: 'handoff' },
    remember: { body: 'A note.', kind: 'lesson', operator: 'human:someone', title: 'A Lesson Learned Here' },
    search: { query: 'agent' },
  };
  for (const [name, row] of table()) assert.equal(host.local.call(name, calls[name]).type, row.type, name);
});
