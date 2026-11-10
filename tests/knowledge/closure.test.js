'use strict';
// Requirement: PRD-075 (docs/PRD.md).
// verifies AGSC-05-37, AGSC-05-23
// AGSC-05-37 — the closure of the graph under the RL subset of OWL 2 Profiles: the rules as
// data, run by the Reasoner of the pinned `n3`. Offline and deterministic: fixed seed, no
// clock, no network. The whole-file cases are the vectors graph-0041 and graph-0042.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const fc = require('fast-check');
const closure = require('../../src/knowledge/closure.js');
const nq = require('../../src/knowledge/nquads.js');
const fixture = require('./_graph-fixture.js');

const RUNS = { numRuns: 100, seed: 20261031, verbose: 0 };
const ONTOLOGY = fs.readFileSync(path.join(__dirname, '..', '..', 'ontology', 'agsc.ttl'), 'utf8');
const G = '<https://t.example/>';
const ex = (name) => `<https://t.example/${name}>`;
const line = (s, p, o) => `${s} ${p} ${o} ${G} .\n`;
/** A line of `closure.nt`: a triple with no graph term (AGSC-05-37 as amended 2026-11-10). */
const triple = (s, p, o) => `${s} ${p} ${o} .\n`;
const vocab = (turtle) => `@prefix owl: <http://www.w3.org/2002/07/owl#> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n${turtle}\n`;
const RDF_TYPE = '<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>';

test('the rules are exactly the eight of AGSC-05-37, as data a reader can check', () => {
  assert.deepStrictEqual(closure.RULES.map((r) => r.name),
    ['prp-dom', 'prp-rng', 'prp-spo1', 'prp-symp', 'prp-inv1', 'prp-inv2', 'prp-trp', 'cax-sco']);
  for (const rule of closure.RULES) {
    assert.ok(rule.if.length >= 2 && rule.then.length === 1, rule.name);
    for (const triple of [...rule.if, ...rule.then]) assert.strictEqual(triple.length, 3);
  }
});

test('no graph and no vocabulary entail nothing: an empty file', () => {
  assert.deepStrictEqual(closure.closure('', []), { text: '', warnings: [] });
  assert.strictEqual(closure.closure(line(ex('a'), ex('p'), ex('b')), []).text, '');
});

test('cax-sco: a type is carried up the subclass axioms, written as a triple with no graph term', () => {
  const out = closure.closure(line(ex('x'), RDF_TYPE, ex('Dog')), [vocab('<https://t.example/Dog> rdfs:subClassOf <https://t.example/Animal> .')]);
  assert.strictEqual(out.text, triple(ex('x'), RDF_TYPE, ex('Animal')));
});

test('prp-dom and prp-rng: the domain types the subject, the range types an IRI object', () => {
  const rules = vocab('<https://t.example/p> rdfs:domain <https://t.example/D> ; rdfs:range <https://t.example/R> .');
  const out = closure.closure(line(ex('x'), ex('p'), ex('y')), [rules]);
  assert.strictEqual(out.text, `${triple(ex('x'), RDF_TYPE, ex('D'))}${triple(ex('y'), RDF_TYPE, ex('R'))}`);
});

test('prp-rng: a literal is never the subject of a triple, so the range of a datatype property adds nothing', () => {
  const rules = vocab('<https://t.example/p> rdfs:range <http://www.w3.org/2001/XMLSchema#string> .');
  const out = closure.closure(line(ex('x'), ex('p'), '"text"^^<http://www.w3.org/2001/XMLSchema#string>'), [rules]);
  assert.strictEqual(out.text, '');
});

test('prp-spo1, prp-symp, prp-inv1 and prp-inv2 each add the triple they entail', () => {
  const rules = vocab([
    '<https://t.example/sub> rdfs:subPropertyOf <https://t.example/super> .',
    '<https://t.example/sym> a owl:SymmetricProperty .',
    '<https://t.example/fwd> owl:inverseOf <https://t.example/back> .',
  ].join('\n'));
  const graph = line(ex('a'), ex('sub'), ex('b')) + line(ex('a'), ex('sym'), ex('b')) + line(ex('a'), ex('fwd'), ex('b')) + line(ex('c'), ex('back'), ex('d'));
  const expected = [
    triple(ex('a'), ex('super'), ex('b')), triple(ex('b'), ex('back'), ex('a')), triple(ex('b'), ex('sym'), ex('a')), triple(ex('d'), ex('fwd'), ex('c')),
  ].join('');
  assert.strictEqual(closure.closure(graph, [rules]).text, expected);
});

test('prp-trp: a chain of a transitive property is closed, and the result is sorted by bytes', () => {
  const rules = vocab('<https://t.example/t> a owl:TransitiveProperty .');
  const graph = line(ex('a'), ex('t'), ex('b')) + line(ex('b'), ex('t'), ex('c')) + line(ex('c'), ex('t'), ex('d'));
  const text = closure.closure(graph, [rules]).text;
  assert.strictEqual(text, [['a', 'c'], ['a', 'd'], ['b', 'd']].map(([s, o]) => triple(ex(s), ex('t'), ex(o))).join(''));
  assert.deepStrictEqual(text.split('\n').slice(0, -1), [...text.split('\n').slice(0, -1)].sort());
});

test('rules chain: a sub-property that is symmetric and has an inverse reaches a fixed point', () => {
  const rules = vocab([
    '<https://t.example/s> rdfs:subPropertyOf <https://t.example/u> .',
    '<https://t.example/u> a owl:SymmetricProperty ; owl:inverseOf <https://t.example/w> .',
  ].join('\n'));
  const text = closure.closure(line(ex('a'), ex('s'), ex('b')), [rules]).text;
  assert.deepStrictEqual(text.split('\n').slice(0, -1).sort(), [
    triple(ex('a'), ex('u'), ex('b')), triple(ex('b'), ex('u'), ex('a')), triple(ex('b'), ex('w'), ex('a')), triple(ex('a'), ex('w'), ex('b')),
  ].map((l) => l.trimEnd()).sort());
});

test('prp-irp is a check only: each violation is the warning AGSC-E313, once, and adds no triple', () => {
  const rules = vocab('<https://t.example/r> a owl:IrreflexiveProperty .');
  const graph = line(ex('a'), ex('r'), ex('a')) + line(ex('b'), ex('r'), ex('c')) + line(ex('a'), ex('r'), ex('a'));
  const out = closure.closure(graph, [rules]);
  assert.strictEqual(out.text, '');
  assert.deepStrictEqual(out.warnings.map((w) => [w.code, w.severity]), [['AGSC-E313', 'warn']]);
  assert.match(out.warnings[0].message, /https:\/\/t\.example\/a .*https:\/\/t\.example\/r|https:\/\/t\.example\/r .*https:\/\/t\.example\/a/u);
});

test('a triple that the graph or a vocabulary already holds is not in the closure', () => {
  const rules = vocab('<https://t.example/Dog> rdfs:subClassOf <https://t.example/Animal> .');
  const graph = line(ex('x'), RDF_TYPE, ex('Dog')) + line(ex('x'), RDF_TYPE, ex('Animal'));
  assert.strictEqual(closure.closure(graph, [rules]).text, '');
});

test('graph-0042 by hand: with the site vocabulary and the domain triples the graph carries, the closure is the vector\'s', () => {
  const vector = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vectors', 'graph', 'graph-0042-closure-with-a-site-vocabulary.json'), 'utf8'));
  const base = 'https://minimal.example/';
  const graph = nq.toNQuads(vector.input.items, { base, bundle: vector.input.bundle })
    + [['engine-a', 'dom:controlled-by', 'ctl'], ['ctl', 'dom:controls', 'engine-a']].map(([s, p, o]) =>
      `<${base}concepts/${s}/> <${base}ns/domain#${p.slice(4)}> <${base}concepts/${o}/> <${base}> .\n`).join('');
  const out = closure.closure(graph, [ONTOLOGY, vector.input.vocabulary]);
  assert.strictEqual(out.text, vector.expected.closure);
});

// ---- properties

const items = fc.uniqueArray(fc.constantFrom('a', 'b', 'c', 'd'), { minLength: 2, maxLength: 4 }).chain((names) =>
  fc.tuple(...names.map((slug) => fc.record({
    uses: fc.subarray(names.filter((n) => n !== slug)),
    related: fc.subarray(names.filter((n) => n !== slug)),
    requires: fc.subarray(names.filter((n) => n !== slug)),
  }).map((links) => ({ slug, type: 'concept', kind: 'principle', title: slug, prov: { origin: 'human', operator: 'human:t' }, ...links })))));

const graphOf = (list) => nq.toNQuads(list, { base: 'https://t.example/' });

test('property: the same graph gives the same bytes twice, and in any order of the items', () => {
  fc.assert(fc.property(items, (list) => {
    const once = closure.closure(graphOf(list), [ONTOLOGY]).text;
    assert.strictEqual(closure.closure(graphOf(list), [ONTOLOGY]).text, once);
    assert.strictEqual(closure.closure(graphOf([...list].reverse()), [ONTOLOGY]).text, once);
  }), RUNS);
});

test('property: the closure of a graph together with its closure adds nothing (a fixed point)', () => {
  fc.assert(fc.property(items, (list) => {
    const graph = graphOf(list);
    const first = closure.closure(graph, [ONTOLOGY]).text;
    assert.strictEqual(closure.closure(graph + first, [ONTOLOGY]).text, '');
  }), RUNS);
});

test('property: the inverse and symmetric edges the graph already holds add no link triple (it agrees with derive.js)', () => {
  const linkPredicates = new Set(Object.values(nq.LINK_PROPERTIES).flatMap((p) => [p.property, p.inverse]).filter(Boolean));
  fc.assert(fc.property(items, (list) => {
    const added = closure.closure(graphOf(list), [ONTOLOGY]).text.split('\n').filter(Boolean);
    for (const triple of added) {
      const predicate = /^<[^>]+> <([^>]+)>/u.exec(triple)[1];
      assert.ok(!linkPredicates.has(predicate), triple);
    }
  }), RUNS);
});

test('the shared graph fixture closes without a warning and is itself a fixed point', () => {
  const graph = nq.toNQuads(fixture.items, { base: 'https://fixture.example/' });
  const first = closure.closure(graph, [ONTOLOGY]);
  assert.deepStrictEqual(first.warnings, []);
  assert.strictEqual(closure.closure(graph + first.text, [ONTOLOGY]).text, '');
});
