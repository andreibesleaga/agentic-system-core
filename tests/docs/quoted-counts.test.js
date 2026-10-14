'use strict';
// tests/docs/quoted-counts.test.js — the counts the documents quote are the counts of
// this tree. A document that says how many cases, areas, personas, feature files or
// guides there are is held to the number the tree gives today, and the measurements
// page is held to the record it was written from (`docs/measurements.json`), which in
// turn names the specification version it measured. The record is not held to every
// later count of the tree: it is re-run for each release, and says which tree it ran on.
//
// Where a sentence can say the same thing without a number, it may; the checks below
// only bind a number that is written.
//
// Deterministic: reads files and runs the shipped counter once; no clock, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

/** The text of one file of the repository, relative to its root. */
function read(rel) {
  return fs.readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8');
}

/** Lines joined into one string, so that hard-wrapped prose reads as one sentence. */
function flat(text) {
  return text.replace(/\s+/gu, ' ');
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty'];
const TENS = { forty: 40, thirty: 30, twenty: 20, fifty: 50 };

/** A count written in digits or in English words up to fifty-nine; null for anything else. */
function number(written) {
  const w = String(written).toLowerCase().replace(/,/gu, '');
  if (/^\d+$/u.test(w)) return Number(w);
  const at = WORDS.indexOf(w);
  if (at !== -1) return at;
  const m = /^(twenty|thirty|forty|fifty)-(one|two|three|four|five|six|seven|eight|nine)$/u.exec(w);
  return m ? TENS[m[1]] + WORDS.indexOf(m[2]) : null;
}

/** The shipped counter's view of this tree. */
const COUNTS = JSON.parse(cp.execFileSync(process.execPath, [path.join(ROOT, 'tools', 'count-artifacts'), '--json'],
  { cwd: ROOT, encoding: 'utf8' })).counts;
const AREAS = COUNTS.vector_areas.length;

/** The feature files, one per persona of the scenarios: `0`, `a` … */
const PERSONAS = fs.readdirSync(path.join(ROOT, 'features'))
  .map((f) => /^persona-([0-9a-z])-.*\.feature$/u.exec(f)).filter(Boolean).map((m) => m[1]).sort();

const RECORD = JSON.parse(read('docs/measurements.json'));
const MEASUREMENTS = read('docs/MEASUREMENTS.md');

test('the measurement record names the specification version of this tree', () => {
  assert.strictEqual(RECORD.spec_version, COUNTS.spec_version,
    'docs/measurements.json was measured on another version; re-run every layer of bench/measure.js and --assemble');
  assert.match(flat(MEASUREMENTS.split('\n## ')[0]), new RegExp(`on the \`${COUNTS.spec_version.replace(/\./gu, '\\.')}\` tree`, 'u'),
    'the status line of docs/MEASUREMENTS.md does not name the tree it measured');
});

test('docs/MEASUREMENTS.md quotes its record', () => {
  const text = flat(MEASUREMENTS);
  const c = RECORD.layers.conformance;
  const run = c.vector_run;
  assert.ok(text.includes(`\`${run.pass} pass, ${run.fail} fail, ${run.skip} skip (${run.withdrawn} withdrawn, ${run.pending} pending) of ${run.total}\``),
    'the vector run line is not the record\'s');
  const v = c.vectors;
  assert.ok(text.includes(`| conformance vectors: total / required / optional / withdrawn | ${v.total} / ${v.required} / ${v.optional} / ${v.withdrawn} |`),
    'the summary row of the vectors is not the record\'s');
  assert.ok(text.includes(`| rules declared / active / reserved | ${c.rules.total} / ${c.rules.active} / ${c.rules.reserved} |`),
    'the summary row of the rules is not the record\'s');
  assert.ok(text.includes(`| error codes registered / used | ${c.error_codes.registered} / ${c.error_codes.used} |`),
    'the summary row of the codes is not the record\'s');
  const areas = Object.keys(c.vector_areas);
  assert.ok(text.includes(`| populated vector areas | ${areas.length} |`), 'the summary row of the areas is not the record\'s');
  assert.ok(text.includes(`populated areas are \`${areas.join(' ')}\``), 'the list of populated areas is not the record\'s');

  const s = RECORD.layers.security;
  assert.ok(text.includes(`A seeded corpus of **${s.corpus.cases} cases**: **${s.totals.faults} faults the rules name**, **${s.totals.controls} valid controls**`),
    'the size of the security corpus is not the record\'s');
  assert.ok(text.includes(`**Score: ${s.totals.handled} of ${s.totals.faults} faults stopped`), 'the security score is not the record\'s');
  assert.ok(text.includes(`**Controls: ${s.totals.clean} of ${s.totals.controls} clean.**`), 'the controls line is not the record\'s');

  const d = RECORD.layers.determinism;
  assert.ok(text.includes(`| two clean builds compared | ${d.double_build.compared} output files, ${d.double_build.different.length} differing |`),
    'the determinism row is not the record\'s');

  const p = RECORD.layers.package;
  assert.ok(text.includes(`| files in the tarball | **${p.files}** |`), 'the package file count is not the record\'s');
  assert.ok(text.includes(`| npm package | ${p.files} files,`), 'the summary row of the package is not the record\'s');

  const t = RECORD.layers.parity.totals;
  assert.ok(text.includes(`| **total** | | **${t.calls}** | **${t.equal}** | **${t.required_difference}** | **${t.differing}** | **${t.transport_equal} / ${t.calls}** |`),
    'the parity totals are not the record\'s');
});

test('every quoted count of populated areas is the number of populated areas', () => {
  for (const rel of ['docs/MEASUREMENTS.md', 'docs/BENCHMARKS.md', 'README.md', 'docs/CONFORMANCE-STATEMENTS.md']) {
    const text = flat(read(rel));
    for (const m of text.matchAll(/\b(?:the |of |in )?([A-Za-z0-9-]+) populated (?:vector )?areas\b/gu)) {
      const n = number(m[1]);
      if (n !== null) assert.strictEqual(n, AREAS, `${rel}: "${m[0]}"; the vectors populate ${AREAS} areas`);
    }
    for (const m of text.matchAll(/\bruns? \S+ of (\d+) areas\b/gu)) {
      assert.strictEqual(Number(m[1]), AREAS, `${rel}: "${m[0]}"; the vectors populate ${AREAS} areas`);
    }
  }
  // The PRD is kept as written; its count is answered by a dated note in "Notes at 1.0.0".
  const notes = flat(read('docs/PRD.md').split('## Notes at 1.0.0')[1] || '');
  assert.ok(new RegExp(`\\b${WORDS[AREAS] || AREAS} populated areas\\b`, 'u').test(notes),
    `the PRD's notes at 1.0.0 do not say how many areas are populated (${AREAS})`);
});

test('the fixture sentence names the number of cases that use the fixture, if it names one', () => {
  const named = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const where = path.join(dir, e.name);
      if (e.isDirectory()) walk(where);
      else if (e.name.endsWith('.json') && /"bundle":\s*"fixtures\/minimal"/u.test(fs.readFileSync(where, 'utf8'))) named.push(e.name);
    }
  };
  walk(path.join(ROOT, 'tests', 'vectors'));
  assert.ok(named.length > 0);
  const rule = flat(read('spec/00-overview.md').split('\n').find((l) => l.startsWith('- **AGSC-00-01**')));
  const readme = flat(read('tests/vectors/README.md'));
  for (const [where, text] of [['AGSC-00-01', rule], ['tests/vectors/README.md', readme]]) {
    assert.ok(text.includes('tests/fixtures/minimal/'), `${where} does not name the fixture Bundle`);
    for (const m of text.matchAll(/\b([A-Za-z0-9-]+) (?:test )?cases name\b/gu)) {
      const n = number(m[1]);
      if (n !== null) assert.strictEqual(n, named.length, `${where}: "${m[0]}"; ${named.length} case files name the fixture`);
    }
  }
});

test('features/README.md counts the scenarios of each feature file', () => {
  const text = read('features/README.md');
  const counts = Object.create(null);
  for (const f of fs.readdirSync(path.join(ROOT, 'features')).filter((n) => n.endsWith('.feature'))) {
    counts[f] = (read(`features/${f}`).match(/^\s*Scenario(?: Outline)?:/gmu) || []).length;
  }
  for (const [f, n] of Object.entries(counts)) {
    const row = text.split('\n').find((l) => l.startsWith(`| \`${f}\` |`));
    assert.ok(row, `the coverage table has no row for ${f}`);
    assert.strictEqual(Number(row.split('|')[4].trim()), n, `the coverage table gives ${f} a scenario count other than its ${n}`);
  }
  const values = Object.values(counts);
  const range = /`Feature:` \+ (\d+)–(\d+) `Scenario:`/u.exec(flat(text));
  assert.ok(range, 'the README does not give the range of scenarios per file');
  assert.deepStrictEqual([Number(range[1]), Number(range[2])], [Math.min(...values), Math.max(...values)]);
  const files = /^(\w+) `\.feature` files/mu.exec(text);
  assert.ok(files && number(files[1]) === Object.keys(counts).length, 'the README does not count the feature files');
});

test('the persona counts of the demos and the scenario map are the personas of the scenarios', () => {
  const demos = read('docs/DEMOS.md');
  const table = (/\n## The \S+ personas, by demo\n([\s\S]*?)(?:\n## |$)/u.exec(demos) || [])[1] || '';
  const rows = table.split('\n').filter((l) => /^\| [0-9A-Z] — /u.test(l)).map((l) => l[2].toLowerCase()).sort();
  assert.deepStrictEqual(rows, PERSONAS, 'the persona table of docs/DEMOS.md has a row for each persona of features/');
  for (const m of flat(demos).matchAll(/\b(?:the |of the )([A-Za-z0-9-]+) personas\b/gu)) {
    const n = number(m[1]);
    if (n !== null) assert.strictEqual(n, PERSONAS.length, `docs/DEMOS.md: "${m[0]}"`);
  }
  const map = read('docs/diagrams/scenario-map.md');
  for (const letter of PERSONAS) {
    assert.ok(map.includes(`F${letter}["persona-${letter}-`), `the scenario map has no node for persona-${letter}`);
  }
  const prd = (read('docs/PRD.md').match(/^\| P\d+ \|/gmu) || []).length;
  for (const m of flat(map).matchAll(/\b([A-Za-z0-9-]+) (personas|`features\/\*\.feature` files)\b/gu)) {
    const n = number(m[1]);
    if (n === null) continue;
    assert.strictEqual(n, m[2] === 'personas' ? prd : PERSONAS.length, `docs/diagrams/scenario-map.md: "${m[0]}"`);
  }
});

test('the pages that count the guides say seven', () => {
  for (const rel of ['docs/TESTING.md', 'docs/README.md']) {
    const text = flat(read(rel));
    assert.doesNotMatch(text, /(?:the|of) six mode guides of|one short guide per mode/u, `${rel} still counts six guides`);
    assert.match(text, /seven (?:short )?guides/u, `${rel} does not say seven guides`);
  }
});

test('the summary table of docs/MEASUREMENTS.md quotes the record', () => {
  const text = flat(MEASUREMENTS);
  const c = RECORD.layers.conformance;
  const run = c.vector_run;
  assert.ok(text.includes(`| vector run | ${run.pass} pass, ${run.fail} fail, ${run.skip} skipped (the ${run.withdrawn} withdrawn) |`),
    'the summary row of the vector run is not the record\'s');
  const v = c.vectors;
  assert.ok(text.includes(`Of the ${v.total} vectors, ${v.required} are required, ${v.optional} is optional and ${v.withdrawn} are withdrawn`),
    'the sentence that splits the vectors is not the record\'s');
  const s = RECORD.layers.security.totals;
  assert.ok(text.includes(`| security floor: seeded faults stopped | ${s.handled} of ${s.faults}, each under its rule's code (${s.detected} detected, ${s.refused} refused, ${s.neutralised} neutralised, ${s.finished} finished; none missed)`),
    'the summary row of the security score is not the record\'s');
  assert.ok(text.includes(`${s.detected} detected, ${s.refused} refused, ${s.neutralised} neutralised, ${s.finished} finished, none refused under another code`),
    'the security score line of §3 is not the record\'s');
  assert.ok(text.includes(`| security floor: valid controls clean | ${s.clean} of ${s.controls} |`),
    'the summary row of the security controls is not the record\'s');
});
