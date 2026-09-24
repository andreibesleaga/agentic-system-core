'use strict';
// Every source this repository audits must be READABLE BY A TEXT SWEEP.
//
// A single literal U+0000 byte makes `file(1)` classify a source as `data` and GNU
// `grep` treat it as binary, so the file silently disappears from every text sweep
// — the rule-id citation checker, the private-path grep, the forbidden-wording
// sweep — with no message at all. That has happened twice on this project: once in
// `src/boundary/federation.js` (a NUL inside a character class) and once
// in two test files whose `git ls-files -z` fixtures used the separator literally
// Both were corrected to the `\u0000` escape, which is
// the same value to the JavaScript engine and plain text on disk.
//
// This test is the guard, so the third occurrence fails a gate instead of hiding a
// file from an audit. It is a whole-tree, binary-safe read, and it reports the
// number of files it actually read — a sweep that cannot say how many files it saw
// cannot claim a clean result (the standing method note of).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
/** The trees whose sources every audit sweep reads. */
const TREES = ['src', 'tests', 'bin', 'tools', 'schema', 'ontology', 'spec'];
/** Extensions that are text by construction; anything else is not this test's business. */
const TEXT = new Set(['.js', '.cjs', '.mjs', '.json', '.md', '.ttl', '.txt', '.diagram', '.feature']);

function textFiles() {
  const out = [];
  for (const tree of TREES) {
    const base = path.join(ROOT, tree);
    if (!fs.existsSync(base)) continue;
    const stack = [base];
    while (stack.length > 0) {
      const dir = stack.pop();
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) { stack.push(p); continue; }
        if (TEXT.has(path.extname(entry.name))) out.push(p);
      }
    }
  }
  return out.sort();
}

test('no source a sweep reads carries a literal NUL, a BOM or a CR', () => {
  const files = textFiles();
  assert.ok(files.length > 200, `the sweep must actually read the tree: ${files.length} files`);

  const withNul = [];
  const withBom = [];
  const withCr = [];
  for (const file of files) {
    // A Buffer read, never a string read: a decoder would hide the very byte
    // this test is looking for.
    const bytes = fs.readFileSync(file);
    const rel = path.relative(ROOT, file);
    if (bytes.includes(0x00)) withNul.push(`${rel} (offset ${bytes.indexOf(0x00)})`);
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) withBom.push(rel);
    if (bytes.includes(0x0d)) withCr.push(`${rel} (offset ${bytes.indexOf(0x0d)})`);
  }

  assert.deepStrictEqual(withNul, [],
    'write the escape `\\u0000`, never the character: a literal NUL removes the file from every text sweep');
  // AGSC-01-14 places the same two obligations on the content files this engine
  // reads; a source tree that broke them could not be audited either.
  assert.deepStrictEqual(withBom, [], 'UTF-8 without a BOM (AGSC-01-14)');
  assert.deepStrictEqual(withCr, [], 'LF line endings only (AGSC-01-14)');
});
