'use strict';
// tests/docs/demos.test.js — every command in docs/DEMOS.md is run, and every line
// the page says to expect is compared with what the command printed.
//
// The page holds one demo per `##` heading. A fenced block opened with
// ```bash demo is a runnable step of that demo; the ```text expect block after it
// lists lines that must appear, exactly, in what the step printed (standard output
// and standard error together). A demo's steps run in order, in one shell, in a
// fresh scratch directory under the system temporary directory, with the fixed build
// instant the page names, an empty git identity, no network and `agsc` resolved to
// this repository's own command line (or to DOCS_ENGINE_PACKAGE, see _page-runner.js).
// A demo that needs a browser, a forge or a model key has no runnable block, so the
// page can only promise what this test has seen. Every code a demo prints has a row on
// the troubleshooting page, docs/guides/troubleshooting.md. Skipped on Windows, where the
// demos are written for a POSIX shell.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, SKIP, check, parse } = require('./_page-runner.js');

const PAGE = path.join(ROOT, 'docs', 'DEMOS.md');
/** 2026-09-14T10:00:00Z — the build instant docs/DEMOS.md names. */
const EPOCH = '1789380000';

const demos = parse(fs.readFileSync(PAGE, 'utf8'));
const TROUBLESHOOTING = path.join(ROOT, 'docs', 'guides', 'troubleshooting.md');

/** Every code a demo printed, filled by the demo tests below (they run in order, in this one process). */
const printed = new Map();

test('docs/DEMOS.md holds runnable demos, each with expected lines', { skip: SKIP }, () => {
  assert.ok(demos.length >= 7, `only ${demos.length} demos with runnable steps`);
  for (const demo of demos) {
    assert.ok(demo.steps.every((s) => s.expect.length > 0), `"${demo.heading}": a runnable step states no expected line`);
  }
});

for (const demo of demos) {
  test(`demo "${demo.heading}": every command runs and prints the lines the page states`, { skip: SKIP }, () => {
    const outputs = check(demo, { epoch: EPOCH, prefix: 'agsc-demos-' });
    for (const code of outputs.flat().join('\n').match(/AGSC-E\d{3}/gu) || []) if (!printed.has(code)) printed.set(code, demo.heading);
  });
}

test('every code a demo printed has a row on the troubleshooting page', { skip: SKIP }, () => {
  assert.ok(printed.size > 0, 'the demos above printed no code: they did not run');
  const rows = new Set(fs.readFileSync(TROUBLESHOOTING, 'utf8').split('\n').map((l) => (/^\| `(AGSC-E\d{3})` \|/u.exec(l) || [])[1]).filter(Boolean));
  for (const [code, heading] of printed) assert.ok(rows.has(code), `demo "${heading}" printed ${code}, and docs/guides/troubleshooting.md has no row for it`);
});
