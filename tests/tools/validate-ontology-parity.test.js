'use strict';
// verifies AGSC-05-38, AGSC-09-90
// tools/validate-ontology on a site vocabulary (AGSC-05-38: "a violation of (a) to (g) is the
// error AGSC-E420, reported by lint and by tools/validate-ontology run on the file"). The tool
// stays standalone (AGSC-09-90: no import from src/), so the rules exist twice; this file is
// the PARITY test between the two: for every vocabulary of the shared fixtures, the tool and
// the engine's check (`src/knowledge/domain.js`) give the same findings, code and message.

const assert = require('node:assert/strict');
const path = require('node:path');
const { describe, it } = require('node:test');

const domain = require('../../src/knowledge/domain.js');
const { ACCEPTED, FAULTS, VALID } = require('../knowledge/_domain-fixtures.js');
const { capture, envelope, tmpdir, writeTree } = require('./helpers');

const FILE = 'domain/vocabulary.ttl';

/** A Bundle folder holding the vocabulary and the configuration that names it. */
function bundleWith(text, contexts = []) {
  const domainObject = { vocabulary: FILE, ...(contexts.length > 0 ? { contexts } : {}) };
  return writeTree(tmpdir(), {
    'agsc.config.json': `${JSON.stringify({ domain: domainObject })}\n`,
    [FILE]: text,
  });
}

const pairs = (findings) => findings.map((f) => `${f.code} ${f.message}`).sort();

describe('validate-ontology — a site vocabulary', () => {
  it('a file of another name than agsc.ttl is read as a site vocabulary and the valid one passes', () => {
    const result = capture('validate-ontology', [path.join(bundleWith(VALID), FILE)]);
    assert.equal(result.code, 0, result.err);
    assert.match(result.out, /site vocabulary, 21 triples, 1 classes, 2 properties, 0 error, 0 warn/u);
  });

  it('each fault is AGSC-E420 on the file, relative to the Bundle that names it, exit 1', () => {
    const { code, json } = envelope('validate-ontology', [path.join(bundleWith(FAULTS[0].text), FILE)]);
    assert.equal(code, 1);
    assert.deepEqual(json.findings.map((f) => [f.code, f.file, f.severity]),
      [['AGSC-E420', FILE, 'error'], ['AGSC-E420', FILE, 'error']]);
    assert.equal(json.verb, 'validate-ontology');
  });

  it('a file no configuration names is read with no context namespace, and named by its path', () => {
    const dir = writeTree(tmpdir(), { 'vocabulary.ttl': VALID });
    const result = envelope('validate-ontology', [path.join(dir, 'vocabulary.ttl')]);
    assert.equal(result.code, 0);
    const other = writeTree(tmpdir(), { 'agsc.config.json': '{"domain":{"vocabulary":"elsewhere.ttl"}}\n', 'vocabulary.ttl': ACCEPTED[4].text });
    const outside = envelope('validate-ontology', [path.join(other, 'vocabulary.ttl')]);
    assert.equal(outside.code, 1, 'the configuration names another file, so its contexts do not apply');
    assert.equal(outside.json.findings[0].file, 'vocabulary.ttl');
  });

  it('a configuration that is not JSON is not a reason to fail: the file is read with no context', () => {
    const dir = writeTree(tmpdir(), { 'agsc.config.json': 'not json', 'v.ttl': VALID });
    assert.equal(capture('validate-ontology', ['--quiet', path.join(dir, 'v.ttl')]).code, 0);
  });
});

describe('validate-ontology and the engine agree on every site vocabulary (parity)', () => {
  for (const { name, text, contexts } of [...ACCEPTED, ...FAULTS.map((f) => ({ ...f, contexts: [] }))]) {
    it(name, () => {
      const { json } = envelope('validate-ontology', [path.join(bundleWith(text, contexts), FILE)]);
      assert.deepEqual(pairs(json.findings), pairs(domain.check(text, { contexts, file: FILE })));
    });
  }
});
