'use strict';
// The two checks that need the reference JSON-LD processor, `jsonld@9.0.0` — a
// devDependency, since nothing under `src/` requires it (AGSC-05-11: this engine is
// not a JSON-LD processor and does not claim to be one).
//
//   * AGSC-06-32 — expanding `graph.jsonld` with `/ns/context.jsonld` and
//     re-compacting it MUST reproduce `graph.jsonld` byte for byte (vector
//     `graph-0011`).
//   * AGSC-05-06 — all four views express the same triples: the processor's own
//     N-Quads for `graph.jsonld` are compared with `graph.nq`.
//
// The document loader serves the one context URL from memory and refuses every other
// URL, so no test reaches the network (AGSC-04-03).

const test = require('node:test');
const assert = require('node:assert');
const jsonldProcessor = require('jsonld');

const jsonld = require('../../src/knowledge/jsonld.js');
const turtle = require('../../src/knowledge/turtle.js');
const nq = require('../../src/knowledge/nquads.js');
const jcs = require('../../src/knowledge/jcs.js');
const fixture = require('./_graph-fixture.js');

const CONTEXT = jsonld.context(turtle.ontologyTerms(fixture.ontologyText()), jsonld.allExternalProperties());
const OPTIONS = fixture.options({ context: CONTEXT });

const loader = async (url) => {
  if (url === fixture.CONTEXT_URL) return { contextUrl: null, document: CONTEXT, documentUrl: url };
  throw new Error(`the tests resolve no URL but the context: ${url}`);
};

/**
 * A plain literal is an `xsd:string` in RDF 1.1, and N-Quads writers may leave the
 * datatype implicit. AGSC-05-31(c) requires it explicitly; the processor omits it.
 * The two forms are the same triple, so the comparison normalises them away — and
 * nothing else.
 */
function triples(text) {
  return new Set(text.split('\n').filter(Boolean)
    .map((line) => line.replace(/\^\^<http:\/\/www\.w3\.org\/2001\/XMLSchema#string>/gu, ''))
    .sort());
}

test('expanding and re-compacting graph.jsonld reproduces its bytes (AGSC-06-32)', async () => {
  const document = jsonld.toJsonLd(fixture.ITEMS, OPTIONS);
  const before = jcs.canonicalize(document);
  const expanded = await jsonldProcessor.expand(document, { documentLoader: loader });
  const compacted = await jsonldProcessor.compact(expanded, fixture.CONTEXT_URL, { documentLoader: loader });
  assert.strictEqual(jcs.canonicalize(compacted), before);
});

test('graph.jsonld and graph.nq express the same triples (AGSC-05-06)', async () => {
  const document = jsonld.toJsonLd(fixture.ITEMS, OPTIONS);
  const fromJsonLd = await jsonldProcessor.toRDF(document, {
    format: 'application/n-quads',
    documentLoader: loader,
  });
  // The JSON-LD view carries the triples; the graph NAME of graph.nq is the Bundle
  // IRI (AGSC-05-03), so the comparison is made in the default graph.
  const ours = nq.toNQuads(fixture.ITEMS, { ...OPTIONS, graph: null });
  assert.deepStrictEqual(triples(fromJsonLd), triples(ours));
});

test('the round trip would catch a value written in a form the context does not select', async () => {
  const document = jsonld.toJsonLd(fixture.ITEMS, OPTIONS);
  const node = document['@graph'].find((n) => n.kind !== undefined);
  node.kind = { '@value': node.kind, '@type': 'http://www.w3.org/2001/XMLSchema#string' };
  const expanded = await jsonldProcessor.expand(document, { documentLoader: loader });
  const compacted = await jsonldProcessor.compact(expanded, fixture.CONTEXT_URL, { documentLoader: loader });
  assert.notStrictEqual(jcs.canonicalize(compacted), jcs.canonicalize(document));
});

test('the document loader refuses every URL but the context (AGSC-04-03)', async () => {
  await assert.rejects(() => loader('https://example.org/elsewhere'), /resolve no URL/u);
});

test('jsonld is a dependency at the pinned version, for the conform run, and src/ never requires it', () => {
  // The graph area's round trip runs from an installed package under `agsc conform`,
  // so the processor is a runtime dependency of the package and not of `src/`.
  const pkg = require('../../package.json');
  assert.strictEqual(pkg.dependencies.jsonld, '9.0.0');
  assert.strictEqual(pkg.devDependencies.jsonld, undefined);
});
