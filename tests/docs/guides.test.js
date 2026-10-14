'use strict';
// tests/docs/guides.test.js — the seven guides of docs/guides/ are run from top to
// bottom, every line they say to expect is compared with what was printed, and the
// troubleshooting page has a row for every code a guide or a demo prints.
//
// The seven guides are the six mode guides (mode-0.md … mode-5.md) and publish.md;
// troubleshooting.md is a reference page, not a guide, and README.md links all eight.
// Each guide is one walk-through: all its ```bash demo blocks run in order, in one shell,
// in a fresh scratch directory, with an empty git identity, no network and `agsc`
// resolved to this repository's own command line (or to DOCS_ENGINE_PACKAGE, see
// _page-runner.js). No build instant is set: the guides commit before they build, as a
// reader does, and the commit instant is fixed by the runner's git dates. Each guide also
// keeps the parts every guide promises a reader. Skipped on Windows, where the guides are
// written for a POSIX shell.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PACKAGE, ROOT, SKIP, environment, parse } = require('./_page-runner.js');

const DIR = path.join(ROOT, 'docs', 'guides');
const GUIDES = ['mode-0.md', 'mode-1.md', 'mode-2.md', 'mode-3.md', 'mode-4.md', 'mode-5.md', 'publish.md'];
const REFERENCE = 'troubleshooting.md';
const PARTS = ['**Who it is for:**', '**What you get:**', '## Before you start', '## What next'];
const CODE = /AGSC-E\d{3}/gu;

const read = (name) => fs.readFileSync(path.join(DIR, name), 'utf8');
const codesIn = (text) => new Set(text.match(CODE) || []);

/** Every code a guide run printed, filled by the guide tests below (they run in order, in this one process). */
const printed = new Map();

/**
 * Run one guide's steps in one shell and return what each step printed. The same walk as
 * _page-runner.js#check, kept here because the troubleshooting test needs the output.
 */
function walk(guide) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-guides-'));
  const trap = `${scratch}.network-attempts.txt`;
  try {
    const script = ['set -e', 'exec 2>&1', ...guide.steps.map((step, i) => `printf '\\n@@step %s\\n' ${i}\n${step.script}`)].join('\n');
    const r = spawnSync('bash', ['-s'], { cwd: scratch, encoding: 'utf8', env: environment(scratch), input: `${script}\n` });
    const attempts = fs.existsSync(trap) ? fs.readFileSync(trap, 'utf8').split('\n').filter(Boolean) : [];
    assert.deepStrictEqual(attempts, [], `a step of "${guide.heading}" reached for the network: ${attempts.join(', ')}`);
    assert.strictEqual(r.status, 0, `a step failed:\n${r.stdout.slice(-3000)}`);
    const outputs = r.stdout.split(/\n@@step \d+\n/u).slice(1).map((p) => p.split('\n').map((l) => l.replace(/\s+$/u, '')));
    assert.strictEqual(outputs.length, guide.steps.length, 'a step printed no marker');
    guide.steps.forEach((step, i) => {
      for (const line of step.expect) {
        assert.ok(outputs[i].includes(line), `step ${i + 1} of "${guide.heading}" did not print the line\n  ${line}\nit printed:\n${outputs[i].join('\n')}`);
      }
    });
    return r.stdout;
  } finally {
    fs.rmSync(scratch, { force: true, recursive: true });
    fs.rmSync(trap, { force: true });
  }
}

/** The codes of the troubleshooting table, in the order of its rows. */
function rowsOf(text) {
  return text.split('\n').map((l) => /^\| `(AGSC-E\d{3})` \|/u.exec(l)).filter(Boolean).map((m) => m[1]);
}

test('docs/guides holds the seven guides and one reference page, each guide with its reader, its result, its prerequisites and a next step', () => {
  const names = fs.readdirSync(DIR).filter((f) => f.endsWith('.md') && f !== 'README.md').sort();
  assert.deepStrictEqual(names, [...GUIDES, REFERENCE].sort());
  const index = read('README.md');
  for (const name of [...GUIDES, REFERENCE]) assert.ok(index.includes(`](${name})`), `docs/guides/README.md does not link ${name}`);
  const table = index.split('\n').filter((l) => l.startsWith('| ['));
  assert.deepStrictEqual(table.map((l) => /\]\(([^)]+)\)/u.exec(l)[1]), GUIDES, 'the guide table of README.md lists exactly the seven guides, in order');
  assert.ok(/seven short guides/iu.test(index), 'README.md calls them the seven guides');
  for (const name of GUIDES) {
    const text = read(name);
    for (const part of PARTS) assert.ok(text.includes(part), `${name} has no "${part}"`);
    const [run] = parse(text, { whole: name });
    assert.ok(run && run.steps.length >= 2, `${name} has fewer than two runnable steps`);
    assert.ok(run.steps[run.steps.length - 1].expect.length > 0, `${name}: the last runnable step states no expected line`);
  }
  const reference = read(REFERENCE);
  assert.deepStrictEqual(parse(reference, { whole: REFERENCE }), [], `${REFERENCE} is a reference page: it runs nothing`);
  assert.ok(!reference.includes('**Who it is for:**'), `${REFERENCE} is a reference page, not a guide`);
});

for (const name of GUIDES) {
  test(`guide ${name}: every command runs and prints the lines the guide states`, { skip: SKIP }, () => {
    const [run] = parse(read(name), { whole: name });
    for (const code of codesIn(walk(run))) if (!printed.has(code)) printed.set(code, name);
  });
}

test('the troubleshooting page has one row per code, in code order, each a registered code with a cause and a fix', () => {
  const rows = rowsOf(read(REFERENCE));
  assert.ok(rows.length > 0, `${REFERENCE} has no rows`);
  assert.deepStrictEqual(rows, [...new Set(rows)].sort(), 'one row per code, in code order');
  const registry = codesIn(fs.readFileSync(path.join(PACKAGE, 'spec', '09-conformance.md'), 'utf8'));
  for (const code of rows) assert.ok(registry.has(code), `${code} is not in the code registry of spec/09-conformance.md`);
  for (const line of read(REFERENCE).split('\n').filter((l) => /^\| `AGSC-E\d{3}` \|/u.test(l))) {
    const cells = line.split(' | ');
    assert.ok(cells.length >= 4 && cells.every((c) => c.replace(/\|/gu, '').trim() !== ''), `a row has an empty cell: ${line}`);
  }
});

test('every code the guides and the demos quote has a row on the troubleshooting page', () => {
  const rows = new Set(rowsOf(read(REFERENCE)));
  const pages = [...GUIDES.map((g) => path.join(DIR, g)), path.join(ROOT, 'docs', 'DEMOS.md')];
  for (const page of pages) {
    for (const code of codesIn(fs.readFileSync(page, 'utf8'))) {
      assert.ok(rows.has(code), `${path.relative(ROOT, page)} quotes ${code}, and ${REFERENCE} has no row for it`);
    }
  }
});

test('every code a guide run printed has a row on the troubleshooting page', { skip: SKIP }, () => {
  assert.ok(printed.size > 0, 'the guide runs above printed no code: they did not run');
  const rows = new Set(rowsOf(read(REFERENCE)));
  for (const [code, guide] of printed) assert.ok(rows.has(code), `${guide} printed ${code}, and ${REFERENCE} has no row for it`);
});

test('the Mode 0 guide quotes what init prints for a note that already has a header, and how to adopt it after all', { skip: SKIP }, () => {
  const guide = read('mode-0.md');
  const quoted = guide.split('\n').find((l) => l.startsWith('left as is: '));
  assert.ok(quoted, 'mode-0.md quotes no "left as is:" line');
  const name = /^left as is: (\S+\.md) /u.exec(quoted)[1];
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-guides-'));
  try {
    const env = environment(scratch);
    const notes = path.join(scratch, 'notes');
    fs.mkdirSync(notes);
    const agsc = (...args) => spawnSync(process.execPath, [path.join(PACKAGE, 'bin', 'agsc.js'), ...args], { cwd: notes, encoding: 'utf8', env });
    fs.writeFileSync(path.join(notes, 'sourdough.md'), '# Sourdough starter\n\nFlour and water.\n');
    fs.writeFileSync(path.join(notes, name), '---\ndescription: what to bake next week, and in which order\n---\n\nRye, then spelt.\n');
    const first = agsc('init');
    assert.strictEqual(first.status, 0, first.stderr);
    assert.ok(`${first.stdout}${first.stderr}`.split('\n').includes(quoted), `init did not print the line the guide quotes:\n  ${quoted}\nit printed:\n${first.stdout}${first.stderr}`);
    assert.ok(fs.existsSync(path.join(notes, name)), `${name} was moved`);
    fs.writeFileSync(path.join(notes, name), 'Rye, then spelt.\n');
    const again = agsc('init');
    assert.strictEqual(again.status, 0, again.stderr);
    assert.ok(`${again.stdout}${again.stderr}`.includes(`wrote: content/concepts/${name}`), `a second init did not adopt ${name} once its header was gone:\n${again.stdout}${again.stderr}`);
    assert.ok(guide.includes('run `agsc init` again'), 'mode-0.md does not say to run agsc init again');
  } finally {
    fs.rmSync(scratch, { force: true, recursive: true });
  }
});
