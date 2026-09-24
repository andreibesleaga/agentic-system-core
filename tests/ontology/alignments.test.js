'use strict';
// ontology/alignments.ttl — the INFORMATIVE alignment file. It must (1) parse, (2) state only SKOS mapping relations or OWL
// equivalences, (3) have one of the 52 terms of ontology/agsc.ttl as every subject —
// it adds no term, so the counter stays unchanged — (4) point every object at a
// well-formed absolute IRI in a namespace its header verified by URL and quote, and
// (5) never reach a build: no rule emits it and AGSC-06-01's route set is closed.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const N3 = require('n3');

const turtle = require('../../src/knowledge/turtle.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FILE = path.join(ROOT, 'ontology', 'alignments.ttl');
const NS = 'https://w3id.org/agentic-system-core/ns#';
const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const OWL = 'http://www.w3.org/2002/07/owl#';
const PREDICATES = Object.freeze([
  `${SKOS}closeMatch`, `${SKOS}exactMatch`, `${SKOS}broadMatch`, `${SKOS}narrowMatch`,
  `${SKOS}relatedMatch`, `${OWL}equivalentClass`, `${OWL}equivalentProperty`,
]);

const text = fs.readFileSync(FILE, 'utf8');
const quads = new N3.Parser({ format: 'text/turtle' }).parse(text);
const terms = new Set(turtle.ontologyTerms(fs.readFileSync(path.join(ROOT, 'ontology', 'agsc.ttl'), 'utf8'))
  .map((entry) => `${NS}${entry.term}`));

test('the alignment file parses and states something', () => {
  assert.ok(quads.length >= 5, `${quads.length} statements`);
});

test('every subject is one of the 52 terms of ontology/agsc.ttl — the file adds no term', () => {
  assert.strictEqual(terms.size, 52);
  for (const q of quads) {
    assert.strictEqual(q.subject.termType, 'NamedNode');
    assert.ok(terms.has(q.subject.value), `${q.subject.value} is not a term of ontology/agsc.ttl`);
  }
});

test('every statement is a SKOS mapping relation or an OWL equivalence', () => {
  for (const q of quads) assert.ok(PREDICATES.includes(q.predicate.value), q.predicate.value);
});

test('every object is a well-formed absolute IRI in a namespace the header verified by URL and quote', () => {
  const namespaces = new Set();
  for (const q of quads) {
    assert.strictEqual(q.object.termType, 'NamedNode', `${q.subject.value}: a literal or blank node`);
    const iri = q.object.value;
    assert.doesNotMatch(iri, /[\s<>"{}|\\^`]/u, iri);
    const url = new URL(iri);
    assert.ok(['http:', 'https:'].includes(url.protocol), iri);
    assert.ok(!iri.startsWith(NS), `${iri}: an alignment points outside this vocabulary`);
    namespaces.add(iri.replace(/[^#/]+$/u, ''));
  }
  for (const namespace of namespaces) {
    const declared = text.indexOf(`<${namespace}>`);
    assert.ok(declared !== -1, `${namespace} is not declared in the header`);
    const block = text.slice(declared, text.indexOf('\n#\n', declared) === -1 ? undefined : text.indexOf('\n#\n', declared));
    assert.match(block, /Source: https:\/\//u, `${namespace}: no source URL`);
    assert.match(block, /Quotes?(?: \([^)]*\))?: "/u, `${namespace}: no quote`);
  }
});

test('the file is CC0 and says it is informative', () => {
  assert.match(text, /^# SPDX-License-Identifier: CC0-1\.0$/mu);
  assert.match(text, /INFORMATIVE/u);
});

test('no build, export or generator reads it (AGSC-06-01, AGSC-05-28)', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory()
    ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const readers = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'tools'))]
    .filter((file) => !file.endsWith('.md'))
    .filter((file) => /alignments\.ttl/u.test(fs.readFileSync(file, 'utf8')));
  assert.deepStrictEqual(readers, []);
});
