'use strict';
// The 1.0.0 vocabulary file and the check that guards it (AGSC-05-22, AGSC-05-25,
// AGSC-05-28, AGSC-09-90).
//
//   * The whole file is inside OWL 2 RL as an OWL 2 profile checker reads it: every
//     annotation property of the ontology node and every class of another vocabulary
//     the file names is declared, one triple each, and nothing else about those
//     entities is said here.
//   * `tools/validate-ontology` rejects what a profile checker rejects: a datatype
//     outside the OWL 2 RL list (OWL 2 Profiles §4.2: `xsd:date` is not on it, and
//     `owl:real` and `owl:rational` MUST NOT be used), and a class or an annotation
//     property used without its declaration. Each fault is a mutated copy of the
//     shipped file, so the test proves the check on the real vocabulary.
//   * The version, the dates and the comments of the 1.0.0 file are the ones the
//     rules state, because the file becomes immutable at `/ns/1.0.0/`.
//
// Deterministic: no clock, no network; the mutated copies are written under the
// system temporary directory and removed when the process exits.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { Parser } = require('n3');
const { capture, envelope, tmpdir, writeTree } = require('../tools/helpers.js');

const ROOT = path.resolve(__dirname, '..', '..');
const TTL = fs.readFileSync(path.join(ROOT, 'ontology', 'agsc.ttl'), 'utf8');
const QUADS = new Parser({ format: 'text/turtle' }).parse(TTL);

const NS = 'https://w3id.org/agentic-system-core/ns#';
const ONTOLOGY = 'https://w3id.org/agentic-system-core/ns';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL = 'http://www.w3.org/2002/07/owl#';
const DCTERMS = 'http://purl.org/dc/terms/';
const VANN = 'http://purl.org/vocab/vann/';
const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const PROV = 'http://www.w3.org/ns/prov#';
const VOAF = 'http://purl.org/vocommons/voaf#';

const objects = (s, p) => QUADS.filter((q) => q.subject.value === s && q.predicate.value === p).map((q) => q.object);
const one = (s, p) => {
  const found = objects(s, p);
  assert.strictEqual(found.length, 1, `<${s}> carries ${found.length} <${p}>, not one`);
  return found[0];
};
const comment = (local) => one(`${NS}${local}`, `${RDFS}comment`).value;

/** The shipped file with `from` replaced by `to` (exactly once), as a root the tool reads. */
function mutated(from, to) {
  assert.strictEqual(TTL.split(from).length, 2, `the mutation anchor ${JSON.stringify(from)} is not unique`);
  return writeTree(tmpdir(), {
    'ontology/agsc.ttl': TTL.replace(from, to),
    'spec/00-overview.md': fs.readFileSync(path.join(ROOT, 'spec', '00-overview.md'), 'utf8'),
  });
}
const findingsOf = (root) => envelope('validate-ontology', [root]).json.findings;

// ---------------------------------------------------------------- declarations

const ANNOTATION_PROPERTIES = [
  `${DCTERMS}creator`, `${DCTERMS}description`, `${DCTERMS}issued`, `${DCTERMS}license`,
  `${DCTERMS}modified`, `${DCTERMS}publisher`, `${DCTERMS}title`,
  `${VANN}preferredNamespacePrefix`, `${VANN}preferredNamespaceUri`, `${SKOS}definition`,
];
const EXTERNAL_CLASSES = [
  `${VOAF}Vocabulary`,
  `${SKOS}Collection`, `${SKOS}Concept`, `${SKOS}ConceptScheme`,
  `${PROV}Activity`, `${PROV}Entity`, `${PROV}Plan`,
];

test('the file declares the ten annotation properties and the seven classes of other vocabularies it uses (AGSC-05-25)', () => {
  for (const iri of ANNOTATION_PROPERTIES) {
    assert.deepStrictEqual(objects(iri, RDF_TYPE).map((o) => o.value), [`${OWL}AnnotationProperty`], `${iri} is not declared`);
  }
  for (const iri of EXTERNAL_CLASSES) {
    assert.deepStrictEqual(objects(iri, RDF_TYPE).map((o) => o.value), [`${OWL}Class`], `${iri} is not declared`);
  }
  // A declaration is all the file says about another vocabulary's entity.
  const external = QUADS.filter((q) => q.subject.value !== ONTOLOGY && !q.subject.value.startsWith(NS));
  assert.strictEqual(external.length, ANNOTATION_PROPERTIES.length + EXTERNAL_CLASSES.length);
  assert.ok(external.every((q) => q.predicate.value === RDF_TYPE));
});

test('every class the file names and every annotation predicate it uses is declared in it', () => {
  const declared = (iri, type) => objects(iri, RDF_TYPE).some((o) => o.value === type);
  const BUILT_IN = new Set([`${OWL}Thing`, `${OWL}Ontology`, `${OWL}Class`, `${OWL}ObjectProperty`,
    `${OWL}DatatypeProperty`, `${OWL}AnnotationProperty`, `${OWL}SymmetricProperty`, `${OWL}IrreflexiveProperty`]);
  for (const q of QUADS) {
    const p = q.predicate.value;
    if (!p.startsWith(OWL) && !p.startsWith(RDFS) && p !== RDF_TYPE) {
      assert.ok(declared(p, `${OWL}AnnotationProperty`), `<${p}> is used and not declared`);
    }
    const classPosition = p === `${RDFS}subClassOf` || (p === RDF_TYPE && !BUILT_IN.has(q.object.value))
      || (p === `${RDFS}range` && !q.object.value.startsWith('http://www.w3.org/2001/XMLSchema#'))
      || p === `${RDFS}domain`;
    if (classPosition) assert.ok(declared(q.object.value, `${OWL}Class`), `<${q.object.value}> is used as a class and not declared`);
  }
});

test('the subjects keep the stable Turtle profile: code-point order, one block each', () => {
  const subjects = [...TTL.matchAll(/^(\S+)\n {4}a /gmu)].map((m) => m[1]);
  const prefixes = Object.fromEntries([...TTL.matchAll(/^@prefix (\w+): <([^>]+)> \.$/gmu)].map((m) => [m[1], m[2]]));
  const iri = (name) => (name.startsWith('<') ? name.slice(1, -1) : `${prefixes[name.split(':')[0]]}${name.split(':')[1]}`);
  const expanded = subjects.map(iri);
  const sorted = [...expanded].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  assert.deepStrictEqual(expanded, sorted);
  assert.strictEqual(new Set(expanded).size, expanded.length);
  assert.strictEqual(new Set(QUADS.map((q) => q.subject.value)).size, expanded.length);
});

// ---------------------------------------------------------------- the check

test('the shipped file passes the check with 12 classes and 40 properties: declarations are not terms', () => {
  const result = capture('validate-ontology', [ROOT]);
  assert.strictEqual(result.err, '');
  assert.strictEqual(result.code, 0);
  assert.match(result.out, / 12 classes, 40 properties, 0 error, 0 warn\n$/u);
});

test('a datatype property ranged over xsd:date is AGSC-E203: xsd:date is not an OWL 2 RL datatype', () => {
  const findings = findingsOf(mutated('rdfs:label "consumes" ;\n    rdfs:range xsd:string .', 'rdfs:label "consumes" ;\n    rdfs:range xsd:date .'));
  assert.ok(findings.some((f) => f.code === 'AGSC-E203' && f.message.includes('XMLSchema#date>') && f.message.includes('#consumes>')),
    JSON.stringify(findings));
});

test('a range of owl:real is AGSC-E203: owl:real MUST NOT be used in OWL 2 RL', () => {
  const findings = findingsOf(mutated('rdfs:label "consumes" ;\n    rdfs:range xsd:string .', 'rdfs:label "consumes" ;\n    rdfs:range owl:real .'));
  assert.ok(findings.some((f) => f.code === 'AGSC-E203' && f.message.includes('owl#real>')), JSON.stringify(findings));
});

test('a term literal typed owl:rational is AGSC-E203, and the ontology node keeps its xsd:date metadata', () => {
  const findings = findingsOf(mutated('rdfs:label "consumes" ;', 'rdfs:label "1"^^owl:rational ;'));
  assert.ok(findings.some((f) => f.code === 'AGSC-E203' && f.message.includes('owl#rational>')), JSON.stringify(findings));
  // `dcterms:issued`/`modified` are xsd:date on the ontology node, which AGSC-05-22
  // leaves out of its scope; the shipped file carries them and passes.
  assert.strictEqual(one(ONTOLOGY, `${DCTERMS}issued`).datatype.value, 'http://www.w3.org/2001/XMLSchema#date');
});

test('a class of another vocabulary used undeclared is AGSC-E203', () => {
  const findings = findingsOf(mutated('skos:Concept\n    a owl:Class .\n\n', ''));
  assert.ok(findings.some((f) => f.code === 'AGSC-E203' && f.message.includes('core#Concept>') && /not declared/u.test(f.message)),
    JSON.stringify(findings));
});

test('an annotation property used undeclared is AGSC-E203', () => {
  const findings = findingsOf(mutated('dcterms:creator\n    a owl:AnnotationProperty .\n\n', ''));
  assert.ok(findings.some((f) => f.code === 'AGSC-E203' && f.message.includes('terms/creator>') && /not declared/u.test(f.message)),
    JSON.stringify(findings));
});

test('a declaration that carries more than its type, or declares what nothing uses, is AGSC-E204', () => {
  const more = findingsOf(mutated('skos:Concept\n    a owl:Class .', 'skos:Concept\n    a owl:Class ;\n    rdfs:label "Concept" .'));
  assert.ok(more.some((f) => f.code === 'AGSC-E204' && f.message.includes('core#Concept>')), JSON.stringify(more));
  const unused = findingsOf(mutated('skos:Concept\n    a owl:Class .', 'skos:Concept\n    a owl:Class .\n\nskos:Unused\n    a owl:Class .'));
  assert.ok(unused.some((f) => f.code === 'AGSC-E204' && f.message.includes('core#Unused>')), JSON.stringify(unused));
});

// ---------------------------------------------------------------- version, dates, comments

test('the 1.0.0 version and the dates the rule states (AGSC-05-25)', () => {
  assert.strictEqual(one(ONTOLOGY, `${OWL}versionIRI`).value, 'https://w3id.org/agentic-system-core/ns/1.0.0');
  assert.strictEqual(one(ONTOLOGY, `${OWL}versionInfo`).value, '1.0.0');
  // The first published tagged release that carried the vocabulary.
  assert.strictEqual(one(ONTOLOGY, `${DCTERMS}issued`).value, '2026-09-29');
  assert.match(one(ONTOLOGY, `${DCTERMS}modified`).value, /^\d{4}-\d{2}-\d{2}$/u);
});

test('the modification date is the date of the release that ships this version of the file (AGSC-05-25)', () => {
  // The rule derives `modified` from the release, never from a clock, and the copy
  // served under the version IRI never changes once it is served, so the date is
  // held equal to the release's own date in the change log and in the citation file.
  const version = one(ONTOLOGY, `${OWL}versionInfo`).value;
  const modified = one(ONTOLOGY, `${DCTERMS}modified`).value;
  const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  const heading = changelog.split('\n').find((line) => line.startsWith(`## [${version}] - `));
  assert.ok(heading, `the change log has no section for version ${version}`);
  assert.strictEqual(modified, heading.slice(`## [${version}] - `.length));
  const citation = fs.readFileSync(path.join(ROOT, 'CITATION.cff'), 'utf8');
  const field = (name) => (citation.split('\n').find((line) => line.startsWith(`${name}: `)) || '').slice(name.length + 2);
  if (field('version') === version) assert.strictEqual(modified, field('date-released'));
});

test('the header names every section a property may be emitted by, and the dates as the rule words them', () => {
  assert.ok(TTL.includes('# emitted by a rule of spec/05 sections 5.3, 5.6 and 5.7 or of spec/11 (AGSC-05-28)'));
  assert.ok(!TTL.includes('section 5.6 (AGSC-05-26..28)'));
  assert.ok(TTL.includes('the first published tagged release'));
  assert.ok(!TTL.includes('first issued'));
});

test('the comments of the 1.0.0 file say what the rules say', () => {
  assert.strictEqual(comment('Gate'),
    'A declared set of checks that a change must pass; the verdict of a run is the file dist/gate.json that the ci verb writes (AGSC-08-10), not an item.');
  assert.strictEqual(comment('Procedure'),
    'An executable-by-a-reader plan: trigger, steps and checks. Wrapped in the published skill pack of every Cluster it is a member of (AGSC-07-19), and rendered as its own SKILL.md in a Harness that selects it (AGSC-07-12).');
  assert.strictEqual(comment('Proposal'),
    'A proposed change to a Bundle. It has no file: it is a forge pull request, and at 1.0 no triple instantiates it (AGSC-05-28).');
  assert.strictEqual(comment('operator'),
    'Person accountable for an item, written human:<id>: the human running the agent that produced it, or its author (AGSC-02-07).');
  assert.ok(comment('Harness').includes('a validated composition of items'));
  assert.ok(!comment('blockedBy').includes('AGSC-05-26a'), 'AGSC-05-26a governs only uses, excludes and contradicts');
  assert.ok(!comment('Lesson').includes('distilled from one or more Episodes'), 'derived-from is a SHOULD (AGSC-02-16)');
  assert.ok(comment('Lesson').includes('AGSC-02-16'));
  assert.ok(comment('contradicts').includes('in the result of a composition'));
  assert.ok(!comment('contradicts').includes('Selecting both'));
});
