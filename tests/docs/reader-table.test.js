'use strict';
// tests/docs/reader-table.test.js — the reader table ("Who it is for, what you get, try it") is
// kept in ONE place, docs/START-HERE.md, and README.md links to it instead of carrying a copy,
// so the two front doors cannot drift apart.
//
// Deterministic: reads two files; no clock, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8');
const TABLE = /^\| Reader \| What you get today \| Try it \|$/mu;

test('docs/START-HERE.md carries the reader table, and README.md links to it instead of a copy', () => {
  const lines = read('docs/START-HERE.md').split('\n');
  const start = lines.findIndex((line) => TABLE.test(line));
  assert.ok(start >= 0, 'docs/START-HERE.md has no "| Reader | What you get today | Try it |" table');
  const rows = lines.slice(start + 2).findIndex((line) => !line.startsWith('|'));
  assert.ok(rows >= 10, `docs/START-HERE.md reader table has only ${rows} rows`);
  const readme = read('README.md');
  assert.ok(!TABLE.test(readme), 'README.md carries a copy of the reader table');
  assert.ok(readme.includes('docs/START-HERE.md#who-it-is-for-what-you-get-try-it'), 'README.md does not link to the table');
});
