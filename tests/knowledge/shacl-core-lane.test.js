'use strict';
// verifies AGSC-05-41
// Development lane: pySHACL, an independent SHACL processor, gives over the shared fixtures of
// `tests/shapes/core/` exactly the results their `results.json` lists, and none over the graphs
// that conform. `shacl-core.test.js` proves the engine gives the same, so the engine and pySHACL
// agree on every fixture (the Python checker reads the same folder).
//
// The lane runs only when AGSC_SHACL_PYTHON names a Python that can import pySHACL (a scratch
// environment, never a dependency of this package):
//   python3 -m venv /tmp/shacl-env && /tmp/shacl-env/bin/pip install pyshacl==0.40.2
//   AGSC_SHACL_PYTHON=/tmp/shacl-env/bin/python node --test tests/knowledge/shacl-core-lane.test.js
// Without the variable the file is skipped. Deterministic: fixed files; no network.

const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const PYTHON = process.env.AGSC_SHACL_PYTHON;
const CORE = path.join(__dirname, '..', 'shapes', 'core');
const components = fs.readdirSync(CORE).filter((name) => name !== 'refused' && fs.statSync(path.join(CORE, name)).isDirectory()).sort();
const read = (...parts) => fs.readFileSync(path.join(CORE, ...parts), 'utf8');

describe('the shared SHACL Core fixtures under pySHACL', { skip: PYTHON ? false : 'AGSC_SHACL_PYTHON is not set' }, () => {
  it('every graph that conforms gives no result, every graph that violates gives the results of its results.json', () => {
    const cases = components.flatMap((component) => ['conforms', 'violates'].map((graph) => ({
      data: read(component, `${graph}.ttl`), id: `${component}/${graph}`, shapes: read(component, 'shapes.ttl'),
    })));
    const child = spawnSync(PYTHON, ['-I', path.join(__dirname, 'shacl-core-lane.py')], {
      encoding: 'utf8', input: JSON.stringify({ cases }), maxBuffer: 16 * 1024 * 1024 });
    assert.strictEqual(child.status, 0, child.stderr);
    const got = new Map(JSON.parse(child.stdout).map((c) => [c.id, c.results]));
    for (const component of components) {
      assert.deepStrictEqual(got.get(`${component}/conforms`), [], `${component}/conforms (${child.stderr.trim()})`);
      assert.deepStrictEqual(got.get(`${component}/violates`), JSON.parse(read(component, 'results.json')), `${component}/violates`);
    }
  });
});
