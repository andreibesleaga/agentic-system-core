'use strict';
// verifies AGSC-05-41
// The SHACL Core subset of AGSC-05-41, as `src/knowledge/shacl-core.js` evaluates it with the
// pinned library `rdf-validate-shacl`. The fixtures are in `tests/shapes/core/`, shared with the
// Python checker: one folder for each of the twelve constraint components, holding the shapes,
// a graph that conforms (no result) and a graph that violates (exactly the results of its
// `results.json`), and `refused/`, one shapes file for each way of leaving the subset, which is
// the error AGSC-E420 and is not evaluated. The results of `results.json` are those pySHACL
// 0.40.2 gives over the same files (`shacl-core-lane.test.js`).
//
// Deterministic: fixed fixtures, fast-check with a fixed seed; no clock, no network.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const fc = require('fast-check');
const N3 = require('n3');
const SHACLValidator = require('rdf-validate-shacl').default;

const shacl = require('../../src/knowledge/shacl-core.js');
const turtle = require('../../src/knowledge/turtle.js');

const CORE = path.join(__dirname, '..', 'shapes', 'core');
const REFUSED = path.join(CORE, 'refused');
const RUNS = { numRuns: 60, seed: 20261103, verbose: 0 };

const read = (...parts) => fs.readFileSync(path.join(CORE, ...parts), 'utf8');
const components = fs.readdirSync(CORE).filter((name) => name !== 'refused' && fs.statSync(path.join(CORE, name)).isDirectory()).sort();
const refused = fs.readdirSync(REFUSED).filter((name) => name.endsWith('.ttl')).sort();

/** The shapes, the two graphs and the expected results of one component's folder. */
function fixture(component) {
  return {
    conforms: turtle.parse(read(component, 'conforms.ttl')),
    results: JSON.parse(read(component, 'results.json')),
    shapes: read(component, 'shapes.ttl'),
    violates: turtle.parse(read(component, 'violates.ttl')),
  };
}

/** A list of quads as N-Triples text, in the order given (blank nodes keep their labels). */
function nTriples(quads) {
  const writer = new N3.Writer({ format: 'N-Triples' });
  writer.addQuads(quads);
  let text = '';
  writer.end((error, result) => {
    assert.ifError(error);
    text = result;
  });
  return text;
}

test('the subset names exactly twelve constraint components, and each has its folder of fixtures', () => {
  assert.deepStrictEqual([...shacl.COMPONENTS].sort(), components);
  assert.strictEqual(components.length, 12);
  assert.ok(Object.isFrozen(shacl.COMPONENTS));
});

for (const component of components) {
  test(`sh:${component}: the graph that conforms gives no result, the graph that violates gives exactly its results`, () => {
    const { shapes, conforms, violates, results } = fixture(component);
    assert.deepStrictEqual(shacl.check(shapes, { file: 'shapes.ttl' }), [], 'the shapes are in the subset');
    assert.deepStrictEqual(shacl.evaluate(shapes, conforms), { findings: [], results: [] });
    assert.deepStrictEqual(shacl.evaluate(shapes, violates), { findings: [], results });
    assert.ok(results.length > 0, 'a negative fixture shows a result');
  });
}

for (const file of refused) {
  test(`refused/${file}: the shapes file is AGSC-E420, naming what leaves the subset, and nothing is evaluated`, () => {
    const text = fs.readFileSync(path.join(REFUSED, file), 'utf8');
    const what = /^# ([^:]+(?::[A-Za-z]+)?):/u.exec(text)[1];
    const findings = shacl.check(text, { file: 'domain/shapes.ttl' });
    assert.ok(findings.length > 0, `${file} is not refused`);
    for (const f of findings) {
      assert.strictEqual(f.code, 'AGSC-E420');
      assert.strictEqual(f.severity, 'error');
      assert.strictEqual(f.file, 'domain/shapes.ttl');
      assert.match(f.message, /\(AGSC-05-41\)$/u);
    }
    assert.ok(findings.some((f) => f.message.includes(what)), `no message of ${file} names "${what}": ${JSON.stringify(findings)}`);
    const data = turtle.parse('<https://example.org/a> a <https://example.org/C> .');
    assert.deepStrictEqual(shacl.evaluate(text, data, { file: 'domain/shapes.ttl' }), { findings, results: [] });
  });
}

test('every refused file names, on its first line, what leaves the subset', () => {
  assert.ok(refused.length >= 18, `${refused.length} refused files`);
  for (const file of refused) {
    assert.match(fs.readFileSync(path.join(REFUSED, file), 'utf8'), /^# [^:\n]+(?::[A-Za-z]+)?: \S/u, file);
  }
});

test('a message of a refusal is the same on every run: no blank node label is ever printed', () => {
  const text = fs.readFileSync(path.join(REFUSED, 'blank-node-shape.ttl'), 'utf8');
  turtle.parse(text);
  const first = shacl.check(text);
  turtle.parse(text);
  assert.deepStrictEqual(shacl.check(text), first);
  for (const f of first) assert.doesNotMatch(f.message, /_:|\bn3-\d|\bb\d+_/u);
});

test('the results are ordered by focus node, then source shape, then path, by code point (AGSC-05-41)', () => {
  const shapes = `@prefix ex: <https://example.org/> .
@prefix exs: <https://example.org/shapes#> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
exs:B a sh:NodeShape ; sh:targetNode ex:a ; sh:property [ sh:path ex:p ; sh:maxLength 1 ] .
exs:A a sh:NodeShape ; sh:targetNode ex:b , ex:a ;
  sh:property [ sh:path ex:q ; sh:datatype xsd:integer ] , [ sh:path ex:p ; sh:minCount 1 ] .
`;
  const data = turtle.parse('@prefix ex: <https://example.org/> . ex:b ex:q "y" . ex:a ex:q "x" ; ex:p "long" .');
  const keys = shacl.evaluate(shapes, data).results.map((r) => `${r.focus.slice(20)} ${r.shape.slice(27)} ${r.component}`);
  assert.deepStrictEqual(keys, [
    'a A > https://example.org/q DatatypeConstraintComponent',
    'a B > https://example.org/p MaxLengthConstraintComponent',
    'b A > https://example.org/p MinCountConstraintComponent',
    'b A > https://example.org/q DatatypeConstraintComponent',
  ]);
});

test('a literal with a language tag and a blank node are written as N-Triples writes them', () => {
  const shapes = `@prefix ex: <https://example.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
ex:S a sh:NodeShape ; sh:targetSubjectsOf ex:p ; sh:property [ sh:path ex:p ; sh:in ( "a" ) ] .
`;
  const [result] = shacl.evaluate(shapes, turtle.parse('[] <https://example.org/p> "b\\"c"@en .')).results;
  assert.match(result.focus, /^_:\S+$/u);
  assert.strictEqual(result.value, '"b\\"c"@en');
});

test('the data graph is read as one set of triples: a named graph and a repeated triple change nothing', () => {
  const { shapes, violates, results } = fixture('maxCount');
  const graph = N3.DataFactory.namedNode('https://example.org/');
  const named = violates.map((q) => N3.DataFactory.quad(q.subject, q.predicate, q.object, graph));
  assert.deepStrictEqual(shacl.evaluate(shapes, named).results, results);
  assert.deepStrictEqual(shacl.evaluate(shapes, [...named, ...violates, ...violates]).results, results);
});

test('owl:imports in the shapes file is never followed: nothing is loaded and the shapes still run', () => {
  const { shapes, violates, results } = fixture('minCount');
  const importing = `${shapes}\n<https://example.org/shapes> <http://www.w3.org/2002/07/owl#imports> <https://example.org/elsewhere> .\n`;
  assert.deepStrictEqual(shacl.check(importing), []);
  assert.deepStrictEqual(shacl.evaluate(importing, violates).results, results);
});

test('a shapes file with no shape, and an empty data graph, give nothing', () => {
  assert.deepStrictEqual(shacl.evaluate('', []), { findings: [], results: [] });
  assert.deepStrictEqual(shacl.evaluate(fixture('class').shapes, []), { findings: [], results: [] });
});

test('the order of the statements in the shapes and in the data does not change the results (property)', () => {
  const cases = components.map((component) => ({ ...fixture(component), shapeQuads: turtle.parse(read(component, 'shapes.ttl')) }));
  fc.assert(fc.property(fc.constantFrom(...cases), fc.integer(), fc.integer(), (c, seedShapes, seedData) => {
    const shuffle = (list, seed) => list.map((q, i) => [((i + 1) * (seed | 1)) % 2147483647, q]).sort((a, b) => a[0] - b[0]).map(([, q]) => q);
    const shapes = nTriples(shuffle(c.shapeQuads, seedShapes));
    assert.deepStrictEqual(shacl.evaluate(shapes, shuffle(c.violates, seedData)).results, c.results);
    return true;
  }), RUNS);
});

test('evaluating twice gives the same results: the evaluator keeps no state between calls (property)', () => {
  fc.assert(fc.property(fc.constantFrom(...components), (component) => {
    const { shapes, violates } = fixture(component);
    const once = shacl.evaluate(shapes, violates);
    assert.deepStrictEqual(shacl.evaluate(shapes, violates), once);
    return true;
  }), { ...RUNS, numRuns: 24 });
});

test('the engine runs the library synchronously and gets what the library\'s own validate() reports', async () => {
  const text = (term) => (term ? `${term.termType}:${term.value}` : null);
  for (const component of components) {
    const { shapes, violates } = fixture(component);
    const report = await new SHACLValidator(turtle.parse(shapes)).validate(new N3.Store(violates));
    const theirs = report.results.map((r) => [text(r.focusNode), r.sourceConstraintComponent.value, r.severity.value, text(r.value)].join(' ')).sort();
    const ours = shacl.evaluate(shapes, violates).results.map((r) => [
      r.focus.startsWith('"') ? `Literal:${JSON.parse(r.focus.replace(/\^\^<[^>]+>$|@[a-z-]+$/u, ''))}` : `NamedNode:${r.focus}`,
      `http://www.w3.org/ns/shacl#${r.component}`, `http://www.w3.org/ns/shacl#${r.severity}`,
      r.value === null ? null : r.value.startsWith('"') ? `Literal:${JSON.parse(r.value.replace(/\^\^<[^>]+>$|@[a-z-]+$/u, ''))}` : `NamedNode:${r.value}`,
    ].join(' ')).sort();
    assert.deepStrictEqual(ours, theirs, component);
  }
});
