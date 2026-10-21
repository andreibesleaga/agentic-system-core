'use strict';
/**
 * bench/metrics.js — the pure arithmetic behind both halves of the kit: the
 * measurements report (`bench/measure.js`) and the retrieval runner
 * (`tools/bench`). Kept separate from either so that the numbers can be tested
 * without running a build, a browser or a query set.
 *
 * Nothing here reads a file, a clock, the network or a random source (the
 * bootstrap and the permutation test draw from a seeded generator, so the same
 * seed gives the same bytes).
 * `docs/MEASUREMENTS.md` governs how the outputs may be described: counts and byte
 * comparisons are verified facts; timings are measurements with a machine and a
 * run count attached; ranking scores are observations under a named
 * configuration. This module computes; it never labels.
 */

/**
 * True for a non-empty list of finite numbers. The statistics below refuse
 * anything else (a `null` score, `undefined`, `NaN`), because JavaScript would read
 * `null` as 0 and let `NaN` through every comparison: a missing value must stay an
 * absence, never become a measurement. Drop the null scores before calling them.
 * @param {unknown} values
 * @returns {boolean}
 */
function finiteList(values) {
  return Array.isArray(values) && values.length > 0 && values.every((x) => typeof x === 'number' && Number.isFinite(x));
}

/**
 * The median of a list of numbers. Even-length lists take the mean of the two
 * middle values, which is what "median of three runs" never has to do — three
 * runs is the project's standing sample size.
 * @param {number[]} values
 * @returns {number|null} null for an empty list, or for one holding anything but
 *   finite numbers, so a missing measurement is visible as an absence instead of
 *   a zero or a shifted middle.
 */
function median(values) {
  if (!finiteList(values)) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Precision at k: of the first k results, how many are relevant.
 * @param {string[]} ranked ranked result ids, best first
 * @param {string[]|Set<string>} relevant the gold ids
 * @param {number} k
 * @returns {number} 0..1
 */
function precisionAt(ranked, relevant, k) {
  const gold = relevant instanceof Set ? relevant : new Set(relevant);
  const head = ranked.slice(0, k);
  if (head.length === 0) return 0;
  return head.filter((id) => gold.has(id)).length / k;
}

/**
 * Recall at k: of the gold ids, how many appear in the first k results.
 * @param {string[]} ranked
 * @param {string[]|Set<string>} relevant
 * @param {number} k
 * @returns {number} 0..1; 0 when nothing is relevant, so an unlabelled query
 *   can never inflate the mean.
 */
function recallAt(ranked, relevant, k) {
  const gold = relevant instanceof Set ? relevant : new Set(relevant);
  if (gold.size === 0) return 0;
  const head = new Set(ranked.slice(0, k));
  let found = 0;
  for (const id of gold) if (head.has(id)) found += 1;
  return found / gold.size;
}

/**
 * Reciprocal rank: 1/(rank of the first relevant result), 0 when none is found.
 * @param {string[]} ranked
 * @param {string[]|Set<string>} relevant
 * @returns {number}
 */
function reciprocalRank(ranked, relevant) {
  const gold = relevant instanceof Set ? relevant : new Set(relevant);
  for (let i = 0; i < ranked.length; i += 1) if (gold.has(ranked[i])) return 1 / (i + 1);
  return 0;
}

/**
 * Normalised discounted cumulative gain at k with binary relevance — the BEIR
 * headline measure. Gains are 1 for a gold id and 0
 * otherwise; the ideal ranking puts every gold id first.
 * @param {string[]} ranked
 * @param {string[]|Set<string>} relevant
 * @param {number} k
 * @returns {number} 0..1
 */
function ndcgAt(ranked, relevant, k) {
  const gold = relevant instanceof Set ? relevant : new Set(relevant);
  if (gold.size === 0) return 0;
  let dcg = 0;
  for (let i = 0; i < Math.min(k, ranked.length); i += 1) {
    if (gold.has(ranked[i])) dcg += 1 / Math.log2(i + 2);
  }
  let ideal = 0;
  for (let i = 0; i < Math.min(k, gold.size); i += 1) ideal += 1 / Math.log2(i + 2);
  return ideal === 0 ? 0 : dcg / ideal;
}

/**
 * The full measure set for one query, at one cut-off.
 * @param {string[]} ranked
 * @param {string[]} relevant
 * @param {number} k
 * @returns {{ndcg:number, map:number, precision:number, recall:number, rr:number, p1:number}}
 */
function score(ranked, relevant, k) {
  const gold = new Set(relevant);
  // Average precision over the gold set, truncated at k — BEIR's MAP@k.
  let hits = 0;
  let sum = 0;
  for (let i = 0; i < Math.min(k, ranked.length); i += 1) {
    if (gold.has(ranked[i])) { hits += 1; sum += hits / (i + 1); }
  }
  return {
    map: gold.size === 0 ? 0 : sum / Math.min(gold.size, k),
    ndcg: ndcgAt(ranked, gold, k),
    p1: precisionAt(ranked, gold, 1),
    precision: precisionAt(ranked, gold, k),
    recall: recallAt(ranked, gold, k),
    rr: reciprocalRank(ranked, gold),
  };
}

/**
 * The mean of each member across a list of per-query score objects, rounded to
 * four decimals so that two runs of the same data produce the same bytes.
 * @param {Array<Record<string, number>>} rows
 * @returns {Record<string, number>}
 */
function meanScores(rows) {
  const out = Object.create(null);
  if (rows.length === 0) return out;
  for (const key of Object.keys(rows[0]).sort()) {
    const total = rows.reduce((acc, r) => acc + (r[key] || 0), 0);
    out[key] = Math.round((total / rows.length) * 10000) / 10000;
  }
  return out;
}

/**
 * A detector's confusion matrix against labelled cases, and the three scores
 * the security layer asks for. A case is `{expected: boolean, detected: boolean}`.
 * @param {Array<{detected:boolean, expected:boolean}>} cases
 * @returns {{cases:number, f1:number|null, fn:number, fp:number, precision:number|null, recall:number|null, tn:number, tp:number}}
 */
function detectorScore(cases) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const c of cases) {
    if (c.expected && c.detected) tp += 1;
    else if (!c.expected && c.detected) fp += 1;
    else if (c.expected && !c.detected) fn += 1;
    else tn += 1;
  }
  const precision = tp + fp === 0 ? null : Math.round((tp / (tp + fp)) * 10000) / 10000;
  const recall = tp + fn === 0 ? null : Math.round((tp / (tp + fn)) * 10000) / 10000;
  const f1 = precision === null || recall === null || precision + recall === 0
    ? null
    : Math.round(((2 * precision * recall) / (precision + recall)) * 10000) / 10000;
  return { cases: cases.length, f1, fn, fp, precision, recall, tn, tp };
}

/**
 * Rule coverage from the three id sets a measurement can derive today.
 * `withVector` is authoritative (a vector names its rule in a `rule` member);
 * `namedByTest` and `namedByChecker` are PROXIES — a rule id written in a test
 * or a checker header says the file means to verify that rule, not that a
 * machine assertion exists for it. `docs/MEASUREMENTS.md` must say so wherever
 * the number appears; the authoritative matrix is `tools/rule-coverage`.
 * @param {{active:string[], withVector:string[], namedByTest:string[], namedByChecker:string[], namedByFeature:string[]}} sets
 */
function ruleCoverage(sets) {
  const active = new Set(sets.active);
  const only = (ids) => new Set([...new Set(ids)].filter((id) => active.has(id)));
  const withVector = only(sets.withVector);
  const namedByTest = only(sets.namedByTest);
  const namedByChecker = only(sets.namedByChecker);
  const namedByFeature = only(sets.namedByFeature);
  const anyMachineCheck = new Set([...withVector, ...namedByTest, ...namedByChecker, ...namedByFeature]);
  const uncovered = [...active].filter((id) => !anyMachineCheck.has(id)).sort();
  return {
    active: active.size,
    any_check: anyMachineCheck.size,
    named_by_checker: namedByChecker.size,
    named_by_feature: namedByFeature.size,
    named_by_test: namedByTest.size,
    no_check: uncovered.length,
    uncovered,
    with_vector: withVector.size,
    without_vector: active.size - withVector.size,
  };
}

/**
 * Group rule ids by their specification chapter (`AGSC-06-21` → `06`).
 * @param {string[]} ids
 * @returns {Record<string, number>}
 */
function byChapter(ids) {
  const out = Object.create(null);
  for (const id of ids) {
    const chapter = /^AGSC-(\d{2})-/u.exec(id);
    if (!chapter) continue;
    out[chapter[1]] = (out[chapter[1]] || 0) + 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The agent-side study (docs/BENCHMARKS.md): citations scored on unit ids, and
// the statistics the results tables carry — a bootstrap interval, a paired
// permutation test, Holm's correction and Cliff's delta. The resampling is driven
// by a SEEDED generator, so the same data and the same seed give the same bytes;
// that is arithmetic, not a random source.
// ---------------------------------------------------------------------------

/** Four decimals, the rounding every aggregate of this module uses. */
function round4(value) {
  return Math.round(value * 10000) / 10000;
}

/**
 * mulberry32: a 32-bit seeded generator, uniform on [0, 1). Small, fast and
 * reproducible on every platform, which is all a bootstrap needs from it.
 * @param {number} seed an integer
 * @returns {() => number}
 */
function seeded(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Citation precision and recall on unit ids, the mechanical half of the ALCE
 * method: a citation is right when the unit it names is a gold unit, and the
 * scorer never asks a model. A unit cited twice counts once.
 * @param {string[]} cited the unit ids the answer cites
 * @param {string[]} gold the gold unit ids of the task
 * @returns {{cited:number, correct:number, gold:number, precision:number|null, recall:number|null}}
 *   `precision` is null when nothing was cited and `recall` when the task has no
 *   gold unit (an unanswerable task): an absence, never a zero that would move a mean.
 *   The statistics below refuse a null, so drop those tasks (and, for a paired
 *   test, their pairs) before computing an interval or a test.
 */
function citationScore(cited, gold) {
  const citedSet = new Set(cited);
  const goldSet = new Set(gold);
  let correct = 0;
  for (const id of citedSet) if (goldSet.has(id)) correct += 1;
  return {
    cited: citedSet.size,
    correct,
    gold: goldSet.size,
    precision: citedSet.size === 0 ? null : round4(correct / citedSet.size),
    recall: goldSet.size === 0 ? null : round4(correct / goldSet.size),
  };
}

/** The value at quantile q (0..1) of an ascending list, by linear interpolation. */
function quantile(sorted, q) {
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/**
 * A percentile bootstrap interval for a statistic of one sample.
 * @param {number[]} values
 * @param {{level?:number, resamples?:number, seed?:number, statistic?:(xs:number[])=>number}} [options]
 *   level 0.95, 10,000 resamples, seed 1 and the median unless given.
 * @returns {{estimate:number, high:number, level:number, low:number, n:number, resamples:number, seed:number}|null}
 *   null for an empty sample, a sample holding anything but finite numbers, or
 *   fewer than one resample.
 */
function bootstrapCI(values, options = {}) {
  const { level = 0.95, resamples = 10000, seed = 1, statistic = median } = options;
  if (!finiteList(values) || !Number.isInteger(resamples) || resamples < 1) return null;
  const next = seeded(seed);
  const stats = new Array(resamples);
  const sample = new Array(values.length);
  for (let r = 0; r < resamples; r += 1) {
    for (let i = 0; i < values.length; i += 1) sample[i] = values[Math.floor(next() * values.length)];
    stats[r] = statistic(sample);
  }
  stats.sort((a, b) => a - b);
  const tail = (1 - level) / 2;
  return {
    estimate: round4(statistic(values)),
    high: round4(quantile(stats, 1 - tail)),
    level,
    low: round4(quantile(stats, tail)),
    n: values.length,
    resamples,
    seed,
  };
}

/**
 * A two-sided paired permutation (sign-flip) test of the mean difference a − b.
 * Up to 16 pairs every one of the 2^n sign patterns is enumerated, so p is exact;
 * above that, `resamples` seeded patterns are drawn and p = (hits + 1)/(resamples + 1),
 * which never reports 0.
 * @param {number[]} a one condition, per task
 * @param {number[]} b the other condition, the same tasks in the same order
 * @param {{resamples?:number, seed?:number}} [options]
 * @returns {{exact:boolean, mean_difference:number, n:number, p:number}|null}
 *   null when the lists are empty, of different lengths, or hold anything but
 *   finite numbers (a missing value would otherwise read as the most significant
 *   result the test can report). `p` is unrounded, so a
 *   small probability is never shown as 0 and Holm's correction gets it whole;
 *   round it only for display.
 */
function pairedPermutationTest(a, b, options = {}) {
  if (!finiteList(a) || !finiteList(b) || a.length !== b.length) return null;
  const { resamples = 10000, seed = 1 } = options;
  const diffs = a.map((x, i) => x - b[i]);
  const n = diffs.length;
  const sum = diffs.reduce((acc, d) => acc + d, 0);
  // A tolerance, so a permuted sum equal to the observed one in exact arithmetic
  // is never lost to a floating-point last digit. It is the rounding error a sum of
  // n terms can carry (n² ulps of the largest term), so it reads the same in any
  // unit and stays far below any real difference between two sums.
  const largest = diffs.reduce((acc, d) => Math.max(acc, Math.abs(d)), 0);
  const observed = Math.abs(sum) - n * n * Number.EPSILON * largest;
  const flippedSum = (pattern) => diffs.reduce((acc, d, i) => acc + (pattern(i) ? -d : d), 0);
  let hits = 0;
  if (n <= 16) {
    const patterns = 2 ** n;
    for (let mask = 0; mask < patterns; mask += 1) {
      if (Math.abs(flippedSum((i) => (mask >> i) & 1)) >= observed) hits += 1;
    }
    return { exact: true, mean_difference: round4(sum / n), n, p: hits / patterns };
  }
  const next = seeded(seed);
  for (let r = 0; r < resamples; r += 1) {
    if (Math.abs(flippedSum(() => next() < 0.5)) >= observed) hits += 1;
  }
  return { exact: false, mean_difference: round4(sum / n), n, p: (hits + 1) / (resamples + 1) };
}

/**
 * Holm's step-down correction for a family of p values.
 * @param {number[]} pValues
 * @returns {number[]|null} the adjusted p values, in the order given, each at most 1,
 *   unrounded: rounding could carry a value across a significance threshold.
 *   An empty family gives an empty list; null when a member is not a probability.
 */
function holm(pValues) {
  if (!Array.isArray(pValues)) return null;
  if (pValues.length === 0) return [];
  if (!finiteList(pValues) || pValues.some((p) => p < 0 || p > 1)) return null;
  const m = pValues.length;
  const order = pValues.map((p, i) => [p, i]).sort((x, y) => x[0] - y[0]);
  const adjusted = new Array(m);
  let running = 0;
  order.forEach(([p, index], rank) => {
    running = Math.max(running, Math.min(1, (m - rank) * p));
    adjusted[index] = running;
  });
  return adjusted;
}

/**
 * Cliff's delta: how often a value of `a` exceeds a value of `b`, minus the
 * reverse, over every pair. −1..1; 0 when neither side dominates.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number|null} null when either list is empty or holds anything but
 *   finite numbers.
 */
function cliffsDelta(a, b) {
  if (!finiteList(a) || !finiteList(b)) return null;
  let balance = 0;
  for (const x of a) {
    for (const y of b) balance += Math.sign(x - y);
  }
  return round4(balance / (a.length * b.length));
}

module.exports = {
  bootstrapCI, byChapter, citationScore, cliffsDelta, detectorScore, holm,
  meanScores, median, ndcgAt, pairedPermutationTest, precisionAt, recallAt,
  reciprocalRank, ruleCoverage, score,
};
