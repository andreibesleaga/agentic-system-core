'use strict';
// The engine consequences of these rules, one test per rule:
// AGSC-09-14b (remember refuses a gate and an actor-less episode), AGSC-11-16 (the
// `mcp` surface declares the revision its transport speaks), AGSC-10-04 with
// AGSC-09-93 (a public Level-2 document links the ledger), AGSC-06-18 (the Content
// Use Terms only where the publisher adopts them), AGSC-01-14 (no C0 control in a
// Markdown file), AGSC-08-17 (numbered chapter references refused by pattern),
// AGSC-09-08 (AGSC-E003 is exit 2) and AGSC-09-09 (`mcp <path>`).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const { tools } = require('../../src/distribution/mcp-tools.js');
const surfaces = require('../../src/boundary/surfaces.js');
const discovery = require('../../src/distribution/discovery.js');
const chunks = require('../../src/knowledge/chunks.js');
const frontmatter = require('../../src/knowledge/frontmatter.js');
const cleanroom = require('../../src/governance/cleanroom.js');
const { USAGE_CLASS_CODES } = require('../../src/application/cli/main.js');
const { bundleRoot } = require('../../bin/agsc.js');

function fixture() {
  const schemas = validate.schemas(readSchemas('.'));
  return loadBundle(createFileSystem('tests/fixtures/minimal'), { schemas });
}

test('AGSC-09-14b: remember refuses kind gate with AGSC-E203', () => {
  const result = tools(fixture(), {}).call('remember', { body: 'b', kind: 'gate', title: 'A Gate' });
  assert.strictEqual(result.type, 'error');
  assert.strictEqual(result.body.code, 'AGSC-E203');
});

test('AGSC-09-14b: an episode without the declared actor is AGSC-E003', () => {
  const result = tools(fixture(), {}).call('remember', {
    at: '2026-01-01T00:00:00Z', body: 'b', kind: 'episode', title: 'A Run',
  });
  assert.strictEqual(result.type, 'error');
  assert.strictEqual(result.body.code, 'AGSC-E003');
});

test('AGSC-11-16: the mcp surface declares the transport revision, echoed when given', () => {
  const [byDefault] = surfaces.declare({ base: 'https://a.example/', mcpServed: true });
  assert.deepStrictEqual(byDefault['agsc-surface-version'], [surfaces.MCP_PROTOCOL_VERSION]);
  const [given] = surfaces.declare({ base: 'https://a.example/', mcpServed: true, mcpVersion: '2026-07-28' });
  assert.deepStrictEqual(given['agsc-surface-version'], ['2026-07-28']);
  const [malformed] = surfaces.declare({ base: 'https://a.example/', mcpServed: true, mcpVersion: 'latest' });
  assert.deepStrictEqual(malformed['agsc-surface-version'], [surfaces.MCP_PROTOCOL_VERSION]);
});

test('AGSC-10-04: a public Level-2 document without the ledger link is AGSC-E202 unless no ledger could be derived', () => {
  const doc = discovery.linkset({ site: { base: 'https://a.example' } }, {
    level: 2,
    bundleVersion: 'v1.0.0',
    bundleHash: discovery.digestOf('bundle'),
    counts: discovery.countsOf([]),
    digests: { '/graph.jsonld': discovery.digestOf('/graph.jsonld'), '/llms.txt': discovery.digestOf('/llms.txt') },
    generatedAt: '2026-01-01T00:00:00Z',
    specVersion: '1.0.0-rc.6',
  });
  assert.ok(discovery.check(doc, { level: 2 }).some((f) => f.code === 'AGSC-E202'));
  assert.ok(!discovery.check(doc, { level: 2, requireLedger: false }).some((f) => f.code === 'AGSC-E202'));
  assert.ok(!discovery.check(doc, { level: 0 }).some((f) => f.code === 'AGSC-E202'));
});

test('AGSC-06-18: the terms member names the Content Use Terms only where they are adopted', () => {
  assert.strictEqual(chunks.termsFor(undefined), chunks.TERMS);
  assert.strictEqual(chunks.termsFor(chunks.TERMS), chunks.TERMS);
  assert.strictEqual(chunks.termsFor('CC-BY-4.0'), 'CC-BY-4.0');
});

test('AGSC-01-14: a C0 control other than TAB and LF in a Markdown body is AGSC-E108', () => {
  const nul = frontmatter.split('---\ntitle: A\n---\nbody\u0000x\n', 'x.md');
  assert.ok(nul.errors.some((f) => f.code === 'AGSC-E108' && /C0 control/u.test(f.message)));
  const tab = frontmatter.split('---\ntitle: A\n---\nbody\tx\n', 'x.md');
  assert.ok(!tab.errors.some((f) => /C0 control/u.test(f.message)));
});

test('AGSC-08-17: a numbered chapter reference is refused by pattern, any number', () => {
  // The samples are assembled at run time so this file itself carries no such reference.
  const word = 'chapter';
  for (const text of [`as ${word.toUpperCase().slice(0, 1)}${word.slice(1)} 21 says`, `see ${word}s IV and V`, `${word} 7`]) {
    assert.strictEqual(cleanroom.check({ text }).length, 1, text);
  }
  assert.strictEqual(cleanroom.check({ text: 'a chaptered text with 21 parts' }).length, 0);
});

test('AGSC-09-08: AGSC-E003 is in the exit-2 class', () => {
  assert.ok(USAGE_CLASS_CODES.has('AGSC-E003'));
  assert.ok(USAGE_CLASS_CODES.has('AGSC-E004'));
});

test('AGSC-09-09: mcp takes an optional Bundle path; other verbs serve the working directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-mcp-root-'));
  try {
    assert.strictEqual(bundleRoot(['mcp'], dir), dir);
    assert.strictEqual(bundleRoot(['mcp', '.'], dir), dir);
    assert.strictEqual(bundleRoot(['--quiet', 'mcp', dir], '/'), dir);
    assert.strictEqual(bundleRoot(['build', 'elsewhere'], dir), dir);
    assert.strictEqual(bundleRoot(['mcp', path.join(dir, 'missing')], dir), null);
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});
