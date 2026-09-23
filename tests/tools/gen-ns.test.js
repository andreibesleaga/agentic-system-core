'use strict';
// tools/gen-ns — AGSC-09-90, PRD-054, AGSC-06-32, AGSC-06-06. The derivation is
// checked against the rule, the RDF/XML is round-tripped against the Turtle, and
// --check is exercised against both a conforming and a non-conforming /ns/ tree.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const { REPO, capture, envelope, tmpdir, tool, writeTree } = require('./helpers');

const {
  EXTERNAL, PREFIXES, buildContext, buildIndex, buildRdfXml, canonicalize,
  externalTermNames, readOntology, readRdfXml, turtleTriples,
} = tool('gen-ns');

const TTL = [
  '@prefix asc: <https://w3id.org/agentic-system-core/ns#> .',
  '@prefix owl: <http://www.w3.org/2002/07/owl#> .',
  '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
  '@prefix skos: <http://www.w3.org/2004/02/skos/core#> .',
  '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
  '',
  '<https://w3id.org/agentic-system-core/ns>',
  '    a owl:Ontology ;',
  '    owl:versionIRI <https://w3id.org/agentic-system-core/ns/1.0.0-draft.1> .',
  '',
  'asc:Concept',
  '    a owl:Class ;',
  '    rdfs:comment "A unit of knowledge." ;',
  '    rdfs:label "Concept" ;',
  '    rdfs:subClassOf skos:Concept .',
  '',
  'asc:uses',
  '    a owl:ObjectProperty ;',
  '    rdfs:label "uses" .',
  '',
  'asc:status',
  '    a owl:DatatypeProperty ;',
  '    rdfs:label "status" ;',
  '    rdfs:range xsd:string .',
  '',
].join('\n');

function nsRoot(turtle = TTL) {
  return writeTree(tmpdir(), {
    'ontology/agsc.ttl': turtle,
    'spec/00-overview.md': '`spec_version: "1.0.0-rc.5"`\n',
  });
}

describe('gen-ns — usage and the envelope', () => {
  it('--help exits 0; an unknown flag, a second argument and a bare --out exit 2', () => {
    assert.equal(capture('gen-ns', ['--help']).code, 0);
    assert.equal(capture('gen-ns', ['--nope']).code, 2);
    assert.equal(capture('gen-ns', [nsRoot(), nsRoot()]).code, 2);
    assert.equal(capture('gen-ns', ['--out']).code, 2);
    assert.equal(capture('gen-ns', ['--check']).code, 2);
  });

  it('a root with no ontology FAILS with AGSC-E901, exit 1', () => {
    // CHANGED at rc.6 (FIX29-S4): AGSC-09-90 now says a validator MUST FAIL "with
    // `AGSC-E901`" over an absent input, and AGSC-09-08 reserves exit 2 for a usage
    // error. An absent input is exit 1, the envelope and the code.
    const { code, json } = envelope('gen-ns', [tmpdir()]);
    assert.equal(code, 1);
    assert.equal(json.status, 'fail');
    assert.deepEqual(json.findings.map((f) => f.code), ['AGSC-E901']);
    assert.match(capture('gen-ns', [tmpdir()]).out, /0 input file\(s\) read/u);
  });

  it('the envelope has the AGSC-09-11 shape', () => {
    const { code, json } = envelope('gen-ns', [nsRoot()]);
    assert.equal(code, 0);
    assert.equal(json.verb, 'gen-ns');
    assert.equal(json.spec_version, '1.0.0-rc.5');
    assert.deepEqual(json.findings, []);
  });

  it('--quiet says nothing; the human output carries a summary line', () => {
    assert.equal(capture('gen-ns', ['--quiet', nsRoot()]).out, '');
    assert.match(capture('gen-ns', [nsRoot()]).out, /^gen-ns: 1 input file\(s\) read, 3 vocabulary terms, \d+ context members, \d+ triples round-tripped, 0 error, 0 warn\n$/u);
  });

  it('Turtle that does not parse is AGSC-E201 and stops the run', () => {
    const root = nsRoot('asc:Broken a owl:Class\n');
    const result = capture('gen-ns', [root]);
    assert.equal(result.code, 1);
    assert.match(result.err, /not well-formed Turtle/u);
    assert.equal(envelope('gen-ns', [root]).json.status, 'fail');
  });
});

describe('gen-ns — the derivation AGSC-06-32 fixes', () => {
  const vocabulary = () => readOntology(TTL);

  it('every asc: term becomes a term definition NAMED BY ITS LOCAL NAME, typed by its kind', () => {
    // CHANGED 2026-09-22 (NS-04, rc.6): AGSC-06-32 now pins the term NAMES as well
    // as the mapping — an `asc:` term is named by its local name, always — and
    // `src/knowledge/jsonld.js#termName`, which already did that, is the conforming
    // one. This tool named every `asc:` term `asc:<Term>`, so the file it generates
    // and the file the engine builds were two different files.
    const context = buildContext(vocabulary())['@context'];
    assert.deepEqual(context.Concept, { '@id': 'asc:Concept' });
    assert.deepEqual(context.uses, { '@id': 'asc:uses', '@type': '@id' });
    assert.deepEqual(context.status,
      { '@id': 'asc:status', '@type': 'http://www.w3.org/2001/XMLSchema#string' });
    assert.equal(context['asc:Concept'], undefined);
  });

  it('a datatype property with no declared range carries no @type', () => {
    const context = buildContext(readOntology(TTL.replace('    rdfs:range xsd:string .', '    rdfs:label "again" .')))['@context'];
    assert.deepEqual(context.status, { '@id': 'asc:status' });
  });

  it('the seven prefixes, @version and @protected are set', () => {
    const context = buildContext(vocabulary())['@context'];
    for (const prefix of Object.keys(PREFIXES)) assert.equal(context[prefix], PREFIXES[prefix]);
    assert.equal(context['@version'], 1.1);
    assert.equal(context['@protected'], true);
  });

  it('every external property a rule emits has a typed definition, and none is null', () => {
    const context = buildContext(vocabulary())['@context'];
    const names = externalTermNames(EXTERNAL);
    for (const [curie, type] of EXTERNAL) {
      const definition = context[names.get(curie)];
      assert.equal(definition['@id'], curie, curie);
      if (type) assert.equal(definition['@type'], type, curie);
    }
    assert.ok(Object.values(context).every((v) => v !== null));
  });

  it('a colliding local name is written in its prefixed form, and a unique one is not', () => {
    const names = externalTermNames(EXTERNAL);
    assert.equal(names.get('dcterms:license'), 'dcterms:license');
    assert.equal(names.get('schema:license'), 'schema:license');
    assert.equal(names.get('skos:prefLabel'), 'prefLabel');
  });

  it('the context file is JCS-canonical with exactly one trailing LF', () => {
    const out = path.join(tmpdir(), 'ns');
    capture('gen-ns', ['--quiet', '--out', out, nsRoot()]);
    const raw = fs.readFileSync(path.join(out, 'context.jsonld'), 'utf8');
    assert.equal(raw, `${canonicalize(JSON.parse(raw))}\n`);
  });

  it('--out writes the four targets of the AGSC-06-06 table, twice identically', () => {
    const root = nsRoot();
    const first = path.join(tmpdir(), 'a');
    const second = path.join(tmpdir(), 'b');
    capture('gen-ns', ['--quiet', '--out', first, root]);
    capture('gen-ns', ['--quiet', '--out', second, root]);
    const names = fs.readdirSync(first).sort();
    assert.deepEqual(names, ['agsc.rdf', 'agsc.ttl', 'context.jsonld', 'index.html']);
    for (const name of names) {
      assert.equal(fs.readFileSync(path.join(first, name), 'utf8'), fs.readFileSync(path.join(second, name), 'utf8'), name);
    }
  });

  it('the RDF/XML round-trips to the Turtle triples, language tags and datatypes included', () => {
    const turtle = TTL.replace('rdfs:label "Concept" ;', 'rdfs:label "Concept"@en ;')
      .replace('    a owl:Class ;', '    a owl:Class ;\n    owl:deprecated true ;')
      .replace('rdfs:comment "A unit of knowledge." ;',
        'rdfs:comment "A unit of knowledge with an <angle> & an \\"ampersand\\"." ;');
    const vocab = readOntology(turtle);
    const xml = buildRdfXml(vocab);
    assert.match(xml, /rdf:datatype="http:\/\/www\.w3\.org\/2001\/XMLSchema#boolean"/u);
    assert.match(xml, /xml:lang="en"/u);
    assert.deepEqual(readRdfXml(xml), turtleTriples(vocab));
  });

  it('a literal XML cannot carry unchanged fails the round trip with AGSC-E605', () => {
    // XML parsers normalise a CR in character data, so a CR in a literal cannot
    // survive RDF/XML: the round trip must say so rather than pass silently.
    const root = nsRoot(TTL.replace('rdfs:label "Concept" ;', 'rdfs:label "Con\\rcept" ;'));
    const result = capture('gen-ns', [root]);
    assert.equal(result.code, 1);
    assert.match(result.err, /AGSC-E605 the generated RDF\/XML does not round-trip/u);
  });

  it('the HTML index lists every term under its kind', () => {
    const html = buildIndex(vocabulary());
    assert.match(html, /<dt id="Concept"><code>asc:Concept<\/code> — Concept<\/dt>/u);
    assert.match(html, /<h2>Object properties<\/h2>/u);
    assert.match(html, /^<!DOCTYPE html>\n/u);
  });

  it('a predicate with no known prefix cannot be serialized', () => {
    const turtle = `${TTL}asc:Concept <https://example.test/odd> "x" .\n`;
    assert.throws(() => buildRdfXml(readOntology(turtle)), /no prefix for predicate/u);
  });
});

describe('gen-ns — --check against a tree on disk', () => {
  it('a tree this tool wrote passes', () => {
    const root = nsRoot();
    const out = path.join(tmpdir(), 'ns');
    capture('gen-ns', ['--quiet', '--out', out, root]);
    const { code, json } = envelope('gen-ns', ['--check', out, root]);
    assert.equal(code, 0);
    assert.deepEqual(json.findings, []);
  });

  it('a missing context is AGSC-E901, and missing siblings are warnings', () => {
    const { json } = envelope('gen-ns', ['--check', tmpdir(), nsRoot()]);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E901' && f.file === 'ns/context.jsonld'));
    assert.ok(json.findings.filter((f) => f.code === 'AGSC-E901' && f.severity === 'warn').length === 2);
  });

  it('a context that is not JSON, not an @context object, or not an object is reported', () => {
    const root = nsRoot();
    const dir = tmpdir();
    fs.writeFileSync(path.join(dir, 'context.jsonld'), '{ not json\n');
    assert.ok(envelope('gen-ns', ['--check', dir, root]).json.findings.some((f) => /not valid JSON/u.test(f.message)));
    fs.writeFileSync(path.join(dir, 'context.jsonld'), '{"@context":{},"extra":1}\n');
    assert.ok(envelope('gen-ns', ['--check', dir, root]).json.findings.some((f) => /not a single `@context` object/u.test(f.message)));
    fs.writeFileSync(path.join(dir, 'context.jsonld'), '{"@context":[]}\n');
    assert.ok(envelope('gen-ns', ['--check', dir, root]).json.findings.some((f) => /`@context` is not an object/u.test(f.message)));
  });

  it('missing asc: terms, a wrong definition, a missing prefix, a null term and a missing flag', () => {
    const root = nsRoot();
    const dir = tmpdir();
    const document = { '@context': { '@version': 1.0, asc: PREFIXES.asc, 'asc:uses': { '@id': 'asc:uses' }, prefLabel: null } };
    fs.writeFileSync(path.join(dir, 'context.jsonld'), `${canonicalize(document)}\n`);
    const { code, json } = envelope('gen-ns', ['--check', dir, root]);
    assert.equal(code, 1);
    const messages = json.findings.map((f) => f.message).join('\n');
    assert.match(messages, /`@version` is not 1\.1/u);
    assert.match(messages, /`@protected` is not true/u);
    assert.match(messages, /the prefix "skos" is undefined/u);
    assert.match(messages, /"prefLabel" is mapped to null/u);
    assert.match(messages, /term definition of "asc:uses" is/u);
    assert.match(messages, /carry no term definition, beginning with/u);
    assert.match(messages, /no term definition for skos:broader/u);
    // CHANGED 2026-09-21 (NS-06): the check resolves a term by `@id` now, so a term
    // NAMED `prefLabel` but mapped to null is "no term definition for
    // skos:prefLabel", not "the term prefLabel does not define @id".
    assert.match(messages, /no term definition for skos:prefLabel/u);
  });

  it('an external term with the wrong @id or the wrong @type is AGSC-E202', () => {
    const root = nsRoot();
    const dir = tmpdir();
    const context = buildContext(readOntology(TTL))['@context'];
    context.prefLabel = { '@id': 'skos:notPrefLabel' };
    context.broader = { '@id': 'skos:broader', '@type': 'http://www.w3.org/2001/XMLSchema#string' };
    fs.writeFileSync(path.join(dir, 'context.jsonld'), `${canonicalize({ '@context': context })}\n`);
    const { json } = envelope('gen-ns', ['--check', dir, root]);
    const messages = json.findings.map((f) => f.message).join('\n');
    assert.match(messages, /no term definition for skos:prefLabel/u);
    assert.match(messages, /the term "broader" carries @type/u);
  });

  // ---------------------------------------------------------------- NS-06
  // AGSC-06-32 pins a term's MAPPING and never its NAME. The check used to look
  // the 52 vocabulary terms up by key name, so it reported the conformant
  // hand-written site and a correct engine build as carrying "52 … no term
  // definition" — a validator that blocks merges (AGSC-09-92) failing on correct
  // output. These four cases hold the check name-independent.

  /**
   * The same context under the OTHER naming convention: the compact IRI.
   *
   * Since rc.6 (NS-04) the generator's own output names every `asc:` term by its
   * local name, so this helper now converts the other way — the point of the four
   * NS-06 cases is that the CHECK is name-independent, whichever convention the
   * file it reads was written under.
   */
  function underCompactNames(context) {
    const renamed = {};
    for (const [name, definition] of Object.entries(context)) {
      const compact = definition !== null && typeof definition === 'object'
        && typeof definition['@id'] === 'string' && definition['@id'].startsWith('asc:')
        ? definition['@id'] : name;
      renamed[compact] = definition;
    }
    return { '@context': renamed };
  }

  function checkOf(document, root = nsRoot()) {
    const dir = tmpdir();
    fs.writeFileSync(path.join(dir, 'context.jsonld'), `${canonicalize(document)}\n`);
    return envelope('gen-ns', ['--check', dir, root]);
  }

  it('a context that names every asc: term by its compact IRI passes (NS-06)', () => {
    const { code, json } = checkOf(underCompactNames(buildContext(readOntology(TTL))['@context']));
    assert.deepEqual(json.findings.filter((f) => f.severity === 'error'), []);
    assert.equal(code, 0);
  });

  it('a compact @id and an expanded @id are the same mapping (NS-06)', () => {
    const context = buildContext(readOntology(TTL))['@context'];
    delete context.uses;
    context['asc:uses'] = { '@id': `${PREFIXES.asc}uses`, '@type': '@id' };
    context.prefLabel = { '@id': 'http://www.w3.org/2004/02/skos/core#prefLabel' };
    assert.deepEqual(checkOf({ '@context': context }).json.findings.filter((f) => f.severity === 'error'), []);
  });

  it('the half-empty context — prefixes and externals, no asc: term — still fails', () => {
    const context = underCompactNames(buildContext(readOntology(TTL))['@context'])['@context'];
    for (const name of Object.keys(context)) if (name.startsWith('asc:')) delete context[name];
    const { code, json } = checkOf({ '@context': context });
    assert.equal(code, 1);
    assert.match(json.findings.map((f) => f.message).join('\n'),
      /3 of the vocabulary's terms carry no term definition/u);
  });

  it('a plain-literal property declared "@type": "@id" is AGSC-E202', () => {
    // AGSC-05-31(c): `schema:usageInfo` is a literal. Declaring it an IRI changes
    // the triple. The check used to run only where the table named a type, so a
    // spurious type on a plain literal passed.
    const context = buildContext(readOntology(TTL))['@context'];
    context.usageInfo = { '@id': 'schema:usageInfo', '@type': '@id' };
    assert.match(checkOf({ '@context': context }).json.findings.map((f) => f.message).join('\n'),
      /the term "usageInfo" carries @type "@id" and schema:usageInfo takes null/u);
  });

  it('two names for one IRI leave compaction a choice and are AGSC-E202', () => {
    const context = buildContext(readOntology(TTL))['@context'];
    context['asc:Concept'] = { '@id': 'asc:Concept' };
    assert.match(checkOf({ '@context': context }).json.findings.map((f) => f.message).join('\n'),
      /2 term definitions map to https:\/\/w3id\.org\/agentic-system-core\/ns#Concept \(Concept, asc:Concept\)/u);
  });

  it('a context that is not JCS-canonical is AGSC-E601, and byte drift is a warning', () => {
    const root = nsRoot();
    const dir = tmpdir();
    const document = buildContext(readOntology(TTL));
    fs.writeFileSync(path.join(dir, 'context.jsonld'), `${JSON.stringify(document, null, 2)}\n`);
    const { json } = envelope('gen-ns', ['--check', dir, root]);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E601'));
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E602' && f.severity === 'warn'));
  });

  it('a sibling whose bytes differ is a warning', () => {
    const root = nsRoot();
    const out = path.join(tmpdir(), 'ns');
    capture('gen-ns', ['--quiet', '--out', out, root]);
    fs.writeFileSync(path.join(out, 'agsc.rdf'), '<?xml version="1.0"?>\n');
    const { json } = envelope('gen-ns', ['--check', out, root]);
    assert.ok(json.findings.some((f) => f.file === 'ns/agsc.rdf' && f.code === 'AGSC-E602'));
  });
});

describe('gen-ns — the real distribution', () => {
  it('derives 52 terms from the shipped ontology and round-trips 278 triples', () => {
    const result = capture('gen-ns', [REPO]);
    assert.equal(result.code, 0);
    assert.match(result.out, /^gen-ns: 1 input file\(s\) read, 52 vocabulary terms, 85 context members, 278 triples round-tripped, 0 error, 0 warn\n$/u);
  });

  it('the derived context is byte-identical on two runs', () => {
    const a = path.join(tmpdir(), 'a');
    const b = path.join(tmpdir(), 'b');
    capture('gen-ns', ['--quiet', '--out', a, REPO]);
    capture('gen-ns', ['--quiet', '--out', b, REPO]);
    assert.equal(fs.readFileSync(path.join(a, 'context.jsonld'), 'utf8'),
      fs.readFileSync(path.join(b, 'context.jsonld'), 'utf8'));
  });
});
