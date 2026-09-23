'use strict';
// tools/validate-ontology — AGSC-09-90, PRD-054. The passing case is the shipped
// ontology/agsc.ttl; each failing case is a three-line Turtle fixture that violates
// exactly one rule, written into a throw-away directory.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const { REPO, capture, codes, envelope, tmpdir, tool, writeTree } = require('./helpers');

const { ancestors } = tool('validate-ontology');

const PREAMBLE = [
  '@prefix asc: <https://w3id.org/agentic-system-core/ns#> .',
  '@prefix dcterms: <http://purl.org/dc/terms/> .',
  '@prefix owl: <http://www.w3.org/2002/07/owl#> .',
  '@prefix prov: <http://www.w3.org/ns/prov#> .',
  '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
  '@prefix skos: <http://www.w3.org/2004/02/skos/core#> .',
  '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
  '',
  '<https://w3id.org/agentic-system-core/ns>',
  '    a owl:Ontology ;',
  '    owl:versionIRI <https://w3id.org/agentic-system-core/ns/1.0.0-draft.1> .',
  '',
].join('\n');

function ontologyRoot(body, extra = {}) {
  return writeTree(tmpdir(), {
    'ontology/agsc.ttl': `${PREAMBLE}${body}`,
    'spec/00-overview.md': '`spec_version: "1.0.0-rc.6"`\n',
    ...extra,
  });
}

const CONCEPT = [
  'asc:Concept',
  '    a owl:Class ;',
  '    rdfs:label "Concept" ;',
  '    rdfs:subClassOf skos:Concept .',
  '',
].join('\n');

describe('validate-ontology — usage and the envelope', () => {
  it('--help exits 0; an unknown flag and a second argument exit 2', () => {
    assert.equal(capture('validate-ontology', ['--help']).code, 0);
    assert.equal(capture('validate-ontology', ['--nope']).code, 2);
    assert.equal(capture('validate-ontology', [ontologyRoot(CONCEPT), ontologyRoot(CONCEPT)]).code, 2);
  });

  it('a root with no ontology FAILS with AGSC-E901, exit 1', () => {
    // CHANGED at rc.6 (FIX29-S4): AGSC-09-90 now says a validator MUST FAIL "with
    // `AGSC-E901`" over an absent input, and AGSC-09-08 reserves exit 2 for a usage
    // error. An absent input is exit 1, the envelope and the code.
    const result = capture('validate-ontology', [tmpdir()]);
    assert.equal(result.code, 1);
    assert.match(result.err, /AGSC-E901 no ontology at/u);
    assert.match(result.out, /0 input file\(s\) read/u);
  });

  it('the envelope has the AGSC-09-11 shape and the file may be named directly', () => {
    const root = ontologyRoot(CONCEPT);
    const { code, json } = envelope('validate-ontology', [path.join(root, 'ontology', 'agsc.ttl')]);
    assert.equal(code, 0);
    assert.equal(json.verb, 'validate-ontology');
    assert.equal(json.spec_version, '1.0.0-rc.6');
    assert.deepEqual(json.findings, []);
  });

  it('--quiet says nothing; the human output carries a summary line', () => {
    assert.equal(capture('validate-ontology', ['--quiet', ontologyRoot(CONCEPT)]).out, '');
    const result = capture('validate-ontology', [ontologyRoot(CONCEPT)]);
    assert.match(result.out, /^validate-ontology: 1 input file\(s\) read, \d+ triples, 1 classes, 0 properties, 0 error, 0 warn\n$/u);
  });
});

describe('validate-ontology — the faults', () => {
  it('Turtle that does not parse is AGSC-E201, and the run stops there', () => {
    const root = ontologyRoot('asc:Broken a owl:Class\n');
    const result = capture('validate-ontology', [root]);
    assert.equal(result.code, 1);
    assert.match(result.err, /AGSC-E201 not well-formed Turtle/u);
    const { json } = envelope('validate-ontology', [root]);
    assert.deepEqual(codes(json), ['AGSC-E201']);
  });

  it('encoding faults are AGSC-E108', () => {
    const root = ontologyRoot(`${CONCEPT}\n`);
    const file = path.join(root, 'ontology', 'agsc.ttl');
    fs.writeFileSync(file, `﻿${fs.readFileSync(file, 'utf8').replace(/\n/gu, '\r\n')}\n`);
    const { json } = envelope('validate-ontology', [root]);
    assert.ok(json.findings.filter((f) => f.code === 'AGSC-E108').length >= 3);
  });

  it('non-NFC text is AGSC-E108', () => {
    const root = ontologyRoot(CONCEPT.replace('"Concept"', '"Concepté"'));
    const { json } = envelope('validate-ontology', [root]);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E108' && /not NFC/u.test(f.message)));
  });

  it('a blank node is AGSC-E605', () => {
    const root = ontologyRoot(`${CONCEPT}asc:Other a owl:Class ; rdfs:subClassOf [ a owl:Class ] .\n`);
    const { json } = envelope('validate-ontology', [root]);
    assert.ok(codes(json).includes('AGSC-E605'));
  });

  it('a predicate outside the RL-safe vocabulary is AGSC-E203', () => {
    const root = ontologyRoot(`${CONCEPT}asc:Other a owl:Class ; owl:disjointUnionOf asc:Concept .\n`);
    const { json } = envelope('validate-ontology', [root]);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E203' && /disjointUnionOf/u.test(f.message)));
  });

  it('a declared type outside OWL 2 RL is AGSC-E203', () => {
    const root = ontologyRoot(`${CONCEPT}asc:reflexive a owl:ReflexiveProperty .\n`);
    const { json } = envelope('validate-ontology', [root]);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E203' && /ReflexiveProperty/u.test(f.message)));
  });

  it('a term outside the persistent namespace is AGSC-E204', () => {
    const root = ontologyRoot(`${CONCEPT}<https://agenticsystemcore.com/ns#Stray> a owl:Class .\n`);
    const { json } = envelope('validate-ontology', [root]);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E204' && /persistent namespace/u.test(f.message)));
  });

  it('asc:Item is AGSC-E203 (AGSC-05-13), and the human output names it', () => {
    const root = ontologyRoot(`${CONCEPT}asc:Item a owl:Class .\n`);
    const { json } = envelope('validate-ontology', [root]);
    assert.ok(json.findings.some((f) => /asc:Item MUST NOT be emitted/u.test(f.message)));
    const human = capture('validate-ontology', [root]);
    assert.equal(human.code, 1);
    assert.match(human.err, /^error: ontology\/agsc\.ttl:1:1 AGSC-E203 asc:Item MUST NOT be emitted/mu);
  });

  it('no owl:versionIRI is AGSC-E202', () => {
    const root = writeTree(tmpdir(), {
      'ontology/agsc.ttl': `${PREAMBLE.replace(/ ;\n    owl:versionIRI[^\n]*\n/u, ' .\n')}${CONCEPT}`,
    });
    const { json } = envelope('validate-ontology', [root]);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E202' && /no owl:versionIRI/u.test(f.message)));
  });

  it('a deprecated term with no replacement is AGSC-E202, and one with a replacement is silent', () => {
    const root = ontologyRoot([CONCEPT,
      'asc:Old a owl:Class ; owl:deprecated true .', '',
      'asc:Older a owl:Class ; owl:deprecated true ; dcterms:isReplacedBy asc:Concept .', ''].join('\n'));
    const { json } = envelope('validate-ontology', [root]);
    const deprecated = json.findings.filter((f) => /owl:deprecated and carries no/u.test(f.message));
    assert.equal(deprecated.length, 1);
    assert.match(deprecated[0].message, /#Old>/u);
  });

  it('asc:uses with a domain or a range is AGSC-E201 (AGSC-05-26a)', () => {
    const root = ontologyRoot(`${CONCEPT}asc:uses a owl:ObjectProperty ; rdfs:domain asc:Concept ; rdfs:range asc:Concept .\n`);
    const { json } = envelope('validate-ontology', [root]);
    const axioms = json.findings.filter((f) => /AGSC-05-26a forbids it/u.test(f.message));
    assert.equal(axioms.length, 2);
  });

  it('a semantic-relation sub-property whose range is not a Concept breaks S19/S20', () => {
    const root = ontologyRoot([CONCEPT,
      'asc:Cluster a owl:Class ; rdfs:subClassOf skos:Collection .', '',
      'asc:nests a owl:ObjectProperty ; rdfs:subPropertyOf skos:broader ; rdfs:range asc:Cluster .', ''].join('\n'));
    const { json } = envelope('validate-ontology', [root]);
    assert.ok(json.findings.some((f) => /SKOS S19\/S20/u.test(f.message)));
  });

  it('a skos:member sub-property whose range is neither Concept nor Collection breaks S32', () => {
    const root = ontologyRoot([CONCEPT,
      'asc:Episode a owl:Class ; rdfs:subClassOf prov:Activity .', '',
      'asc:holds a owl:ObjectProperty ; rdfs:subPropertyOf skos:member ; rdfs:range asc:Episode .', ''].join('\n'));
    const { json } = envelope('validate-ontology', [root]);
    assert.ok(json.findings.some((f) => /SKOS S32/u.test(f.message)));
  });

  it('a class under both skos:Collection and skos:Concept breaks S37', () => {
    const root = ontologyRoot([CONCEPT,
      'asc:Both a owl:Class ; rdfs:subClassOf skos:Collection, skos:Concept .', ''].join('\n'));
    const { json } = envelope('validate-ontology', [root]);
    assert.ok(json.findings.some((f) => /S37/u.test(f.message) && /skos:Concept/u.test(f.message)));
  });

  it('a class under both skos:Collection and skos:ConceptScheme breaks S37', () => {
    const root = ontologyRoot([CONCEPT,
      'asc:Both a owl:Class ; rdfs:subClassOf skos:Collection, skos:ConceptScheme .', ''].join('\n'));
    const { json } = envelope('validate-ontology', [root]);
    assert.ok(json.findings.some((f) => /S37/u.test(f.message) && /skos:ConceptScheme/u.test(f.message)));
  });
});

describe('validate-ontology — the helper it exports', () => {
  it('ancestors walks a subclass chain once, cycles included', () => {
    const graph = new Map([['a', new Set(['b'])], ['b', new Set(['c'])], ['c', new Set(['a'])]]);
    assert.deepEqual([...ancestors('a', graph)].sort(), ['a', 'b', 'c']);
    assert.deepEqual([...ancestors('z', graph)], []);
  });
});

describe('validate-ontology — the real distribution', () => {
  it('the shipped ontology passes, with 52 terms', () => {
    const result = capture('validate-ontology', [REPO]);
    assert.equal(result.code, 0);
    assert.match(result.out, /12 classes, 40 properties, 0 error, 0 warn/u);
    assert.equal(result.err, '');
  });
});
