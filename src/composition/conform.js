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

const { SLUG_PATTERN } = require('../knowledge/slug.js');

/**
 * AGSC-09-04: the twenty-five areas in the order the rule names them. From 1.1 a
 * claim lists a Level's areas in this order (AGSC-10-15, AGSC-09-01(d)).
 */
const AREA_ORDER = Object.freeze(['frontmatter', 'slug', 'links', 'jcs', 'graph', 'lint', 'cli',
  'bundle', 'prov', 'ledger', 'compose', 'build', 'discovery', 'adopt', 'import', 'export',
  'skills', 'adapters', 'channels', 'harness', 'run', 'conform', 'boundary', 'chunks', 'boards']);

/**
 * AGSC-10-15: the Level IS the vector set. The membership of each Level is
 * transcribed from AGSC-10-02 to AGSC-10-05 and from nowhere else — in particular
 * NOT from the class sentences of AGSC-00-09 to AGSC-00-11, which describe what a
 * class implements and are never read as a competing list (`conform-0005`).
 * Each Level names the areas of the one below it and these additions; Level 3
 * names all twenty-five.
 */
const LEVEL_ADDS = Object.freeze({
  // AGSC-10-02 — Level 0, Publisher.
  0: Object.freeze(['frontmatter', 'slug', 'bundle', 'discovery']),
  // AGSC-10-03 — Level 1, Reader.
  1: Object.freeze(['links', 'jcs', 'lint']),
  // AGSC-10-04 — Level 2, Writer/Exporter.
  2: Object.freeze(['graph', 'build', 'adopt', 'ledger', 'import', 'export', 'skills',
    'chunks', 'boards', 'boundary']),
  // AGSC-10-05 — Level 3, Full engine: every area.
  3: AREA_ORDER,
});

/** The areas of each Level, in the fixed order of AREA_ORDER. */
const LEVEL_AREAS = Object.freeze([0, 1, 2, 3].reduce((byLevel, level) => {
  const names = new Set([].concat(...Object.keys(LEVEL_ADDS).filter((l) => Number(l) <= level).map((l) => LEVEL_ADDS[l])));
  byLevel[level] = Object.freeze(AREA_ORDER.filter((area) => names.has(area)));
  return byLevel;
}, []));

/**
 * AGSC-10-15 (amended for 1.0.0 and 1.1.0): the cases of a Level's areas that exercise a
 * HIGHER Level's behaviour, each with the Level it belongs to. Transcribed from the
 * rule's table and from nowhere else; `tests/composition/conform-higher-level-cases
 * .test.js` holds the two to one list. From 1.1 the table also holds the rows for the
 * cases 1.1 adds (AGSC-10-19) and the withdrawn cases keep theirs (AGSC-00-13).
 */
const HIGHER_LEVEL_CASES = Object.freeze({
  'bundle-0001': 1, 'bundle-0006': 1, 'bundle-0007': 1, 'bundle-0009': 1, 'bundle-0010': 1,
  'disc-0005': 1, 'disc-0019': 1, 'bundle-0012': 1, 'bundle-0013': 1, 'bundle-0014': 1,
  'bundle-0015': 1, 'bundle-0016': 1, 'bundle-0017': 1, 'bundle-0020': 1, 'bundle-0021': 1,
  'fm-0021': 1, 'fm-0022': 1, 'fm-0023': 1, 'fm-0024': 1, 'fm-0025': 1, 'disc-0023': 1, 'fm-0026': 1,
  'fm-0027': 1,
  'bundle-0008': 2, 'disc-0009': 2, 'disc-0012': 2, 'disc-0015': 2, 'disc-0016': 2, 'disc-0017': 2,
  'disc-0018': 2, 'disc-0020': 2, 'disc-0021': 2, 'lint-0026': 2, 'bundle-0011': 2, 'disc-0026': 2,
  'disc-0027': 2, 'disc-0028': 2, 'disc-0029': 2, 'disc-0030': 2, 'disc-0031': 2, 'disc-0032': 2,
  'disc-0033': 2, 'disc-0035': 2, 'disc-0036': 2, 'disc-0037': 2, 'disc-0038': 2,
  'bundle-0003': 3, 'bundle-0004': 3, 'bundle-0005': 3, 'lint-0001': 3, 'lint-0002': 3, 'lint-0003': 3,
  'lint-0028': 3, 'lint-0029': 3, 'lint-0032': 3, 'lint-0033': 3, 'adopt-0007': 3, 'adopt-0008': 3,
  'adopt-0009': 3, 'bundle-0018': 3, 'bundle-0019': 3, 'imp-0006': 3, 'imp-0007': 3, 'imp-0008': 3,
  'bnd-0046': 3, 'bnd-0047': 3, 'bnd-0048': 3, 'bnd-0050': 3, 'lint-0046': 3, 'lint-0047': 3,
  'lint-0048': 3, 'lint-0049': 3, 'lint-0050': 3, 'lint-0057': 3, 'lint-0058': 3, 'lint-0059': 3,
  'lint-0063': 3, 'lint-0065': 3,
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

/**
 * AGSC-04-24 (amended 2026-10-29 for 1.1.0): the files 1.1 adds to the obligation. Each
 * entry is spelled as the rule `named_by` names the file (`<slug>` and `NNNN` stand for a
 * slug and a four-digit number), under the name the expected-byte cases in `cases` use, and
 * is claimable only through those cases; a file that no case pins is outside the obligation.
 * `except` names the members no case pins: the manifest's own `spec_version` (AGSC-09-17).
 * None of these is a route except the chunk index, so only it takes a leading slash. The
 * compiled diagram is the SVG a page inlines (AGSC-01-07, AGSC-02-13), not the page.
 */
function entry(artefact, namedBy, cases, except) {
  const pattern = artefact.replace(/[.]/gu, '\\.').replace('NNNN', '\\d{4}')
    .replace('<slug>', SLUG_PATTERN.replace(/^\^|\$$/gu, ''));
  const re = new RegExp(`^${artefact.startsWith('/') ? `/?${pattern.slice(1)}` : pattern}$`, 'u');
  return Object.freeze({
    artefact, cases: Object.freeze(cases), except: Object.freeze(except || []), named_by: namedBy,
    test: (name) => re.test(name),
  });
}

const BRIEF_CASES = ['compose-0024', 'compose-0034'];

const CROSS_IMPLEMENTATION_1_1 = Object.freeze([
  entry('skos.ttl', 'AGSC-05-36', ['graph-0040']),
  entry('closure.nt', 'AGSC-05-37', ['graph-0041', 'graph-0042']),
  entry('dist/suggestions.json', 'AGSC-05-35', ['lint-0046', 'lint-0047', 'lint-0048', 'lint-0049', 'lint-0050']),
  entry('BRIEF.md', 'AGSC-07-25', BRIEF_CASES),
  entry('brief.json', 'AGSC-07-25', BRIEF_CASES),
  entry('brief.mmd', 'AGSC-07-25', BRIEF_CASES),
  entry('context.md', 'AGSC-07-25', BRIEF_CASES),
  entry('/chunks-index.toon', 'AGSC-06-37', ['chk-0010']),
  entry('context-map.json', 'AGSC-07-30', ['compose-0032']),
  entry('blueprint/c4-context.mmd', 'AGSC-07-29', ['compose-0028']),
  entry('blueprint/c4-containers.mmd', 'AGSC-07-29', ['compose-0028']),
  entry('blueprint/c4-components.mmd', 'AGSC-07-29', ['compose-0028']),
  entry('blueprint/decisions/NNNN-<slug>.md', 'AGSC-07-29', ['compose-0029']),
  entry('blueprint/build-plan.md', 'AGSC-07-29', ['compose-0030']),
  entry('export-manifest.json', 'AGSC-09-17', ['export-0003', 'export-0004'], ['spec_version']),
  entry('<slug>.svg', 'AGSC-02-13', ['bundle-0018', 'bundle-0019']),
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

/** The 1.1 entry a claimed name falls under, or undefined. */
function entry11(name) {
  return CROSS_IMPLEMENTATION_1_1.find((e) => e.test(name));
}

/**
 * crossImplementationClaim(claimed) -> { accepted, excepted, rejected, reason }
 * AGSC-04-24: byte-identity across implementations is claimable only for the
 * machine artefacts. A claim listing generated HTML has that entry rejected
 * and the rest of the claim stands. `excepted` maps each accepted name that has
 * members outside the obligation to those members (from 1.1, the manifest's
 * `spec_version`); it is `{}` when there is none.
 *
 * A claimed ROUTE is recognised in the AGSC-06-01 form, with its leading slash
 * (`conform-0004`); the bare form without the slash is also
 * accepted, because a claim is a document a stranger wrote and AGSC-00-15 makes a
 * reader tolerant of a spelling its own emitter would not choose.
 */
function crossImplementationClaim(claimed) {
  const list = Array.isArray(claimed) ? claimed : [];
  const accepted = [];
  const excepted = {};
  const rejected = [];
  const routes = new Set(CROSS_IMPLEMENTATION.flatMap((r) => [r, r.replace(/^\//u, '')]));
  for (const artefact of list) {
    const name = String(artefact);
    const isHtml = /\.html?$/u.test(name);
    const added = entry11(name);
    const known = routes.has(name)
      || /^\/?search-\d{2}\.json$/u.test(name)
      || /^\/?chunks-\d{2}\.jsonl$/u.test(name)
      || /^\/?boards\//u.test(name)
      || /\.jsonld$/u.test(name)
      || added !== undefined;
    if (isHtml || !known) rejected.push(name);
    else accepted.push(name);
    // No 1.1 entry is an HTML file, so an entry found here was accepted above.
    if (added && added.except.length > 0) excepted[name] = added.except;
  }
  return Object.freeze({
    accepted: Object.freeze(accepted),
    excepted: Object.freeze(excepted),
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
  CROSS_IMPLEMENTATION_1_1,
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
