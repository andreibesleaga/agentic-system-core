'use strict';
// FV29-10: a checker that answers `pass` on a destroyed or empty input protects
// nothing. AGSC-09-92 makes `validate-spec` a merge gate, and three of the nine
// command contracts of AGSC-09-90 reported `status: "pass"`, `findings: []`, exit 0
// on a distribution whose `spec/00-overview.md` and `spec/09-conformance.md` were
// EMPTY files — and two of them did the same for a directory that does not exist at
// all.
//
// This suite is the guard for all nine: a missing or empty input is a FAILURE with a
// registered code, never a vacuous pass, and every checker states how many input
// files it read so that a reader can see the difference between "nothing is wrong"
// and "nothing was looked at".
//
// Deterministic: no clock, no network, no randomness; every run is in process over a
// throw-away directory.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { describe, it } = require('node:test');

const { REPO, capture, envelope, tmpdir, writeTree } = require('./helpers');

/** The eight command contracts of AGSC-09-90 that take a root or a directory. */
const ROOTED = Object.freeze([
  'validate-spec', 'validate-schemas', 'validate-ontology', 'validate-vectors',
  'validate-features', 'validate-diagrams', 'gen-spec-html', 'gen-ns',
]);

/**
 * How each tool is pointed at a distribution. `validate-vectors` takes the VECTOR
 * DIRECTORY (AGSC-09-04), not the root, and resolves `spec/` from its own location.
 */
function argvFor(name, root) {
  return name === 'validate-vectors' ? [path.join(root, 'tests', 'vectors')] : [root];
}

/** A root whose required inputs all EXIST and are all empty or unreadable. */
function destroyedRoot() {
  const dir = tmpdir();
  writeTree(dir, {
    'spec/00-overview.md': '',
    'spec/09-conformance.md': '',
    'spec/01-bundle.md': '\u0000\u0001 not text',
    'ontology/agsc.ttl': '',
    'schema/item.schema.json': '{}',
    'schema/config.schema.json': '{}',
    'schema/bundle.schema.json': '{}',
    'docs/PRD.md': '',
  });
  for (const empty of ['tests/vectors', 'features', 'docs/diagrams']) {
    fs.mkdirSync(path.join(dir, empty), { recursive: true });
  }
  return dir;
}

describe('the nine checkers never pass vacuously (FV29-10, AGSC-09-90)', () => {
  it('a destroyed distribution fails every rooted checker with a finding', () => {
    const dir = destroyedRoot();
    for (const name of ROOTED) {
      const result = envelope(name, argvFor(name, dir));
      assert.notEqual(result.code, 0, `${name} passed on a destroyed distribution`);
      if (result.code === 1) {
        assert.equal(result.json.status, 'fail', name);
        assert.ok(result.json.findings.length > 0, `${name} failed with no finding`);
        for (const f of result.json.findings) {
          assert.match(f.code, /^AGSC-E\d{3}$/u, `${name} invented the code ${f.code}`);
        }
      }
    }
  });

  it('an ABSENT input is AGSC-E901 in the envelope, exit 1 — not a usage error', () => {
    // TIGHTENED at rc.6 (FIX29-S4). AGSC-09-90 now says a validator MUST FAIL "with
    // `AGSC-E901`" over absent inputs, and AGSC-09-08 reserves exit 2 for an unknown
    // verb, an unknown flag or a missing argument. Five of the nine used to print a
    // usage block and exit 2, so the code was in prose a caller reading the envelope
    // never saw.
    const dir = tmpdir();
    for (const name of ROOTED) {
      const result = envelope(name, argvFor(name, dir));
      assert.equal(result.code, 1, `${name} did not FAIL on a root that holds nothing`);
      assert.equal(result.json.status, 'fail', name);
      assert.ok(result.json.findings.some((f) => f.code === 'AGSC-E901'),
        `${name} failed without AGSC-E901: ${JSON.stringify(result.json.findings)}`);
      // …and the summary says zero were read, so "nothing is wrong" cannot be
      // mistaken for "nothing was looked at".
      assert.match(capture(name, argvFor(name, dir)).out, /\b0 input file\(s\) read/u, name);
    }
  });

  it('the shipped distribution still answers, so the guards are not vacuous', () => {
    for (const name of ROOTED) {
      const result = envelope(name, argvFor(name, REPO));
      // `validate-spec` exits 1 on the recorded specification items and nothing else.
      assert.ok(result.code === 0 || name === 'validate-spec',
        `${name} now fails on the real distribution: ${result.err}`);
      assert.ok(result.json.findings.every((f) => /^AGSC-E\d{3}$/u.test(f.code)), name);
    }
  });

  it('every checker states how many input files it read', () => {
    for (const name of ROOTED) {
      const result = capture(name, argvFor(name, REPO));
      assert.match(result.out, /\b\d+ input file/u,
        `${name} does not say how many inputs it read: ${result.out}`);
    }
  });

  it('validate-wellknown refuses an empty document and says what it read', () => {
    // AGSC-09-93 gives this tool a `<url|file>` argument and it runs as a process,
    // so it is driven here the way an operator drives it. No network: a file target.
    const dir = tmpdir();
    writeTree(dir, { '.well-known/knowledge-linkset': '' });
    const run = spawnSync(process.execPath,
      [path.join(REPO, 'tools', 'validate-wellknown'), path.join(dir, '.well-known', 'knowledge-linkset')],
      { encoding: 'utf8' });
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.match(run.stdout, /\b\d+ input file\(s\) read/u, run.stdout);
    const missing = spawnSync(process.execPath,
      [path.join(REPO, 'tools', 'validate-wellknown')], { encoding: 'utf8' });
    assert.equal(missing.status, 2, 'a missing argument must be a usage error');
  });
});
