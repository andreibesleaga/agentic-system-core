'use strict';
// tests/bench/bench.test.js — the benchmark kit: the arithmetic (bench/metrics.js),
// the synthetic-Bundle generator (bench/gen-bundle.js) and the standalone retrieval
// runner (tools/bench).
//
// Deterministic: no clock, no network, no randomness, no subprocess. The generator
// writes into a temporary directory that is removed on exit, never into the
// repository — which the generator itself refuses.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, it } = require('node:test');

const metrics = require('../../bench/metrics.js');
const gen = require('../../bench/gen-bundle.js');
const bench = require('../../tools/bench');

const REPO = path.resolve(__dirname, '..', '..');

function tmpdir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-bench-'));
  process.on('exit', () => { try { fs.rmSync(dir, { force: true, recursive: true }); } catch { /* gone */ } });
  return dir;
}

function capture(module_, argv) {
  let out = '';
  let err = '';
  const code = module_.run(argv, { err: (s) => { err += s; }, out: (s) => { out += s; } });
  return { code, err, out };
}

describe('bench/metrics.js — the arithmetic', () => {
  it('median returns null for nothing and the middle value otherwise', () => {
    assert.equal(metrics.median([]), null);
    assert.equal(metrics.median('not a list'), null);
    assert.equal(metrics.median([3, 1, 2]), 2);
    assert.equal(metrics.median([4, 1, 2, 3]), 2.5);
  });

  it('precision, recall, reciprocal rank and nDCG agree with hand calculation', () => {
    const ranked = ['a', 'b', 'c', 'd'];
    assert.equal(metrics.precisionAt(ranked, ['b'], 2), 0.5);
    assert.equal(metrics.precisionAt([], ['b'], 2), 0);
    assert.equal(metrics.recallAt(ranked, ['b', 'z'], 4), 0.5);
    assert.equal(metrics.recallAt(ranked, [], 4), 0);
    assert.equal(metrics.reciprocalRank(ranked, ['c']), 1 / 3);
    assert.equal(metrics.reciprocalRank(ranked, ['z']), 0);
    assert.equal(metrics.ndcgAt(ranked, ['a'], 4), 1);
    assert.equal(metrics.ndcgAt(ranked, [], 4), 0);
    assert.ok(metrics.ndcgAt(ranked, ['d'], 4) < 0.5);
    // A Set is accepted wherever a list is.
    assert.equal(metrics.recallAt(ranked, new Set(['a']), 1), 1);
  });

  it('score reports the whole BEIR measure set for one query', () => {
    const s = metrics.score(['a', 'b'], ['a'], 2);
    assert.equal(s.p1, 1);
    assert.equal(s.recall, 1);
    assert.equal(s.map, 1);
    assert.equal(metrics.score(['a'], [], 1).map, 0);
  });

  it('meanScores averages every member and rounds so two runs agree', () => {
    assert.deepEqual({ ...metrics.meanScores([]) }, {});
    const mean = metrics.meanScores([{ recall: 1 }, { recall: 0 }, { recall: 1 }]);
    assert.equal(mean.recall, 0.6667);
  });

  it('detectorScore reports the confusion matrix and null where a score is undefined', () => {
    const scored = metrics.detectorScore([
      { detected: true, expected: true }, { detected: false, expected: true },
      { detected: true, expected: false }, { detected: false, expected: false },
    ]);
    assert.deepEqual([scored.tp, scored.fp, scored.fn, scored.tn], [1, 1, 1, 1]);
    assert.equal(scored.precision, 0.5);
    assert.equal(scored.recall, 0.5);
    assert.equal(scored.f1, 0.5);
    const empty = metrics.detectorScore([]);
    assert.equal(empty.precision, null);
    assert.equal(empty.recall, null);
    assert.equal(empty.f1, null);
    // Nothing detected and nothing expected: precision undefined, recall undefined.
    const none = metrics.detectorScore([{ detected: false, expected: false }]);
    assert.equal(none.precision, null);
    assert.equal(none.f1, null);
  });

  it('ruleCoverage counts only active rules and lists what nothing checks', () => {
    const coverage = metrics.ruleCoverage({
      active: ['AGSC-01-01', 'AGSC-01-02', 'AGSC-06-21'],
      namedByChecker: ['AGSC-01-02'],
      namedByFeature: ['AGSC-99-99'],
      namedByTest: ['AGSC-01-02', 'AGSC-99-99'],
      withVector: ['AGSC-01-01', 'AGSC-99-99'],
    });
    assert.equal(coverage.active, 3);
    assert.equal(coverage.with_vector, 1);
    assert.equal(coverage.without_vector, 2);
    assert.equal(coverage.any_check, 2);
    assert.deepEqual(coverage.uncovered, ['AGSC-06-21']);
    assert.equal(coverage.named_by_feature, 0, 'an id outside the active set is never counted');
  });

  it('byChapter groups rule ids by specification chapter', () => {
    assert.deepEqual({ ...metrics.byChapter(['AGSC-06-21', 'AGSC-06-31', 'AGSC-01-01', 'nonsense']) }, { '01': 1, '06': 2 });
  });
});

describe('bench/metrics.js — the agent-side statistics', () => {
  it('citationScore scores cited unit ids against the gold units, each unit once', () => {
    assert.deepEqual(metrics.citationScore(['u#c1', 'u#c2', 'u#c2'], ['u#c2', 'u#c3']),
      { cited: 2, correct: 1, gold: 2, precision: 0.5, recall: 0.5 });
    assert.deepEqual(metrics.citationScore(['u#c1'], ['u#c1']),
      { cited: 1, correct: 1, gold: 1, precision: 1, recall: 1 });
  });

  it('citationScore reports an absence, not a zero, where a score is undefined', () => {
    // Nothing cited: precision undefined, recall 0 of the gold set.
    assert.deepEqual(metrics.citationScore([], ['u#c1']),
      { cited: 0, correct: 0, gold: 1, precision: null, recall: 0 });
    // An unanswerable task: no gold unit, so recall is undefined.
    assert.deepEqual(metrics.citationScore(['u#c1'], []),
      { cited: 1, correct: 0, gold: 0, precision: 0, recall: null });
  });

  it('bootstrapCI is reproducible from its seed and brackets the estimate', () => {
    const values = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5];
    const first = metrics.bootstrapCI(values, { resamples: 2000, seed: 7 });
    assert.deepEqual(metrics.bootstrapCI(values, { resamples: 2000, seed: 7 }), first);
    assert.equal(first.estimate, 4);
    assert.ok(first.low <= first.estimate && first.estimate <= first.high);
    assert.deepEqual([first.n, first.resamples, first.seed, first.level], [11, 2000, 7, 0.95]);
    assert.notDeepEqual(metrics.bootstrapCI(values, { resamples: 2000, seed: 8 }), first);
  });

  it('bootstrapCI takes another statistic, collapses on a constant sample and refuses an empty one', () => {
    const mean = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length;
    assert.equal(metrics.bootstrapCI([1, 2, 3, 4], { resamples: 500, statistic: mean }).estimate, 2.5);
    const constant = metrics.bootstrapCI([0.5, 0.5, 0.5], { resamples: 100 });
    assert.deepEqual([constant.low, constant.estimate, constant.high], [0.5, 0.5, 0.5]);
    assert.equal(metrics.bootstrapCI([]), null);
    assert.equal(metrics.bootstrapCI('not a list'), null);
  });

  it('pairedPermutationTest is exact up to 16 pairs', () => {
    // Every difference +1 over five pairs: only the all-plus and all-minus
    // patterns reach |sum| = 5, so p = 2 / 32.
    assert.deepEqual(metrics.pairedPermutationTest([2, 2, 2, 2, 2], [1, 1, 1, 1, 1]),
      { exact: true, mean_difference: 1, n: 5, p: 0.0625 });
    // No difference at all: every pattern reaches |sum| = 0, so p = 1.
    assert.equal(metrics.pairedPermutationTest([1, 2, 3], [1, 2, 3]).p, 1);
    // The sign of the difference does not change a two-sided p.
    assert.equal(metrics.pairedPermutationTest([1, 1, 1, 1, 1], [2, 2, 2, 2, 2]).p, 0.0625);
  });

  it('pairedPermutationTest reads the same in any unit and keeps a small p whole', () => {
    // Differences of 1e-10 are as decisive as differences of 1.
    const tiny = metrics.pairedPermutationTest([1e-10, 1e-10, 1e-10, 1e-10, 1e-10], [0, 0, 0, 0, 0]);
    assert.equal(tiny.p, 0.0625);
    // Sixteen equal differences: exactly 2 of 65,536 patterns, never rounded to 0.
    const sixteen = Array.from({ length: 16 }, () => 1);
    assert.equal(metrics.pairedPermutationTest(sixteen, sixteen.map(() => 0)).p, 2 / 65536);
  });

  it('pairedPermutationTest resamples above 16 pairs, reproducibly, and never reports 0', () => {
    const a = Array.from({ length: 20 }, () => 1);
    const b = Array.from({ length: 20 }, () => 0);
    const result = metrics.pairedPermutationTest(a, b, { resamples: 999, seed: 3 });
    assert.equal(result.exact, false);
    assert.equal(result.mean_difference, 1);
    assert.ok(result.p > 0 && result.p <= 0.01, `p = ${result.p}`);
    assert.deepEqual(metrics.pairedPermutationTest(a, b, { resamples: 999, seed: 3 }), result);
  });

  it('pairedPermutationTest refuses unpaired input', () => {
    assert.equal(metrics.pairedPermutationTest([1, 2], [1]), null);
    assert.equal(metrics.pairedPermutationTest([], []), null);
    assert.equal(metrics.pairedPermutationTest('a', 'b'), null);
  });

  it('holm adjusts step-down, keeps the given order, stays monotone and caps at 1', () => {
    // Sorted: 0.01×3 = 0.03; 0.03×2 = 0.06; 0.04×1 = 0.04, raised to 0.06.
    const adjusted = metrics.holm([0.01, 0.04, 0.03]);
    [0.03, 0.06, 0.06].forEach((want, i) => assert.ok(Math.abs(adjusted[i] - want) < 1e-12, `${adjusted}`));
    assert.deepEqual(metrics.holm([0.5, 0.6]), [1, 1]);
    assert.deepEqual(metrics.holm([]), []);
    // Unrounded: a family of one keeps its p, which must not drift to the threshold.
    assert.deepEqual(metrics.holm([0.05004]), [0.05004]);
  });

  it('cliffsDelta counts dominance over every pair', () => {
    assert.equal(metrics.cliffsDelta([4, 5], [1, 2]), 1);
    assert.equal(metrics.cliffsDelta([1, 2], [4, 5]), -1);
    assert.equal(metrics.cliffsDelta([1, 2, 3], [1, 2, 3]), 0);
    // a < b in three pairs, a tie in one: −3 / 4.
    assert.equal(metrics.cliffsDelta([1, 2], [2, 3]), -0.75);
    assert.equal(metrics.cliffsDelta([], [1]), null);
  });
});

describe('bench/gen-bundle.js — the synthetic Bundle', () => {
  it('is a pure function of the item count: two generations agree byte for byte', () => {
    assert.deepEqual(gen.bundle(3, 'x'), gen.bundle(3, 'x'));
    assert.notDeepEqual(gen.bundle(3, 'x'), gen.bundle(4, 'x'));
  });

  it('writes a tree that carries a configuration, an index, a cluster and n items', () => {
    const dir = tmpdir();
    const result = capture(gen, ['--items', '4', '--out', dir, '--id', 'bench-test']);
    assert.equal(result.code, 0);
    assert.match(result.out, /4 items/u);
    assert.ok(fs.existsSync(path.join(dir, 'agsc.config.json')));
    assert.ok(fs.existsSync(path.join(dir, 'content', 'index.md')));
    assert.ok(fs.existsSync(path.join(dir, 'content', 'clusters', 'bench-cluster.md')));
    assert.ok(fs.existsSync(path.join(dir, '.well-known', 'security.txt')));
    assert.equal(fs.readdirSync(path.join(dir, 'content', 'concepts')).length, 4);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8')).bundle.id, 'bench-test');
  });

  it('every generated item carries front matter, five headings and two related links', () => {
    const text = gen.item(0, 10);
    assert.ok(text.startsWith('---\n'));
    for (const heading of gen.HEADINGS) assert.ok(text.includes(`## ${heading}`), heading);
    assert.match(text, /related:\n {2}- bench-item-2\n {2}- bench-item-8/u);
  });

  it('paragraphs are drawn from the fixed word list, never from a random source', () => {
    const first = gen.paragraph(1, 2, 5);
    assert.equal(first, gen.paragraph(1, 2, 5));
    assert.ok(first.endsWith('.'));
    for (const word of first.slice(0, -1).toLowerCase().split(' ')) assert.ok(gen.WORDS.includes(word), word);
  });

  it('refuses to generate inside the repository, and says so', () => {
    assert.equal(gen.insideRepository(path.join(REPO, 'bench', 'x')), true);
    assert.equal(gen.insideRepository(REPO), true);
    assert.equal(gen.insideRepository(os.tmpdir()), false);
    const refused = capture(gen, ['--items', '2', '--out', path.join(REPO, 'generated')]);
    assert.equal(refused.code, 2);
    assert.match(refused.err, /refusing to generate inside the repository/u);
  });

  it('answers --help and rejects a malformed invocation', () => {
    assert.equal(capture(gen, ['--help']).code, 0);
    assert.equal(capture(gen, ['-h']).code, 0);
    assert.equal(capture(gen, ['--items', '0', '--out', path.join(os.tmpdir(), 'x')]).code, 2);
    assert.equal(capture(gen, ['--items', '2']).code, 2);
    assert.equal(capture(gen, ['--nonsense']).code, 2);
  });
});

describe('tools/bench — the retrieval runner', () => {
  /** A tiny built node: two items, one index, one chunk file, one llms.txt. */
  function builtNode() {
    const dir = tmpdir();
    fs.writeFileSync(path.join(dir, 'search.json'), JSON.stringify({
      docs: [{ slug: 'alpha', title: 'Alpha' }, { slug: 'beta', title: 'Beta' }],
      terms: { beta: [1], gate: [0], human: [0, 1] },
    }));
    fs.writeFileSync(path.join(dir, 'chunks.jsonl'), [
      JSON.stringify({ item: 'alpha', section: 'intent', terms: 'human gate approval' }),
      JSON.stringify({ item: 'beta', section: 'intent', terms: 'beta routing' }),
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(dir, 'llms.txt'), [
      '# A node', '', '- [Alpha](https://n.example/concepts/alpha/): a human gate',
      '- [Beta](https://n.example/concepts/beta/): beta routing', '',
    ].join('\n'));
    return dir;
  }

  function set(dir, queries, qrels) {
    fs.mkdirSync(path.join(dir, 'qrels'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'queries.jsonl'), `${queries.map((q) => JSON.stringify(q)).join('\n')}\n`);
    fs.writeFileSync(path.join(dir, 'qrels', 'test.tsv'), `query-id\tcorpus-id\tscore\n${qrels}`);
    return dir;
  }

  it('answers --help with exit 0 and writes nothing to stderr', () => {
    const result = capture(bench, ['--help']);
    assert.equal(result.code, 0);
    assert.equal(result.err, '');
    assert.match(result.out, /^bench /u);
    assert.equal(capture(bench, ['-h']).code, 0);
  });

  it('dry-runs the committed set without a node', () => {
    const result = capture(bench, ['--dry-run']);
    assert.equal(result.code, 0);
    assert.match(result.out, /20 queries, 20 labelled/u);
    const json = capture(bench, ['--dry-run', '--json']);
    assert.equal(JSON.parse(json.out).status, 'dry-run');
  });

  it('the committed set labels every query it carries', () => {
    const committed = bench.loadSet(path.join(REPO, 'bench', 'queries', 'bench-v2'));
    assert.equal(committed.queries.length, 20);
    for (const query of committed.queries) {
      assert.ok(committed.qrels.has(query.id), `${query.id} has no gold label`);
      assert.ok(['hand-written'].includes(query.meta.origin), `${query.id} has no declared origin`);
    }
  });

  it('scores each surface separately and reports the measure set', () => {
    const node = builtNode();
    const queries = set(tmpdir(), [
      { _id: 'q1', metadata: { node: 'n', origin: 'hand-written' }, text: 'a human gate for approval' },
      { _id: 'q2', metadata: { node: 'other', origin: 'hand-written' }, text: 'beta routing' },
    ], 'q1\talpha\t1\nq2\tbeta\t1\n');
    const result = capture(bench, ['--node', node, '--set', queries, '--json']);
    assert.equal(result.code, 0);
    const envelope = JSON.parse(result.out);
    assert.equal(envelope.schema, 'agsc.bench.v1');
    assert.equal(envelope.status, 'pass');
    assert.deepEqual(Object.keys(envelope.surfaces).sort(), ['chunks', 'llms', 'search']);
    assert.equal(envelope.surfaces.search.recall, 1);
    assert.equal(envelope.surfaces.chunks.p1, 1);
    assert.equal(envelope.surfaces.llms.documents, 2);
  });

  it('--origin-node scores only the queries that node can answer', () => {
    const node = builtNode();
    const queries = set(tmpdir(), [
      { _id: 'q1', metadata: { node: 'n', origin: 'hand-written' }, text: 'a human gate' },
      { _id: 'q2', metadata: { node: 'other', origin: 'hand-written' }, text: 'beta routing' },
    ], 'q1\talpha\t1\nq2\tbeta\t1\n');
    const envelope = JSON.parse(capture(bench, ['--node', node, '--set', queries, '--origin-node', 'n', '--json']).out);
    assert.equal(envelope.origin_node, 'n');
    assert.equal(envelope.surfaces.search.queries_scored, 1);
  });

  it('--surface selects one surface and --out writes the envelope', () => {
    const node = builtNode();
    const queries = set(tmpdir(), [{ _id: 'q1', metadata: { origin: 'hand-written' }, text: 'human gate' }], 'q1\talpha\t1\n');
    const where = path.join(tmpdir(), 'results.json');
    const result = capture(bench, ['--node', node, '--set', queries, '--surface', 'search', '--out', where]);
    assert.equal(result.code, 0);
    assert.match(result.out, /^search: recall@10/u);
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(where, 'utf8')).surfaces), ['search']);
  });

  it('an unlabelled query is a warning, and a set with no label at all is a failure', () => {
    const node = builtNode();
    const partly = set(tmpdir(), [
      { _id: 'q1', metadata: {}, text: 'human gate' }, { _id: 'q2', metadata: {}, text: 'nothing' },
    ], 'q1\talpha\t1\n');
    const warned = JSON.parse(capture(bench, ['--node', node, '--set', partly, '--json']).out);
    assert.equal(warned.counts.warn, 1);
    assert.equal(warned.status, 'pass');

    const none = set(tmpdir(), [{ _id: 'q1', metadata: {}, text: 'human gate' }], '');
    const failed = capture(bench, ['--node', node, '--set', none]);
    assert.equal(failed.code, 1);
    assert.match(failed.err, /nothing was measured/u);
  });

  it('refuses a malformed invocation, a missing set and a directory that is not a built node', () => {
    assert.equal(capture(bench, ['--nonsense']).code, 2);
    assert.equal(capture(bench, ['--k', '0']).code, 2);
    assert.equal(capture(bench, ['--surface', 'embeddings']).code, 2);
    assert.equal(capture(bench, ['--set', tmpdir()]).code, 2);
    assert.equal(capture(bench, []).code, 2, '--node is required for a real run');
    assert.equal(capture(bench, ['--node', tmpdir()]).code, 2, 'a directory with no search.json is not a node');
  });

  it('reads sharded surfaces, which is the only shape above 500 items', () => {
    const dir = tmpdir();
    fs.writeFileSync(path.join(dir, 'search.json'), JSON.stringify({ docs: [{ slug: 'a' }], terms: { human: [0] } }));
    fs.writeFileSync(path.join(dir, 'search-01.json'), JSON.stringify({ docs: [{ slug: 'b' }], terms: { human: ['b'] } }));
    fs.writeFileSync(path.join(dir, 'chunks-01.jsonl'), `${JSON.stringify({ item: 'b', terms: 'human' })}\n`);
    assert.deepEqual(bench.rankSearch(dir, ['human']).ranked.sort(), ['a', 'b']);
    assert.equal(bench.rankSearch(dir, ['human']).documents, 2);
    assert.deepEqual(bench.rankChunks(dir, ['human']).ranked, ['b']);
    assert.deepEqual(bench.rankLlms(dir, ['human']), { documents: 0, ranked: [] }, 'a node without llms.txt ranks nothing');
  });

  it('the tokenizer is its own: NFC, lower case, no single characters', () => {
    assert.deepEqual(bench.tokenize('Human-in-the-Loop Gate!'), ['human', 'in', 'the', 'loop', 'gate']);
    assert.deepEqual(bench.tokenize(null), []);
    assert.deepEqual(bench.tokenize('a bc'), ['bc']);
  });

  it('mean and score behave at the edges', () => {
    assert.deepEqual(bench.mean([]), {});
    const empty = bench.score([], new Set(['a']), 10);
    assert.equal(empty.p1, 0);
    assert.equal(empty.rr, 0);
    assert.equal(bench.score(['a'], new Set(), 10).ndcg, 0);
  });
});

it('the bench counts active rules exactly as tools/count-artifacts does', () => {
  const cp = require('node:child_process');
  const path = require('node:path');
  const { specRules } = require('../../bench/measure.js');
  const root = path.resolve(__dirname, '..', '..');
  const counted = JSON.parse(cp.execFileSync(process.execPath, [path.join(root, 'tools', 'count-artifacts'), '--json'],
    { cwd: root, encoding: 'utf8' })).counts;
  const rules = specRules();
  assert.strictEqual(rules.all.length, counted.rules);
  assert.strictEqual(rules.active.length, counted.rules_active);
});

describe('the recorded commands run as printed', () => {
  // docs/measurements.json and the "Reproduce with" lines of the site print each layer's
  // `command`; at 1.0.0 four of them left out the fixed clock or the scratch directory that
  // every run of bench/measure.js needs, so they exited 2 as printed.
  const { COMMANDS } = require('../../bench/measure.js');
  const record = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'measurements.json'), 'utf8'));

  it('every command in the table carries the fixed clock and a scratch directory', () => {
    for (const [layer, command] of Object.entries(COMMANDS)) {
      assert.match(command, /^SOURCE_DATE_EPOCH=1767225600 /u, layer);
      assert.match(command, new RegExp(`--layer ${layer} --scratch <dir>`, 'u'), layer);
    }
  });

  it('the record prints, for each layer this script runs, the table\'s line', () => {
    for (const [layer, command] of Object.entries(COMMANDS)) {
      const printed = record.layers[layer].command;
      // perf adds the sizes and the run count it measured, as arguments.
      assert.ok(printed === command || (layer === 'perf' && /^ --sizes [\d,]+ --runs \d+$/u.test(printed.slice(command.length)) && printed.startsWith(command)), `${layer}: ${printed}`);
    }
  });
});
