'use strict';
// verifies PRD-066
// tests/bench/agent-kit.test.js — the kit of the agent-side study: the question-set templates,
// the gold index and the results-row contract under bench/queries/ (bench/queries/agent-study/
// README.md), the runner that checks them (bench/runners/kit.js, compiled from
// src-ts/bench/kit.ts) and the dry run of tools/bench that calls it.
//
// Deterministic: a fixed SOURCE_DATE_EPOCH for the one build, no network, no wall clock; the
// property tests use fast-check's fixed seed. Every write goes under the system temporary
// directory and is removed on exit.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { describe, it } = require('node:test');

const fc = require('fast-check');

const kit = require('../../bench/runners/kit.js');
const bench = require('../../tools/bench');
const lintClaims = require('../../tools/lint-claims');

const REPO = path.resolve(__dirname, '..', '..');
const SET = path.join(REPO, 'bench', 'queries', 'agent-study');
const CONTRACT = path.join(REPO, 'bench', 'queries', 'results-row.schema.json');
const FIXTURE = path.join(REPO, 'tests', 'fixtures', 'minimal');
const HOST = 'minimal.example';
const NODES = { 'agenticsystemcore.com': 21, 'patterns.agenticsystemcore.com': 128 };

function tmpdir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-agent-kit-'));
  process.on('exit', () => { try { fs.rmSync(dir, { force: true, recursive: true }); } catch { /* gone */ } });
  return dir;
}

function capture(module_, argv) {
  let out = '';
  let err = '';
  const code = module_.run(argv, { err: (s) => { err += s; }, out: (s) => { out += s; } });
  return { code, err, out };
}

let built = null;
/** The minimal fixture built once at the fixed epoch: the output directory. */
function buildOutput() {
  if (built !== null) return built;
  const dir = path.join(tmpdir(), 'node');
  fs.cpSync(FIXTURE, dir, { recursive: true });
  const env = { PATH: process.env.PATH, SOURCE_DATE_EPOCH: '1767225600' };
  const r = spawnSync(process.execPath, [path.join(REPO, 'bin', 'agsc.js'), 'build'], { cwd: dir, encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  built = path.join(dir, 'www');
  return built;
}

/** A copy of the agent-study set with `files` (set-relative path -> text) written over it. */
function setWith(files) {
  const dir = path.join(tmpdir(), 'set');
  fs.cpSync(SET, dir, { recursive: true });
  for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), text);
  return dir;
}

describe('the agent-study set: templates, gold index and rules', () => {
  it('ships the question template, the gold labels, the gold index, the datasheet and the rules', () => {
    for (const file of ['README.md', 'datasheet.md', 'gold-index.tsv', 'queries.jsonl', path.join('qrels', 'test.tsv')]) {
      assert.ok(fs.existsSync(path.join(SET, file)), file);
    }
    const set = bench.loadSet(SET);
    assert.equal(set.queries.length, 1, 'one example row, until the questions are written');
    for (const key of ['answerable', 'author', 'node', 'note', 'paraphrased_by', 'split', 'written']) {
      assert.ok(Object.hasOwn(set.queries[0].meta, key), `metadata.${key}`);
    }
    assert.match(fs.readFileSync(path.join(SET, 'qrels', 'test.tsv'), 'utf8'), /^query-id\tcorpus-id\tscore\n/u);
  });

  it('the gold index parses: 149 chunks of the two public nodes, nine columns, each chunk id once', () => {
    const { findings, rows } = kit.parseGoldIndex(fs.readFileSync(path.join(SET, 'gold-index.tsv'), 'utf8'), 'gold-index.tsv');
    assert.deepEqual(findings, []);
    assert.equal(rows.length, 149);
    const perNode = {};
    for (const row of rows) perNode[row.node] = (perNode[row.node] || 0) + 1;
    assert.deepEqual(perNode, NODES);
    assert.equal(new Set(rows.map((r) => r.chunk_id)).size, 149);
    assert.ok(rows.every((r) => r.first_140_chars === ''), 'the repository copy carries no chunk text (the Content Use Terms)');
  });

  it('every gold unit of qrels/test.tsv is a chunk id of the gold index', () => {
    const { rows } = kit.parseGoldIndex(fs.readFileSync(path.join(SET, 'gold-index.tsv'), 'utf8'), 'gold-index.tsv');
    assert.deepEqual(kit.checkQrels(bench.loadSet(SET).qrels, rows, 'qrels/test.tsv'), []);
    const stray = kit.checkQrels(new Map([['q1', new Set(['f'.repeat(64)])]]), rows, 'qrels/test.tsv');
    assert.deepEqual(stray.map((f) => [f.code, f.severity]), [['AGSC-E301', 'error']]);
  });

  it('a malformed gold index is refused row by row: header, columns, ids, ordinal, digest prefix, a repeated id', () => {
    const header = kit.GOLD_COLUMNS.join('\t');
    const row = (cells) => cells.join('\t');
    const good = ['n.example', 'a'.repeat(64), 'item', '0', 'concept', '', 'Item', 'b'.repeat(16), ''];
    assert.deepEqual(kit.parseGoldIndex(`${header}\n${row(good)}\n\n`, 'g').findings, [], 'a blank line is skipped');
    assert.equal(kit.parseGoldIndex(`node\tchunk\n${row(good)}\n`, 'g').findings[0].code, 'AGSC-E201');
    const faults = [
      good.slice(0, 8),
      ['', ...good.slice(1)],
      [good[0], 'xyz', ...good.slice(2)],
      [...good.slice(0, 3), '-1', ...good.slice(4)],
      [...good.slice(0, 7), 'B'.repeat(16), ''],
    ];
    for (const cells of faults) {
      const { findings, rows } = kit.parseGoldIndex(`${header}\n${row(cells)}\n`, 'g');
      assert.deepEqual([findings.length, findings[0].code, findings[0].line, rows.length], [1, 'AGSC-E201', 2, 0], cells.join('|'));
    }
    const twice = kit.parseGoldIndex(`${header}\n${row(good)}\n${row(good)}\n`, 'g');
    assert.deepEqual([twice.rows.length, twice.findings[0].line], [1, 3]);
    assert.match(twice.findings[0].message, /line 2/u);
  });
});

describe('the results-row contract', () => {
  const contract = JSON.parse(fs.readFileSync(CONTRACT, 'utf8'));
  const accepts = kit.contractValidator(contract);

  it('is a JSON Schema of draft 2020-12 that accepts each of its own examples', () => {
    assert.equal(contract.$schema, 'https://json-schema.org/draft/2020-12/schema');
    const checked = kit.checkContract(CONTRACT);
    assert.deepEqual(checked.findings, []);
    assert.equal(checked.summary.examples, contract.examples.length);
    for (const example of contract.examples) assert.equal(accepts(example), true);
  });

  it('refuses a row with no interval, no date, a date that is no day, or a comparison that publishes one configuration', () => {
    const row = contract.examples[0].rows[0];
    const without = (key) => Object.fromEntries(Object.entries(row).filter(([k]) => k !== key));
    for (const bad of [without('ci'), without('date'), { ...row, date: '2026-02-29' }, { ...row, n: 0 }, { ...row, ci: [0.4] },
      { ...row, configs: { 'agentic-system-core': { surfaces: 'chunks' } }, system: 'other' }]) {
      assert.equal(accepts({ rows: [bad] }), false, JSON.stringify(bad));
    }
  });

  it('a schema that refuses its own example, a file that is not JSON and a schema of another dialect are findings', () => {
    const dir = tmpdir();
    const write = (name, value) => {
      const file = path.join(dir, name);
      fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
      return file;
    };
    const refusing = { ...contract, examples: [{ rows: [{ model: 'm' }] }] };
    assert.deepEqual(kit.checkContract(write('refusing.json', refusing)).findings.map((f) => f.code), ['AGSC-E201']);
    assert.deepEqual(kit.checkContract(write('text.json', 'not json')).findings.map((f) => f.code), ['AGSC-E201']);
    const draft7 = { ...contract, $schema: 'http://json-schema.org/draft-07/schema#' };
    assert.deepEqual(kit.checkContract(write('draft7.json', draft7)).findings.map((f) => f.code), ['AGSC-E201']);
    const none = { ...contract, examples: [] };
    assert.deepEqual(kit.checkContract(write('none.json', none)).findings.map((f) => f.code), ['AGSC-E202']);
    assert.deepEqual(kit.checkContract(path.join(dir, 'absent.json')).findings.map((f) => f.code), ['AGSC-E901']);
  });

  // tools/lint-claims and the schema state one contract: every row the lint accepts, the schema
  // accepts. (The lint adds two cross-member checks the schema cannot state, so the converse
  // holds only for those two members, which the second property fixes.)
  const value = fc.oneof(fc.constant(undefined), fc.jsonValue({ maxDepth: 2 }));
  const day = fc.date({ max: new Date('2099-12-31T00:00:00Z'), min: new Date('2000-01-01T00:00:00Z'), noInvalidDate: true })
    .map((d) => d.toISOString().slice(0, 10));
  const row = fc.record({
    ci: fc.oneof(value, fc.tuple(fc.double({ noNaN: true, noDefaultInfinity: true }), fc.double({ noNaN: true, noDefaultInfinity: true }))),
    configs: fc.oneof(value, fc.constant({ 'agentic-system-core': { a: 1 }, other: { b: 2 } })),
    date: fc.oneof(value, day, fc.constant('2026-02-30')),
    metric: fc.oneof(value, fc.constant('recall@10')),
    model: fc.oneof(value, fc.constant('m')),
    n: fc.oneof(value, fc.integer({ max: 100, min: -1 })),
    system: fc.oneof(fc.constant(undefined), fc.constant('agentic-system-core'), fc.constant('other'), value),
    value: fc.oneof(value, fc.double({ noNaN: true, noDefaultInfinity: true })),
  }).map((r) => JSON.parse(JSON.stringify(r)));
  const lintAccepts = (rows) => lintClaims.lintResults('r.json', JSON.stringify({ rows })).length === 0;

  it('tools/lint-claims reads the date and the system as strings, as the contract does', () => {
    const base = { ci: [0.4, 0.6], date: '2027-01-15', metric: 'recall@10', model: 'm', n: 5, value: 0.5 };
    for (const bad of [{ ...base, date: ['2027-01-15'] }, { ...base, configs: { 'agentic-system-core': { a: 1 }, null: { b: 2 } }, system: null }]) {
      assert.equal(accepts({ rows: [bad] }), false);
      assert.equal(lintAccepts([bad]), false, JSON.stringify(bad));
    }
  });

  it('property: a row tools/lint-claims accepts, the schema accepts', () => {
    fc.assert(fc.property(row, (r) => !lintAccepts([r]) || accepts({ rows: [r] })), { numRuns: 2000, seed: 20260101 });
  });

  it('property: on an ordered interval and a configuration keyed by the system, the schema and the lint agree', () => {
    const fixed = row.map((r) => {
      const ci = Array.isArray(r.ci) && r.ci.length === 2 && r.ci.every(Number.isFinite) ? [...r.ci].sort((a, b) => a - b) : r.ci;
      const configs = typeof r.system === 'string' && r.system !== 'agentic-system-core'
        ? { 'agentic-system-core': { a: 1 }, [r.system]: { b: 2 } } : r.configs;
      return JSON.parse(JSON.stringify({ ...r, ci, configs }));
    });
    fc.assert(fc.property(fixed, (r) => lintAccepts([r]) === accepts({ rows: [r] })), { numRuns: 2000, seed: 20260101 });
  });
});

describe('the gold index against a build', () => {
  it('the generator writes the gold index of a build: every chunk once, and the index checks against that build', () => {
    const chunks = kit.readChunks(buildOutput()).chunks;
    assert.ok(chunks.length > 3, `${chunks.length} chunks`);
    const rows = kit.goldRows(HOST, chunks, { excerpts: true });
    assert.equal(rows.length, chunks.length);
    assert.ok(rows.every((r) => r.first_140_chars.length > 0 && [...r.first_140_chars].length <= 140 && !/\s\s|\t|\n/u.test(r.first_140_chars)));
    const text = kit.formatGoldIndex(rows);
    assert.deepEqual(kit.parseGoldIndex(text, 'g').rows, rows, 'the written index reads back as written');
    const check = kit.checkGoldIndex(rows, chunks, 'g');
    assert.deepEqual(check.findings, []);
    assert.deepEqual(check.summary, { checked: rows.length, digest_changed: 0, fixture_ids: 0, found: rows.length, rows: rows.length });
    assert.ok(kit.goldRows(HOST, chunks, { excerpts: false }).every((r) => r.first_140_chars === ''));
  });

  it('a gold id the build does not publish is an error, a row of another node is a fixture id, a changed digest is a warning', () => {
    const chunks = kit.readChunks(buildOutput()).chunks;
    const [one, two] = kit.goldRows(HOST, chunks, { excerpts: false });
    const rows = [
      { ...one, chunk_id: 'f'.repeat(64) },
      { ...two, digest16: '0'.repeat(16) },
      { ...two, chunk_id: 'e'.repeat(64), node: 'elsewhere.example' },
    ];
    const check = kit.checkGoldIndex(rows, chunks, 'g');
    assert.deepEqual(check.findings.map((f) => [f.code, f.severity, f.line]), [['AGSC-E301', 'error', 2], ['AGSC-E210', 'warn', 3]]);
    assert.deepEqual(check.summary, { checked: 2, digest_changed: 1, fixture_ids: 1, found: 1, rows: 3 });
  });

  it('a build with no chunk export cannot be checked', () => {
    const empty = tmpdir();
    assert.deepEqual(kit.readChunks(empty).findings.map((f) => f.code), ['AGSC-E901']);
  });

  it('a chunk line that is not JSON or lacks a member the kit reads is a finding with its file and line', () => {
    const node = tmpdir();
    const good = fs.readFileSync(path.join(buildOutput(), 'chunks.jsonl'), 'utf8').split('\n')[0];
    fs.writeFileSync(path.join(node, 'chunks.jsonl'), `${good}\n{"id":"x"\n{"id":"y","iri":"https://minimal.example/y"}\n`);
    const read = kit.readChunks(node);
    assert.equal(read.chunks.length, 1);
    assert.deepEqual(read.findings.map((f) => [f.code, path.basename(f.file), f.line]), [['AGSC-E201', 'chunks.jsonl', 2], ['AGSC-E201', 'chunks.jsonl', 3]]);
    assert.match(read.findings[1].message, /digest/u);
    fs.writeFileSync(path.join(node, 'search.json'), JSON.stringify({ docs: [], terms: {} }));
    const r = capture(bench, ['--node', node, '--set', SET, '--dry-run', '--json']);
    assert.equal(r.code, 1);
    assert.deepEqual(JSON.parse(r.out).findings.map((f) => f.code), ['AGSC-E201', 'AGSC-E201']);
  });

  it('a sharded export is read through its manifest, shard by shard (AGSC-06-31); a shard outside the export is refused', () => {
    const node = tmpdir();
    const lines = fs.readFileSync(path.join(buildOutput(), 'chunks.jsonl'), 'utf8');
    fs.writeFileSync(path.join(node, 'chunks-01.jsonl'), lines);
    fs.writeFileSync(path.join(node, 'chunks.jsonl'), `${JSON.stringify({ bundle_version: '1', lines_total: 1, shards: ['/chunks-01.jsonl'] })}\n`);
    const read = kit.readChunks(node);
    assert.deepEqual(read.findings, []);
    assert.deepEqual(read.chunks, kit.readChunks(buildOutput()).chunks);
    fs.writeFileSync(path.join(node, 'chunks.jsonl'), `${JSON.stringify({ bundle_version: '1', lines_total: 1, shards: ['/../secret.jsonl'] })}\n`);
    assert.deepEqual(kit.readChunks(node).findings.map((f) => [f.code, f.line]), [['AGSC-E201', 1]]);
  });
});

describe('tools/bench --dry-run with the kit', () => {
  it('on a built node: offline, exit 0, and the same JSON on every run', () => {
    const argv = ['--node', buildOutput(), '--set', SET, '--dry-run', '--json'];
    const first = capture(bench, argv);
    const second = capture(bench, argv);
    assert.equal(first.code, 0, first.err);
    assert.equal(second.out, first.out);
    const envelope = JSON.parse(first.out);
    assert.equal(envelope.status, 'dry-run');
    assert.equal(envelope.counts.error, 0);
    assert.deepEqual(envelope.kit.gold_index, { checked: 0, digest_changed: 0, fixture_ids: 149, found: 0, rows: 149 });
    // No row of the shipped index names the fixture's node, so nothing was checked against it: a warning says so.
    assert.deepEqual(envelope.findings.map((f) => [f.code, f.severity]), [['AGSC-E210', 'warn']]);
    assert.match(envelope.findings[0].message, /no gold row names a node this build publishes \(minimal\.example\)/u);
    assert.equal(envelope.counts.warn, 1);
    assert.equal(envelope.kit.contract.examples, 1);
    assert.equal(envelope.kit.contract.schema, 'results-row.schema.json');
  });

  it('the committed retrieval set has no gold index: the contract alone is checked', () => {
    const envelope = JSON.parse(capture(bench, ['--dry-run', '--json']).out);
    assert.equal(envelope.kit.gold_index, null);
    assert.equal(envelope.kit.contract.examples, 1);
    const text = capture(bench, ['--dry-run']);
    assert.match(text.out, /20 queries, 20 labelled/u);
    assert.match(text.out, /results-row contract: 1 example accepted/u);
  });

  it('a gold id of the built node that the build does not publish fails the dry run with exit 1', () => {
    const chunks = kit.readChunks(buildOutput()).chunks;
    const rows = kit.goldRows(HOST, chunks, { excerpts: false });
    const set = setWith({ 'gold-index.tsv': kit.formatGoldIndex([...rows, { ...rows[0], chunk_id: 'f'.repeat(64) }]) });
    const r = capture(bench, ['--node', buildOutput(), '--set', set, '--dry-run']);
    assert.equal(r.code, 1);
    assert.match(r.err, /FINDING AGSC-E301 .*f{64}/u);
    assert.match(r.out, new RegExp(`gold index: ${rows.length + 1} rows, ${rows.length + 1} checked, ${rows.length} found, 0 fixture ids`, 'u'));
  });

  it('a malformed gold index and a gold unit outside it fail the dry run without a node', () => {
    const set = setWith({ 'gold-index.tsv': 'node\n', [path.join('qrels', 'test.tsv')]: `query-id\tcorpus-id\tscore\nq-example\t${'f'.repeat(64)}\t1\n` });
    const envelope = JSON.parse(capture(bench, ['--set', set, '--dry-run', '--json']).out);
    assert.equal(envelope.status, 'fail');
    assert.deepEqual(envelope.findings.map((f) => f.code), ['AGSC-E201', 'AGSC-E301']);
    assert.equal(envelope.findings[1].line, 2, 'the gold-label finding names the line of qrels/test.tsv');
  });

  it('without a node, the report counts the gold rows and the gold labels it checked', () => {
    const envelope = JSON.parse(capture(bench, ['--set', SET, '--dry-run', '--json']).out);
    assert.equal(envelope.kit.gold_index, null);
    assert.deepEqual(envelope.kit.index, { labels: 1, rows: 149 });
    assert.match(capture(bench, ['--set', SET, '--dry-run']).out, /gold index: 149 rows, 1 gold label checked against it/u);
    assert.equal(JSON.parse(capture(bench, ['--dry-run', '--json']).out).kit.index, null, 'a set with no gold index');
  });

  it('a set with a gold index and a node with no chunk export is a finding, not a pass', () => {
    const node = tmpdir();
    fs.writeFileSync(path.join(node, 'search.json'), JSON.stringify({ docs: [], terms: {} }));
    const r = capture(bench, ['--node', node, '--set', SET, '--dry-run', '--json']);
    assert.equal(r.code, 1);
    assert.deepEqual(JSON.parse(r.out).findings.map((f) => f.code), ['AGSC-E901']);
  });
});

describe('bench/runners/kit.js gold-index — writing the index from builds', () => {
  it('writes the gold index of the builds it is given, with or without the chunk text', () => {
    const chunks = kit.readChunks(buildOutput()).chunks;
    const full = capture(kit, ['gold-index', `${HOST}=${buildOutput()}`]);
    assert.equal(full.code, 0, full.err);
    assert.equal(full.out, kit.formatGoldIndex(kit.goldRows(HOST, chunks, { excerpts: true })));
    const bare = capture(kit, ['gold-index', '--without-excerpts', `${HOST}=${buildOutput()}`]);
    assert.equal(bare.out, kit.formatGoldIndex(kit.goldRows(HOST, chunks, { excerpts: false })));
  });

  it('answers --help, and refuses no node, a malformed node argument and a build with no chunks', () => {
    assert.equal(capture(kit, ['--help']).code, 0);
    assert.match(capture(kit, ['--help']).out, /^kit gold-index /u);
    assert.equal(capture(kit, []).code, 2);
    assert.equal(capture(kit, ['gold-index']).code, 2);
    assert.equal(capture(kit, ['gold-index', 'no-equals-sign']).code, 2);
    assert.equal(capture(kit, ['gold-index', '--nonsense', `${HOST}=${buildOutput()}`]).code, 2);
    const empty = capture(kit, ['gold-index', `${HOST}=${tmpdir()}`]);
    assert.equal(empty.code, 1);
    assert.match(empty.err, /AGSC-E901/u);
  });
});
