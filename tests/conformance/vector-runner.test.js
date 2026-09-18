'use strict';
// The conformance runner (AGSC-09-02, AGSC-09-04, AGSC-09-06).
//
// The RUN itself is `src/application/conformance.js` — the same module
// `agsc conform` calls, so the suite and the verb can never disagree about
// what a vector set is or how a result is classified (WP-10-G). This file is
// the node:test wrapper around it: it loads the vectors and the area handlers
// from the repository, prints the one summary line, and fails the suite when
// any non-pending required vector fails.
//
//   * `level: "withdrawn"`      -> skip, never counted for or against a claim
//                                  (AGSC-00-16, AGSC-09-05).
//   * id in pending.json        -> skip with its reason, until the owning package
//                                  lands its handler; the integration package
//                                  empties that file (and it is empty).
//   * `requires_surface`        -> the reference node declares ["mcp","webmcp"], so
//                                  those vectors MUST run (AGSC-09-04, V7-23).
//   * a required vector with no handler -> fail.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const conformance = require('../../src/application/conformance.js');
const { createFileSystem } = require('../../src/adapters/node-fs.js');

const ROOT = path.resolve(__dirname, '..', '..');
const AREAS = path.join(__dirname, 'areas');

function loadPending() {
  const file = path.join(__dirname, 'pending.json');
  if (!fs.existsSync(file)) return { pending: new Set(), reason: {} };
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { pending: new Set(raw.pending || []), reason: raw.reason || {} };
}

const handlerCache = new Map();
function handlerFor(area) {
  if (!handlerCache.has(area)) {
    const file = path.join(AREAS, `${area}.js`);
    // eslint-disable-next-line global-require, import/no-dynamic-require
    handlerCache.set(area, fs.existsSync(file) ? require(file) : null);
  }
  return handlerCache.get(area);
}

function specVersion() {
  const text = fs.readFileSync(path.join(ROOT, 'spec', '00-overview.md'), 'utf8');
  const m = /1\.0\.0-rc\.\d+/u.exec(text);
  return m ? m[0] : 'unknown';
}

test('conformance vectors', async (t) => {
  // Lazily required so that a broken adapter cannot break vector collection.
  const { readSchemas } = require('../../src/adapters/node-fs.js');
  const validate = require('../../src/knowledge/validate.js');
  const ctx = {
    root: ROOT,
    schemas: validate.schemas(readSchemas(ROOT)),
    specVersion: specVersion(),
    surfaces: conformance.DECLARED_SURFACES,
  };

  const vectors = conformance.vectors(createFileSystem(ROOT));
  const { pending, reason } = loadPending();
  const { results, tally } = conformance.runAll(vectors, { ctx, handlerFor, pending, reason });
  const failures = results.filter((r) => r.status === 'fail')
    .map((r) => `${r.id} (${r.rule}) ${r.detail}`);

  for (const result of results) {
    // eslint-disable-next-line no-await-in-loop
    await t.test(`${result.id} ${result.rule}`, { skip: result.status === 'skip' }, () => {
      assert.strictEqual(result.status, 'pass', result.detail);
    });
  }

  process.stdout.write(`${conformance.summaryLine(tally, vectors.length)}\n`);

  assert.strictEqual(tally.fail, 0, `failing vectors:\n${failures.join('\n')}`);
  assert.strictEqual(tally.pass + tally.fail + tally.skip, vectors.length, 'every vector is accounted for');
  assert.strictEqual(tally.pending, 0, 'tests/conformance/pending.json must be empty at integration');
});
