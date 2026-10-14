'use strict';
// verifies AGSC-09-09, AGSC-09-11, AGSC-09-13, AGSC-09-14a, AGSC-09-14b, AGSC-09-92, AGSC-09-93, AGSC-09-94
// verifies AGSC-11-04, AGSC-11-05, AGSC-11-08, AGSC-11-10, AGSC-11-14, AGSC-11-17, AGSC-11-18, AGSC-11-20
// The tool and command contracts of spec/09 and the boundary rules of spec/11 say
// what the reference engine does, and say it once. Each test reads the rule text
// in plain words (no code span is required of the specification) and, where the
// sentence states a behaviour, checks the engine against it: the `remember`
// signature against the tool table and the server's own argument list, the
// refusal of an absolute `compose --out` or `conform --to`, the `sources[]`
// entries a `remember` call keeps. Deterministic: fixed build instant, scratch
// copies under the system temporary directory, no network.

const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ROOT } = require('./_fixture.js');
const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const { tools, ARGUMENTS } = require('../../src/distribution/mcp-tools.js');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SPEC = fs.readdirSync(path.join(ROOT, 'spec')).filter((f) => f.endsWith('.md')).sort()
  .map((f) => read(`spec/${f}`)).join('\n');

/** The text of one rule, up to the next rule of its chapter. */
function ruleText(id) {
  const at = SPEC.indexOf(`**${id}**`);
  assert.ok(at >= 0, `${id} is not in the specification`);
  const end = SPEC.indexOf('\n- **AGSC-', at + 1);
  return SPEC.slice(at, end < 0 ? undefined : end);
}

/**
 * Text without its dated amendment notes, code-span ticks or emphasis, so that
 * assertions read the rule's plain words — a note quotes the wording it replaced.
 */
const plainWords = (text) => text.replace(/\*\(Amended [^)]*?\)\*/gu, '').replace(/[`*]/gu, '').replace(/\s+/gu, ' ');

/** The argument names of the AGSC-09-13 table row of one tool. */
function tableArguments(tool) {
  const row = ruleText('AGSC-09-13').split('\n').find((l) => l.startsWith(`  | \`${tool}\` |`));
  assert.ok(row, `the AGSC-09-13 table has no row for ${tool}`);
  const cell = row.split('|')[2];
  return [...cell.matchAll(/`([a-z_]+)`/gu)].map((m) => m[1]).sort();
}

test('AGSC-09-14b: the remember(...) signature names exactly the arguments of the AGSC-09-13 table row', () => {
  const rule = ruleText('AGSC-09-14b');
  const signature = /remember\(\{([^}]*)\}\)/u.exec(rule);
  assert.ok(signature, 'AGSC-09-14b carries no remember({...}) signature');
  const named = signature[1].split(',').map((a) => a.trim().replace(/\?$/u, '')).filter(Boolean).sort();
  assert.deepStrictEqual(named, tableArguments('remember'));
  // The table and the server's own argument list are one contract (AGSC-09-16).
  assert.deepStrictEqual(tableArguments('remember'), [...ARGUMENTS.remember].sort());
  for (const identity of ['agent', 'model', 'operator', 'origin']) assert.ok(named.includes(identity), identity);
});

test('AGSC-09-14b: the bound on the token counts of usage is stated, as the engine applies it', () => {
  const rule = plainWords(ruleText('AGSC-09-14b'));
  assert.match(rule, /safe integer/u);
  assert.match(rule, /RFC 7493/u);
  const toolset = tools(fixture(), {});
  const call = (usage) => toolset.call('remember', {
    actor: 'process:ci', at: '2026-01-01T00:00:00Z', body: 'It ran.', kind: 'episode',
    operator: 'human:someone', title: 'A Recorded Run', usage,
  });
  assert.strictEqual(call({ tokens_in: Number.MAX_SAFE_INTEGER, tokens_out: 0 }).type, 'proposal');
  const over = call({ tokens_in: Number.MAX_SAFE_INTEGER + 1 });
  assert.strictEqual(over.type, 'error');
  assert.strictEqual(over.body.code, 'AGSC-E201');
});

test('AGSC-09-14b: a sources[] entry that fails is dropped with the one warning AGSC-E506, and a kept entry carries its resource and id only', () => {
  const rule = plainWords(ruleText('AGSC-09-14b'));
  assert.doesNotMatch(rule, /AGSC-E401/u, 'the sources[] sentence names two codes for one fault');
  assert.doesNotMatch(rule, /truncated to its schema bound/u);
  assert.match(rule, /carries its resource and its id and no other member/u);
  const result = tools(fixture(), {}).call('remember', {
    body: 'x', kind: 'concept', operator: 'human:someone', title: 'A Remembered Note',
    sources: [
      { id: 'one', resource: 'https://example.org/a', title: 'Kept title' },
      { id: 'two', resource: 'ftp://example.org/b' },
    ],
  });
  assert.strictEqual(result.type, 'proposal');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result.body.frontmatter.sources)), [{ id: 'one', resource: 'https://example.org/a' }]);
  assert.deepStrictEqual(result.body.findings.map((f) => f.code), ['AGSC-E506']);
});

test('AGSC-09-14a: no stop-word list, and the no-answer result cites nothing', () => {
  const rule = plainWords(ruleText('AGSC-09-14a'));
  assert.doesNotMatch(rule, /stop words the tokenizer drops/u);
  assert.match(rule, /no stop-word list/u);
  assert.match(rule, /empty citations\[\]/u);
  assert.doesNotMatch(rule, /Every answer MUST cite/u);
});

test('AGSC-09-09: an absolute or escaping compose --out or conform --to is refused with AGSC-E902', (t) => {
  const rule = plainWords(ruleText('AGSC-09-09'));
  assert.match(rule, /compose --out and conform --to take a path relative to the Bundle root/u);
  assert.match(rule, /refused with AGSC-E902/u);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-out-'));
  t.after(() => fs.rmSync(scratch, { force: true, recursive: true }));
  const bundle = path.join(scratch, 'bundle');
  fs.cpSync(path.join(ROOT, 'tests', 'fixtures', 'minimal'), bundle, { recursive: true });
  const outside = path.join(scratch, 'outside');
  const env = { PATH: process.env.PATH, SOURCE_DATE_EPOCH: '1767225600' };
  if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
  const run = (args) => spawnSync(process.execPath, [path.join(ROOT, 'bin', 'agsc.js'), ...args, '--json'],
    { cwd: bundle, encoding: 'utf8', env });
  for (const args of [['conform', '--to', path.join(outside, 'report.json')], ['compose', '--out', outside, 'handoff'],
    ['conform', '--to', '../report.json'], ['compose', '--out', '../harness', 'handoff']]) {
    const r = run(args);
    assert.strictEqual(r.status, 1, `${args.join(' ')}: ${r.stderr}`);
    const codes = JSON.parse(r.stdout).findings.map((f) => f.code);
    assert.deepStrictEqual(codes, ['AGSC-E902'], args.join(' '));
  }
  assert.ok(!fs.existsSync(outside), 'a refused path was written');
  assert.ok(!fs.existsSync(path.join(scratch, 'report.json')) && !fs.existsSync(path.join(scratch, 'harness')));
});

test('AGSC-09-11: which members a finding always carries, which it carries when they apply, and how one with no file sorts', () => {
  const rule = plainWords(ruleText('AGSC-09-11'));
  assert.match(rule, /a finding about a whole file carries line 1 and col 1/u);
  assert.match(rule, /file as the empty string/u);
  assert.match(rule, /slug only when the finding is about one item/u);
  // The engine's envelope does what the sentence says.
  const out = validate.withPosition({ code: 'AGSC-E901', message: 'm', severity: 'error' });
  assert.deepStrictEqual(out, { code: 'AGSC-E901', col: 1, file: '', line: 1, message: 'm', severity: 'error' });
});

test('AGSC-09-94: the run timeout and the vendor name of a kept trace member are said', () => {
  const rule = plainWords(ruleText('AGSC-09-94'));
  assert.match(rule, /timeout, whose value this specification leaves to the implementation/u);
  assert.match(rule, /x-trace-/u);
  assert.match(read('src/interchange/trace.js'), /const KEEP_PREFIX = 'x-trace-';/u);
  assert.match(read('src/adapters/node-proc.js'), /const DEFAULT_TIMEOUT_MS = 10000;/u);
  assert.match(rule, /10 seconds/u);
});

test('AGSC-09-92: the rule names whose CI runs the validators', () => {
  const rule = plainWords(ruleText('AGSC-09-92'));
  assert.match(rule, /^AGSC-09-92 \(reference distribution\) The reference distribution's CI MUST run/u);
});

test('AGSC-09-93: the media type is required in every case; the profile comes by the parameter or the Link header', () => {
  const rule = plainWords(ruleText('AGSC-09-93'));
  assert.doesNotMatch(rule, /application\/linkset\+json or a Link/u);
  assert.match(rule, /the response media type is application\/linkset\+json, and the profile URI is named by its profile parameter or by a Link/u);
});

test('AGSC-11-04: the header-blind equivalence is about the profile carrier only', () => {
  const rule = plainWords(ruleText('AGSC-11-04'));
  assert.doesNotMatch(rule, /conformance MUST NOT differ/u);
  assert.match(rule, /whether a document is recognised as carrying the profile MUST NOT differ/u);
  assert.match(rule, /about the profile carrier only/u);
});

test('AGSC-11-05: the ETag is an act of the host that serves the node', () => {
  const rule = plainWords(ruleText('AGSC-11-05'));
  assert.doesNotMatch(rule, /It MUST send an ETag/u);
  assert.match(rule, /Every public artefact MUST be served with an ETag/u);
  assert.match(rule, /host that serves the node/u);
  // The rationale no longer leans on a sentence AGSC-11-04 no longer says.
  assert.doesNotMatch(rule, /AGSC-11-04 requires conformance not to differ/u);
});

test('AGSC-11-08: mapped and compatible IPv6 addresses are refused whole, and the classification is testable', () => {
  const rule = plainWords(ruleText('AGSC-11-08'));
  assert.doesNotMatch(rule, /well-tested library/u);
  assert.doesNotMatch(rule, /hand-parse/u);
  assert.match(rule, /::\/96 \(IPv4-compatible, refused whole/u);
  assert.match(rule, /::ffff:0:0\/96 \(IPv4-mapped, refused whole/u);
  assert.match(rule, /::ffff:8\.8\.8\.8 is refused/u);
  assert.match(rule, /every textual form of one address the same result/u);
});

test('AGSC-11-10: the members of a walk result are said', () => {
  const rule = plainWords(ruleText('AGSC-11-10'));
  assert.match(rule, /A walk's result names the peers visited, in the order visited, each skipped peer with its code, and partial/u);
});

test('AGSC-11-14: an auto contribute channel names its code', () => {
  const rule = plainWords(ruleText('AGSC-11-14'));
  assert.match(rule, /auto is NOT permitted for a contribute channel \(AGSC-E209/u);
});

test('AGSC-11-17: an extension surface is declarable on stated terms', () => {
  const rule = plainWords(ruleText('AGSC-11-17'));
  assert.match(rule, /An extension surface x-<vendor>-<name>/u);
  assert.match(rule, /AGSC-E210/u);
});

test('AGSC-11-18: the cases pin the capabilities as reported under the revision spoken, citing SEP-2133 for initialize', () => {
  const rule = plainWords(ruleText('AGSC-11-18'));
  assert.doesNotMatch(rule, /bnd-0036 pins the map as it is carried in the server\/discover result/u);
  assert.match(rule, /in the initialize result under 2025-11-25, in the server\/discover result under 2026-07-28/u);
  assert.match(rule, /Servers advertise extension support in the initialize response/u);
});

test('AGSC-11-20: a restricted node checked at Level 0 still carries the two attributes it keeps', () => {
  const rule = plainWords(ruleText('AGSC-11-20'));
  assert.match(rule, /a check at Level 0 accepts them/u);
});

function fixture() {
  const schemas = validate.schemas(readSchemas(ROOT));
  return loadBundle(createFileSystem(path.join(ROOT, 'tests', 'fixtures', 'minimal')), { schemas });
}
