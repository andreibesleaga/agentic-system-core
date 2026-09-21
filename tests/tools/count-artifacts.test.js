'use strict';
// FV29-09: `tools/count-artifacts` is the counter every report in this project
// depends on, and it was the one tool that resolved its inputs against
// `process.cwd()` instead of against its own location. From any other directory —
// including with `--help` — it threw a nine-frame `ENOENT` stack trace and exited 1,
// never printing usage. AGSC-09-90 asks a tool to answer with a finding, and
// AGSC-09-11 fixes the shape of that answer.
//
// Deterministic: no clock, no network, no randomness. Every run is in process.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const { REPO, capture, envelope, tmpdir, writeTree } = require('./helpers');

describe('tools/count-artifacts — invocation (FV29-09)', () => {
  it('counts the distribution from ANY working directory', () => {
    const here = process.cwd();
    try {
      process.chdir(tmpdir());
      const result = envelope('count-artifacts', []);
      assert.equal(result.code, 0, result.err);
      assert.equal(result.json.ok, true);
      assert.deepEqual(result.json.findings, []);
      assert.equal(result.json.counts.rules, 335);
      assert.equal(result.json.counts.vectors_total, 150);
      // The same answer the gate list gets from the repository root.
      process.chdir(REPO);
      assert.deepEqual(envelope('count-artifacts', []).json, result.json);
    } finally {
      process.chdir(here);
    }
  });

  it('answers --help with usage, exit 0, before reading anything', () => {
    const here = process.cwd();
    try {
      process.chdir(tmpdir());
      const result = capture('count-artifacts', ['--help']);
      assert.equal(result.code, 0);
      assert.equal(result.err, '');
      assert.match(result.out, /^count-artifacts /u);
    } finally {
      process.chdir(here);
    }
  });

  it('exits 2 with a usage finding on a root that holds no spec/', () => {
    const empty = tmpdir();
    const result = capture('count-artifacts', ['--json', empty]);
    assert.equal(result.code, 2);
    assert.equal(result.out, '');
    assert.match(result.err, /AGSC-E901/u);
    assert.match(result.err, /count-artifacts/u);
  });

  it('exits 2 on an unknown flag and on a second root argument', () => {
    assert.equal(capture('count-artifacts', ['--nope']).code, 2);
    assert.equal(capture('count-artifacts', [REPO, REPO]).code, 2);
  });

  it('counts a root it is POINTED at, not the one it lives in', () => {
    const dir = tmpdir();
    writeTree(dir, {
      'spec/00-overview.md': '# Overview\n\n`spec_version: "1.0.0-rc.5"`\n\n- **AGSC-00-01** A rule. [PRD-002]\n',
      'spec/09-conformance.md': '# Conformance\n\n| Code | Fault | Raised by |\n|---|---|---|\n| `AGSC-E201` | x | AGSC-00-01 |\n',
      'ontology/agsc.ttl': 'asc:Thing\n    a owl:Class .\n',
      'tests/vectors/jcs/jcs-0001-x.json': JSON.stringify({
        area: 'jcs', description: 'x', expected: {}, id: 'jcs-0001', input: {},
        level: 'required', rule: 'AGSC-00-01',
      }),
    });
    const result = envelope('count-artifacts', [dir]);
    assert.equal(result.code, 0, result.err);
    assert.equal(result.json.counts.rules, 1);
    assert.equal(result.json.counts.vectors_total, 1);
    assert.equal(result.json.counts.ontology_classes, 1);
  });

  it('states how many inputs it read', () => {
    const result = envelope('count-artifacts', []);
    assert.equal(typeof result.json.counts.inputs_read, 'number');
    assert.ok(result.json.counts.inputs_read >= 150,
      `only ${result.json.counts.inputs_read} inputs were read`);
    const plain = capture('count-artifacts', []);
    assert.match(plain.out, /inputs_read: \d+/u);
  });

  it('never resolves a vector file against the working directory', () => {
    const text = fs.readFileSync(path.join(REPO, 'tools', 'count-artifacts'), 'utf8');
    for (const match of text.matchAll(/readFileSync\(([^)]*)\)/gu)) {
      assert.ok(/root|abs|join|resolve/u.test(match[1]),
        `count-artifacts reads ${match[1]} without resolving it against the root`);
    }
  });
});
