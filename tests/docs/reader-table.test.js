'use strict';
// tests/docs/reader-table.test.js — README.md and docs/START-HERE.md both open with the
// same reader table ("Who it is for, what you get, try it"). Each is a front door, so
// both keep it; this test keeps the two in step: the same readers in the same order,
// and the same "What you get today" cell for each reader. The "Try it" cells may
// differ (the README links to GitHub, START-HERE to its neighbours).
//
// Deterministic: reads two files; no clock, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

/** The rows of the first table whose header starts with "| Reader |": [reader, what you get]. */
function readerRows(rel) {
  const lines = fs.readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8').split('\n');
  const start = lines.findIndex((line) => /^\| Reader \| What you get today \|/u.test(line));
  assert.ok(start >= 0, `${rel} has no "| Reader | What you get today |" table`);
  const rows = [];
  for (let i = start + 2; i < lines.length && lines[i].startsWith('|'); i += 1) {
    const cells = lines[i].split('|').map((c) => c.trim());
    rows.push([cells[1], cells[2]]);
  }
  return rows;
}

test('README.md and docs/START-HERE.md carry the same reader table (readers and what they get)', () => {
  const readme = readerRows('README.md');
  const startHere = readerRows('docs/START-HERE.md');
  assert.ok(readme.length >= 10, `README.md reader table has only ${readme.length} rows`);
  assert.deepEqual(startHere.map((r) => r[0]), readme.map((r) => r[0]), 'the readers differ or are in another order');
  for (const [i, [reader, what]] of readme.entries()) {
    assert.equal(startHere[i][1], what, `"What you get today" differs for "${reader}"`);
  }
});
