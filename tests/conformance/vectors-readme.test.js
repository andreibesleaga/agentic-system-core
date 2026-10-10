'use strict';
// tests/vectors/README.md names every member a case uses, so that a port can read any
// case from that file and the specification alone (AGSC-00-01, AGSC-09-04). A member is
// a member of a case's `input` or `expected` object, or of an entry of their `cases[]`
// arrays, the sub-case shape several areas share. The "Member index" section lists them
// per area; a case that brings a new member fails here until the index names it.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const VECTORS = path.resolve(__dirname, '..', 'vectors');
const README = fs.readFileSync(path.join(VECTORS, 'README.md'), 'utf8');

const PARTS = Object.freeze({
  expected: 'expected',
  'expected.cases': 'expected `cases[]` entries',
  input: 'input',
  'input.cases': 'input `cases[]` entries',
});

/** The member names of one case, as `[part, name]` pairs. */
function membersOf(vector) {
  const pairs = [];
  for (const part of ['input', 'expected']) {
    const object = vector[part];
    if (object === null || typeof object !== 'object' || Array.isArray(object)) continue;
    for (const [name, value] of Object.entries(object)) {
      pairs.push([part, name]);
      const entries = name === 'cases' && Array.isArray(value) ? value : [];
      for (const entry of entries.filter((e) => e !== null && typeof e === 'object')) {
        for (const key of Object.keys(entry)) pairs.push([`${part}.cases`, key]);
      }
    }
  }
  return pairs;
}

/** `{area: {part: Set(name)}}` over every case file. */
function membersInUse() {
  const out = {};
  for (const area of fs.readdirSync(VECTORS, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const file of fs.readdirSync(path.join(VECTORS, area.name)).filter((f) => f.endsWith('.json'))) {
      const vector = JSON.parse(fs.readFileSync(path.join(VECTORS, area.name, file), 'utf8'));
      const parts = (out[vector.area] = out[vector.area] || {});
      for (const [part, name] of membersOf(vector)) (parts[part] = parts[part] || new Set()).add(name);
    }
  }
  return out;
}

/** `{area: {label: Set(name)}}` read from the "Member index" section. */
function index() {
  const start = README.indexOf('\n## Member index\n');
  assert.notStrictEqual(start, -1, 'README.md has no "## Member index" section');
  const rest = README.slice(start + 1);
  const end = rest.indexOf('\n## ', 3);
  const section = end === -1 ? rest : rest.slice(0, end);
  const out = {};
  let area = null;
  for (const line of section.split('\n')) {
    const heading = /^### `([a-z]+)`$/u.exec(line);
    if (heading) { area = heading[1]; out[area] = {}; continue; }
    const row = /^- \*\*(.+?):\*\* (.*)$/u.exec(line);
    if (area === null || row === null) continue;
    out[area][row[1]] = new Set([...row[2].matchAll(/`([^`]+)`/gu)].map((m) => m[1]));
  }
  return out;
}

test('the member index names every member each area uses, under the part that uses it', () => {
  const listed = index();
  const missing = [];
  for (const [area, parts] of Object.entries(membersInUse())) {
    for (const [part, names] of Object.entries(parts)) {
      const have = (listed[area] || {})[PARTS[part]] || new Set();
      for (const name of names) if (!have.has(name)) missing.push(`${area} / ${PARTS[part]} / ${name}`);
    }
  }
  assert.deepStrictEqual(missing.sort(), [], `members not in the README's member index:\n${missing.join('\n')}`);
});

test('the members that need more than their name are explained in the README text', () => {
  // Members whose meaning a reader cannot take from the name alone: each is written in
  // backticks outside the index too, where the input and expected shapes are described.
  const prose = README.slice(0, README.indexOf('\n## Member index\n'));
  for (const name of ['frames', 'tools_list_id', 'responses', 'tools', 'envelope', 'stderr_codes',
    'exit_one_of', 'error_codes_allowed', 'codes_absent', 'cases', 'add_files', 'add_sized_files',
    'add_links', 'lint', 'resolved', 'dev', 'results', 'git_log']) {
    // Written alone or under its object (`input.dev`, `expected.results[]`).
    assert.match(prose, new RegExp(`\`(?:input\\.|expected\\.)?${name}(?:\\[\\])?\``, 'u'), `${name} is not explained`);
  }
});
