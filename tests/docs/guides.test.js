'use strict';
// tests/docs/guides.test.js — the six mode guides of docs/guides/ are run from top to
// bottom, and every line they say to expect is compared with what was printed.
//
// One guide per mode (mode-0.md … mode-5.md). Each guide is one walk-through: all its
// ```bash demo blocks run in order, in one shell, in a fresh scratch directory, with an
// empty git identity, no network and `agsc` resolved to this repository's own command
// line (or to DOCS_ENGINE_PACKAGE, see _page-runner.js). No build instant is set: the
// guides commit before they build, as a reader does, and the commit instant is fixed by
// the runner's git dates. Each guide also keeps the parts every guide promises a reader.
// Skipped on Windows, where the guides are written for a POSIX shell.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, SKIP, check, parse } = require('./_page-runner.js');

const DIR = path.join(ROOT, 'docs', 'guides');
const MODES = [0, 1, 2, 3, 4, 5];
const PARTS = ['**Who it is for:**', '**What you get:**', '## Before you start', '## What next'];

test('docs/guides holds one guide per mode, each with its reader, its result, its prerequisites and a next step', () => {
  const names = fs.readdirSync(DIR).filter((f) => f.endsWith('.md') && f !== 'README.md').sort();
  assert.deepStrictEqual(names, MODES.map((m) => `mode-${m}.md`));
  const index = fs.readFileSync(path.join(DIR, 'README.md'), 'utf8');
  for (const name of names) {
    const text = fs.readFileSync(path.join(DIR, name), 'utf8');
    assert.ok(index.includes(`](${name})`), `docs/guides/README.md does not link ${name}`);
    for (const part of PARTS) assert.ok(text.includes(part), `${name} has no "${part}"`);
    const [run] = parse(text, { whole: name });
    assert.ok(run && run.steps.length >= 2, `${name} has fewer than two runnable steps`);
    assert.ok(run.steps[run.steps.length - 1].expect.length > 0, `${name}: the last runnable step states no expected line`);
  }
});

for (const mode of MODES) {
  const name = `mode-${mode}.md`;
  test(`guide ${name}: every command runs and prints the lines the guide states`, { skip: SKIP }, () => {
    const [run] = parse(fs.readFileSync(path.join(DIR, name), 'utf8'), { whole: name });
    check(run, { prefix: 'agsc-guides-' });
  });
}
