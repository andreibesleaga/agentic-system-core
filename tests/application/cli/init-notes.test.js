'use strict';
// `agsc init` on a folder of notes: two things a newcomer met on the first run
// (package D1 of the road to 1.0.0, 2026-10-06).
//
//   G11  A Bundle made by `init` names the Content Use Terms as its prose licence but
//        has no `LICENSE-CONTENT` file, so `export --markdown/--okf` refuses with
//        AGSC-E901 and `/legal/` is not published — and `init` did not say so. It now
//        says so in one "before you publish" line. The build itself does not need the
//        file, so the two "before you build" steps AGSC-02-92 names stay two.
//   D1   A root note that already has a closed frontmatter block without `type` (only
//        `description:`, say) is NOT adopted: AGSC-02-91 forbids modifying a file that
//        carries a closed block, and AGSC-02-93 moves adopted files only. The file is
//        left byte for byte where it is and is not an item — what the rules require.
//        It was left out SILENTLY: `init` now names it in one "left as is" line on
//        standard error (a message only: no finding, no exit code, no file changes).
//
// Deterministic: a fixed build instant, the FileSystem port, a temporary folder.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFileSystem } = require('../../../src/adapters/node-fs.js');
const { main } = require('../../../src/application/cli/main.js');

const EPOCH = '1767225600';

function run(dir, argv) {
  const out = [];
  const err = [];
  const stream = (sink) => ({ write: (s) => { sink.push(String(s)); return true; } });
  const exit = main(argv, {
    env: { SOURCE_DATE_EPOCH: EPOCH },
    ports: { fs: createFileSystem(dir) },
    root: dir,
    stderr: stream(err),
    stdout: stream(out),
  });
  return { err: err.join(''), exit, out: out.join('') };
}

function folder(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-init-notes-'));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

test('G11: init says before you publish that LICENSE-CONTENT is missing', () => {
  const dir = folder({ 'agents.md': 'Notes on agents.\n' });
  try {
    const got = run(dir, ['init']);
    assert.equal(got.exit, 0, got.err);
    assert.match(got.err, /^before you publish: [^\n]*LICENSE-CONTENT/mu);
    // AGSC-02-92: the build needs two steps, and init still names exactly those two.
    const steps = got.err.split('\n').filter((l) => l.startsWith('before you build: '));
    assert.equal(steps.length, 2, steps.join('\n'));
    assert.ok(steps.every((l) => !l.includes('LICENSE-CONTENT')), steps.join('\n'));
  } finally { fs.rmSync(dir, { force: true, recursive: true }); }
});

test('G11: the LICENSE-CONTENT step is not printed when the file is there', () => {
  const dir = folder({ 'LICENSE-CONTENT': 'terms\n', 'agents.md': 'Notes on agents.\n' });
  try {
    const got = run(dir, ['init']);
    assert.equal(got.exit, 0, got.err);
    assert.doesNotMatch(got.err, /LICENSE-CONTENT/u);
  } finally { fs.rmSync(dir, { force: true, recursive: true }); }
});

test('D1 / AGSC-02-91: a root note with a closed block and no type is left as it is', () => {
  const note = '---\ndescription: A note about handing work from one agent to another one.\n---\n\nThe body.\n';
  const dir = folder({ 'agents.md': 'Notes on agents.\n', 'handoff.md': note });
  try {
    const got = run(dir, ['init']);
    assert.equal(got.exit, 0, got.err);
    // AGSC-02-91: a file that carries a closed frontmatter block is not modified …
    assert.equal(fs.readFileSync(path.join(dir, 'handoff.md'), 'utf8'), note);
    // … and AGSC-02-93 moves adopted files only, so it is not under content/.
    assert.equal(fs.existsSync(path.join(dir, 'content', 'concepts', 'handoff.md')), false);
    // The bare note beside it is adopted as before.
    assert.equal(fs.existsSync(path.join(dir, 'content', 'concepts', 'agents.md')), true);
    // It is not left out silently: one line names it and says what makes it an item.
    const kept = got.err.split('\n').filter((l) => l.startsWith('left as is: '));
    assert.equal(kept.length, 1, got.err);
    assert.match(kept[0], /handoff\.md/u);
    assert.match(kept[0], /AGSC-02-91/u);
    assert.match(kept[0], /content\/<type-plural>\//u);
    // A message, not a finding: the same warnings as for the bare note alone.
    const alone = folder({ 'agents.md': 'Notes on agents.\n' });
    try {
      const warnings = (text) => text.split('\n').filter((l) => l.startsWith('warn: '));
      assert.deepEqual(warnings(got.err), warnings(run(alone, ['init']).err));
    } finally { fs.rmSync(alone, { force: true, recursive: true }); }
  } finally { fs.rmSync(dir, { force: true, recursive: true }); }
});

test('D1: a note already under content/<type-plural>/ is an item, and is not named as left out', () => {
  const item = '---\ntype: concept\ntitle: Handoff\nprov:\n  origin: human\n  operator: human:someone\nkind: explainer\n---\n\nThe body.\n';
  const dir = folder({ 'agents.md': 'Notes on agents.\n', 'content/concepts/handoff.md': item });
  try {
    const got = run(dir, ['init']);
    assert.equal(got.exit, 0, got.err);
    assert.equal(fs.readFileSync(path.join(dir, 'content', 'concepts', 'handoff.md'), 'utf8'), item);
    assert.doesNotMatch(got.err, /left as is: /u);
  } finally { fs.rmSync(dir, { force: true, recursive: true }); }
});

test('D1: under --json the left-out note is not printed (stderr carries findings only, AGSC-09-10)', () => {
  const note = '---\ndescription: A note about handing work from one agent to another one.\n---\n\nThe body.\n';
  const dir = folder({ 'agents.md': 'Notes on agents.\n', 'handoff.md': note });
  try {
    const got = run(dir, ['init', '--json']);
    assert.equal(got.exit, 0, got.err);
    assert.doesNotMatch(got.err, /left as is: /u);
  } finally { fs.rmSync(dir, { force: true, recursive: true }); }
});
