'use strict';
// The three tools that read the declared specification version accept a release as
// well as a release candidate (plan item A4 of the 1.0.0 release plan, 2026-10-07).
//
// `spec/00-overview.md` declares the version as `spec_version: "<version>"`. Until
// the regexes read `(?:-rc\.\d+)?`, each of `tools/count-artifacts`,
// `tools/validate-vectors` and the conformance runner took the first `1.0.0-rc.N`
// literal of the file as the declaration, which stops being true the day the version
// is `1.0.0`. This file is the regression test the plan asked for: a copy of the
// distribution that declares `1.0.0` is read by both tools, and the runner's own
// declaration pattern matches both forms.
//
// Deterministic: temporary copies under the system temporary directory, no clock,
// no network; `validate-vectors` runs as a child process because it reads `spec/`
// beside its own file (AGSC-09-90: a checker is independent of the engine).

const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const { REPO, envelope, tmpdir } = require('./helpers');

const CANDIDATE = /1\.0\.0-rc\.\d+/gu;
const RELEASE = '1.0.0';

/** Copy `rel` from the repository into `root`, replacing every candidate version in text files. */
function copyAsRelease(root, rel) {
  const from = path.join(REPO, rel);
  const to = path.join(root, rel);
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(from)) copyAsRelease(root, path.join(rel, name));
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (/\.(?:md|json|ttl|html|txt)$/u.test(rel) || path.basename(rel) === 'validate-vectors') {
    fs.writeFileSync(to, fs.readFileSync(from, 'utf8').replace(CANDIDATE, RELEASE));
  } else {
    fs.copyFileSync(from, to);
  }
}

/** A distribution root that declares `1.0.0` everywhere the candidate stood. */
function releaseRoot() {
  const root = tmpdir();
  for (const rel of ['spec', 'ontology', 'tests/vectors', 'docs/SPEC.md', 'w3c/index.html', 'tools/validate-vectors']) {
    copyAsRelease(root, rel);
  }
  // `validate-vectors` stamps its envelope with the version of the package it ships in.
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'agentic-system-core', version: RELEASE }));
  const overview = fs.readFileSync(path.join(root, 'spec', '00-overview.md'), 'utf8');
  assert.match(overview, /spec_version: "1\.0\.0"/u, 'the copy declares 1.0.0');
  assert.doesNotMatch(overview, CANDIDATE, 'no candidate version is left in the copy');
  return root;
}

describe('plan item A4: the tools read a 1.0.0 declaration', () => {
  it('count-artifacts reports spec_version 1.0.0 and finds no disagreement', () => {
    const root = releaseRoot();
    const result = envelope('count-artifacts', [root]);
    assert.equal(result.code, 0, result.err);
    assert.equal(result.json.ok, true);
    assert.deepEqual(result.json.findings, []);
    assert.equal(result.json.counts.spec_version, RELEASE);
  });

  it('validate-vectors compares every vector against the 1.0.0 declaration and passes', () => {
    const root = releaseRoot();
    const run = cp.spawnSync(process.execPath, [path.join(root, 'tools', 'validate-vectors'), '--json', path.join(root, 'tests', 'vectors')], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const json = JSON.parse(run.stdout);
    assert.equal(json.status, 'pass');
    assert.deepEqual(json.findings, []);
  });

  it('the conformance runner declares the version with the same pattern, which matches both forms', () => {
    const source = fs.readFileSync(path.join(REPO, 'tests', 'conformance', 'vector-runner.test.js'), 'utf8');
    const pattern = /\/spec_version: "\(\\d\+\\\.\\d\+\\\.\\d\+\(\?:-rc\\\.\\d\+\)\?\)"\/u/u;
    assert.match(source, pattern, 'the runner reads the declaration with the release-or-candidate pattern');
    const re = /spec_version: "(\d+\.\d+\.\d+(?:-rc\.\d+)?)"/u;
    assert.equal(re.exec('spec_version: "1.0.0"')[1], '1.0.0');
    assert.equal(re.exec('spec_version: "1.0.0-rc.7"')[1], '1.0.0-rc.7');
    for (const tool of ['count-artifacts', 'validate-vectors']) {
      assert.match(fs.readFileSync(path.join(REPO, 'tools', tool), 'utf8'), pattern, `${tool} reads the declaration with the same pattern`);
    }
  });
});
