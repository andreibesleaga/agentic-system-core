'use strict';
// The rules that bind the distribution's own implementers' guide and the place a foreign
// node publishes its Bundle id. Until 2026-10-02 these three rules were listed as gaps of
// the reference engine; the guide now carries the ten-step path, the platform mapping and
// the per-Level checklist, and AGSC-10-08 no longer asks for a key no schema has.
//
// Deterministic: reads files of this repository only.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const GUIDE = fs.readFileSync(path.join(ROOT, 'docs', 'IMPLEMENTERS-GUIDE.md'), 'utf8');

function section(title) {
  const start = GUIDE.indexOf(`## ${title}`);
  assert.ok(start >= 0, `the guide has no section "${title}"`);
  const next = GUIDE.indexOf('\n## ', start + 4);
  return GUIDE.slice(start, next < 0 ? GUIDE.length : next);
}

/** Table rows of a section, as arrays of cells, header and separator excluded. */
function rows(text) {
  const lines = text.split('\n').filter((l) => /^\|/u.test(l));
  return lines.slice(2).map((l) => l.split(/(?<!\\)\|/u).slice(1, -1).map((c) => c.trim()));
}

test('AGSC-10-10: the guide gives a Level-0 path of at most ten steps', () => {
  const steps = rows(section('1a.'));
  assert.ok(steps.length >= 1 && steps.length <= 10, `${steps.length} steps`);
  steps.forEach((cells, i) => assert.equal(cells[0], String(i + 1), `step ${i + 1} is numbered ${cells[0]}`));
});

test('AGSC-10-10: the guide carries the per-Level rule and case checklist, one row per Level', () => {
  const levels = rows(section('1c.')).map((cells) => cells[0].charAt(0));
  assert.deepEqual(levels, ['0', '1', '2', '3']);
  assert.match(section('1c.'), /AGSC-10-15/u);
});

test('AGSC-10-10: the platform mapping table names every platform the rule lists', () => {
  const mapping = section('1b.');
  for (const platform of ['MediaWiki', 'WordPress', 'Docusaurus', 'MkDocs', 'Hugo', 'Notion', 'Confluence', 'Obsidian', 'Logseq', 'Django', 'Laravel', 'Rails']) {
    assert.ok(mapping.includes(platform), platform);
  }
});

test('AGSC-10-11: every step of the Level-0 path names what proves it, and Node is no prerequisite', () => {
  for (const cells of rows(section('1a.'))) assert.ok(cells[3] && cells[3].length > 0, `step ${cells[0]} names no proof`);
  assert.match(GUIDE, /your own runner|in your own language/u, 'the route without the reference tools is stated');
  assert.ok(fs.existsSync(path.join(ROOT, 'tests', 'e2e', 'level-0-without-engine.test.js')), 'the end-to-end Level-0 run without the engine');
  assert.doesNotMatch(section('1a.'), /requires? Node|Node is required|install Node/iu);
});

test('AGSC-10-08: the Bundle id is published as bundle.id of the configuration, the one place a schema has for it', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema', 'config.schema.json'), 'utf8'));
  assert.ok(config.required.includes('bundle'));
  assert.ok(config.properties.bundle.required.includes('id'));
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema', 'bundle.schema.json'), 'utf8'));
  assert.ok(!Object.prototype.hasOwnProperty.call(index.properties || {}, 'id'), 'content/index.md has no id key');
});
