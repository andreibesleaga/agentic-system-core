'use strict';
// Unit tests for `src/knowledge/jsonld.js` — the context file (AGSC-06-32), the
// `memory://` alias (AGSC-05-04b) and the JSON-LD view (AGSC-05-09).
// The expand / re-compact round trip itself lives in `jsonld-roundtrip.test.js`,
// because it needs the asynchronous reference processor.

const test = require('node:test');
const assert = require('node:assert');

const jsonld = require('../../src/knowledge/jsonld.js');
const turtle = require('../../src/knowledge/turtle.js');
const jcs = require('../../src/knowledge/jcs.js');
const fixture = require('./_graph-fixture.js');

const fullContext = () => jsonld.context(
  turtle.ontologyTerms(fixture.ontologyText()),
  jsonld.allExternalProperties(),
);

test('the context declares @version 1.1, @protected and the seven prefixes (AGSC-06-32)', () => {
  const c = fullContext()['@context'];
  assert.strictEqual(c['@version'], 1.1);
  assert.strictEqual(c['@protected'], true);
  assert.deepStrictEqual(Object.keys(c).filter((k) => typeof c[k] === 'string').sort(),
    ['asc', 'dcterms', 'prov', 'rdfs', 'schema', 'skos', 'xsd']);
});

test('an object property is @id and a datatype property carries its expanded range (AGSC-06-32)', () => {
  const c = fullContext()['@context'];
  assert.deepStrictEqual(c.hasAttachment, { '@id': 'asc:hasAttachment', '@type': '@id' });
  assert.deepStrictEqual(c.produces, { '@id': 'asc:produces', '@type': 'http://www.w3.org/2001/XMLSchema#string' });
  assert.deepStrictEqual(c.Concept, { '@id': 'asc:Concept' });
});

test('no term is ever mapped to null (AR2-44)', () => {
  const c = fullContext()['@context'];
  assert.ok(Object.values(c).every((definition) => definition !== null));
});

test('every IRI is mapped by exactly one term, so compaction has no choice (AGSC-06-32)', () => {
  const c = fullContext()['@context'];
  const ids = Object.values(c).filter((d) => d && typeof d === 'object').map((d) => d['@id']);
  assert.strictEqual(new Set(ids).size, ids.length);
});

test('a colliding local name is keyed by its compact IRI', () => {
  const c = fullContext()['@context'];
  // `source` is taken by asc:source (AGSC-05-14), and `license` by two vocabularies
  assert.deepStrictEqual(c.source, { '@id': 'asc:source', '@type': '@id' });
  assert.deepStrictEqual(c['dcterms:source'], { '@id': 'dcterms:source' });
  assert.deepStrictEqual(c['dcterms:license'], { '@id': 'dcterms:license' });
  assert.deepStrictEqual(c['schema:license'], { '@id': 'schema:license' });
  assert.deepStrictEqual(c.seeAlso, { '@id': 'rdfs:seeAlso', '@type': '@id' });
});

test('only the external properties actually asked for are defined (AGSC-06-32)', () => {
  const c = jsonld.context([], ['rdfs:seeAlso'])['@context'];
  assert.deepStrictEqual(Object.keys(c).filter((k) => typeof c[k] === 'object'), ['seeAlso']);
  assert.strictEqual(jsonld.allExternalProperties().length, jsonld.EXTERNAL_PROPERTIES.length);
});

test('a compact name expands against the prefix table, and anything else is left alone', () => {
  assert.strictEqual(jsonld.expandCompact('xsd:string'), 'http://www.w3.org/2001/XMLSchema#string');
  assert.strictEqual(jsonld.expandCompact('https://e.org/a'), 'https://e.org/a');
  assert.strictEqual(jsonld.expandCompact('nope:thing'), 'nope:thing');
  assert.strictEqual(jsonld.expandCompact('plain'), 'plain');
});

test('memory:// resolves for this Bundle and is AGSC-E309 for another (AGSC-05-04b)', () => {
  assert.deepStrictEqual(jsonld.resolveMemory('memory://example/a2a', { bundleId: 'example' }), { slug: 'a2a' });
  assert.deepStrictEqual(jsonld.resolveMemory('a2a', { bundleId: 'example' }), { slug: 'a2a' });
  const foreign = jsonld.resolveMemory('memory://other/a2a', { bundleId: 'example' });
  assert.strictEqual(foreign.finding.code, 'AGSC-E309');
  assert.strictEqual(foreign.finding.severity, 'error');
  // a bare `memory://` with no slug is not the alias form and stays a slug argument
  assert.deepStrictEqual(jsonld.resolveMemory('memory://example/', { bundleId: 'example' }), { slug: 'memory://example/' });
});

test('graph.jsonld references the versioned context and sorts nodes by @id (AGSC-05-09)', () => {
  const document = jsonld.toJsonLd(fixture.ITEMS, fixture.options({ context: fullContext() }));
  assert.strictEqual(document['@context'], fixture.CONTEXT_URL);
  const ids = document['@graph'].map((node) => node['@id']);
  assert.deepStrictEqual(ids, [...ids].sort());
  assert.ok(ids.every((id) => !id.startsWith('memory://')));
});

test('a single value is a scalar, several are an array, and the types are terms', () => {
  const document = jsonld.toJsonLd(fixture.ITEMS, fixture.options({ context: fullContext() }));
  const node = document['@graph'].find((n) => n['@id'].endsWith('/concepts/a2a/'));
  assert.strictEqual(node['@type'], 'Concept');
  assert.strictEqual(node.consumes, 'config');
  assert.deepStrictEqual(node.produces, ['events', 'metrics']);
  assert.deepStrictEqual(node.prefLabel, { '@language': 'en', '@value': 'A2A' });
  assert.strictEqual(node.inScheme, 'https://example.org/');
  assert.strictEqual(node.modified, '2026-02-01T00:00:00Z');
});

test('the document carries no context member when no URL is given', () => {
  const document = jsonld.toJsonLd([], { base: 'https://e.org' });
  assert.deepStrictEqual(document, { '@graph': [] });
});

test('a predicate with no term definition keeps its IRI as the member name', () => {
  const document = jsonld.toJsonLd([{ type: 'concept', slug: 'a', title: 'A' }], {
    base: 'https://e.org',
    context: jsonld.context([], []),
  });
  const node = document['@graph'][0];
  assert.ok(Object.keys(node).includes('http://www.w3.org/2004/02/skos/core#prefLabel'));
  assert.strictEqual(node['@type'], 'https://w3id.org/agentic-system-core/ns#Concept');
});

test('the JSON-LD view is I-JSON and canonicalises (AGSC-04-04)', () => {
  const document = jsonld.toJsonLd(fixture.ITEMS, fixture.options({ context: fullContext() }));
  assert.ok(jcs.isIJSON(document));
  assert.strictEqual(jcs.canonicalize(document), jcs.canonicalize(document));
});

test('a typed literal the context does not coerce keeps the expanded value form', () => {
  // `stale_after` is an xsd:dateTime (AGSC-05-26); with a context that defines no
  // term for it, the only faithful JSON-LD is the value object.
  const document = jsonld.toJsonLd([{ type: 'concept', slug: 'a', stale_after: '2027-01-01' }], {
    base: 'https://e.org',
    context: jsonld.context([], []),
  });
  assert.deepStrictEqual(document['@graph'][0]['https://w3id.org/agentic-system-core/ns#staleAfter'], {
    '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
    '@value': '2027-01-01T00:00:00Z',
  });
});
