'use strict';
// Not a test — the site vocabularies the tests of the domain layer share (AGSC-05-38).
//
// `VALID` is the vocabulary of vector `lint-0052` (one class under `asc:Concept`, two
// properties under `asc:uses` that are each other's inverse), read from the vector so the
// two can never drift. `FAULTS` holds one vocabulary per rule (a) to (g), each built from
// `VALID` by one change, with the number of `AGSC-E420` findings it must give and the rule
// letter every message must name. `tests/knowledge/domain.test.js` runs them through the
// engine's check (`src/knowledge/domain.js`) and `tests/tools/validate-ontology-parity.test.js`
// through both the engine and `tools/validate-ontology`, which must agree finding for finding.

const path = require('node:path');

const VECTORS = path.resolve(__dirname, '..', 'vectors', 'lint');
const vocabularyOf = (file) => require(path.join(VECTORS, file)).input.add_files['domain/vocabulary.ttl'];

/** The site vocabulary of `lint-0052`: it meets every rule. */
const VALID = vocabularyOf('lint-0052-site-vocabulary-accepted.json');

/** The site namespace of `VALID` and of every fault built from it. */
const NAMESPACE = 'https://minimal.example/ns/domain#';

/** `VALID` with the statements of `extra` (Turtle, using the prefixes of the file) added. */
const withExtra = (extra) => `${VALID}\n${extra}\n`;

/**
 * A property whose `owl:inverseOf` names `rdf:type`: the edge computed for it would type an item
 * by another item. Both sides of the statement must be object properties the file defines
 * (AGSC-05-38 (f)); the graph writer never materialises such a pair (AGSC-03-27).
 */
const INVERSE_OF_TYPE = 'dom:typeOf a owl:ObjectProperty ; rdfs:label "type of" ; rdfs:subPropertyOf asc:uses ; '
  + 'owl:inverseOf <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> .';

/**
 * One vocabulary per rule. `count` is the number of AGSC-E420 findings and `rule` the letter
 * every one of their messages names (`null` where the faults are of two rules).
 */
const FAULTS = Object.freeze([
  { name: 'a class under no item class and a class under two (vector lint-0053)', rule: '(e)', count: 2,
    text: vocabularyOf('lint-0053-site-class-needs-exactly-one-item-class.json') },
  { name: 'a property under no link property, and one with a domain (vector lint-0054)', rule: null, count: 2,
    text: vocabularyOf('lint-0054-site-property-needs-a-link-super-property-and-no-domain.json') },
  { name: 'owl:complementOf, outside OWL 2 RL (vector lint-0055)', rule: '(c)', count: 1,
    text: vocabularyOf('lint-0055-site-vocabulary-outside-owl-2-rl.json') },
  { name: 'CR line endings', rule: '(a)', count: 1, text: VALID.replace('\n', '\r\n') },
  { name: 'text that is not NFC', rule: '(a)', count: 1,
    text: withExtra('dom:Engine rdfs:comment "Café" .') },
  { name: 'a blank node', rule: '(a)', count: 1, text: withExtra('dom:Engine rdfs:seeAlso [ rdfs:label "x" ] .') },
  { name: 'no ontology', rule: '(a)', count: 1,
    text: VALID.replace('<https://minimal.example/ns/domain>\n    a owl:Ontology ;\n    rdfs:label "Minimal domain vocabulary" .\n', '') },
  { name: 'two ontologies', rule: '(a)', count: 1, text: withExtra('<https://minimal.example/ns/other> a owl:Ontology .') },
  { name: 'an ontology IRI that ends in "/"', rule: '(a)', count: 1,
    text: VALID.split('<https://minimal.example/ns/domain>').join('<https://minimal.example/ns/domain/>') },
  { name: 'not Turtle', rule: '(a)', count: 1, text: `${VALID}dom:Engine rdfs:label .\n` },
  { name: 'a term outside the site namespace', rule: '(b)', count: 1,
    text: withExtra('<https://elsewhere.example/Thing> a owl:Class ; rdfs:label "Thing" ; rdfs:subClassOf asc:Concept .') },
  { name: 'a term of the specification\'s own namespace', rule: '(b)', count: 1,
    text: withExtra('asc:Concept rdfs:label "Concept" .') },
  { name: 'a site namespace that is the specification\'s own, and the terms of the file outside it', rule: '(b)', count: 4,
    text: withExtra('asc:Turbine a owl:Class ; rdfs:label "Turbine" ; rdfs:subClassOf asc:Concept .')
      .replace('<https://minimal.example/ns/domain>\n', '<https://w3id.org/agentic-system-core/ns>\n') },
  { name: 'a term in a context namespace that is not declared', rule: '(b)', count: 1,
    text: withExtra('<https://minimal.example/ns/ops#Valve> a owl:Class ; rdfs:label "Valve" ; rdfs:subClassOf asc:Concept .') },
  { name: 'an annotation property used and not declared', rule: '(c)', count: 1,
    text: withExtra('dom:Engine <http://purl.org/dc/terms/title> "Engine" .') },
  { name: 'a class used and not declared', rule: '(c)', count: 1,
    text: withExtra('dom:Rotor a owl:Class ; rdfs:label "Rotor" ; rdfs:subClassOf asc:Concept , <https://elsewhere.example/Part> .') },
  { name: 'a type outside OWL 2 RL', rule: '(c)', count: 1, text: withExtra('dom:controls a owl:ReflexiveProperty .') },
  { name: 'a literal whose datatype is not an OWL 2 RL datatype', rule: '(c)', count: 1,
    text: withExtra('dom:Engine rdfs:comment "2026-01-01"^^<http://www.w3.org/2001/XMLSchema#date> .') },
  { name: 'a term with no label', rule: '(d)', count: 1, text: VALID.replace('    rdfs:label "Engine" ;\n', '') },
  { name: 'a datatype property', rule: null, count: 2,
    text: withExtra('dom:weight a owl:DatatypeProperty ; rdfs:label "weight" ; rdfs:subPropertyOf asc:uses .') },
  { name: 'an annotation property of the site', rule: '(f)', count: 1,
    text: withExtra('dom:note a owl:AnnotationProperty ; rdfs:label "note" .') },
  { name: 'a term that is neither a class nor a property', rule: '(e)', count: 1,
    text: withExtra('dom:thing rdfs:label "thing" .') },
  { name: 'a range', rule: '(g)', count: 1, text: withExtra('dom:controls rdfs:range dom:Engine .') },
  { name: 'an inverse that is rdf:type, which the file does not define', rule: '(f)', count: 1,
    text: withExtra(INVERSE_OF_TYPE) },
  { name: 'an inverse that is a link property, which the file only declares', rule: '(f)', count: 1,
    text: withExtra('dom:usedBy a owl:ObjectProperty ; rdfs:label "used by" ; rdfs:subPropertyOf asc:uses ; owl:inverseOf asc:uses .') },
  { name: 'an inverse that is a literal', rule: '(f)', count: 1,
    text: withExtra('dom:controls owl:inverseOf "controlled by" .') },
  // Amended 2026-11-10 (AGSC-05-38 (e), (f)): equivalence counts both ways, and every super-property is
  // a link property or a property of the file, so `prp-spo1` and `prp-eqp` state no other predicate.
  { name: 'a class equivalent to an item class', rule: '(e)', count: 1,
    text: withExtra('dom:Engine owl:equivalentClass asc:Concept .') },
  { name: 'a class equivalent to a class under another item class', rule: '(e)', count: 2,
    text: withExtra('dom:Run a owl:Class ; rdfs:label "Run" ; rdfs:subClassOf asc:Episode .\ndom:Engine owl:equivalentClass dom:Run .') },
  { name: 'a property equivalent to asc:uses, which takes no super-property', rule: '(f)', count: 1,
    text: withExtra('dom:employs a owl:ObjectProperty ; rdfs:label "employs" ; rdfs:subPropertyOf asc:uses ; owl:equivalentProperty asc:uses .') },
  { name: 'a super-property that is rdf:type', rule: '(f)', count: 1,
    text: withExtra('dom:typeOf a owl:ObjectProperty ; rdfs:label "type of" ; rdfs:subPropertyOf asc:uses , <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> .') },
  { name: 'a property equivalent to rdf:type', rule: '(f)', count: 1,
    text: withExtra('dom:typeOf a owl:ObjectProperty ; rdfs:label "type of" ; rdfs:subPropertyOf asc:uses ; owl:equivalentProperty <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> .') },
]);

/**
 * Vocabularies that meet every rule although they do more than `VALID`; `contexts` is the
 * `domain.contexts` of the configuration beside each (AGSC-01-41).
 */
const ACCEPTED = Object.freeze([
  { name: 'the vocabulary of lint-0052', text: VALID, contexts: [] },
  { name: 'a class under an item class through another class of the file', contexts: [],
    text: withExtra('dom:Turbofan a owl:Class ; rdfs:label "Turbofan" ; rdfs:subClassOf dom:Engine .') },
  { name: 'a property under a link property through another property of the file', contexts: [],
    text: withExtra('dom:throttles a owl:ObjectProperty ; rdfs:label "throttles" ; rdfs:subPropertyOf dom:controls .') },
  { name: 'a symmetric property and a property characteristic', contexts: [],
    text: withExtra('dom:pairedWith a owl:ObjectProperty , owl:SymmetricProperty ; rdfs:label "paired with" ; rdfs:subPropertyOf <http://www.w3.org/2004/02/skos/core#related> .') },
  { name: 'two classes of the file under the same item class, stated equivalent', contexts: [],
    text: withExtra('dom:Motor a owl:Class ; rdfs:label "Motor" ; rdfs:subClassOf asc:Concept ; owl:equivalentClass dom:Engine .') },
  { name: 'a property equivalent to a property of the file and one equivalent to skos:related', contexts: [],
    text: withExtra('dom:runs a owl:ObjectProperty ; rdfs:label "runs" ; owl:equivalentProperty dom:controls .\n'
      + 'dom:near a owl:ObjectProperty ; rdfs:label "near" ; owl:equivalentProperty <http://www.w3.org/2004/02/skos/core#related> .') },
  { name: 'a class in a declared context namespace', contexts: [{ cluster: 'ops', namespace: 'https://minimal.example/ns/ops#' }],
    text: withExtra('<https://minimal.example/ns/ops#Valve> a owl:Class ; rdfs:label "Valve" ; rdfs:subClassOf asc:Concept .') },
]);

module.exports = { ACCEPTED, FAULTS, INVERSE_OF_TYPE, NAMESPACE, VALID, withExtra };
