'use strict';
// verifies AGSC-00-20, AGSC-00-21, AGSC-10-02
// The declared scope and the overview of the specification, read as text: what the declared-scope
// rule names for a later version, the rows of the "ignore and preserve" table, the
// routes a Level-0 node serves, the terms and the normative references of spec/00,
// and the clarified wording of the version, carrier and board rules. Plain text only,
// so a reworded sentence keeps the test meaningful. No clock, no network, no writes.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const OVERVIEW = read('spec/00-overview.md');
const PROFILES = read('spec/10-implementation-profiles.md');
const SPEC = fs.readdirSync(path.join(ROOT, 'spec')).filter((f) => f.endsWith('.md')).sort()
  .map((f) => read(`spec/${f}`)).join('\n');

/** A rule's whole text, nested lists and tables included, up to the next rule or section. */
function ruleText(text, id) {
  const at = text.indexOf(`- **${id}**`);
  assert.ok(at >= 0, `${id} was not found`);
  const ends = [text.indexOf('\n- **AGSC-', at + 1), text.indexOf('\n## ', at + 1), text.indexOf('\n> ', at + 1)]
    .filter((n) => n > 0);
  return text.slice(at, ends.length ? Math.min(...ends) : undefined);
}

/** The text without its dated notes and rationales, which quote old wording. */
const normative = (text) => text.replace(/\*\((?:Amended|Rationale)[^]*?\)\*/gu, '');

test('AGSC-00-21: the table has a row for each artefact, and for an environment name, that a reader may meet from a later version', () => {
  const rows = ruleText(OVERVIEW, 'AGSC-00-21').split('\n').filter((l) => /^\s*\| /u.test(l)).slice(2);
  assert.ok(rows.length >= 13, `${rows.length} rows read`);
  const rowOf = (pattern) => rows.find((r) => pattern.test(r.split('|')[1] || ''));
  for (const [what, pattern] of [
    ['the gate verdict', /gate\.json/u],
    ['the Harness description', /harness\.jsonld/u],
    ['the conformance report', /conformance report/u],
    ['the agent card', /agent card/iu],
    ['an environment name', /AGSC_/u],
  ]) {
    const row = rowOf(pattern);
    assert.ok(row, `no row for ${what}`);
    const cells = row.split('|').map((c) => c.trim());
    assert.ok(cells[2].length > 0, `the row for ${what} says nothing a reader does`);
    assert.match(cells[3], /AGSC-\d{2}-\d{2}|this rule/u, `the row for ${what} names no owning rule`);
  }
});

test('AGSC-10-02: a Level-0 node is described by the routes it serves, and its content files are not routes', () => {
  const rule = normative(ruleText(PROFILES, 'AGSC-10-02'));
  const sentence = (rule.match(/serves these routes[^]*?\.(?=\s+[A-Z])/u) || [''])[0];
  assert.ok(sentence, 'the sentence naming what a Level-0 node serves was not found');
  const routes = [...sentence.matchAll(/`([^`]+)`/gu)].map((m) => m[1]);
  assert.ok(routes.length >= 3, `only ${routes.length} routes named`);
  for (const route of routes) assert.match(route, /^\//u, `${route} is not a route`);
  for (const route of ['/.well-known/knowledge-linkset', '/graph.jsonld', '/llms.txt']) {
    assert.ok(routes.includes(route), `${route} is not among the routes`);
  }
  assert.match(rule, /content\/index\.md/u, 'the root document is still named, as a file of the Bundle');
  assert.match(rule, /not routes/u, 'the rule says that the files of the Bundle are not routes');
});

test('AGSC-00-20: the eleven capabilities of the reference distribution are planned for a later MINOR, and none is "not planned"', () => {
  const rule = normative(ruleText(OVERVIEW, 'AGSC-00-20'));
  const at = rule.search(/Planned for a later MINOR as capabilities of the reference distribution/u);
  assert.ok(at >= 0, 'the list of capabilities planned for a later MINOR was not found');
  const list = rule.slice(at, rule.indexOf('**2.0**', at) > 0 ? rule.indexOf('**2.0**', at) : undefined);
  const eleven = {
    'an ingest stub and channel adapters': [/ingest stub/u, /channel adapters/u],
    'init examples, type folders, forge workflow, init options': [/example Concepts/u, /type folders/u, /forge workflow/u, /--forge/u, /--host/u],
    'direct memory adapters': [/Mem0/u, /Letta/u, /Zep/u, /CSV/u],
    'other skill install trees and install from a site': [/install trees/u, /from a published site/u],
    'a container image, Homebrew, Nix and a PyPI wrapper': [/container image/u, /Homebrew/u, /Nix/u, /PyPI/u],
    'git mirror and weekly attested snapshot': [/git mirror/u, /weekly attested snapshot/u],
    'a model client for the review lane': [/model client for the review lane/u],
    narrate: [/narrate/u],
    'Basic Memory and Claude Code memory adapters': [/Basic Memory/u, /Claude Code/u],
    'Deno, Bun and Workers': [/Deno/u, /Bun/u, /Workers/u],
    'a model adapter for the agent lane': [/model adapter for the agent lane/u],
  };
  for (const [name, patterns] of Object.entries(eleven)) {
    for (const p of patterns) assert.match(list, p, `${name}: ${p} is not in the list planned for a later MINOR`);
  }
  assert.doesNotMatch(OVERVIEW, /declared scope of (?:any|no) version|not planned/u);
});

test('AGSC-00-20: the items already sent to 1.1 are named, and an unknown key is AGSC-E004 only in the configuration', () => {
  const rule = normative(ruleText(OVERVIEW, 'AGSC-00-20'));
  for (const p of [/provenance/u, /duplicate-of/u, /import/u, /answers of `search` and `ask`/u, /2025-11-25/u, /2026-07-28/u, /isError/u,
    /failed conformance case/u, /Content-Digest/u, /Cursor/u, /security\.txt/u, /immutable/u, /model-adapter plugin kind/u,
    /trailing ledger entry that no longer names the builder/u, /different `?spec_version`? values/u, /punctuation or letters outside ASCII/u, /`remember` checking the `id` of a `sources\[\]` entry/u]) {
    assert.match(rule, p, `${p} is not named in the declared scope`);
  }
  assert.doesNotMatch(rule, /unknown key as `AGSC-E004` as today/u);
  assert.match(rule, /unknown configuration key as `AGSC-E004`/u);
});

test('AGSC-00-17: when the root document and the configuration differ, the configuration governs', () => {
  const rule = normative(ruleText(OVERVIEW, 'AGSC-00-17'));
  assert.match(rule, /configuration's value governs/u);
  assert.match(rule, /1\.1/u, 'a finding for the mismatch is named as a 1.1 addition');
});

test('section 0.2 defines the terms the rules use, and the two private names are said to be unregistered', () => {
  const terms = OVERVIEW.slice(OVERVIEW.indexOf('## 0.2 Terms'), OVERVIEW.indexOf('## 0.3'));
  for (const term of ['Mode 0', 'Mode 5', 'Persona', 'Forge', 'Content branch', 'Namespace document site',
    'Launch pipeline', 'refs[]']) {
    assert.ok(new RegExp(`^ {2}- \\*\\*\`?${term.replace(/[[\]]/gu, '\\$&')}`, 'mu').test(terms), `${term} is not defined in 0.2`);
  }
  assert.match(terms, /P0 to P15/u);
  assert.match(terms, /urn:agsc:[^\n]*memory:[^\n]*not registered[^\n]*never dereferenced/u);
});

test('the overview lists its normative references, and each one is cited by the rules', () => {
  const at = OVERVIEW.indexOf('## 0.7 Normative references');
  assert.ok(at >= 0, 'no normative-references section');
  const list = OVERVIEW.slice(at, OVERVIEW.indexOf('\n> ', at) > 0 ? OVERVIEW.indexOf('\n> ', at) : undefined);
  for (const p of [/RFC 2119/u, /RFC 8174/u, /RFC 9111/u, /Open Knowledge Format[^\n]*0\.2/u]) assert.match(list, p);
  const elsewhere = SPEC.replace(list, '');
  for (const [rfc] of list.matchAll(/RFC \d{4}/gu)) {
    if (rfc === 'RFC 5646' || rfc === 'RFC 4647' || rfc === 'RFC 5890' || rfc === 'RFC 5891') continue; // named through BCP 47 and IDNA
    assert.ok(elsewhere.includes(rfc), `${rfc} is listed and cited by no rule`);
  }
});

test('AGSC-10-08: the Bundle id is declared in the configuration, which is not a route', () => {
  const rule = normative(ruleText(PROFILES, 'AGSC-10-08'));
  assert.doesNotMatch(rule, /MUST publish/u);
  assert.match(rule, /not a route/u);
});

test('AGSC-10-13: a merging client expands a board slug with the type folder of the item it names', () => {
  const rule = normative(ruleText(PROFILES, 'AGSC-10-13'));
  assert.match(rule, /type folder/u);
});
