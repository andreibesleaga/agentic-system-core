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

test('every $ENGINE file a demo runs ships in the package, or the step says it needs a clone', { skip: SKIP }, () => {
  // "Before you start" points ENGINE at the installed package: a step that runs a file the
  // package does not ship works only from a clone of the repository, and says so first.
  const { files } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const ships = (rel) => files.some((f) => rel === f || rel.startsWith(f.endsWith('/') ? f : `${f}/`));
  const missing = [];
  let prose = '';
  const parts = fs.readFileSync(PAGE, 'utf8').split(/^```/mu);
  parts.forEach((part, k) => {
    if (k % 2 === 0) { prose = part; return; }
    if (!part.startsWith('bash demo')) return;
    for (const [, rel] of part.matchAll(/\$ENGINE\/([^"'\s)]+)/gu)) {
      if (!ships(rel) && !/needs a clone\s+of the repository/u.test(prose)) missing.push(rel);
    }
  });
  assert.deepEqual(missing, [], 'a demo step runs a file the package does not ship, and its text does not say it needs a clone');
});

test('every code a demo printed has a row on the troubleshooting page', { skip: SKIP }, () => {
  assert.ok(printed.size > 0, 'the demos above printed no code: they did not run');
  const rows = new Set(fs.readFileSync(TROUBLESHOOTING, 'utf8').split('\n').map((l) => (/^\| `(AGSC-E\d{3})` \|/u.exec(l) || [])[1]).filter(Boolean));
  for (const [code, heading] of printed) assert.ok(rows.has(code), `demo "${heading}" printed ${code}, and docs/guides/troubleshooting.md has no row for it`);
});

test('a runnable step edits a file in place the way GNU and BSD sed both accept (`sed -i.bak`)', () => {
  // GNU sed takes `sed -i 's/…/'`, BSD sed (macOS) reads the script as the backup suffix and
  // fails ("command c expects \ followed by text"), so a page that runs on macOS writes the
  // suffix attached: `sed -i.bak '…' file`. Every page whose `bash demo` blocks a test runs.
  const pages = [];
  const visit = (rel) => {
    for (const entry of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') visit(child); } else if (entry.name.endsWith('.md')) pages.push(child);
    }
  };
  for (const rel of ['docs', 'examples']) visit(rel);
  const found = [];
  for (const page of pages) {
    const parts = fs.readFileSync(path.join(ROOT, page), 'utf8').split(/^`{3,}/mu);
    parts.forEach((part, k) => {
      if (k % 2 === 1 && part.startsWith('bash demo') && /\bsed\s+-i(?=\s)/u.test(part)) found.push(page);
    });
  }
  assert.deepStrictEqual(found, [], 'write `sed -i.bak \'…\' file` (and remove the .bak) where a step edits in place');
});
