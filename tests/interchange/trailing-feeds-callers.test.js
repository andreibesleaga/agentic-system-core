'use strict';
// The trailing line feeds of a text are removed, or made exactly one, by a scan from
// the end (src/shared/trailing.js), in the Composition, Interchange, Boundary and
// Governance contexts, the commands and the tools too. The patterns it replaces,
// `/\n+$/u` and `/\n*$/u`, read to the end of every run of line feeds from each of
// its positions, so a body with a long run of line feeds before its last word stalled
// the caller (100,000 line feeds took tens of seconds).
//
// Two places cannot load the shared module and keep a copy of the loop:
//   * `composition/harness.js`, whose functions are emitted as the compose page's
//     script (composition/browser.js), where a function may name only what the
//     script itself declares;
//   * `tools/gen-spec-html`, which never loads `src/` (AGSC-09-90).
// Each copy is compared here with the shared scan on a seeded corpus.
//
// Steps are counted, not timed (tests/_linear-kit.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const trailing = require('../../src/shared/trailing.js');
const harness = require('../../src/composition/harness.js');
const boards = require('../../src/interchange/board-formats.js');
const prov = require('../../src/governance/prov.js');
const { MIB, assertLinear, texts } = require('../_linear-kit.js');

const REPO = path.resolve(__dirname, '..', '..');
const SEED = 20261012;
const COUNT = 20000;
const ALPHABET = ['\n', '\n\n', '\r', '\r\n', '\u2028', ' ', '/', 'a', '\u{1F600}'];
const FIXED = ['', '\n', '\n\n\n', 'a', 'a\n', 'a\n\n', '\na', 'a\nb', 'a\r\n', 'a\n\r', '\u{1F600}\n'];

/** The loop `tools/gen-spec-html` carries, read from the tool's own text. */
function toolTrim() {
  const text = fs.readFileSync(path.join(REPO, 'tools', 'gen-spec-html'), 'utf8');
  const m = /^function withoutTrailingFeeds\([^)]*\) \{\n[\s\S]*?\n\}\n/mu.exec(text);
  assert.ok(m, 'tools/gen-spec-html declares withoutTrailingFeeds');
  return new Function(`${m[0]}\nreturn withoutTrailingFeeds;`)();
}

test('the copies of the loop equal the shared scan on a seeded corpus', () => {
  const tool = toolTrim();
  for (const text of [...texts(SEED, COUNT, ALPHABET), ...FIXED]) {
    const want = trailing.withoutTrailingFeeds(text);
    assert.equal(harness.withoutTrailingFeeds(text), want, JSON.stringify(text));
    assert.equal(tool(text), want, JSON.stringify(text));
    assert.equal(boards.withoutTrailingFeeds(text), want, JSON.stringify(text));
  }
});

test('the copies of the loop take linear steps on a long run before a word', () => {
  const text = `${'\n'.repeat(MIB)}x${'\n'.repeat(MIB)}`;
  const tool = toolTrim();
  assert.equal(assertLinear('harness.withoutTrailingFeeds', harness.withoutTrailingFeeds, text, 2),
    `${'\n'.repeat(MIB)}x`);
  assert.equal(assertLinear('gen-spec-html withoutTrailingFeeds', tool, text, 2), `${'\n'.repeat(MIB)}x`);
});

test('callers keep their results on a long run of line feeds', () => {
  const run = '\n'.repeat(MIB);
  // the AGENTS.md and MADR fences of a Harness quote prose with exactly one line feed.
  assert.equal(harness.fenceProse(`${run}x${run}`), `\`\`\`text agsc-content\n${run}x\n\`\`\`\n`);
  // a commit message's trailer block is read after its trailing line feeds.
  const address = ['a', 'example.org'].join('@');
  assert.deepEqual(prov.trailerBlock(`subject\n${run}body\n\nSigned-off-by: A <${address}>${run}`)
    .map((line) => line.split(':')[0]), ['Signed-off-by']);
});

/** Every file under `dir` (repository-relative), skipping dependency folders and prose. */
function files(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') out.push(...files(rel));
    } else if (!entry.name.endsWith('.md')) {
      out.push(rel);
    }
  }
  return out;
}

const FOLDERS = ['src/composition', 'src/interchange', 'src/boundary', 'src/governance', 'bin', 'tools'];

test('no module of these contexts, no command and no tool uses either trailing line-feed pattern', () => {
  const patterns = ['/\\n+$/', '/\\n*$/'];
  const offenders = [];
  for (const rel of [...FOLDERS.flatMap(files), 'index.js']) {
    const text = fs.readFileSync(path.join(REPO, rel), 'utf8');
    text.split('\n').forEach((line, i) => {
      if (patterns.some((pattern) => line.includes(pattern))) offenders.push(`${rel}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, []);
});
