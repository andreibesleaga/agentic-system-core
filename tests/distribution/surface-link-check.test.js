'use strict';
// AGSC-11-16: the engine's discovery checker (`distribution/discovery.js#check`) makes the
// same structural checks of a `rel#surface` link as `tools/validate-wellknown`. Until
// 2026-10-02 it made none, so an `llms-txt` link carrying `agsc-surface-version` passed the
// engine and failed the independent validator and the Python checker.
//
// Deterministic: in-memory documents only.

const test = require('node:test');
const assert = require('node:assert/strict');

const discovery = require('../../src/distribution/discovery.js');

const REL = discovery.REL;

/** A Level-0 document whose only link besides the two required ones is `surface`. */
function withSurface(surface) {
  return {
    linkset: [{
      alternate: [{ href: 'https://a.example/llms.txt', type: 'text/plain' }],
      anchor: 'https://a.example/',
      describedby: [{ href: 'https://a.example/graph.jsonld', type: 'application/ld+json' }],
      [`${REL}surface`]: [surface],
    }],
  };
}

const codes = (doc) => discovery.check(doc, { level: 0 }).map((f) => `${f.code}/${f.severity}`);

test('AGSC-11-16: well-formed surface links raise nothing', () => {
  assert.deepEqual(codes(withSurface({ 'agsc-access': ['none'], 'agsc-surface': ['llms-txt'], href: 'https://a.example/llms.txt' })), []);
  assert.deepEqual(codes(withSurface({
    'agsc-access': ['consent'], 'agsc-surface': ['mcp'], 'agsc-surface-version': ['2025-11-25'], href: 'https://a.example/specs/mcp/',
  })), []);
});

test('AGSC-11-16: a version on llms-txt or chunks, or none on mcp, is AGSC-E210', () => {
  assert.deepEqual(codes(withSurface({
    'agsc-access': ['none'], 'agsc-surface': ['llms-txt'], 'agsc-surface-version': ['2'], href: 'https://a.example/llms.txt',
  })), ['AGSC-E210/error']);
  assert.deepEqual(codes(withSurface({
    'agsc-access': ['none'], 'agsc-surface': ['chunks'], 'agsc-surface-version': ['1'], href: 'https://a.example/chunks.jsonl',
  })), ['AGSC-E210/error']);
  assert.deepEqual(codes(withSurface({ 'agsc-access': ['consent'], 'agsc-surface': ['mcp'], href: 'https://a.example/specs/mcp/' })),
    ['AGSC-E210/error']);
});

test('AGSC-11-16: llms-txt must target /llms.txt; one surface and one access value', () => {
  assert.deepEqual(codes(withSurface({ 'agsc-access': ['none'], 'agsc-surface': ['llms-txt'], href: 'https://a.example/other.txt' })),
    ['AGSC-E210/error']);
  assert.deepEqual(codes(withSurface({ 'agsc-access': ['none', 'consent'], 'agsc-surface': ['llms-txt'], href: 'https://a.example/llms.txt' })),
    ['AGSC-E210/error']);
  assert.deepEqual(codes(withSurface({ 'agsc-access': ['none'], href: 'https://a.example/llms.txt' })), ['AGSC-E210/error']);
});

test('AGSC-11-02: an unknown surface name or access class is a warning, never an error', () => {
  assert.deepEqual(codes(withSurface({ 'agsc-access': ['none'], 'agsc-surface': ['telepathy'], href: 'https://a.example/t' })),
    ['AGSC-E210/warn']);
  assert.deepEqual(codes(withSurface({ 'agsc-access': ['public'], 'agsc-surface': ['llms-txt'], href: 'https://a.example/llms.txt' })),
    ['AGSC-E210/warn']);
  assert.deepEqual(codes(withSurface({ 'agsc-access': ['none'], 'agsc-surface': ['x-acme-feed'], href: 'https://a.example/f' })), []);
});

test('AGSC-11-16: a webmcp version must be a real date, in the engine\'s check and in the independent checker', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const checker = require('../../tools/validate-wellknown');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-webmcp-date-'));
  const webmcp = (version) => withSurface({
    'agsc-access': ['consent'], 'agsc-surface': ['webmcp'], 'agsc-surface-version': [version], href: 'https://a.example/compose/',
  });
  let n = 0;
  const independent = async (doc) => {
    n += 1;
    const at = path.join(dir, `doc-${n}.json`);
    fs.writeFileSync(at, `${JSON.stringify(doc)}\n`);
    let out = '';
    await checker.run([at, '--level', '0', '--json'], { err: () => {}, out: (s) => { out += s; } });
    return JSON.parse(out).findings.filter((f) => /webmcp/u.test(f.message)).map((f) => `${f.code}/${f.severity}`);
  };
  for (const [version, expected] of [['2026-10-27', []], ['2028-02-29', []], ['2026-13-45', ['AGSC-E210/error']],
    ['2026-02-30', ['AGSC-E210/error']], ['2027-02-29', ['AGSC-E210/error']]]) {
    assert.deepEqual(codes(webmcp(version)), expected, `engine ${version}`);
    assert.deepEqual(await independent(webmcp(version)), expected, `checker ${version}`);
  }
  fs.rmSync(dir, { force: true, recursive: true });
});
