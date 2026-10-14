'use strict';
// tests/docs/requirements-and-plan.test.js — the requirements document (docs/PRD.md),
// the plan (docs/PLAN.md) and the pages that repeat what they promise say what 1.0.0
// ships. The PRD and the plan are kept as they were written: a statement that no
// longer holds is answered by a dated note, never rewritten, so this test checks that
// every such statement has its note. The other pages are corrected in place, so for
// them the test checks the statement itself.
//
// Deterministic: reads files only; no process, no clock, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

/** The text of one file of the repository, relative to its root. */
function read(rel) {
  return fs.readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8');
}

/** Lines joined into one paragraph-insensitive string (hard-wrapped prose reads as one). */
function flat(text) {
  return text.replace(/\s+/gu, ' ');
}

/** The text of one `## Heading` section of a Markdown file, up to the next `## `. */
function section(text, heading) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l === `## ${heading}`);
  assert.ok(start !== -1, `no section "## ${heading}"`);
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (end === -1) end = lines.length;
  return flat(lines.slice(start + 1, end).join('\n'));
}

const PRD_NOTES = 'Notes at 1.0.0 (2026-10-10)';
// A requirement id, built at run time: this test checks what the documents say about a
// requirement and is not evidence for the requirement itself, so the requirements matrix
// must not count it as a test that names one.
const req = (kind, number) => [kind, number].join('-');
const PLAN_NOTES = 'Addendum — notes at 1.0.0 (2026-10-10)';

// The eleven capabilities of the reference distribution that 1.0.0 places at 1.1.
const ELEVEN = Object.freeze([
  /ingest stub and channel adapters/u,
  /example Concepts, type folders and a forge workflow/u,
  /Mem0, Letta, Zep and CSV/u,
  /other agents' install trees/u,
  /GHCR, Homebrew and Nix, and a PyPI wrapper/u,
  /git mirror and a weekly attested snapshot/u,
  /model client for the review lane/u,
  /`narrate`/u,
  /Basic Memory and (?:for )?Claude Code's memory files/u,
  /Deno, Bun and Cloudflare Workers/u,
  /model adapter for the agent lane/u,
]);

test('PRD: the eleven capabilities are planned for 1.1, and the notes that said otherwise are answered', () => {
  const notes = section(read('docs/PRD.md'), PRD_NOTES);
  for (const p of ELEVEN) assert.match(notes, p, `the 1.0.0 notes of the PRD do not name ${p}`);
  assert.match(notes, /planned for 1\.1/u);
  assert.match(notes, /AGSC-00-20/u);
  // Every wording the earlier notes use for them is named, so a reader knows which to re-read.
  for (const quoted of ['not planned', 'not in the declared scope of any version',
    'planned for later, with no version fixed', 'is planned for a version']) {
    assert.ok(notes.includes(`"${quoted}"`), `the 1.0.0 notes do not answer "${quoted}"`);
  }
});

test('PRD: a live run of an agent lane is an outside agent as a client, and a model-adapter kind is a 1.1 candidate', () => {
  const notes = section(read('docs/PRD.md'), PRD_NOTES);
  assert.ok(notes.includes(`Note to ${req('PRD', '063')}`));
  assert.match(notes, /outside the engine/u);
  assert.match(notes, /client of the local tool server/u);
  assert.match(notes, /AGSC-08-28/u);
  assert.match(notes, /model-adapter plugin kind/u);
  assert.match(notes, /AGSC-00-24/u);
});

test('PRD: memory:// is resolved at 1.0, and the row and the non-goal that say otherwise are answered', () => {
  const notes = section(read('docs/PRD.md'), PRD_NOTES);
  assert.ok(notes.includes(`Note to ${req('PRD', '027')} and §4`));
  assert.match(notes, /AGSC-05-04b/u);
  assert.match(notes, /graph-0005/u);
  assert.match(notes, /cli-0015/u);
  assert.match(notes, /AGSC-E309/u);
  for (const quoted of ['(resolver: v2)', 'Alias-only; no resolver', '`memory://` = documented alias only']) {
    assert.ok(notes.includes(`"${quoted}"`), `the 1.0.0 notes do not answer "${quoted}"`);
  }
});

test('PRD: the coverage requirement names the thresholds continuous integration enforces', () => {
  const notes = section(read('docs/PRD.md'), PRD_NOTES);
  assert.ok(notes.includes(`Note to ${req('NFR', '03')}`));
  assert.match(notes, /lines 99\.9 %, functions 99 % and branches 93 %/u);
  assert.match(notes, /npm run test:coverage/u);
  assert.match(notes, /test \(ubuntu-latest, Node 24\)/u);
});

test('PRD: the definition of done reads at 1.0.0 with every persona, final releases and benchmarks at 1.1', () => {
  const prd = read('docs/PRD.md');
  const notes = section(prd, PRD_NOTES);
  assert.match(notes, /Note to §5, the definition of done/u);
  assert.ok(notes.includes('"persona walkthroughs (a)–(j)"'));
  assert.match(notes, /`persona-0` and `persona-a` to `persona-o`/u);
  // The letters stop at the last persona feature file that exists.
  const personas = fs.readdirSync(path.join(ROOT, 'features')).filter((f) => /^persona-[0a-z]-/u.test(f));
  const last = personas.map((f) => f[8]).filter((c) => c !== '0').sort().pop();
  assert.equal(last, 'o', 'the note names persona-o as the last persona file');
  assert.ok(notes.includes('"a DOI for each release"'));
  assert.match(notes, /a DOI for each final release/u);
  assert.match(notes, /tools\/bench/u);
  assert.ok(notes.includes('"published benchmarks are a v1.0.1 gate within 30 days of launch"'));
  // The scope line points to the exceptions note at once.
  const lines = prd.split('\n');
  const scope = lines.findIndex((l) => l.startsWith('Scope: **v1** = must;'));
  assert.ok(scope !== -1, 'the scope line of §2 is missing');
  assert.match(lines.slice(scope + 1, scope + 4).join(' '),
    /Note to the scope cells that Amendment 6 reads as v1\.0/u);
});

test('PRD and plan: the two drafting dates are gone', () => {
  assert.doesNotMatch(read('docs/PRD.md'), /note 2026-10-02/u);
  assert.doesNotMatch(read('docs/PLAN.md'), /\(decided 2026-10-02\)/u);
});

test('plan: every statement that does not hold at 1.0.0 has its note', () => {
  const plan = read('docs/PLAN.md');
  assert.doesNotMatch(plan, /153-card corpus/u);
  const notes = section(plan, PLAN_NOTES);
  const expect = [
    [/never resolved/u, 'the memory:// alias'],
    [/AGSC-05-04b/u, 'the memory:// alias'],
    [/lines 99\.9 %, functions 99 % and branches 93 %/u, 'the coverage bar'],
    [/REUSE/u, 'the REUSE claim'],
    [/tests\/security\/fuzz-patterns\.test\.js/u, 'R7 and T7'],
    [/-linear\.test\.js/u, 'R7 and T7'],
    [/security corpus/u, 'R7 and T7'],
    [/immutable/u, 'the caching line'],
    [/max-age=0/u, 'the caching line'],
    [/2025-11-25/u, 'ADR-013'],
    [/server\/discover/u, 'ADR-013'],
    [/uses, requires, excludes, contradicts and supersedes/u, 'ADR-004'],
    [/Deno, Bun and Cloudflare Workers/u, 'the portability line'],
    [/git mirror and a weekly attested snapshot/u, 'the restore-from-zero addendum'],
    [/planned for 1\.1/u, 'the capabilities'],
  ];
  for (const [p, what] of expect) assert.match(notes, p, `the 1.0.0 notes of the plan miss ${what}: ${p}`);
});

// The pages corrected in place: the benchmark kit is 1.1 work of the tools/bench program,
// and an agent lane's live run is an outside agent, not an adapter someone adds.
const IN_PLACE = Object.freeze([
  'docs/BENCHMARKS.md', 'docs/MEASUREMENTS.md', 'bench/README.md', 'bench/measure.js',
  'docs/DEMOS.md', 'docs/guides/mode-5.md',
]);

test('the benchmark pages promise no v1.0.1 study and no bench verb', () => {
  for (const f of IN_PLACE) {
    const text = flat(read(f));
    assert.doesNotMatch(text, /v1\.0\.1/u, `${f} still names v1.0.1`);
    assert.doesNotMatch(text, /`bench` verb|bench verb/u, `${f} still names a bench verb`);
  }
  for (const f of ['docs/BENCHMARKS.md', 'docs/MEASUREMENTS.md', 'bench/README.md', 'bench/measure.js']) {
    const text = flat(read(f));
    assert.match(text, /1\.1/u, `${f} does not say 1.1`);
    assert.match(text, /`?tools\/bench`? program/u, `${f} does not name the tools/bench program`);
  }
});

test('the demos and the Mode 5 guide name the live route of an agent lane', () => {
  for (const f of ['docs/DEMOS.md', 'docs/guides/mode-5.md']) {
    const text = flat(read(f));
    assert.doesNotMatch(text, /a live run needs one|adapter of (?:their|your) own/u, `${f}`);
    assert.match(text, /a live run is made by an agent outside the engine/u, `${f} does not name the live route`);
    assert.match(text, /AGSC-08-28/u, `${f}`);
  }
});

test('the measurements page names the widths the site lane loads', () => {
  assert.match(flat(read('docs/MEASUREMENTS.md')), /loads every page at 390, 768 and 1280 px/u);
});
