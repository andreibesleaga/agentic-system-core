'use strict';
// src/application/cli/verbs/conform.js — `conform [--level <n>] [--to <path>]`
// (AGSC-09-07): it executes the vector set of a declared Level (AGSC-10-01,
// AGSC-10-15) and writes the AGSC-09-03 report.
//
// It runs THE SAME area handlers the suite runs (`application/conformance.js`
// is the one implementation of the run), so `agsc conform` and
// `node --test tests/conformance/vector-runner.test.js` cannot disagree.
// The handlers live beside the vectors in the repository; a distribution that
// carries the vectors but not the handlers reports `skip` per vector — which
// AGSC-09-02 counts as a failure for a required vector — never a silent pass.
// Owner: B (shell); wired at integration.

const path = require('node:path');
const conformance = require('../../conformance.js');
const conform = require('../../../composition/conform.js');
const { canonicalize } = require('../../../knowledge/jcs.js');
const { createFileSystem } = require('../../../adapters/node-fs.js');
const helpers = require('./_helpers.js');

const AREAS_DIR = path.join(helpers.ENGINE_ROOT, 'tests', 'conformance', 'areas');

/** `require` of an area handler, or null when this distribution carries none. */
function handlerFor(area) {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(path.join(AREAS_DIR, `${area}.js`));
  } catch (e) {
    return null;
  }
}

function run(ctx) {
  const raw = ctx.verbFlags && ctx.verbFlags.level;
  const level = raw === undefined ? 3 : Number(raw);
  if (![0, 1, 2, 3].includes(level)) {
    return { status: 'fail', findings: [{ code: 'AGSC-E003', message: `--level must be 0, 1, 2 or 3, not ${JSON.stringify(raw)}`, severity: 'error' }] };
  }

  const engineFs = createFileSystem(helpers.ENGINE_ROOT);
  const list = conformance.vectors(engineFs, { areas: conform.areasForLevel(level) });
  const { results, tally } = conformance.runAll(list, {
    ctx: { root: helpers.ENGINE_ROOT, schemas: helpers.schemas(), specVersion: ctx.specVersion, surfaces: conformance.DECLARED_SURFACES },
    handlerFor,
    pending: new Set(),
  });

  const document = conformance.report(results, {
    impl: 'agentic-system-core',
    level,
    spec_version: ctx.specVersion,
    version: ctx.version,
  });
  const bytes = `${canonicalize(document)}\n`;

  const to = (ctx.verbFlags && ctx.verbFlags.to) || 'dist/conformance-report.json';
  ctx.ports.fs.mkdirp(path.posix.dirname(String(to)));
  ctx.ports.fs.writeFile(String(to), bytes);
  helpers.note(ctx, conformance.summaryLine(tally, list.length));
  helpers.note(ctx, `wrote: ${to}`);

  return { findings: findingsFor(results) };
}

/**
 * AGSC-09-02: a `skip` counts as a failure for a required vector — but a WITHDRAWN
 * vector is counted for nothing at all (AGSC-00-16, AGSC-09-05), so it raises no
 * finding. AGSC-10-05: no Level is claimed before 1.0.0 — the report is the record
 * of a run, never a claim.
 *
 * A pure function of the run's results, so the mapping can be asserted without a
 * distribution that is missing a handler.
 *
 * @param {Array<{id:string, rule:string, status:string, detail?:string, withdrawn?:boolean}>} results
 * @returns {Array<object>} Findings.
 */
function findingsFor(results) {
  return (results || [])
    .filter((r) => r.status !== 'pass' && r.withdrawn !== true)
    .map((r) => ({
      code: 'AGSC-E001',
      message: `vector ${r.id} (${r.rule}) ${r.status}: ${r.detail === undefined ? '' : r.detail}`,
      severity: 'error',
    }));
}

module.exports = { AREAS_DIR, findingsFor, handlerFor, name: 'conform', run };
