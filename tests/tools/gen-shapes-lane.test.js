'use strict';
// tests/tools/gen-shapes-lane.test.js — the development lane of AGSC-05-24: the shapes of
// schema/item-shapes.ttl RUN, with pySHACL, over the RDF graph of every Bundle the
// repository ships as a fixture or a demonstration, and over one negative graph for each
// shape.
//
// The lane runs only when AGSC_SHACL_PYTHON names a Python that can import pySHACL (a
// scratch environment, never a dependency of this package, so `npm audit` is untouched):
//   python3 -m venv /tmp/shacl-env && /tmp/shacl-env/bin/pip install pyshacl==0.40.2
//   AGSC_SHACL_PYTHON=/tmp/shacl-env/bin/python node --test tests/tools/gen-shapes-lane.test.js
// The version is recorded in docs/SHACL-SHAPES.md. Without the variable the file is skipped;
// the checks that need no SHACL library are in gen-shapes.test.js and always run.
//
// Deterministic: builds copies of the fixtures at a fixed instant; no network (the pip
// install is outside the test).

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it, before } = require('node:test');

const { REPO, tmpdir } = require('./helpers');

const PYTHON = process.env.AGSC_SHACL_PYTHON;
const SH = 'http://www.w3.org/ns/shacl#';
const ASCS = 'https://w3id.org/agentic-system-core/shapes#';
const SHAPES = fs.readFileSync(path.join(REPO, 'schema', 'item-shapes.ttl'), 'utf8');
const NEGATIVES = path.join(REPO, 'tests', 'shapes', 'negative');

/** Every Bundle of the repository that has its own configuration: the fixtures and the four demonstration modes. */
const BUNDLES = Object.freeze({
  'minimal': 'tests/fixtures/minimal',
  'mode-2-project': 'examples/demos/mode-2-project',
  'mode-3-skills': 'examples/demos/mode-3-skills',
  'mode-4-compose': 'examples/demos/mode-4-compose',
  'mode-5-board': 'examples/demos/mode-5-board',
  'with-assets': 'tests/fixtures/with-assets',
});

/** The only results the shapes give over those Bundles: the orphan that `agsc lint` also reports (AGSC-E305). */
const KNOWN_WARNINGS = Object.freeze({
  'mode-2-project': [`${ASCS}OrphanShape https://project.example/gates/merge-gate/`],
});

function agsc(cwd, args) {
  // The engine refuses an AGSC_* variable it does not know (AGSC-01-37), this lane's own among them.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('AGSC_')));
  env.SOURCE_DATE_EPOCH = '1767225600';
  const child = spawnSync(process.execPath, [path.join(REPO, 'bin', 'agsc.js'), ...args], { cwd, encoding: 'utf8', env });
  assert.equal(child.status, 0, `agsc ${args.join(' ')}: ${child.stdout}${child.stderr}`);
}

/** Copy a Bundle, build it and export its SKOS view; the graphs of the build as lane cases. */
function casesOf(name, relative) {
  const dir = path.join(tmpdir(), name);
  fs.cpSync(path.join(REPO, relative), dir, { recursive: true });
  fs.rmSync(path.join(dir, 'www'), { force: true, recursive: true });
  agsc(dir, ['build']);
  agsc(dir, ['export', '--skos']);
  const read = (file) => fs.readFileSync(path.join(dir, file), 'utf8');
  return [
    { data: read('www/graph.nq'), format: 'nquads', id: `${name} graph.nq` },
    { data: read('www/graph.ttl'), format: 'turtle', id: `${name} graph.ttl` },
    { data: read('dist/export/skos.ttl'), format: 'turtle', id: `${name} skos.ttl` },
  ];
}

function validate(cases) {
  const child = spawnSync(PYTHON, ['-I', path.join(__dirname, 'gen-shapes-lane.py')], {
    encoding: 'utf8', input: JSON.stringify({ cases, shapes: SHAPES }), maxBuffer: 64 * 1024 * 1024 });
  assert.equal(child.status, 0, child.stderr);
  return { results: new Map(JSON.parse(child.stdout).map((c) => [c.id, c.results])), versions: child.stderr.trim() };
}

/** The severity a shape declares for its results (a shape with none reports violations). */
function declaredSeverity(shape) {
  const found = SHAPES.slice(SHAPES.indexOf(`ascs:${shape}\n`)).split('\n\n')[0].match(/sh:severity sh:(\w+)/u);
  return `${SH}${found ? found[1] : 'Violation'}`;
}

describe('AGSC-05-24 — the development lane', { skip: PYTHON ? false : 'AGSC_SHACL_PYTHON is not set' }, () => {
  let positive;
  let negative;

  before(() => {
    const cases = Object.entries(BUNDLES).flatMap(([name, relative]) => casesOf(name, relative));
    positive = validate(cases);
    const names = fs.readdirSync(NEGATIVES).filter((f) => f.endsWith('.ttl')).map((f) => f.slice(0, -4)).sort();
    negative = validate(names.map((id) => ({ data: fs.readFileSync(path.join(NEGATIVES, `${id}.ttl`), 'utf8'), format: 'turtle', id })));
  });

  it('the shapes give no violation over the three RDF views of every Bundle of the repository', (t) => {
    const total = [...positive.results.values()].reduce((sum, results) => sum + results.length, 0);
    t.diagnostic(`${positive.versions}; ${positive.results.size} graphs; ${total} results`);
    assert.equal(positive.results.size, Object.keys(BUNDLES).length * 3);
    for (const [id, results] of positive.results) {
      const violations = results.filter((r) => r.severity === `${SH}Violation`);
      assert.deepEqual(violations, [], id);
    }
  });

  it('the smallest Bundle gives no result of any severity, so a result of a negative graph is the fault and not the lane', () => {
    for (const view of ['graph.nq', 'graph.ttl', 'skos.ttl']) assert.deepEqual(positive.results.get(`minimal ${view}`), [], view);
  });

  it('the only warnings are the orphan that agsc lint reports too, on the same item', () => {
    for (const [id, results] of positive.results) {
      const bundle = id.split(' ')[0];
      const found = [...new Set(results.map((r) => `${r.shape} ${r.focus}`))].sort();
      const wanted = id.endsWith('skos.ttl') ? [] : KNOWN_WARNINGS[bundle] || [];
      assert.deepEqual(found, wanted, id);
    }
  });

  it('each negative graph shows the violation of the shape it is named for, with the severity the shape declares', () => {
    const shapes = fs.readdirSync(NEGATIVES).filter((f) => f.endsWith('.ttl')).map((f) => f.slice(0, -4));
    assert.ok(shapes.length >= 40, `${shapes.length} negative graphs`);
    for (const shape of shapes) {
      const results = negative.results.get(shape);
      const own = results.filter((r) => r.shape === `${ASCS}${shape}`);
      assert.ok(own.length > 0, `${shape}: no result of its own among ${results.map((r) => r.shape).join(', ')}`);
      assert.ok(own.every((r) => r.severity === declaredSeverity(shape)), `${shape}: severity ${own[0].severity}`);
    }
  });
});
