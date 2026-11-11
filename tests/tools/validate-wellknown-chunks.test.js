'use strict';
// tests/tools/validate-wellknown-chunks.test.js — AGSC-09-93 (b) and (c) with AGSC-06-44: at
// `--level 2` the checker recomputes the digest, the count and the set commitment of the chunks
// surface link over the fetched `/chunks.jsonl`, requires them of a document of 1.1.0 or later,
// and compares `agsc-ledger-length` with the fetched ledger.
//
// Over a real build of the minimal fixture (with a ledger), read from disk the way an operator
// checks a build output before deploying it, then the same output with one fact changed.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { after, describe, it } = require('node:test');

const { buildFixture, cleanup } = require('../distribution/hosts/_build.js');
const { canonicalize } = require('../../src/knowledge/jcs.js');
const { REPO } = require('./helpers');

const REL = 'https://w3id.org/agentic-system-core/rel#';
const digest = (text) => `sha-256=:${crypto.createHash('sha256').update(text).digest('base64')}:`;

/** A fresh build output; `change(doc, www)` edits the document and the files before the check. */
function checked(change = () => {}) {
  const www = path.join(buildFixture(), 'www');
  const file = path.join(www, '.well-known', 'knowledge-linkset');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  change(doc, www);
  fs.writeFileSync(file, `${canonicalize(doc)}\n`);
  const run = spawnSync(process.execPath, [path.join(REPO, 'tools', 'validate-wellknown'), file, '--level', '2', '--json'],
    { encoding: 'utf8' });
  return JSON.parse(run.stdout);
}

const context = (doc) => doc.linkset[0];
const chunksLink = (doc) => context(doc)[`${REL}surface`].find((one) => one['agsc-surface'][0] === 'chunks');
const anchorLink = (doc) => context(doc).describedby.find((one) => one.href.endsWith('/graph.jsonld'));
const about = (envelope, pattern) => envelope.findings.filter((f) => pattern.test(f.message)).map((f) => f.code);

after(cleanup);

describe('validate-wellknown: the chunks surface link and the ledger length', () => {
  it('a 1.1 build passes at Level 2, its chunks link and ledger length recomputed', () => {
    const envelope = checked((doc) => {
      assert.ok(chunksLink(doc)['agsc-chunk-set'] && context(doc)[`${REL}ledger`][0]['agsc-ledger-length']);
    });
    assert.equal(envelope.status, 'pass', JSON.stringify(envelope.findings));
  });

  it('a dropped chunk line is found by the count and the set, though the digest was recomputed', () => {
    const envelope = checked((doc, www) => {
      const file = path.join(www, 'chunks.jsonl');
      const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
      const text = `${lines.slice(1).join('\n')}\n`;
      fs.writeFileSync(file, text);
      chunksLink(doc).digest = [digest(text)];
    });
    assert.deepEqual(about(envelope, /agsc-chunk-(count|set)/u), ['AGSC-E201', 'AGSC-E201']);
  });

  it('a 1.1.0 document without the three attributes is AGSC-E202, one finding each', () => {
    const envelope = checked((doc) => {
      anchorLink(doc)['agsc-spec-version'] = ['1.1.0'];
      for (const name of ['digest', 'agsc-chunk-count', 'agsc-chunk-set']) delete chunksLink(doc)[name];
    });
    assert.deepEqual(about(envelope, /chunks surface/u), ['AGSC-E202', 'AGSC-E202', 'AGSC-E202']);
  });

  it('the engine\'s own build declares the version it implements, so the three are required of it as built', () => {
    // ERR-075: no version is edited here. A build that still said 1.0.0 would let a writer
    // drop the chunk facts unnoticed.
    const envelope = checked((doc) => {
      assert.deepEqual(anchorLink(doc)['agsc-spec-version'], [require('../../src/shared/spec-version.js').SPEC_VERSION]);
      for (const name of ['agsc-chunk-count', 'agsc-chunk-set']) delete chunksLink(doc)[name];
    });
    assert.deepEqual(about(envelope, /chunks surface/u), ['AGSC-E202', 'AGSC-E202']);
  });

  it('a 1.0.0 document without them is accepted (AGSC-06-44)', () => {
    const envelope = checked((doc) => {
      anchorLink(doc)['agsc-spec-version'] = ['1.0.0'];
      for (const name of ['digest', 'agsc-chunk-count', 'agsc-chunk-set']) delete chunksLink(doc)[name];
      delete context(doc)[`${REL}ledger`][0]['agsc-ledger-length'];
    });
    assert.deepEqual(about(envelope, /chunks surface|agsc-ledger-length/u), []);
  });

  it('an agsc-ledger-length that is not the number of ledger entries is AGSC-E201', () => {
    const envelope = checked((doc) => { context(doc)[`${REL}ledger`][0]['agsc-ledger-length'] = ['99']; });
    assert.deepEqual(about(envelope, /agsc-ledger-length/u), ['AGSC-E201']);
  });

  it('a chunks surface declared credential (a restricted node) is not asked for them', () => {
    const envelope = checked((doc) => {
      const link = chunksLink(doc);
      link['agsc-access'] = ['credential'];
      for (const name of ['digest', 'agsc-chunk-count', 'agsc-chunk-set']) delete link[name];
    });
    assert.deepEqual(about(envelope, /chunks surface/u), []);
  });
});
