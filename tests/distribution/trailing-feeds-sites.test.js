'use strict';
// The trailing line feeds of a text are removed, or made exactly one, by the shared
// scan from the end (src/shared/trailing.js), in linear steps. The patterns it
// replaces, `/\n+$/u` and `/\n*$/u`, read to the end of every run of line feeds from
// each of its positions. The Distribution and application modules use the shared scan:
// the bytes of a page (AGSC-04-07), of the NOW page and of a tool resource are what
// the patterns gave, and the last test keeps the patterns from coming back here.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const trailing = require('../../src/shared/trailing.js');
const llms = require('../../src/distribution/llms.js');

const REPO = path.resolve(__dirname, '..', '..');

test('/llms-full.txt uses the shared one-line-feed scan, not a copy of its own', () => {
  assert.equal(llms.withOneTrailingFeed, trailing.withOneTrailingFeed);
});

/** Every JavaScript file under `dir` (repository-relative). */
function files(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...files(rel));
    else if (entry.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

test('no Distribution or application module uses either trailing line-feed pattern', () => {
  const patterns = ['/\\n+$/', '/\\n*$/'];
  const offenders = [];
  for (const rel of ['src/distribution', 'src/application'].flatMap(files)) {
    fs.readFileSync(path.join(REPO, rel), 'utf8').split('\n').forEach((line, i) => {
      if (patterns.some((pattern) => line.includes(pattern))) offenders.push(`${rel}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, []);
});
