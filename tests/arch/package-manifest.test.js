'use strict';
// tests/arch/package-manifest.test.js — what an npm consumer actually receives.
//
// PAT1-08: `tools/` was in no `files` entry, so `npm pack` carried 286 files and
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

test(': the alias is the same version and depends on the engine EXACTLY', () => {
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
  // (AGSC-09-90). At this release candidate the owner publishes them equal,
  // and they are still read from two different places.
  const main = fs.readFileSync(path.join(ROOT, 'src', 'application', 'cli', 'main.js'), 'utf8');
  const declared = /const SPEC_VERSION = '([^']+)';/u.exec(main);
  assert.ok(declared, 'src/application/cli/main.js must declare SPEC_VERSION');
  const spec = fs.readFileSync(path.join(ROOT, 'spec', '00-overview.md'), 'utf8');
  assert.ok(spec.includes(declared[1]),
    `the engine states spec version ${declared[1]} and spec/00-overview.md does not declare it`);
});
