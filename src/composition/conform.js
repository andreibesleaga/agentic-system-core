'use strict';
/**
 * CONTEXT Composition — aggregate: Claim/Verdict (a conformance claim is a
 * composition of Levels, areas and vector results; it owns no emission and no
 * I/O, which is why it lives beside the combiner and not in Distribution).
 * Implements AGSC-09-01 (what a claim MUST name), AGSC-09-02 (pass/fail/skip
 * per vector id; a skipped required vector counts as a failure), AGSC-09-03
 * (the `conformance-report.json` shape), AGSC-04-22 (the Unicode version and
 * the two divergence verdicts) and AGSC-04-24 (the cross-implementation set),
 * with AGSC-10-15 as the single source of a Level's area set (AGSC-10-02 to
 * AGSC-10-05); no second list exists and none is consulted.
 * Requirements: PRD-010, PRD-055.
 *
 * PURE.
 */

/**
 * AGSC-10-15: the Level IS the vector set. These four arrays are transcribed
 * from AGSC-10-02 to AGSC-10-05 and from nowhere else — in particular NOT from
 * the class sentences of AGSC-00-09 to AGSC-00-11, which describe what a class
 * implements and are never read as a competing list (`conform-0003`).
 * Membership, not order, is what those rules fix.
 */
const LEVEL_AREAS = Object.freeze({
  // AGSC-10-02 — Level 0, Publisher.
  0: Object.freeze(['frontmatter', 'slug', 'bundle', 'discovery']),
  // AGSC-10-03 — Level 1, Reader: Level 0 + links, lint, jcs.
  1: Object.freeze(['frontmatter', 'slug', 'bundle', 'jcs', 'discovery', 'links', 'lint']),
  // AGSC-10-04 — Level 2, Writer/Exporter.
  2: Object.freeze(['frontmatter', 'slug', 'bundle', 'jcs', 'discovery', 'links', 'lint',
    'graph', 'build', 'adopt', 'ledger', 'import', 'export', 'skills', 'chunks', 'boards', 'boundary']),
  // AGSC-10-05 — Level 3, Full engine: all twenty-five areas of AGSC-09-04.
  3: Object.freeze(['frontmatter', 'slug', 'links', 'jcs', 'graph', 'lint', 'cli', 'bundle',
    'prov', 'ledger', 'compose', 'build', 'discovery', 'adopt', 'import', 'export', 'skills',
    'adapters', 'channels', 'harness', 'run', 'conform', 'boundary', 'chunks', 'boards']),
});

/**
 * AGSC-10-15 (amended for 1.0.0): the cases of a Level's areas that exercise a
 * HIGHER Level's behaviour, each with the Level it belongs to. Transcribed from the
 * rule's table and from nowhere else; `tests/composition/conform-higher-level-cases
 * .test.js` holds the two to one list.
 */
const HIGHER_LEVEL_CASES = Object.freeze({
  'bundle-0001': 1, 'bundle-0006': 1, 'bundle-0007': 1, 'disc-0005': 1, 'disc-0019': 1,
  'bundle-0008': 2, 'disc-0009': 2, 'disc-0012': 2, 'disc-0015': 2, 'disc-0016': 2, 'disc-0017': 2, 'disc-0018': 2, 'lint-0026': 2,
  'bundle-0003': 3, 'bundle-0004': 3, 'bundle-0005': 3,
  'lint-0001': 3, 'lint-0002': 3, 'lint-0003': 3, 'lint-0028': 3, 'lint-0029': 3,
  'adopt-0007': 3, 'adopt-0008': 3,
});

/** AGSC-04-24: the artefacts for which byte-identity ACROSS implementations holds. */
const CROSS_IMPLEMENTATION = Object.freeze([
  '/graph.jsonld', '/graph.ttl', '/graph.nq', '/search.json', '/chunks.jsonl', '/ledger.jsonl',
  '/llms.txt', '/llms-full.txt', '/.well-known/knowledge-linkset',
  // The seven Harness FILE KINDS of AGSC-07-12. They are not routes (a Harness is a
  // directory the operator is given, never a served surface), so they carry no
  // leading slash — and AGSC-04-24 says their obligation
  // is discharged only when `tests/vectors/harness/` is populated, which it is not.
  'harness.jsonld', 'AGENTS.md', 'workspace.dsl', 'diagram.mmd', 'arc42.md',
]);

/** The reason AGSC-04-24 gives for keeping generated HTML out of that set. */
const HTML_REASON = 'HTML is deterministic within one implementation only (AGSC-04-01)';

/** Members every claim MUST name (AGSC-09-01 + AGSC-04-22). */
const REQUIRED_CLAIM_MEMBERS = Object.freeze(['level', 'spec_version', 'unicode_version', 'vectors_passed']);

function isLevel(value) {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

/**
 * areasForLevel(level) -> string[]
 * The single source of the vector set (AGSC-10-15). Throws for a Level outside
 * 0 to 3, which is a programming fault, not a domain fact.
 */
function areasForLevel(level) {
  if (!isLevel(level)) throw new TypeError(`level must be 0, 1, 2 or 3, not ${JSON.stringify(level)}`);
  return LEVEL_AREAS[level];
}

/**
 * casesForLevel(vectors, level) -> the cases a claim at `level` runs (AGSC-10-15):
 * those of the Level's areas, less every case the rule's table assigns to a higher
 * Level. The order of `vectors` is kept.
 */
function casesForLevel(vectors, level) {
  const areas = new Set(areasForLevel(level));
  return (vectors || []).filter((v) => areas.has(v.area)
    && (HIGHER_LEVEL_CASES[v.id] === undefined || HIGHER_LEVEL_CASES[v.id] <= level));
}

/**
 * claimCompleteness(claim) -> { complete, missing }
 * AGSC-09-01 (as amended for 1.0.0): the machine-readable claim carries the Level, the full spec_version and the
 * vector set passed; AGSC-04-22 adds the runtime's Unicode version.
 */
function claimCompleteness(claim) {
  const c = claim || {};
  const missing = REQUIRED_CLAIM_MEMBERS.filter((k) => {
    const v = c[k];
    if (k === 'level') return !isLevel(v);
    if (k === 'vectors_passed') return !Array.isArray(v) || v.length === 0;
    return typeof v !== 'string' || v === '';
  });
  return { complete: missing.length === 0, missing: Object.freeze(missing) };
}

/**
 * divergenceVerdict(divergence, options) -> 'documented' | 'failure'
 * AGSC-04-22: a divergence that arises only from a different Unicode version,
 * on input OUTSIDE the vector set, is documented; the same divergence ON the
 * vector set is a conformance failure. `options.isVectorId` decides whether an
 * input names a vector; by default an id of the `<area>-<nnnn>` form does.
 */
const VECTOR_ID = /^[a-z]+-\d{4}$/u;

function divergenceVerdict(divergence, options) {
  const opts = options || {};
  const input = divergence && divergence.input;
  const onVectorSet = typeof opts.isVectorId === 'function'
    ? Boolean(opts.isVectorId(input))
    : VECTOR_ID.test(String(input));
  if (!onVectorSet) return 'documented';
  return 'failure';
}

function divergenceVerdicts(divergences, options) {
  return Object.freeze((divergences || []).map((d) => Object.freeze({
    input: d.input, verdict: divergenceVerdict(d, options),
  })));
}

/**
 * crossImplementationClaim(claimed) -> { accepted, rejected, reason }
 * AGSC-04-24: byte-identity across implementations is claimable only for the
 * machine artefacts. A claim listing generated HTML has that entry rejected
 * and the rest of the claim stands.
 *
 * A claimed ROUTE is recognised in the AGSC-06-01 form, with its leading slash
 * (`conform-0004`); the bare form without the slash is also
 * accepted, because a claim is a document a stranger wrote and AGSC-00-15 makes a
 * reader tolerant of a spelling its own emitter would not choose.
 */
function crossImplementationClaim(claimed) {
  const list = Array.isArray(claimed) ? claimed : [];
  const accepted = [];
  const rejected = [];
  const routes = new Set(CROSS_IMPLEMENTATION.flatMap((r) => [r, r.replace(/^\//u, '')]));
  for (const artefact of list) {
    const name = String(artefact);
    const isHtml = /\.html?$/u.test(name);
    const known = routes.has(name)
      || /^\/?search-\d{2}\.json$/u.test(name)
      || /^\/?chunks-\d{2}\.jsonl$/u.test(name)
      || /^\/?boards\//u.test(name)
      || /\.jsonld$/u.test(name);
    if (isHtml || !known) rejected.push(name);
    else accepted.push(name);
  }
  return Object.freeze({
    accepted: Object.freeze(accepted),
    reason: HTML_REASON,
    rejected: Object.freeze(rejected),
  });
}

/**
 * report(input) -> the AGSC-09-03 `conformance-report.json` object, JCS member
 * order, ready for `knowledge/jcs.js#canonicalize`. `class` is the Level's
 * name (AGSC-09-01: the class names ARE the Levels' names and nothing more).
 */
const LEVEL_NAMES = Object.freeze(['publisher', 'reader', 'writer', 'full-engine']);

function report(input) {
  const i = input || {};
  const results = (i.results || []).map((r) => (r.got === undefined
    ? { id: r.id, status: r.status }
    : { got: r.got, id: r.id, status: r.status }));
  const summary = { fail: 0, pass: 0, skip: 0 };
  for (const r of results) {
    if (r.status === 'pass') summary.pass += 1;
    else if (r.status === 'fail') summary.fail += 1;
    else summary.skip += 1;
  }
  return {
    class: LEVEL_NAMES[i.level] || String(i.level),
    impl: i.impl,
    results,
    spec_version: i.spec_version,
    summary,
    version: i.version,
  };
}

module.exports = {
  CROSS_IMPLEMENTATION,
  HIGHER_LEVEL_CASES,
  HTML_REASON,
  LEVEL_NAMES,
  areasForLevel,
  casesForLevel,
  claimCompleteness,
  crossImplementationClaim,
  divergenceVerdict,
  divergenceVerdicts,
  report,
};
