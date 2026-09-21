'use strict';
// The vocabulary context of a REAL build (NS-01, NS-02, NS-03).
//
// `tests/knowledge/jsonld-roundtrip.test.js` and the vector `graph-0011` prove the
// pure generator `knowledge/jsonld.js#context` correct. Nothing proved the WIRING
// from `ontology/agsc.ttl` to an `agsc build`, and that is where the defect lived:
// the vocabulary was never supplied, the generated context was never handed to the
// JSON-LD emitter, and a Level-0 emission named no context at all. This file builds
// the reference fixture through the same options the CLI passes and checks:
//
//   * AGSC-06-32 — `/ns/context.jsonld` defines all 52 `asc:` terms and the 24
//     external properties, with `@version` 1.1 and `@protected` true;
//   * AGSC-06-32 — expanding the built `/graph.jsonld` with the built
//     `/ns/context.jsonld` and re-compacting reproduces it byte for byte;
//   * AGSC-05-09 as amended at rc.5 — `graph.jsonld` names a context at EVERY
//     Level, so a Level-0 document loses no triple in a standard processor;
//   * AGSC-05-06 — the N-Quads and Turtle views do not move by one byte.
//
// Offline: the document loader serves the built context from memory and refuses
// every other URL (AGSC-04-03). The clock is fixed at 2026-01-01T00:00:00Z.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const jsonldProcessor = require('jsonld');

const { createFileSystem, readOntology, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const turtle = require('../../src/knowledge/turtle.js');
const jsonldView = require('../../src/knowledge/jsonld.js');
const { canonicalize } = require('../../src/knowledge/jcs.js');
const { loadBundle } = require('../../src/application/bundle.js');
const helpers = require('../../src/application/cli/verbs/_helpers.js');
const site = require('../../src/distribution/site.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
/** 2026-01-01T00:00:00Z — the fixed instant of `tests/fixtures/minimal/README.md`. */
const EPOCH = '1767225600';
const VOCABULARY = readOntology(ROOT);
const TERMS = turtle.ontologyTerms(VOCABULARY);
const NS_HASH = 'https://w3id.org/agentic-system-core/ns#';

/** The build options the CLI passes, so that this file tests the shipped wiring. */
function load(extra) {
  const fs = createFileSystem(FIXTURE);
  const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(ROOT)) });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } });
  const options = helpers.buildOptions({ specVersion: '1.0.0-rc.5', version: '0.0.2' }, extra);
  return { bundle, ports: { fs, clock }, options };
}

function build(extra) {
  const { bundle, ports, options } = load(extra);
  return site.build(bundle, ports, options);
}

/** Expand and re-compact a built pair with an offline loader (AGSC-06-32). */
async function roundTrip(files) {
  const document = JSON.parse(files.get('/graph.jsonld'));
  const context = JSON.parse(files.get('/ns/context.jsonld'));
  const url = document['@context'];
  const documentLoader = async (requested) => {
    if (requested === url) return { contextUrl: null, document: context, documentUrl: requested };
    throw new Error(`the tests resolve no URL but the context: ${requested}`);
  };
  const expanded = await jsonldProcessor.expand(document, { documentLoader });
  const compacted = await jsonldProcessor.compact(expanded, url, { documentLoader });
  return { after: canonicalize(compacted), before: canonicalize(document) };
}

/** The number of triples a JSON-LD document yields in a conforming processor. */
async function tripleCount(document, context) {
  const url = typeof document['@context'] === 'string' ? document['@context'] : 'urn:context';
  const documentLoader = async (requested) => {
    if (requested === url) return { contextUrl: null, document: context, documentUrl: requested };
    throw new Error(`the tests resolve no URL but the context: ${requested}`);
  };
  const quads = await jsonldProcessor.toRDF(document, {
    documentLoader, format: 'application/n-quads',
  });
  return quads.split('\n').filter(Boolean).length;
}

// ------------------------------------------------------------------ NS-01

test('buildOptions supplies the vocabulary the context is generated from (NS-01)', () => {
  const options = helpers.buildOptions({ specVersion: '1.0.0-rc.5', version: '0.0.2' });
  assert.strictEqual(options.ontologyTerms.length, 52,
    'the 52 terms of ontology/agsc.ttl never reached a build');
  assert.strictEqual(options.ontologyVersion, '1.0.0-draft.1',
    'the owl:versionIRI version of AGSC-05-25 never reached a build');
  // Read once and memoised, exactly as the three compiled schemas are.
  assert.strictEqual(options.ontologyTerms,
    helpers.buildOptions({ specVersion: '1.0.0-rc.5', version: '0.0.2' }).ontologyTerms);
});

test('a built /ns/context.jsonld defines all 52 asc: terms and the 24 external ones (AGSC-06-32)', () => {
  const context = JSON.parse(build().files.get('/ns/context.jsonld'))['@context'];
  const definitions = Object.entries(context)
    .filter(([, value]) => value !== null && typeof value === 'object');
  const asc = definitions.filter(([, value]) => String(value['@id']).startsWith('asc:'));
  assert.strictEqual(asc.length, 52, 'the built context carries no asc: term definition');
  assert.strictEqual(definitions.length, 52 + 24);
  assert.strictEqual(Object.keys(context).length, 85, '2 flags + 7 prefixes + 52 + 24');
  assert.strictEqual(context['@version'], 1.1);
  assert.strictEqual(context['@protected'], true);
  assert.ok(Object.values(context).every((value) => value !== null),
    'AGSC-06-32 forbids a term mapped to null');
  // The build's context is the generator's, not a second derivation.
  assert.strictEqual(canonicalize(JSON.parse(build().files.get('/ns/context.jsonld'))),
    canonicalize(jsonldView.context(TERMS, jsonldView.allExternalProperties())));
});

// ------------------------------------------------------------------ NS-02

test('the built graph.jsonld is compact: no vocabulary IRI is written out (NS-02)', () => {
  const { files } = build();
  for (const [route, bytes] of files) {
    if (!route.endsWith('.jsonld') || route === '/ns/context.jsonld') continue;
    assert.ok(!String(bytes).includes(NS_HASH),
      `${route} writes a vocabulary IRI unabbreviated although the context defines a term for it`);
  }
  const document = JSON.parse(files.get('/graph.jsonld'));
  assert.strictEqual(document['@graph'][0]['@type'], 'Bundle');
  assert.strictEqual(document['@graph'][0].specVersion, '1.0.0-rc.5');
});

test('expand then re-compact reproduces graph.jsonld byte for byte (AGSC-06-32)', async () => {
  const { after, before } = await roundTrip(build().files);
  assert.strictEqual(after, before);
});

test('every per-item view compacts against the same context (AGSC-06-02, AGSC-06-32)', async () => {
  const { files } = build();
  const context = JSON.parse(files.get('/ns/context.jsonld'));
  const pages = [...files.keys()].filter((route) => route.startsWith('/pages/') && route.endsWith('.jsonld'));
  assert.ok(pages.length >= 3, 'the fixture emits no per-item JSON-LD view');
  for (const route of pages) {
    const document = JSON.parse(files.get(route));
    const url = document['@context'];
    const documentLoader = async (requested) => {
      if (requested === url) return { contextUrl: null, document: context, documentUrl: requested };
      throw new Error(`the tests resolve no URL but the context: ${requested}`);
    };
    const expanded = await jsonldProcessor.expand(document, { documentLoader });
    const compacted = await jsonldProcessor.compact(expanded, url, { documentLoader });
    assert.strictEqual(canonicalize(compacted), canonicalize(document), route);
  }
});

test('the N-Quads and Turtle views do not move by one byte (AGSC-05-06)', () => {
  const withContext = build().files;
  // The same build with the vocabulary withheld — the state before this fix.
  const { bundle, ports } = load();
  const without = site.build(bundle, ports, { specVersion: '1.0.0-rc.5', version: '0.0.2' }).files;
  assert.strictEqual(withContext.get('/graph.nq'), without.get('/graph.nq'));
  assert.strictEqual(withContext.get('/graph.ttl'), without.get('/graph.ttl'));
  // …and the JSON-LD view of the same triples DOES move: that is the fix.
  assert.notStrictEqual(withContext.get('/graph.jsonld'), without.get('/graph.jsonld'));
});

// ------------------------------------------------------------------ NS-03

test('graph.jsonld names a context at EVERY Level (AGSC-05-09 as amended at rc.5)', () => {
  const persistent = 'https://w3id.org/agentic-system-core/ns/1.0.0-draft.1/context.jsonld';
  for (const level of [0, 1]) {
    const document = JSON.parse(build({ level }).files.get('/graph.jsonld'));
    assert.strictEqual(document['@context'], persistent,
      `a Level-${level} graph.jsonld names no context, so a processor drops every compacted member`);
    assert.ok(!build({ level }).files.has('/ns/context.jsonld'),
      `Level ${level} must not serve a context file of its own (AGSC-06-32)`);
  }
  // A Level ≥ 2 writer serves its own byte-identical copy and MAY name it.
  const full = JSON.parse(build().files.get('/graph.jsonld'));
  assert.strictEqual(full['@context'], 'https://minimal.example/ns/context.jsonld');
});

test('a Level-0 graph.jsonld expands to every triple graph.nq carries (NS-03)', async () => {
  const context = JSON.parse(build().files.get('/ns/context.jsonld'));
  const expected = build().files.get('/graph.nq').split('\n').filter(Boolean).length;
  assert.ok(expected > 30, 'the fixture is too small to detect a loss');
  for (const level of [0, 1, 2]) {
    const document = JSON.parse(build({ level }).files.get('/graph.jsonld'));
    assert.strictEqual(await tripleCount(document, context), expected,
      `a Level-${level} graph.jsonld loses triples when a conforming processor expands it`);
  }
});

test('the persistent context URL is derived from the vocabulary, never typed (AGSC-05-09)', () => {
  assert.strictEqual(jsonldView.persistentContextUrl(turtle.ontologyVersion(VOCABULARY)),
    'https://w3id.org/agentic-system-core/ns/1.0.0-draft.1/context.jsonld');
  assert.strictEqual(turtle.ontologyVersion('<urn:x> a <urn:y> .\n'), null);
});

test('a build given no vocabulary names what it could not emit, never silence', () => {
  const { bundle, ports } = load();
  const built = site.build(bundle, ports, { level: 0, specVersion: '1.0.0-rc.5', version: '0.0.2' });
  assert.ok(!('@context' in JSON.parse(built.files.get('/graph.jsonld'))));
  assert.ok(built.skipped.some((s) => s.includes('AGSC-05-09')),
    'a graph.jsonld with no context must be named in skipped');
});
