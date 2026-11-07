'use strict';
// tests/composition/skill-format.test.js — AGSC-07-22, the Agent Skills check a writer makes
// before it writes a `SKILL.md` (agentskills.io/specification, read again 2026-11-07).
//
//   * The six fields of the format; a file this specification emits carries `name`,
//     `description` and `license`, and each fault has its code: a bound E204, a missing
//     `license` E202, a `metadata` that is not a map of strings E201, `allowed-tools` E407,
//     any other key E207.
//   * In a published pack every fault is an error and the file is not written; in a file of
//     the Harness a bound fault is the warning E204 and the file is written as authored.
//   * Every file the writers emit passes: the published packs of a Bundle, and the Harness
//     skill files, whose bytes do not change (no byte a 1.0 writer emits changes).
//   * fast-check: the check is deterministic and does not depend on the order of the keys.
//
// Deterministic: no clock, no network, fixed seed.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fc = require('fast-check');

const format = require('../../src/composition/skill-format.js');
const skills = require('../../src/composition/skills.js');
const harness = require('../../src/composition/harness.js');
const { compose } = require('../../src/composition/compose.js');

const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');
const PACK = Object.freeze({ directory: 'agent-patterns', file: 'agent-patterns/SKILL.md' });
const HARNESS = Object.freeze({ directory: 'handoff', file: 'skills/handoff/SKILL.md', harness: true });

/** A `SKILL.md` whose frontmatter is `lines`, with a short body. */
const skillFile = (lines) => `---\n${lines.join('\n')}\n---\n\n# Title\n`;
const GOOD = ['name: agent-patterns', 'description: Patterns for agents.', 'license: CC-BY-4.0'];
const codes = (findings) => findings.map((f) => `${f.code} ${f.severity}`);

test('AGSC-07-22: the three fields this specification emits pass the check', () => {
  assert.deepEqual(format.check(skillFile(GOOD), PACK), []);
});

test('AGSC-07-22: the six fields of the format, and compatibility and metadata within their bounds, pass', () => {
  const text = skillFile([...GOOD, 'compatibility: Any reader of Markdown.', 'metadata:', '  author: example-org', '  version: "1.0"']);
  assert.deepEqual(format.check(text, PACK), []);
  assert.deepEqual(format.FIELDS, ['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
});

test('AGSC-07-22: name — 1 to 64 characters of the slug grammar, equal to the directory; E204', () => {
  const name = (value, where = PACK) => codes(format.check(skillFile([`name: ${value}`, ...GOOD.slice(1)]), where));
  assert.deepEqual(name('Agent-Patterns'), ['AGSC-E204 error']);
  assert.deepEqual(name('agent--patterns'), ['AGSC-E204 error']);
  assert.deepEqual(name('a'.repeat(65), { ...PACK, directory: 'a'.repeat(65) }), ['AGSC-E204 error']);
  assert.deepEqual(name('a'.repeat(64), { ...PACK, directory: 'a'.repeat(64) }), []);
  assert.deepEqual(name('other-name'), ['AGSC-E204 error'], 'the name equals the directory');
  assert.deepEqual(codes(format.check(skillFile(GOOD.slice(1)), PACK)), ['AGSC-E204 error'], 'a missing name is outside its bound');
});

test('AGSC-07-22: description — 1 to 1024 characters; compatibility at most 500; E204', () => {
  const at = (key, n) => codes(format.check(skillFile([...GOOD.filter((l) => !l.startsWith(`${key}:`)), `${key}: ${'d'.repeat(n)}`]), PACK));
  assert.deepEqual(at('description', 1024), []);
  assert.deepEqual(at('description', 1025), ['AGSC-E204 error']);
  assert.deepEqual(codes(format.check(skillFile([GOOD[0], 'description: ""', GOOD[2]]), PACK)), ['AGSC-E204 error']);
  assert.deepEqual(at('compatibility', 500), []);
  assert.deepEqual(at('compatibility', 501), ['AGSC-E204 error']);
  // Characters are code points: 1024 emoji are 2048 UTF-16 units and still within the bound.
  assert.deepEqual(codes(format.check(skillFile([GOOD[0], `description: ${'\u{1F600}'.repeat(1024)}`, GOOD[2]]), PACK)), []);
});

test('AGSC-07-22: a missing license is E202; metadata that is not a map of strings is E201', () => {
  assert.deepEqual(codes(format.check(skillFile(GOOD.slice(0, 2)), PACK)), ['AGSC-E202 error']);
  assert.deepEqual(codes(format.check(skillFile([...GOOD, 'metadata: flat']), PACK)), ['AGSC-E201 error']);
  assert.deepEqual(codes(format.check(skillFile([...GOOD, 'metadata:', '  nested:', '    deep: x']), PACK)), ['AGSC-E201 error']);
});

test('AGSC-07-22 with AGSC-07-15: allowed-tools is E407; any other key is E207', () => {
  assert.deepEqual(codes(format.check(skillFile([...GOOD, 'allowed-tools: Read']), PACK)), ['AGSC-E407 error']);
  assert.deepEqual(codes(format.check(skillFile([...GOOD, 'version: "1.0"']), PACK)), ['AGSC-E207 error']);
});

test('AGSC-07-22: a file with no frontmatter block fails the check; a body of any size is not read', () => {
  assert.deepEqual(codes(format.check('# Title\n', PACK)), ['AGSC-E101 error']);
  // A pack of a large cluster is bigger than the size cap of an item file (AGSC-01-16).
  assert.deepEqual(format.check(`${skillFile(GOOD)}${'x'.repeat(2 * 1024 * 1024)}\n`, PACK), []);
});

test('AGSC-07-22 with AGSC-00-14: in a file of the Harness a bound fault is the warning E204, any other fault an error', () => {
  const long = skillFile(['name: handoff', `description: ${'d'.repeat(1025)}`, 'license: CC-BY-4.0']);
  assert.deepEqual(codes(format.check(long, HARNESS)), ['AGSC-E204 warn']);
  assert.deepEqual(codes(format.check(skillFile(['name: handoff', 'description: D.', 'license: x', 'allowed-tools: Read']), HARNESS)),
    ['AGSC-E407 error']);
  assert.equal(format.check(long, HARNESS)[0].file, 'skills/handoff/SKILL.md');
});

test('AGSC-07-22: every pack the writer emits passes the check, an imported cluster\'s long description included', () => {
  const items = [
    { description: 'The patterns.', slug: 'agent-patterns', title: 'Agent patterns', type: 'cluster' },
    // A cluster that reached here from an import was never schema-validated (AGSC-01-22).
    { description: 'x'.repeat(1200), slug: 'long', title: 'Long', type: 'cluster' },
  ];
  const out = skills.packs(items, { base: 'https://a.example/', generatedAt: '2026-01-01T00:00:00Z', sha256, specVersion: '1.1.0' });
  assert.deepEqual(out.files.map((f) => f.path), ['agent-patterns/SKILL.md', 'index.json', 'long/SKILL.md'],
    'the writer bounds the description itself, so both packs pass');
  assert.deepEqual(out.findings, []);
  for (const file of out.files.filter((f) => f.path.endsWith('/SKILL.md'))) {
    assert.deepEqual(format.check(file.text, { directory: file.path.split('/')[0], file: file.path }), [], file.path);
  }
});

/** The Harness of one Procedure, emitted by the writer. */
function harnessOf(procedure) {
  const items = [{ body: '## Steps\n\n1. Hand off.\n', slug: 'handoff', title: 'Hand off', type: 'procedure', ...procedure }];
  const result = compose(items, ['handoff']);
  return harness.emit(result, {
    base: 'https://minimal.example/', instant: '2026-01-01T00:00:00Z', items, name: 'h', selectionDigest: sha256('h'), specVersion: '1.1.0',
  });
}

test('AGSC-07-22: the skill files of a Harness pass; a description beyond 1024 is a warning and the bytes stay', () => {
  const plain = harnessOf({ description: 'Pass the task and its context to the next agent.' });
  assert.deepEqual(format.harnessFindings(plain.kinds.skills), []);
  // A 1.0 writer wrote this file from an item that never passed validation; 1.1 still writes it.
  const long = harnessOf({ description: 'd'.repeat(1100) });
  assert.deepEqual(codes(format.harnessFindings(long.kinds.skills)), ['AGSC-E204 warn']);
  assert.equal(long.files.get('skills/handoff/SKILL.md'), long.kinds.skills[0].text);
  assert.equal(long.emitted, true);
});

test('AGSC-07-22 (property): the check is deterministic and independent of the order of the keys', () => {
  const lines = fc.shuffledSubarray([...GOOD, 'compatibility: c', 'version: "2"', 'allowed-tools: Read', 'metadata: m'],
    { minLength: 0 });
  fc.assert(fc.property(lines, (subset) => {
    const once = codes(format.check(skillFile(subset), PACK)).sort();
    assert.deepEqual(codes(format.check(skillFile([...subset].reverse()), PACK)).sort(), once);
    assert.deepEqual(codes(format.check(skillFile(subset), PACK)).sort(), once);
  }), { numRuns: 200, seed: 22 });
});
