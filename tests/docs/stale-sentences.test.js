'use strict';
// tests/docs/stale-sentences.test.js — public text that was true of the draft and is no
// longer true of this tree. AGSC-00-20 (as amended for 1.1.0) says that everything it
// defers is "planned for a later MINOR", with no version number, and that the language
// variants, `build.rdfxml`, `build.feed`, `weights`, `routing`, `executable`, the channel
// adapters, the runtime emitters and the rest of that list are NOT part of 1.1. A sentence
// that sends one of them to "1.1", or to a number after it, is stale.
//
// The sweep reads the documents, the schemas, the tool READMEs and the comments and
// messages of `src/`. In `spec/`, which is frozen and keeps what each dated note said on
// its day, it looks only for a version number after 1.1 (this specification names no
// version for what it defers). It leaves out the files that record what was planned on a given day
// (the plan, the requirements document, the change log, the vectors) and the files another
// package is rewriting; each such file is named below with its reason.
//
// Deterministic: reads files of this repository, nothing else.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

/** Stale phrases: [name, pattern]. Case-insensitive; the text is read as one paragraph. */
const STALE = [
  ['a name reserved to 1.1', /reserved (?:to|for) 1\.1\b|reserved names? of 1\.1\b/iu],
  ['a capability planned for 1.1', /planned for 1\.1\b/iu],
  ['"comes with 1.1"', /\bcomes? with 1\.1\b/iu],
  ['a version number after 1.1', /(?:planned|reserved|deferred|listed|not before)(?: for| with| to)? 1\.2\b(?!\.\d)/iu],
  ['"seven page tools" (there are ten)', /\bseven page tools\b/iu],
  ['a wording said to be someone\'s to write (say what is not written yet)', /\bwording is the owner'?s to write\b/iu],
];

/** The phrases that apply to the frozen specification: a number after 1.1 only. */
const FROZEN = new Set(['a version number after 1.1']);

/** Files and folders left out, each with the reason. */
const SKIPPED = new Map([
  ['CHANGELOG.md', 'records what each change said on its day'],
  ['docs/PLAN.md', 'the plan of 1.0.0 with dated 1.1 notes'],
  ['docs/PRD.md', 'the requirements of 1.0.0 with dated 1.1 notes'],
  ['docs/diagrams-rendered', 'generated pictures'],
  ['tests/vectors', 'frozen conformance cases'],
  ['tests/docs/stale-sentences.test.js', 'this file names the phrases'],
]);

/** Folders and root files the sweep reads. */
const ROOTS = ['README.md', 'docs', 'schema', 'src', 'tools', 'spec', 'examples', 'features', 'tests/requirements-matrix.allow.json'];
const TEXT = /\.(?:md|json|js|ts|feature|ttl|txt)$/u;

function* walk(rel) {
  if (SKIPPED.has(rel) || rel.includes('/vendor/') || rel.includes('node_modules')) return;
  const full = path.join(ROOT, ...rel.split('/'));
  if (!fs.existsSync(full)) return;
  if (fs.statSync(full).isDirectory()) {
    for (const name of fs.readdirSync(full).sort()) yield* walk(`${rel}/${name}`);
  } else if (TEXT.test(rel)) {
    yield rel;
  }
}

/** Every stale phrase of one file: `file: name: the sentence around it`. */
function stale(rel) {
  const text = fs.readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8').replace(/\s+/gu, ' ');
  const found = [];
  for (const [name, pattern] of STALE) {
    if (rel.startsWith('spec/') && !FROZEN.has(name)) continue;
    const at = text.search(pattern);
    if (at >= 0) found.push(`${rel}: ${name}: …${text.slice(Math.max(0, at - 60), at + 90)}…`);
  }
  return found;
}

test('public text sends nothing to 1.1 that AGSC-00-20 defers, and names no version after 1.1', () => {
  const files = ROOTS.flatMap((root) => [...walk(root)]);
  assert.ok(files.length > 400, `the sweep read only ${files.length} files`);
  const problems = files.flatMap(stale);
  assert.deepEqual(problems, [], `stale sentences:\n${problems.join('\n')}`);
});

test('the sweep finds each stale phrase in a sentence that has it', () => {
  const samples = [
    'Language variants are reserved to 1.1.',
    'a channel adapter is planned for 1.1',
    'the new check comes with 1.1',
    'Planned for a later MINOR, not before 1.2',
    'the seven page tools',
  ];
  for (const [i, sample] of samples.entries()) {
    assert.match(sample, STALE[i][1], STALE[i][0]);
  }
  assert.doesNotMatch('planned for a later MINOR (AGSC-00-20)', STALE[1][1]);
});

test('every skipped file exists, so the list cannot outlive the file', () => {
  for (const rel of SKIPPED.keys()) {
    assert.ok(fs.existsSync(path.join(ROOT, ...rel.split('/'))), `${rel} no longer exists`);
  }
});
