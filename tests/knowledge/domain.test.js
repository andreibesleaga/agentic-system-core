'use strict';
// verifies AGSC-05-38, AGSC-01-41
// The site vocabulary (AGSC-05-38) and the configuration of the domain layer (AGSC-01-41):
// the rules (a) to (g) a vocabulary file meets, the model the graph writer reads from it,
// and the faults of the `domain` object. Offline and deterministic: fixed seed, no clock,
// no network. The whole-file cases are the vectors lint-0052 to lint-0055 and bundle-0020.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');
const domain = require('../../src/knowledge/domain.js');
const { ACCEPTED, FAULTS, NAMESPACE, VALID, withExtra } = require('./_domain-fixtures.js');

const RUNS = { numRuns: 60, seed: 20261102, verbose: 0 };
const FILE = 'domain/vocabulary.ttl';
const ASC = 'https://w3id.org/agentic-system-core/ns#';

test('a vocabulary that meets the rules (a) to (g) raises nothing', () => {
  for (const { name, text, contexts } of ACCEPTED) {
    assert.deepStrictEqual(domain.check(text, { contexts, file: FILE }), [], name);
  }
});

test('each fault is the error AGSC-E420 on the vocabulary file, naming its rule', () => {
  for (const { name, text, count, rule } of FAULTS) {
    const findings = domain.check(text, { contexts: [], file: FILE });
    assert.strictEqual(findings.length, count, `${name}: ${JSON.stringify(findings)}`);
    for (const f of findings) {
      assert.deepStrictEqual([f.code, f.severity, f.file], ['AGSC-E420', 'error', FILE], name);
      assert.ok(f.message.includes('AGSC-05-38'), f.message);
      if (rule !== null) assert.ok(f.message.includes(rule), `${name}: ${f.message}`);
    }
  }
});

test('a namespace the configuration declares as a context admits the terms under it, and only then', () => {
  const text = ACCEPTED.find((a) => a.contexts.length > 0).text;
  assert.strictEqual(domain.check(text, { contexts: [], file: FILE }).length, 1);
  assert.deepStrictEqual(domain.check(text, { contexts: [{ cluster: 'ops', namespace: 'https://minimal.example/ns/ops#' }], file: FILE }), []);
});

test('the findings are sorted and the same for the same text, whatever order the statements are in', () => {
  const blocks = withExtra('dom:Widget a owl:Class ; rdfs:label "Widget" .\ndom:floats a owl:ObjectProperty ; rdfs:label "floats" .')
    .split('\n\n');
  const prefixes = blocks[0];
  fc.assert(fc.property(fc.shuffledSubarray(blocks.slice(1), { minLength: blocks.length - 1 }), (shuffled) => {
    const text = `${[prefixes, ...shuffled].join('\n\n').trimEnd()}\n`;
    const once = domain.check(text, { contexts: [], file: FILE });
    assert.deepStrictEqual(once.map((f) => f.message), domain.check(`${[prefixes, ...blocks.slice(1)].join('\n\n').trimEnd()}\n`, { contexts: [], file: FILE }).map((f) => f.message));
    assert.deepStrictEqual(domain.check(text, { contexts: [], file: FILE }), once);
    assert.strictEqual(once.length, 2);
  }), RUNS);
});

test('the model: every triple of the file, as terms of the graph writer', () => {
  const model = domain.load(VALID, { contexts: [] });
  assert.strictEqual(model.namespace, NAMESPACE);
  assert.strictEqual(model.ontology, 'https://minimal.example/ns/domain');
  assert.strictEqual(model.triples.length, 21);
  const label = model.triples.find(([s, p]) => s.value === `${NAMESPACE}Engine` && p.value.endsWith('#label'));
  assert.deepStrictEqual(label[2], { termType: 'literal', value: 'Engine', datatype: 'http://www.w3.org/2001/XMLSchema#string' });
  const definition = model.triples.find(([s, p]) => s.value === `${NAMESPACE}Engine` && p.value.endsWith('#definition'));
  assert.strictEqual(definition[2].lang, 'en');
});

test('the model leaves out a statement with a blank node, and a text that is not Turtle has none', () => {
  const model = domain.load(withExtra('dom:Engine rdfs:seeAlso [ rdfs:label "x" ] .'), { contexts: [] });
  assert.strictEqual(model.triples.length, 21);
  assert.strictEqual(domain.load('not turtle at all', { contexts: [] }), null);
});

test('a domain type names a class of the site namespace, or of the context the item is in (AGSC-02-25)', () => {
  const contexts = [{ cluster: 'ops', namespace: 'https://minimal.example/ns/ops#' }];
  const model = domain.load(withExtra('<https://minimal.example/ns/ops#Valve> a owl:Class ; rdfs:label "Valve" ; rdfs:subClassOf asc:Concept .'), { contexts });
  assert.strictEqual(model.classFor({ domain_type: 'Engine' }), `${NAMESPACE}Engine`);
  assert.strictEqual(model.classFor({ domain_type: 'Valve' }), null);
  assert.strictEqual(model.classFor({ domain_type: 'Valve', domain_context: 'ops' }), 'https://minimal.example/ns/ops#Valve');
  assert.strictEqual(model.classFor({ domain_type: 'Valve', clusters: ['ops', 'other'] }), 'https://minimal.example/ns/ops#Valve');
  assert.strictEqual(model.classFor({ domain_type: 'Valve', clusters: ['other', 'ops'] }), null);
  assert.strictEqual(model.classFor({ domain_type: 'Engine', domain_context: 'ops' }), null);
  assert.strictEqual(model.classFor({ domain_type: 'controls' }), null, 'a property is not a class');
  assert.strictEqual(model.classFor({}), null);
  assert.strictEqual(model.contextOf({ domain_context: 'undeclared', clusters: ['ops'] }), 'ops');
  assert.strictEqual(model.contextOf({ clusters: 'ops' }), null, 'clusters[] is an array');
});

test('a domain link names an object property, with the edge the vocabulary materialises (AGSC-03-27)', () => {
  const model = domain.load(withExtra([
    'dom:pairedWith a owl:ObjectProperty , owl:SymmetricProperty ; rdfs:label "paired with" ; rdfs:subPropertyOf skos:related .',
    'dom:feeds a owl:ObjectProperty ; rdfs:label "feeds" ; rdfs:subPropertyOf asc:uses ; owl:inverseOf dom:fedBy .',
    'dom:fedBy a owl:ObjectProperty ; rdfs:label "fed by" ; rdfs:subPropertyOf asc:uses .',
    'dom:narrows a owl:ObjectProperty ; rdfs:label "narrows" ; rdfs:subPropertyOf dom:widens .',
    'dom:widens a owl:ObjectProperty ; rdfs:label "widens" ; rdfs:subPropertyOf skos:broader .',
  ].join('\n')), { contexts: [] });
  assert.deepStrictEqual(model.propertyFor({}, 'controlled-by'),
    { conceptOnly: false, inverse: `${NAMESPACE}controls`, iri: `${NAMESPACE}controlled-by`, symmetric: false });
  assert.deepStrictEqual(model.propertyFor({}, 'pairedWith'),
    { conceptOnly: true, inverse: null, iri: `${NAMESPACE}pairedWith`, symmetric: true });
  assert.strictEqual(model.propertyFor({}, 'feeds').inverse, `${NAMESPACE}fedBy`);
  assert.strictEqual(model.propertyFor({}, 'fedBy').inverse, `${NAMESPACE}feeds`, 'owl:inverseOf runs both ways');
  assert.strictEqual(model.propertyFor({}, 'narrows').conceptOnly, true, 'through another property of the file');
  assert.strictEqual(model.propertyFor({}, 'Engine'), null, 'a class is not a property');
  assert.strictEqual(model.propertyFor({}, 'unknown'), null);
});

test('a vocabulary with no valid ontology has no site namespace, so nothing resolves in it', () => {
  const model = domain.load(withExtra('<https://minimal.example/ns/other> a owl:Ontology .'), { contexts: [] });
  assert.strictEqual(model.namespace, null);
  assert.strictEqual(model.classFor({ domain_type: 'Engine' }), null);
  assert.strictEqual(model.propertyFor({}, 'controls'), null);
});

test('the item classes and the link properties are the six and the fourteen of the specification', () => {
  assert.deepStrictEqual(domain.ITEM_CLASSES, ['Concept', 'Lesson', 'Episode', 'Procedure', 'Cluster', 'Gate'].map((c) => `${ASC}${c}`));
  assert.strictEqual(domain.LINK_PROPERTIES.length, 14);
  assert.ok(domain.LINK_PROPERTIES.includes('http://www.w3.org/ns/prov#wasDerivedFrom'));
});

// ------------------------------------------------------------------- AGSC-01-41

const CLUSTERS = [{ slug: 'propulsion', type: 'cluster' }, { slug: 'engine-a', type: 'concept' }];
const codesOf = (findings) => findings.map((f) => f.code);

test('the domain object: a valid one raises nothing, and no domain object is not checked at all', () => {
  assert.deepStrictEqual(domain.configFindings({}, { items: CLUSTERS }), []);
  assert.deepStrictEqual(domain.configFindings({ domain: {
    contexts: [{ cluster: 'propulsion', namespace: 'https://minimal.example/ns/propulsion#' }],
    questions: 'domain/questions.json', shapes: 'domain/shapes.ttl', vocabulary: 'domain/vocabulary.ttl',
  } }, { items: CLUSTERS }), []);
});

test('a path under content/, dist/ or build.out is AGSC-E204, compared without regard to case', () => {
  for (const named of ['content', 'content/v.ttl', 'Dist/v.ttl', 'www/v.ttl', 'site/out/v.ttl']) {
    const config = { build: { out: named.startsWith('site') ? 'site/out/' : undefined }, domain: { vocabulary: named } };
    const findings = domain.configFindings(config, { items: [] });
    assert.deepStrictEqual(codesOf(findings), ['AGSC-E204'], named);
    assert.ok(findings[0].message.includes('domain.vocabulary'), findings[0].message);
  }
  assert.deepStrictEqual(domain.configFindings({ domain: { shapes: 'contents/s.ttl', questions: 'distribution/q.json' } }, { items: [] }), []);
});

test('a context for a slug that is no cluster item is AGSC-E301; a repeated cluster or namespace is AGSC-E209', () => {
  const ns = (name) => `https://minimal.example/ns/${name}#`;
  const findings = domain.configFindings({ domain: { contexts: [
    { cluster: 'ghost', namespace: ns('ghost') },
    { cluster: 'engine-a', namespace: ns('engine') },
    { cluster: 'propulsion', namespace: ns('one') },
    { cluster: 'propulsion', namespace: ns('two') },
    { cluster: 'other', namespace: ns('one') },
  ] } }, { items: CLUSTERS });
  assert.deepStrictEqual(codesOf(findings), ['AGSC-E301', 'AGSC-E301', 'AGSC-E209', 'AGSC-E301', 'AGSC-E209']);
  assert.ok(findings.every((f) => f.file === 'agsc.config.json' && f.severity === 'error'));
});

test('a context namespace that is the vocabulary namespace of AGSC-05-02 is AGSC-E209 (AGSC-08-32)', () => {
  const findings = domain.configFindings({ domain: { contexts: [{ cluster: 'propulsion', namespace: ASC }] } }, { items: CLUSTERS });
  assert.deepStrictEqual(codesOf(findings), ['AGSC-E209']);
  assert.match(findings[0].message, /vocabulary namespace of AGSC-05-02/u);
});

test('the schema half of AGSC-01-41: a namespace outside the form is AGSC-E209, and a repeated entry is reported once', () => {
  const { readSchemas } = require('../../src/adapters/node-fs.js');
  const validate = require('../../src/knowledge/validate.js');
  const schemas = validate.schemas(readSchemas(require('node:path').resolve(__dirname, '..', '..')));
  const entry = { cluster: 'propulsion', namespace: 'http://minimal.example/ns#' };
  const config = (contexts) => ({ bundle: { id: 'minimal', license_prose: 'CC0-1.0', license_schema: 'CC0-1.0', operator: 'human:tester' },
    domain: { contexts }, site: { base: 'https://minimal.example/', tdm_crawlers: ['CCBot'], title: 'Minimal' }, spec_version: '1.0.0' });
  assert.deepStrictEqual(codesOf(validate.config(config([entry]), { schemas })), ['AGSC-E209']);
  const valid = { cluster: 'propulsion', namespace: 'https://minimal.example/ns#' };
  assert.deepStrictEqual(codesOf(validate.config(config([valid, valid]), { schemas })), []);
  assert.deepStrictEqual(codesOf(domain.configFindings(config([valid, valid]), { items: CLUSTERS })), ['AGSC-E209', 'AGSC-E209']);
});
