'use strict';
// tests/arch/scratch-hygiene.test.js — the suite leaves nothing behind in the
// system temporary directory.
//
// Four test files used to create `agsc-*` scratch directories they never removed;
// after one run of the suite the temporary directory held over a hundred of them.
// This test runs those files in a child process and requires the count of entries
// carrying THEIR prefixes to be the same before and after. Only those prefixes are
// counted, so other test files running beside this one (node:test runs files in
// parallel) cannot move the number: each prefix below is used by one file only.
//
// Deterministic: no clock, no network; the child is this repository's own suite.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');

/** The files that once leaked, with the scratch prefixes each one uses. */
const SAMPLE = Object.freeze({
  'tests/tools/release.test.js': ['agsc-release-hyg-'],
  'tests/application/input-refusals.test.js': ['agsc-zip-', 'agsc-big-'],
});

function countScratch(prefixes) {
  const entries = fs.readdirSync(os.tmpdir());
  const counts = {};
  for (const prefix of prefixes) counts[prefix] = entries.filter((e) => e.startsWith(prefix)).length;
  return counts;
}

test('a test that creates a scratch directory removes it', () => {
  const prefixes = Object.values(SAMPLE).flat();
  const before = countScratch(prefixes);
  const result = spawnSync(process.execPath, ['--test', ...Object.keys(SAMPLE)], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' },
  });
  assert.strictEqual(result.status, 0, `the sample failed:\n${result.stdout}\n${result.stderr}`);
  assert.deepStrictEqual(countScratch(prefixes), before,
    'a scratch directory survived its test (wrap the writer in try/finally or t.after)');
});

test('every scratch prefix the sample counts is used by that file alone', () => {
  // The count above is only conclusive while no other file shares a prefix.
  const testFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const where = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(where);
      else if (entry.name.endsWith('.js')) testFiles.push(where);
    }
  };
  walk(path.join(ROOT, 'tests'));
  for (const [file, prefixes] of Object.entries(SAMPLE)) {
    for (const prefix of prefixes) {
      const users = testFiles.filter((f) => f !== __filename && fs.readFileSync(f, 'utf8').includes(`'${prefix}'`))
        .map((f) => path.relative(ROOT, f).split(path.sep).join('/'));
      assert.deepStrictEqual(users, [file], `${prefix} is used by ${users.join(', ')}`);
    }
  }
});
