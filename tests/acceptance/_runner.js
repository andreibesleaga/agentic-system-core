'use strict';
// The acceptance runner's library: the parts of `features.test.js` that are rules
// rather than a run, so that `runner.test.js` can show each rule on a small tree.
//
//   pickles       every Scenario, and every Examples row of a Scenario Outline, of
//                 `features/*.feature`, compiled by the Gherkin reference parser;
//   definitions   the step definitions of `steps/`: every file whose name does not
//                 start with `_`, plus the shared phrases of `steps/_common.js`
//                 (other `_` files are helpers: the World, the network trap, the
//                 probe modules); one phrase has exactly one definition;
//   pending       one JSON file per scenario that does not run as written in the
//                 offline lane, `pending/<feature-stem>--<scenario-slug>.json`, with
//                 `scenario` (its exact name), `class`, `reason` and, by class,
//                 `closes_in` (gap) or `needs` (conditional);
//   disposition   what a pending file means for the run of its scenario.
//
// A finding names a registered code: AGSC-E201 a file that is not a pending file
// (not JSON, a member outside the five, a member its class does not take),
// AGSC-E202 a required member missing, AGSC-E203 a class outside the closed list,
// AGSC-E204 a file name that is not the scenario's slug or a malformed value,
// AGSC-E206 two scenarios of one feature with one slug, AGSC-E301 a pending file
// naming no scenario.

const fs = require('node:fs');
const path = require('node:path');

const gherkin = require('@cucumber/gherkin');
const messages = require('@cucumber/messages');

/** The closed list of pending classes; `drift` is not one (see `classProblem`). */
const CLASSES = Object.freeze({
  conditional: 'the scenario runs where the thing its `needs` names is present on the machine (probed by tests/acceptance/steps/_<needs>.js, never through the network) and is skipped, with the reason, where it is not',
  external: 'the scenario needs a third-party service or application (the w3id redirect service, an Obsidian install, a Zenodo deposit)',
  forge: 'the scenario needs a forge or a hosting platform (a pull request, a workflow run, a deploy, an issue, a release)',
  gap: 'a rule requires the behaviour and the reference engine does not implement it yet; `closes_in` names the change that makes it run, which deletes the file',
  model: 'the scenario runs an agent lane for real, which needs a model adapter and a channel adapter; the reference engine ships neither',
});
const MEMBERS = Object.freeze(['class', 'closes_in', 'needs', 'reason', 'scenario']);
const CHANGE = /^[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$/u;
const NEED = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const SLUG_MAX = 100;
const SHARED = '_common.js';

/** The slug of a scenario name: lower-case ASCII letters and digits joined by `-`. */
function scenarioSlug(name) {
  const slug = name.normalize('NFKD').replace(/[̀-ͯ]/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '');
  return slug.slice(0, SLUG_MAX).replace(/-+$/u, '');
}

/** The pending file of one scenario: `<feature-stem>--<scenario-slug>.json`. */
function pendingFileName(featureFile, scenario) {
  return `${featureFile.replace(/\.feature$/u, '')}--${scenarioSlug(scenario)}.json`;
}

/** Every pickle of every feature file, with the file and scenario it came from. */
function readPickles(featuresDir) {
  const out = [];
  for (const file of fs.readdirSync(featuresDir).filter((f) => f.endsWith('.feature')).sort()) {
    const ids = messages.IdGenerator.incrementing();
    const parser = new gherkin.Parser(new gherkin.AstBuilder(ids), new gherkin.GherkinClassicTokenMatcher());
    const document = parser.parse(fs.readFileSync(path.join(featuresDir, file), 'utf8'));
    const counts = new Map();
    for (const pickle of gherkin.compile(document, file, ids)) {
      const n = (counts.get(pickle.name) || 0) + 1;
      counts.set(pickle.name, n);
      out.push({ example: n, file, key: `${file}#${pickle.name}`, pickle });
    }
  }
  return out;
}

/** Two scenario names of one feature that give one slug would share one pending file. */
function slugCollisions(pickles) {
  const problems = [];
  const seen = new Map();
  for (const { file, pickle } of pickles) {
    const slot = `${file}#${scenarioSlug(pickle.name)}`;
    const before = seen.get(slot);
    if (before === undefined) seen.set(slot, pickle.name);
    else if (before !== pickle.name) {
      problems.push({ code: 'AGSC-E206', file: `features/${file}`,
        message: `the scenarios "${before}" and "${pickle.name}" give one slug, ${scenarioSlug(pickle.name)}: rename one` });
    }
  }
  return problems;
}

/** Every step definition: `{ pattern: string|RegExp, run(world, ...captures), file }`. */
function loadDefinitions(stepsDir) {
  return fs.readdirSync(stepsDir)
    .filter((f) => f.endsWith('.js') && (!f.startsWith('_') || f === SHARED)).sort()
    .flatMap((f) => require(path.join(stepsDir, f)).map((d) => ({ ...d, file: f })));
}

/** The definitions whose pattern matches one step text, with the captures. */
function matches(definitions, text) {
  const found = [];
  for (const d of definitions) {
    if (typeof d.pattern === 'string') {
      if (d.pattern === text) found.push({ captures: [], definition: d });
    } else {
      const m = d.pattern.exec(text);
      if (m) found.push({ captures: m.slice(1), definition: d });
    }
  }
  return found;
}

/**
 * One phrase, two definitions: the same string or the same pattern written twice, or
 * a string phrase that another definition's pattern also matches. Found before any
 * scenario uses the phrase.
 */
function duplicatePhrases(definitions) {
  const problems = [];
  const label = (d) => (typeof d.pattern === 'string' ? d.pattern : String(d.pattern));
  definitions.forEach((a, i) => {
    for (const b of definitions.slice(i + 1)) {
      if (label(a) === label(b) && typeof a.pattern === typeof b.pattern) {
        problems.push({ code: 'AGSC-E206', file: `steps/${b.file}`,
          message: `the phrase "${label(a)}" is defined in ${a.file} and in ${b.file}` });
      }
    }
    if (typeof a.pattern !== 'string') return;
    for (const b of definitions) {
      if (b !== a && typeof b.pattern !== 'string' && b.pattern.test(a.pattern)) {
        problems.push({ code: 'AGSC-E206', file: `steps/${a.file}`,
          message: `the phrase "${a.pattern}" of ${a.file} is also matched by ${b.pattern} of ${b.file}` });
      }
    }
  });
  return problems;
}

/** The problems of one parsed pending file's members (the file name is checked apart). */
function memberProblems(entry, rel) {
  const problems = [];
  const add = (code, message) => problems.push({ code, file: rel, message });
  for (const name of Object.keys(entry).sort()) {
    if (!MEMBERS.includes(name)) add('AGSC-E201', `the member "${name}" is not one of ${MEMBERS.join(', ')}`);
  }
  if (typeof entry.scenario !== 'string' || entry.scenario === '') add('AGSC-E202', 'no "scenario": the exact name of the scenario');
  if (entry.class === 'drift') {
    add('AGSC-E203', 'the class "drift" is not allowed: a scenario whose text disagrees with the specification is rewritten, never pended');
  } else if (!Object.prototype.hasOwnProperty.call(CLASSES, entry.class)) {
    add('AGSC-E203', `the class "${entry.class}" is not one of ${Object.keys(CLASSES).join(', ')}`);
  }
  if (typeof entry.reason !== 'string' || entry.reason.length < 30) add('AGSC-E202', 'no "reason" of at least one sentence (30 characters)');
  if (entry.class === 'gap') {
    if (entry.closes_in === undefined) add('AGSC-E202', 'a gap names the change that makes it run in "closes_in"');
    else if (typeof entry.closes_in !== 'string' || !CHANGE.test(entry.closes_in)) add('AGSC-E204', `"closes_in" ${JSON.stringify(entry.closes_in)} names no change`);
  } else if (entry.closes_in !== undefined) add('AGSC-E201', `"closes_in" belongs to the class gap, not ${entry.class}`);
  if (entry.class === 'conditional') {
    if (entry.needs === undefined) add('AGSC-E202', 'a conditional scenario names what it needs in "needs"');
    else if (typeof entry.needs !== 'string' || !NEED.test(entry.needs)) add('AGSC-E204', `"needs" ${JSON.stringify(entry.needs)} is not a lower-case name`);
  } else if (entry.needs !== undefined) add('AGSC-E201', `"needs" belongs to the class conditional, not ${entry.class}`);
  return problems;
}

/**
 * Read `pending/`: every `*.json` file is one pending scenario; other files (its
 * README) are not read.
 * @param {string} pendingDir
 * @param {Set<string>} scenarioKeys every `<file>.feature#<scenario name>` of features/
 * @returns {{entries: Map<string, object>, problems: Array<{code:string, file:string, message:string}>}}
 */
function readPending(pendingDir, scenarioKeys) {
  const entries = new Map();
  const problems = [];
  const names = fs.existsSync(pendingDir) ? fs.readdirSync(pendingDir).filter((f) => f.endsWith('.json')).sort() : [];
  for (const name of names) {
    const rel = `pending/${name}`;
    let entry;
    try {
      entry = JSON.parse(fs.readFileSync(path.join(pendingDir, name), 'utf8'));
    } catch (e) {
      problems.push({ code: 'AGSC-E201', file: rel, message: `not JSON: ${e.message}` });
      continue;
    }
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      problems.push({ code: 'AGSC-E201', file: rel, message: 'a pending file holds one JSON object' });
      continue;
    }
    const own = memberProblems(entry, rel);
    problems.push(...own);
    if (typeof entry.scenario !== 'string' || entry.scenario === '') continue;
    const cut = name.indexOf('--');
    const feature = `${cut > 0 ? name.slice(0, cut) : name.replace(/\.json$/u, '')}.feature`;
    const key = `${feature}#${entry.scenario}`;
    const expected = pendingFileName(feature, entry.scenario);
    if (expected !== name) {
      problems.push({ code: 'AGSC-E204', file: rel, message: `the file of the scenario "${entry.scenario}" is named ${expected}` });
    }
    if (!scenarioKeys.has(key)) {
      problems.push({ code: 'AGSC-E301', file: rel, message: `"${key}" names no scenario of features/` });
    }
    entries.set(key, { ...entry, file: rel });
  }
  return { entries, problems };
}

/** The probe of a conditional need: `steps/_<need>.js` exporting `probe()`, or null. */
function probeFor(stepsDir, need) {
  const file = path.join(stepsDir, `_${need}.js`);
  if (!fs.existsSync(file)) return null;
  const { probe } = require(file);
  if (typeof probe !== 'function') throw new Error(`${file} exports no probe()`);
  return probe;
}

/**
 * What the pending file of a scenario (or its absence) means for the run.
 * @returns {{counted: 'run'|'pending', skip: string|null}} `skip` null = run it
 */
function disposition(entry, stepsDir) {
  if (!entry) return { counted: 'run', skip: null };
  if (entry.class !== 'conditional') {
    const why = entry.class === 'gap' ? `gap, closes in ${entry.closes_in}` : entry.class;
    return { counted: 'pending', skip: `pending (${why}): ${entry.reason}` };
  }
  const probe = probeFor(stepsDir, entry.needs);
  if (!probe) {
    return { counted: 'pending',
      skip: `pending (conditional, needs ${entry.needs}): no probe for it yet, tests/acceptance/steps/_${entry.needs}.js is not written. ${entry.reason}` };
  }
  const found = probe();
  if (found.available) return { counted: 'run', skip: null };
  return { counted: 'run', skip: `not available here (${entry.needs}): ${found.reason}. ${entry.reason}` };
}

module.exports = {
  CLASSES, SHARED, disposition, duplicatePhrases, loadDefinitions, matches, pendingFileName,
  probeFor, readPending, readPickles, scenarioSlug, slugCollisions,
};
