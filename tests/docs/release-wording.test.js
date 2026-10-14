'use strict';
// tests/docs/release-wording.test.js — the documents of this repository speak of the
// version the tree declares as what it is.
//
// When `spec_version` (spec/00-overview.md) carries no pre-release part, no document
// calls the current version a release candidate, asks for `--pre` to install it, or
// says that the reference engine makes no conformance claim. The reference engine's
// claim (AGSC-10-05) is written once, in docs/CONFORMANCE-STATEMENTS.md under the
// heading "The reference engine's claim", in the form of AGSC-09-01, with the numbers
// the tree's own count gives; the bullets under it ("The run", "The runtime") give the
// same numbers; the README quotes it word for word, and src/REFERENCE.md, the
// implementers' guide and the architecture guide point to it.
//
// Deterministic: reads files and runs `tools/count-artifacts` in process; no clock,
// no network, no child process.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const CLAIM_HEADING = "The reference engine's claim";
const CLAIM_ANCHOR = 'the-reference-engines-claim';

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
  return lines.slice(start + 1, end).join('\n');
}

/** The specification version the tree declares. */
function declaredVersion() {
  const match = /spec_version: "([^"]+)"/u.exec(read('spec/00-overview.md'));
  assert.ok(match, 'spec/00-overview.md declares no spec_version');
  return match[1];
}

/** True when a SemVer version carries a pre-release part. */
function isPreRelease(version) {
  return /^\d+\.\d+\.\d+-/u.test(version);
}

/**
 * Every sentence form that calls `version` a release candidate, or that is true only
 * before a final release. Each entry is [pattern over flattened text, what it says].
 */
function candidateForms(version) {
  const literal = version.replace(/\./gu, '\\.');
  return [
    [/\bthis release candidate\b/iu, '"this release candidate"'],
    [/\*\*Release candidate\.\*\*/u, 'a status line "Release candidate."'],
    [/\bpip install --pre\b/u, 'an install line with --pre'],
    [/\bbetween release candidates\b/iu, '"frozen between release candidates"'],
    [new RegExp(`\`${literal}\`,? (?:is )?(?:a|the [a-z]+(?: public)?) release candidate`, 'iu'),
      'the current version called a release candidate'],
    [new RegExp(`\\buntil \`?${literal}\`? is released\\b`, 'iu'), '"until it is released"'],
    [/\bis a SemVer pre-release\b/iu, '"is a SemVer pre-release"'],
    [/\bclaims no conformance Level\b/iu, 'the engine "claims no conformance Level"'],
    [/\bno conformance claim\*{0,2} in this release\b/iu, '"no conformance claim in this release"'],
    [/\bclaims today: nothing\b/iu, '"claims today: nothing"'],
    [/\bclaims nothing before 1\.0\.0\b(?! and)/iu, '"claims nothing before 1.0.0", with no word on 1.0.0 itself'],
    [/\*\*Upgrading from 1\.0\.0-rc\.\d+\.\*\*/u, 'an upgrade paragraph named after one candidate only'],
  ];
}

/** The forms of `candidateForms` that `text` contains, by what each says. */
function candidateHits(text, version) {
  const body = flat(text);
  return candidateForms(version).filter(([pattern]) => pattern.test(body)).map(([, what]) => what);
}

// Folders that hold no document of this repository's own (dependencies, ignored local
// trees, build output), and the records that are history by design: the change log, the
// released conformance cases (AGSC-00-16) and the posted Internet-Draft revision.
const SKIP_DIRS = new Set(['.git', 'node_modules', 'GABBE', 'coverage', 'dist', 'www']);
const SKIP_FILES = new Set(['CHANGELOG.md']);
const SKIP_PATHS = ['tests/vectors/', 'internet-draft/'];

/** Every Markdown and HTML document of the repository, relative to its root, sorted. */
function documents() {
  const out = [];
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !SKIP_PATHS.some((p) => `${child}/`.startsWith(p))) walk(child);
      } else if (/\.(?:md|html)$/u.test(entry.name) && !SKIP_FILES.has(entry.name)) {
        out.push(child);
      }
    }
  };
  walk('');
  return out.sort();
}

/** The `count-artifacts` counts of this tree. */
function counts() {
  const tool = require(path.join(ROOT, 'tools', 'count-artifacts'));
  let out = '';
  const code = tool.run(['--json', ROOT], { err: () => {}, out: (s) => { out += s; } });
  assert.equal(code, 0, 'count-artifacts failed');
  return JSON.parse(out).counts;
}

/** The ids of the cases of one area that are not withdrawn, sorted. */
function liveCases(area) {
  const dir = path.join(ROOT, 'tests', 'vectors', area);
  return fs.readdirSync(dir).filter((n) => n.endsWith('.json'))
    .map((n) => JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')))
    .filter((c) => c.level !== 'withdrawn').map((c) => c.id).sort();
}

/** The level of one case, found by its id in its area folder. */
function caseLevel(area, id) {
  const dir = path.join(ROOT, 'tests', 'vectors', area);
  const name = fs.readdirSync(dir).find((n) => n.startsWith(`${id}-`));
  assert.ok(name, `no case ${id} in tests/vectors/${area}/`);
  return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')).level;
}

/** The quoted claim of the conformance-statements page: its blockquote lines, as written. */
function claimBlock() {
  const body = section(read('docs/CONFORMANCE-STATEMENTS.md'), CLAIM_HEADING);
  const lines = body.split('\n');
  const start = lines.findIndex((l) => l.startsWith('> agentic-system-core '));
  assert.ok(start !== -1, `"## ${CLAIM_HEADING}" quotes no claim that starts "> agentic-system-core "`);
  let end = start;
  while (end < lines.length && lines[end].startsWith('>')) end += 1;
  return lines.slice(start, end).join('\n');
}

/** The claim as one line of prose, without the blockquote marks. */
function claimText() {
  return flat(claimBlock().replace(/^> ?/gmu, ''));
}

/** One bullet under the claim, `- **<name>.** …`, as one line of prose. */
function claimBullet(name) {
  const lines = section(read('docs/CONFORMANCE-STATEMENTS.md'), CLAIM_HEADING).split('\n');
  const start = lines.findIndex((l) => l.startsWith(`- **${name}.**`));
  assert.ok(start !== -1, `"## ${CLAIM_HEADING}" has no bullet "${name}."`);
  let end = start + 1;
  while (end < lines.length && lines[end].startsWith('  ')) end += 1;
  return flat(lines.slice(start, end).join('\n'));
}

// Counts written in words, as the documents write them (the same reading as the
// quoted-counts test, copied: test files do not import each other).
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

/** How a sentence counts `n` Unicode versions that all sit inside one window. */
function unicodeWindowPhrase(n) {
  if (n === 1) return 'The Unicode version is inside the window';
  if (n === 2) return 'Both Unicode versions are inside the window';
  return `All ${WORDS[n] || n} Unicode versions are inside the window`;
}

test('the detector finds each candidate form and leaves the general sentences alone', () => {
  const flagged = [
    '**Release candidate.** This tree states specification `1.0.0-rc.7`.',
    'Install with `pip install --pre agentic-system-core`.',
    'The reference engine publishes **no conformance claim** in this release candidate.',
    '**What the reference distribution claims today: nothing.**',
    'rules, schemas, vocabulary, vectors. Frozen between release candidates',
    'Specification `1.0.0`, a release candidate tagged on 2026-10-14.',
    'It **claims no conformance Level** yet.',
    'the reference engine claims nothing before 1.0.0 (AGSC-10-05).',
    '**Upgrading from 1.0.0-rc.6.** `CHANGELOG.md` has a section of that name.',
  ];
  for (const sentence of flagged) {
    assert.ok(candidateHits(sentence, '1.0.0').length > 0, `not flagged: ${sentence}`);
  }
  const kept = [
    'no fix is made to a release candidate.',
    'the full `spec_version` whose cases were run (a release candidate named as such)',
    'the `.htaccess` version rule already accepts a SemVer pre-release suffix.',
    'this version: `1.0.0`, after two public release candidates',
    'the reference engine claims nothing before 1.0.0 and claims Level 3 at 1.0.0.',
    '**Upgrading from a release candidate.** `CHANGELOG.md` has one section per release.',
  ];
  for (const sentence of kept) {
    assert.deepEqual(candidateHits(sentence, '1.0.0'), [], `flagged: ${sentence}`);
  }
});

test('when the declared version is final, no document calls it a release candidate', (t) => {
  const version = declaredVersion();
  if (isPreRelease(version)) {
    t.skip(`spec_version ${version} is a pre-release; the candidate wording is true`);
    return;
  }
  const hits = [];
  for (const rel of documents()) {
    for (const what of candidateHits(read(rel), version)) hits.push(`${rel}: ${what}`);
  }
  assert.deepEqual(hits, [], `documents that still speak of a release candidate:\n${hits.join('\n')}`);
});

test('the README points an upgrader to every candidate section of the change log', (t) => {
  const version = declaredVersion();
  if (isPreRelease(version)) {
    t.skip(`spec_version ${version} is a pre-release`);
    return;
  }
  const readme = flat(read('README.md'));
  const changelog = read('CHANGELOG.md');
  const upgrades = [...changelog.matchAll(/^### Upgrading from (1\.0\.0-rc\.\d+)$/gmu)].map((m) => m[1]);
  assert.ok(upgrades.length >= 2, 'the change log has an upgrade section for each candidate');
  assert.match(readme, /\*\*Upgrading from a release candidate\.\*\*/u);
  for (const from of upgrades) {
    const anchor = `upgrading-from-${from.replace(/\./gu, '')}`;
    assert.ok(readme.includes(`(CHANGELOG.md#${anchor})`), `the README does not link CHANGELOG.md#${anchor}`);
  }
  assert.doesNotMatch(readme, /pip install --pre/u);
  assert.match(readme, /`pip install agentic-system-core`/u);
});

test('the reference engine\'s claim is written once, in the form of AGSC-09-01, with the tree\'s own numbers', () => {
  const page = read('docs/CONFORMANCE-STATEMENTS.md');
  assert.equal(page.split('\n').filter((l) => l === `## ${CLAIM_HEADING}`).length, 1,
    `exactly one "## ${CLAIM_HEADING}" heading`);
  const claim = claimText();
  const version = declaredVersion();
  const pkg = JSON.parse(read('package.json'));
  const c = counts();
  const run = c.vectors_required + c.vectors_optional;
  const areas = c.vector_areas;

  // (a) implementation and version, (b) one Level, (c) the full specification version.
  assert.ok(claim.startsWith(`agentic-system-core ${pkg.version} conforms to AgenticSystemCore ${version}, Level 3.`),
    `the claim does not open with the implementation, its version ${pkg.version}, specification ${version} and Level 3`);
  // The date of the run.
  assert.match(claim, /Verified against the published conformance vectors on \d{4}-\d{2}-\d{2}:/u);
  // (d) the vector set: cases run and passed, the areas by number and by name, the withdrawn ones excluded.
  assert.ok(claim.includes(`${run} of ${run} passed in the ${areas.length} populated areas`),
    `the claim does not say "${run} of ${run} passed in the ${areas.length} populated areas"`);
  assert.ok(claim.includes(`(${areas.join(', ')})`), 'the claim does not name the populated areas, in order');
  assert.ok(claim.includes(`${c.vectors_required} required and ${c.vectors_optional} optional`),
    `the claim does not split the ${run} into ${c.vectors_required} required and ${c.vectors_optional} optional`);
  assert.ok(claim.includes(`the ${c.vectors_withdrawn} withdrawn cases excluded`),
    `the claim does not exclude the ${c.vectors_withdrawn} withdrawn cases`);
  // (e) the Unicode version of the runtime, inside the window of AGSC-04-22.
  const unicode = /with Unicode (\d+)\.(\d+)/u.exec(claim);
  assert.ok(unicode, 'the claim names no Unicode version');
  const major = Number(unicode[1]);
  assert.ok(major >= 15 && major <= 18, `Unicode ${unicode[1]}.${unicode[2]} is outside the window of AGSC-04-22`);
  // (f) the deployment profile.
  assert.match(claim, /Deployment profile: cloudflare-pages — /u);
  // (g) every surface a built node declares, each with the cases that prove it.
  const chunks = liveCases('chunks');
  assert.ok(chunks.length > 0);
  assert.ok(claim.includes(`chunks (proved by ${chunks.join(', ')})`), 'the chunks surface does not name every live chunks case');
  assert.ok(claim.includes('llms-txt (proved by disc-0013, disc-0014)'));
  assert.ok(claim.includes('webmcp (proved by cli-0003)'));
  for (const [area, id] of [['discovery', 'disc-0013'], ['discovery', 'disc-0014'], ['cli', 'cli-0003']]) {
    assert.equal(caseLevel(area, id), 'required', `${id} proves a surface and must be a required case`);
  }
  assert.doesNotMatch(claim, /\bmcp \(proved/u, 'a 1.0 writer does not declare mcp (AGSC-11-16)');
  // No word that suggests the project vouches for itself.
  assert.doesNotMatch(claim, /certif|approved|official/iu);

  // The run under the claim gives the same numbers as the claim: the cases run all
  // passed, and the withdrawn ones are the skipped ones.
  const runBullet = claimBullet('The run');
  assert.ok(runBullet.includes(`summary is ${run} passed, 0 failed and ${c.vectors_withdrawn} skipped.`),
    `"The run" does not say "${run} passed, 0 failed and ${c.vectors_withdrawn} skipped"`);
  const skipped = /\bThe ([a-z0-9-]+) skipped are the withdrawn cases\b/iu.exec(runBullet);
  assert.ok(skipped, '"The run" does not say which cases were skipped');
  assert.equal(number(skipped[1]), c.vectors_withdrawn,
    `"The run" calls ${skipped[1]} cases withdrawn; the count gives ${c.vectors_withdrawn}`);

  // The runtime: the word that counts the Unicode versions counts the ones the bullet names.
  const runtime = claimBullet('The runtime');
  const versions = new Set([...runtime.matchAll(/\bUnicode (\d+\.\d+)/gu)].map((m) => m[1]));
  assert.ok(versions.size > 0, '"The runtime" names no Unicode version');
  const phrase = unicodeWindowPhrase(versions.size);
  assert.ok(runtime.includes(`${phrase} AGSC-04-22 states`),
    `"The runtime" names ${versions.size} Unicode versions (${[...versions].join(', ')}) and must say "${phrase} AGSC-04-22 states"`);
});

test('the README quotes the claim word for word and links to it; the other pages point to it', () => {
  const block = claimBlock();
  const engine = section(read('README.md'), 'Reference engine');
  assert.ok(engine.includes(block), 'the README "Reference engine" section does not quote the claim word for word');
  assert.ok(engine.includes(`(docs/CONFORMANCE-STATEMENTS.md#${CLAIM_ANCHOR})`), 'the README does not link to the claim');

  const reference = read('src/REFERENCE.md');
  const claimSection = reference.slice(reference.indexOf('### 11.1 The conformance claim'), reference.indexOf('### 11.2'));
  assert.ok(claimSection.includes(`(../docs/CONFORMANCE-STATEMENTS.md#${CLAIM_ANCHOR})`), 'src/REFERENCE.md §11.1 does not point to the claim');
  assert.match(flat(claimSection), /claims Level 3/u);

  const guide = section(read('docs/IMPLEMENTERS-GUIDE.md'), '7. Claiming a Level');
  assert.ok(guide.includes(`(CONFORMANCE-STATEMENTS.md#${CLAIM_ANCHOR})`), 'the implementers\' guide §7 does not point to the claim');
  assert.match(flat(guide), /claims Level 3/u);

  const architecture = flat(read('docs/ARCHITECTURE-GUIDE.md'));
  assert.ok(architecture.includes(`(CONFORMANCE-STATEMENTS.md#${CLAIM_ANCHOR})`), 'the architecture guide does not point to the claim');
});

/** The text of one `## [<version>]` section of the change log, up to the next `## [`. */
function changelogSection(version) {
  const text = read('CHANGELOG.md');
  const head = `\n## [${version}] - `;
  const start = text.indexOf(head);
  assert.ok(start !== -1, `the change log has no "## [${version}]" section`);
  const end = text.indexOf('\n## [', start + head.length);
  return text.slice(start, end === -1 ? text.length : end);
}

/** The release date of the change-log section that follows `version`'s, in the file order. */
function previousReleaseDate(version) {
  const heads = [...read('CHANGELOG.md').matchAll(/^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})$/gmu)];
  const at = heads.findIndex((m) => m[1] === version);
  assert.ok(at !== -1 && at + 1 < heads.length, `no release before ${version} in the change log`);
  return heads[at + 1][2];
}

/** Note text compared loosely: no backticks, one space, lower case, no closing full stop. */
function noteKey(text) {
  return flat(text.replace(/`/gu, '')).trim().toLowerCase().replace(/\.$/u, '').trim();
}

/** Every dated note of `spec/*.md` written for `version`: [{ rule, day, text }]. */
function amendmentNotes(version) {
  const notes = [];
  const literal = version.replace(/\./gu, '\\.');
  const note = new RegExp(`\\*\\(Amended (\\d{4}-\\d{2}-\\d{2}) for ${literal}: ([\\s\\S]*?)\\)\\*`, 'gu');
  const dir = path.join(ROOT, 'spec');
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.md')).sort()) {
    const lines = fs.readFileSync(path.join(dir, name), 'utf8').split('\n');
    let rule = null;
    let block = [];
    const close = () => {
      if (rule) for (const m of block.join('\n').matchAll(note)) notes.push({ rule, day: m[1], text: m[2] });
    };
    for (const line of lines) {
      const start = /^- \*\*(AGSC-\d{2}-\d{2,3}[a-z]?)\*\*/u.exec(line);
      if (start || line.startsWith('#')) {
        close();
        rule = start ? start[1] : null;
        block = start ? [line] : [];
      } else if (rule) {
        block.push(line);
      }
    }
    close();
  }
  return notes;
}

test('the 1.0.0 change log says what the version adds and where the vocabulary address moves', () => {
  const body = flat(changelogSection('1.0.0'));
  assert.ok(body.includes('adds one section, §0.7'),
    'the upgrading paragraph does not say that 1.0.0 adds one section, §0.7 (the normative references)');
  assert.ok(!body.includes('adds no section'), 'the upgrading paragraph still says that 1.0.0 adds no section');
  assert.ok(body.includes('the `@context` of `graph.jsonld` on a Level 0 or 1 node'),
    'the vocabulary bullet does not limit the move of the graph\'s `@context` to a Level 0 or 1 node, the only node that names the versioned address');
});

test('the 1.0.0 change log names every rule amended after the previous release, with its note', () => {
  const section = changelogSection('1.0.0');
  const entries = flat(section);
  const since = previousReleaseDate('1.0.0');
  const notes = amendmentNotes('1.0.0').filter((n) => n.day > since);
  assert.ok(notes.length > 0, `no note dated after ${since}`);
  const unnamed = [...new Set(notes.map((n) => n.rule))]
    .filter((rule) => !new RegExp(`^- ${rule}: `, 'mu').test(section));
  assert.deepEqual(unnamed, [], `rules amended after ${since} with no entry in the 1.0.0 section`);
  const sectionKey = noteKey(entries);
  const missing = notes.filter((n) => !sectionKey.includes(noteKey(n.text))).map((n) => `${n.rule} (${n.day})`);
  assert.deepEqual(missing, [], 'amendment notes whose text the 1.0.0 section does not carry');
});
