'use strict';
/**
 * APPLICATION LAYER — the conformance run.
 * Implements AGSC-09-02 (every `required` vector of the declared areas is
 * executed and reported `pass`/`fail`/`skip` per id), AGSC-09-04 (a vector
 * naming a surface this node does not declare is skipped as passed),
 * AGSC-09-05/AGSC-00-16 (a withdrawn vector is skipped and counted for
 * nothing) and AGSC-10-15 (the Level — not the class sentence — is the single
 * source of the area set). The report shape is AGSC-09-03's and is built by
 * `composition/conform.js#report`, which owns it.
 *
 * This module is the ONE implementation of the run: `agsc conform` and
 * `tests/conformance/vector-runner.test.js` both call it, so the verb cannot
 * drift from the suite. Loading is through an injected FileSystem port, and
 * the area handlers are injected as a `handlerFor(area)` function, because the
 * handlers live beside the vectors in the repository and a published package
 * need not carry them (the verb then reports `skip`, never a silent pass).
 */

const conform = require('../composition/conform.js');
const { compareCodePoint } = require('../knowledge/unicode.js');

/** AGSC-11-16 / AGSC-09-04: the surfaces this reference node declares. */
const DECLARED_SURFACES = Object.freeze(['mcp', 'webmcp']);

/**
 * Every vector under `tests/vectors/**`, sorted by id.
 * @param {object} fs a FileSystem port rooted at the ENGINE root.
 * @param {{areas?: string[]}} [options] the Level's area set (AGSC-10-15);
 *   omitted means every area on disk.
 */
function vectors(fs, options) {
  const areas = options && Array.isArray(options.areas) ? new Set(options.areas) : null;
  const out = [];
  for (const file of fs.walk('tests/vectors')) {
    if (!file.endsWith('.json')) continue;
    const parsed = JSON.parse(String(fs.readFile(file, 'utf8')));
    if (areas !== null && !areas.has(parsed.area)) continue;
    out.push({ ...parsed, __file: file });
  }
  return out.sort((a, b) => compareCodePoint(String(a.id), String(b.id)));
}

/**
 * Run one vector and classify it. `pending` is the temporary allow-list of
 * `tests/conformance/pending.json`; at 1.0.0 it is empty.
 */
function runOne(vector, options) {
  const opts = options || {};
  const surfaces = opts.surfaces || DECLARED_SURFACES;
  if (vector.level === 'withdrawn') return { status: 'skip', withdrawn: true, detail: 'withdrawn (AGSC-00-16)' };
  if (opts.pending instanceof Set && opts.pending.has(vector.id)) {
    return { status: 'skip', pending: true, detail: (opts.reason || {})[vector.id] || 'pending' };
  }
  if (Array.isArray(vector.requires_surface)
      && !vector.requires_surface.some((s) => surfaces.includes(s))) {
    return { status: 'pass', detail: 'skipped as passed: surface not declared (AGSC-09-04)' };
  }
  const handler = opts.handlerFor(vector.area);
  if (!handler || typeof handler.run !== 'function') {
    return { status: 'fail', detail: `no handler for area "${vector.area}"` };
  }
  try {
    return handler.run(vector, opts.ctx);
  } catch (e) {
    return { status: 'fail', detail: `handler threw: ${e.message}` };
  }
}

/**
 * runAll(list, options) -> { results, tally }
 * `results` is the AGSC-09-02 per-id record, in vector order; `tally` is what
 * the one summary line of the runner prints.
 */
function runAll(list, options) {
  const results = [];
  const tally = { fail: 0, pass: 0, pending: 0, skip: 0, withdrawn: 0 };
  for (const vector of list) {
    const result = runOne(vector, options);
    if (result.status === 'pass') tally.pass += 1;
    else if (result.status === 'skip') {
      tally.skip += 1;
      if (result.withdrawn) tally.withdrawn += 1;
      else tally.pending += 1;
    } else tally.fail += 1;
    results.push({ ...result, id: vector.id, rule: vector.rule });
  }
  return { results, tally };
}

/** The one summary line every runner prints (WP-10-CONTRACT, test discipline). */
function summaryLine(tally, total) {
  return `vectors: ${tally.pass} pass, ${tally.fail} fail, ${tally.skip} skip `
    + `(${tally.withdrawn} withdrawn, ${tally.pending} pending) of ${total}`;
}

/**
 * The AGSC-09-03 `conformance-report.json` object for one Level, ready for
 * `knowledge/jcs.js#canonicalize`. A `skip` counts as a failure for a required
 * vector (AGSC-09-02), which the summary of the report makes visible.
 */
function report(results, options) {
  const opts = options || {};
  return conform.report({
    impl: opts.impl,
    level: opts.level,
    results: results.map((r) => (r.status === 'pass'
      ? { id: r.id, status: r.status }
      : { got: r.detail === undefined ? '' : String(r.detail), id: r.id, status: r.status })),
    spec_version: opts.spec_version,
    version: opts.version,
  });
}

module.exports = { DECLARED_SURFACES, report, runAll, runOne, summaryLine, vectors };
