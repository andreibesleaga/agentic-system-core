'use strict';
// tests/tools/validate-wellknown-access.test.js — AGSC-11-20 in the independent
// checker of AGSC-09-93: a restricted node carries exactly one `…/rel#access` link,
// whose target names where a reader obtains credentials.
//
// A restricted node with no access link tells a reader that its content is gated and
// not where to ask; one with two leaves the reader to guess. The checker reports the
// first as `AGSC-E202` (a required link is missing) and the second as `AGSC-E210` (a
// declaration that disagrees with the rule), at every Level, because a restricted node
// asserts conformance for its unauthenticated view at Level 0. A public node is not
// asked for the link.
//
// Two halves: the command's exported `run`, called in process over a real file, and
// the shipped command as a real process. No network.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { describe, it } = require('node:test');

const { REPO, tmpdir } = require('./helpers');

const TOOL = path.join(REPO, 'tools', 'validate-wellknown');
const REL = 'https://w3id.org/agentic-system-core/rel#';
const BASE = 'https://example.org/';
const ACCESS = `${BASE}access/`;
const WHERE = 'a restricted node carries exactly one rel#access link, naming where a reader obtains credentials';

/** RFC 8785 for plain JSON: members sorted by name, no white space. */
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

/**
 * The Level-0 view of a node (AGSC-06-08a): restricted unless `visibility` is
 * `public`, with the given access-link targets (none when the list is empty).
 */
function document({ access = [], visibility = 'restricted' } = {}) {
  const describedby = { href: `${BASE}graph.jsonld`, type: 'application/ld+json' };
  if (visibility === 'restricted') {
    // AGSC-11-20: the two attributes a restricted node keeps, and its visibility.
    describedby['agsc-generated-at'] = ['2026-09-16T00:00:00Z'];
    describedby['agsc-spec-version'] = ['1.0.0'];
    describedby['agsc-visibility'] = ['restricted'];
  }
  const context = {
    alternate: [{ href: `${BASE}llms.txt`, type: 'text/plain' }],
    anchor: BASE,
    describedby: [describedby],
    license: [{ href: `${BASE}legal/` }],
  };
  if (access.length) context[`${REL}access`] = access.map((href) => ({ 'agsc-access': ['credential'], href }));
  return { linkset: [context] };
}

/** Write one document where the checker expects it and return its path. */
function place(doc) {
  const dir = tmpdir();
  fs.mkdirSync(path.join(dir, '.well-known'), { recursive: true });
  const at = path.join(dir, '.well-known', 'knowledge-linkset');
  fs.writeFileSync(at, `${canonical(doc)}\n`);
  return at;
}

/** The exported `run` over one document at one Level: exit code and envelope. */
async function check(doc, level = '0') {
  let out = '';
  const code = await require(TOOL).run([place(doc), '--level', level, '--json'], { err: () => {}, out: (s) => { out += s; } });
  return { code, envelope: JSON.parse(out) };
}

/** The findings about the access link. */
const accessFindings = (envelope) => envelope.findings.filter((f) => /rel#access/u.test(f.message));

describe('validate-wellknown: the access link of a restricted node (AGSC-11-20)', () => {
  it('a restricted node with no access link fails with one AGSC-E202 that names the rule', async () => {
    const { code, envelope } = await check(document());
    assert.equal(code, 1);
    const found = accessFindings(envelope);
    assert.deepEqual(found.map((f) => [f.code, f.severity]), [['AGSC-E202', 'error']]);
    // The Python checker words it the same, so an operator reads one text whichever ran.
    assert.equal(found[0].message, `${WHERE}; this one carries none (AGSC-11-20)`);
    // Nothing else is wrong with the document, so the missing link is the only finding.
    assert.equal(envelope.findings.length, 1, JSON.stringify(envelope.findings));
  });

  it('a restricted node with two access links fails with one AGSC-E210 that counts them', async () => {
    const { code, envelope } = await check(document({ access: [ACCESS, `${ACCESS}other/`] }));
    assert.equal(code, 1);
    const found = accessFindings(envelope);
    assert.deepEqual(found.map((f) => [f.code, f.severity]), [['AGSC-E210', 'error']]);
    assert.equal(found[0].message, `${WHERE}; this one carries 2 (AGSC-11-20)`);
    assert.equal(envelope.findings.length, 1, JSON.stringify(envelope.findings));
  });

  it('a restricted node with exactly one access link passes', async () => {
    const { code, envelope } = await check(document({ access: [ACCESS] }));
    assert.deepEqual(envelope.findings, []);
    assert.equal(code, 0);
  });

  it('the link is asked at every Level, not only at Level 0', async () => {
    for (const level of ['1', '2', '3']) {
      const { envelope } = await check(document(), level);
      assert.deepEqual(accessFindings(envelope).map((f) => f.code), ['AGSC-E202'], `level ${level}`);
    }
  });

  it('a public node is not asked for an access link', async () => {
    const { code, envelope } = await check(document({ visibility: 'public' }));
    assert.deepEqual(envelope.findings, []);
    assert.equal(code, 0);
  });

  it('an access link with no agsc-access fails with one AGSC-E202 (AGSC-11-20, disc-0020)', async () => {
    const doc = document({ access: [ACCESS] });
    delete doc.linkset[0][`${REL}access`][0]['agsc-access'];
    const { code, envelope } = await check(doc);
    assert.equal(code, 1);
    assert.deepEqual(envelope.findings.map((f) => [f.code, f.severity]), [['AGSC-E202', 'error']]);
    // The Python checker words it the same.
    assert.equal(envelope.findings[0].message, `rel#access ${ACCESS}: the access link of a restricted node carries agsc-access ["credential"] (AGSC-11-20)`);
  });

  it('an access link with another access class fails with one AGSC-E210', async () => {
    let last;
    for (const value of [['none'], ['consent'], ['credential', 'credential'], ['x-other']]) {
      const doc = document({ access: [ACCESS] });
      doc.linkset[0][`${REL}access`][0]['agsc-access'] = value;
      const { code, envelope } = await check(doc);
      assert.equal(code, 1, JSON.stringify(value));
      assert.deepEqual(envelope.findings.map((f) => [f.code, f.severity]), [['AGSC-E210', 'error']], JSON.stringify(value));
      last = envelope.findings[0].message;
    }
    assert.equal(last, `rel#access ${ACCESS}: the access link of a restricted node carries exactly agsc-access ["credential"]; this one carries ["x-other"] (AGSC-11-20)`);
  });

  it('a malformed agsc-access is AGSC-E201 alone and is not judged again', async () => {
    for (const value of [[], 'credential', [1]]) {
      const doc = document({ access: [ACCESS] });
      doc.linkset[0][`${REL}access`][0]['agsc-access'] = value;
      const { envelope } = await check(doc);
      assert.deepEqual(envelope.findings.map((f) => f.code), ['AGSC-E201'], JSON.stringify(value));
    }
  });

  it('every access link of a restricted node is asked its access class', async () => {
    const doc = document({ access: [ACCESS, `${ACCESS}other/`] });
    delete doc.linkset[0][`${REL}access`][1]['agsc-access'];
    const { envelope } = await check(doc);
    assert.deepEqual(envelope.findings.map((f) => f.code).sort(), ['AGSC-E202', 'AGSC-E210']);
  });

  it('a public node is not asked the access class of an access link', async () => {
    const doc = document({ access: [ACCESS], visibility: 'public' });
    delete doc.linkset[0][`${REL}access`][0]['agsc-access'];
    const { code, envelope } = await check(doc);
    assert.deepEqual(envelope.findings, []);
    assert.equal(code, 0);
  });

  it('a restricted node keeps agsc-generated-at and agsc-spec-version at every Level', async () => {
    for (const name of ['agsc-generated-at', 'agsc-spec-version']) {
      for (const level of ['0', '1']) {
        const doc = document({ access: [ACCESS] });
        delete doc.linkset[0].describedby[0][name];
        const { code, envelope } = await check(doc, level);
        assert.equal(code, 1, `${name} level ${level}`);
        assert.deepEqual(envelope.findings.map((f) => [f.code, f.severity]), [['AGSC-E202', 'error']], `${name} level ${level}`);
        // The Python checker words it the same.
        assert.equal(envelope.findings[0].message, `a restricted node carries "${name}" at every Level: it says only that the node exists and is current (AGSC-11-20)`);
      }
      // At Level 2 the absence is reported once, with the other Level-2 attributes.
      const doc = document({ access: [ACCESS] });
      delete doc.linkset[0].describedby[0][name];
      const { envelope } = await check(doc, '2');
      assert.deepEqual(envelope.findings.filter((f) => f.message.includes(name)).map((f) => f.code), ['AGSC-E202'], name);
    }
  });

  it('a public Level-0 node is not asked agsc-generated-at or agsc-spec-version', async () => {
    const doc = document({ visibility: 'public' });
    assert.equal(doc.linkset[0].describedby[0]['agsc-generated-at'], undefined);
    const { code, envelope } = await check(doc);
    assert.deepEqual(envelope.findings, []);
    assert.equal(code, 0);
  });

  it('the shipped command reports the same as a real process, in text and in JSON', () => {
    const at = place(document());
    const text = spawnSync(process.execPath, [TOOL, at, '--level', '0'], { encoding: 'utf8' });
    assert.equal(text.status, 1);
    assert.match(text.stderr, /error AGSC-E202 .*rel#access/u);
    const json = spawnSync(process.execPath, [TOOL, at, '--level', '0', '--json'], { encoding: 'utf8' });
    assert.equal(json.status, 1);
    assert.deepEqual(JSON.parse(json.stdout).findings.map((f) => f.code), ['AGSC-E202']);
  });
});
