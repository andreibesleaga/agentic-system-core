'use strict';
/**
 * bench/metrics.js — the pure arithmetic behind both halves of the kit: the
 * measurements report (`bench/measure.js`) and the retrieval runner
 * (`tools/bench`). Kept separate from either so that the numbers can be tested
 * without running a build, a browser or a query set.
 *
 * Nothing here reads a file, a clock, the network or a random source.
 * research/39 §6 governs how the outputs may be described: counts and byte
 * comparisons are verified facts; timings are measurements with a machine and a
 * run count attached; ranking scores are observations under a named
 * configuration. This module computes; it never labels.
 */

/**
 * The median of a list of numbers. Even-length lists take the mean of the two
 * middle values, which is what "median of three runs" never has to do — three
 * runs is the project's standing sample size (research/09 §4).
 * @param {number[]} values
 * @returns {number|null} null for an empty list, so a missing measurement is
 *   visible as an absence instead of a zero.
 */
function median(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
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
 * headline measure (research/39 §3.6). Gains are 1 for a gold id and 0
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
 * research/39 §3.3 asks for. A case is `{expected: boolean, detected: boolean}`.
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
 * the number appears; the authoritative matrix is's `tools/rule-coverage`.
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

module.exports = {
  byChapter, detectorScore, meanScores, median, ndcgAt, precisionAt,
  recallAt, reciprocalRank, ruleCoverage, score,
};
