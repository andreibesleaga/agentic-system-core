'use strict';
// tests/arch/package-manifest.test.js — what an npm consumer actually receives.
//
// `tools/` was in no `files` entry, so `npm pack` carried 286 files and
// NONE of the nine independent checkers of AGSC-09-90 — although that rule says
// the reference distribution "MUST include … the `tools/` validators of PRD-054,
// each runnable standalone … so that every normative artifact (schemas, spec text,
// ontology, vectors, well-known file, features, diagrams) is checkable by an
// independent party". A checker that does not ship checks nothing for anybody.
//
// This file reads the manifest, not the tarball: `npm pack` needs a network-free
// child process and several seconds, and the fault was always in the manifest.
// The tarball itself is proved once per release by `tools/release`.
//
// Deterministic: no clock, no network, no child process.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const alias = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages', 'agsc-cli', 'package.json'), 'utf8'));

/** True when `files[]` ships this path — as itself, or inside a directory entry. */
function ships(entry) {
  return (manifest.files || []).some((f) => f === entry || entry.startsWith(f));
}

test('AGSC-09-90: the nine checkers ship, and so do the inputs they name', () => {
  for (const tool of ['validate-spec', 'validate-schemas', 'validate-ontology',
    'validate-vectors', 'validate-wellknown', 'validate-features', 'validate-diagrams',
    'gen-spec-html', 'gen-ns']) {
    assert.ok(fs.existsSync(path.join(ROOT, 'tools', tool)), `tools/${tool} is missing`);
    assert.ok(ships(`tools/${tool}`), `package.json files[] does not ship tools/${tool}`);
  }
  // Two of the nine read inputs that the rule names as normative artefacts: without
  // them the checker ships and cannot run.
  for (const input of ['features/', 'docs/diagrams/', 'spec/', 'schema/', 'ontology/',
    'tests/vectors/']) {
    assert.ok(ships(input), `package.json files[] does not ship ${input}`);
  }
});

test('only the nine checkers, the counter and the benchmark tool ship from tools/', () => {
  // The maintainer tools (rule coverage, hygiene, release, glossary, publish set)
  // read the test suite, the allow-list or the repository's own tree: run from an
  // installed package each one fails or misleads, so none of them is in `files[]`.
  // The eleven that ship each run on inputs the tarball carries.
  const shipped = ['validate-spec', 'validate-schemas', 'validate-ontology',
    'validate-vectors', 'validate-wellknown', 'validate-features', 'validate-diagrams',
    'gen-spec-html', 'gen-ns', 'count-artifacts', 'bench'].map((t) => `tools/${t}`);
  const listed = (manifest.files || []).filter((f) => f === 'tools/' || f.startsWith('tools/'));
  assert.deepStrictEqual(listed.sort(), shipped.sort());
  for (const tool of fs.readdirSync(path.join(ROOT, 'tools'))) {
    assert.strictEqual(ships(`tools/${tool}`), shipped.includes(`tools/${tool}`),
      `tools/${tool} ${shipped.includes(`tools/${tool}`) ? 'must' : 'must not'} ship`);
  }
  // The benchmark tool reads its committed query set; the measurement runners and
  // their corpus are the maintainer's and stay in the repository.
  assert.ok(ships('bench/queries/'));
  assert.ok(!ships('bench/corpus/') && !ships('bench/measure.js'));
});

test('AGSC-00-01 + AGSC-08-06: the texts a consumer has to be able to read ship', () => {
  for (const file of ['LICENSE', 'LICENSE-CONTENT', 'CONTRIBUTOR-AGREEMENT',
    'SECURITY.md', 'CONTRIBUTING.md', 'CITATION.cff', 'CHANGELOG.md', 'README.md']) {
    assert.ok(ships(file), `package.json files[] does not ship ${file}`);
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is missing from the tree`);
  }
});

test('no private path can reach the tarball', () => {
  // Project rule (owner, 2026-09-04): planning files never enter a public artefact.
  for (const entry of manifest.files || []) {
    assert.ok(!/GABBE|discovery-product|05-WILEY/u.test(entry), entry);
  }
});

test('the alias is the same version and depends on the engine EXACTLY', () => {
  assert.strictEqual(alias.name, 'agsc-cli');
  assert.strictEqual(alias.version, manifest.version,
    'the alias and the engine are published together, at one version');
  assert.strictEqual(alias.dependencies['agentic-system-core'], manifest.version,
    'the alias must pin the engine EXACTLY: a range would let the two drift');
  assert.strictEqual(alias.engines.node, manifest.engines.node);
  // It must CALL the engine: `bin/agsc.js` guards its auto-run behind
  // `require.main === module`, so a bare `require` of it runs nothing at all.
  const bin = fs.readFileSync(path.join(ROOT, 'packages', 'agsc-cli', 'bin', 'agsc.js'), 'utf8');
  assert.match(bin, /\.run\(/u, 'the alias loads the engine and never invokes it');
});

test('the version is one SemVer string, and the CLI reports that one', () => {
  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u);
  // The engine version and the SPECIFICATION version are two different numbers
  // (AGSC-09-90). At this release candidate the maintainer publishes them equal,
  // and they are still read from two different places.
  const main = fs.readFileSync(path.join(ROOT, 'src', 'application', 'cli', 'main.js'), 'utf8');
  const declared = /const SPEC_VERSION = '([^']+)';/u.exec(main);
  assert.ok(declared, 'src/application/cli/main.js must declare SPEC_VERSION');
  const spec = fs.readFileSync(path.join(ROOT, 'spec', '00-overview.md'), 'utf8');
  assert.ok(spec.includes(declared[1]),
    `the engine states spec version ${declared[1]} and spec/00-overview.md does not declare it`);
});

test('the main entry reports the package version and exports the command line', () => {
  const entry = require(path.join(ROOT, manifest.main));
  assert.strictEqual(entry.version, manifest.version, 'index.js must report the version package.json declares');
  assert.strictEqual(entry.specVersion, require(path.join(ROOT, 'src', 'application', 'cli', 'main.js')).SPEC_VERSION);
  assert.strictEqual(typeof entry.run, 'function');
  assert.strictEqual(entry.WELLKNOWN_SUFFIX, 'knowledge-linkset');
  // AGSC-06-25: a page points at the discovery document with `describedby` (type
  // application/linkset+json); `agentic-knowledge` names the PROFILE, not a relation.
  assert.strictEqual(entry.LINK_RELATION, 'describedby');
  assert.strictEqual(entry.PROFILE_URI, 'https://w3id.org/agentic-system-core/profile/agentic-knowledge');
  assert.deepStrictEqual(Object.keys(entry).sort(),
    ['LINK_RELATION', 'PROFILE_URI', 'WELLKNOWN_SUFFIX', 'run', 'specVersion', 'version']);
});

test('the declared licence names both licences the tarball carries', () => {
  // The engine is Apache-2.0; the schemas, the ontology and the identifiers it ships
  // are CC0-1.0. The alias package ships only its own launcher and stays Apache-2.0.
  assert.strictEqual(manifest.license, 'Apache-2.0 AND CC0-1.0');
  assert.ok(ships('schema/') && ships('ontology/'));
  assert.strictEqual(alias.license, 'Apache-2.0');
});

test('the test scripts quote their glob with double quotes, which every shell npm uses reads', () => {
  // npm runs scripts in cmd.exe on Windows, where a single quote is an ordinary
  // character; double quotes are quotes there and in /bin/sh alike.
  for (const name of ['test', 'test:coverage']) {
    assert.ok(!manifest.scripts[name].includes("'"), `${name} carries a single quote`);
    assert.match(manifest.scripts[name], /"tests\/\*\*\/\*\.test\.js"/u);
  }
});
