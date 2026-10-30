'use strict';
// A README in every folder. Each folder of this repository at the first and second
// level carries a `README.md` that says what the folder holds, or its parent's README
// says it in a sentence, because a file of its own there would do harm (the folder's
// contents are pinned by a test or read by another tool). A folder deeper than the
// second level is described by the README above it.
//
// The walk reads the working tree, not git: generated and local folders are set aside
// by the folder names `.gitignore` lists, so a fresh clone and a worked-in checkout give
// the same answer. `.github/` is set aside on purpose: GitHub shows `.github/README.md`
// in place of the repository's own README, and reads every Markdown file under
// `.github/ISSUE_TEMPLATE/` as an issue template, so neither may hold one.
//
// Deterministic: no clock, no network, no child process; it only reads files.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * Folders described by a sentence in their parent's README instead of a README of
 * their own: folder → [the README that describes it, words that README must hold].
 */
const COVERED = Object.freeze({
  '.claude-plugin': ['README.md', '.claude-plugin/marketplace.json'],
  LICENSES: ['README.md', 'text of each licence above is in `LICENSES/`'],
  'skills/agentic-system-core': ['skills/README.md', 'folder `agentic-system-core/` has no README of its own'],
  'src/ports': ['src/README.md', '`tests/ports/` holds the folder to exactly its four interface files'],
});

/** Folder names `.gitignore` sets aside (lines of the form `name/`), plus git's own. */
function ignoredNames() {
  const names = new Set(['.git', 'node_modules']);
  for (const raw of fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split('\n')) {
    const line = raw.trim();
    if (/^[^!#*/][^*/]*\/$/u.test(line)) names.add(line.slice(0, -1));
  }
  return names;
}

/** Every folder at the first and second level, as a path relative to the root with `/`. */
function folders() {
  const skip = ignoredNames();
  const out = [];
  const dirs = (rel) => fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !skip.has(e.name)).map((e) => (rel ? `${rel}/${e.name}` : e.name));
  for (const first of dirs('')) {
    if (first === '.github') continue;
    out.push(first);
    for (const second of dirs(first)) out.push(second);
  }
  return out.sort();
}

test('every folder at the first and second level has a README or is described by its parent README', () => {
  const all = folders();
  assert.ok(all.length > 40, `the walk must actually read the tree: ${all.length} folders`);
  const missing = all.filter((rel) => !fs.existsSync(path.join(ROOT, rel, 'README.md')) && !(rel in COVERED));
  assert.deepStrictEqual(missing, [], 'add a README.md to each folder, or a sentence to its parent README listed in this test');
});

test('each folder described by its parent README still exists, has no README of its own, and the parent says so', () => {
  for (const [rel, [readme, words]] of Object.entries(COVERED)) {
    assert.ok(fs.statSync(path.join(ROOT, rel)).isDirectory(), `${rel} is listed here but is not a folder`);
    assert.ok(!fs.existsSync(path.join(ROOT, rel, 'README.md')), `${rel} now has a README of its own: remove it from the list`);
    const text = fs.readFileSync(path.join(ROOT, readme), 'utf8');
    assert.ok(text.includes(words), `${readme} does not describe ${rel} (expected the words: ${words})`);
  }
});

test('no README where GitHub would read it as something else', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, '.github', 'README.md')), '.github/README.md would replace the repository README on GitHub');
  const templates = path.join(ROOT, '.github', 'ISSUE_TEMPLATE');
  if (fs.existsSync(templates)) {
    const markdown = fs.readdirSync(templates).filter((f) => f.toLowerCase().endsWith('.md'));
    assert.deepStrictEqual(markdown, [], 'a Markdown file in .github/ISSUE_TEMPLATE/ is offered as an issue template');
  }
});
