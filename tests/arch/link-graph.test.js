'use strict';
// Fitness function: ONE reading of the Link graph for the pictures of it.
//
// Two writers draw the typed Links between published items: the `mermaid` export
// (Interchange) and the graph view of the pages (Distribution, AGSC-06-38). The context
// map forbids the two contexts to require each other, so what they share lives in
// `knowledge/link-graph.js`. A writer that walked the fourteen Link keys itself would be a
// second reading of the same edges, free to drift from the first (a different order, an
// anchor kept, a duplicate not removed). This test keeps both writers on the shared one.

const test = require('node:test');
const assert = require('node:assert');
const { sources } = require('./_scan.js');

const SHARED = 'src/knowledge/link-graph.js';
const WRITERS = ['src/interchange/adapters/mermaid.js', 'src/distribution/graph-view.js'];

test('the Mermaid export and the graph view read the Link graph from knowledge/link-graph.js', () => {
  const files = new Map(sources().map((f) => [f.rel, f]));
  assert.ok(files.has(SHARED), `${SHARED} is missing`);
  for (const rel of WRITERS) {
    const file = files.get(rel);
    assert.ok(file, `${rel} is missing`);
    assert.ok(file.requires.some((s) => /(^|\/)link-graph\.js$/u.test(s)), `${rel} does not read ${SHARED}`);
    // Walking the keys over an item is the shared module's job; naming them for a list
    // the writer prints (the Mermaid adapter's READS) is not a walk.
    assert.ok(!/for \(const key of LINK_KEYS\)|LINK_KEYS\s*\.\s*(?:forEach|flatMap|filter)\(/u.test(file.text), `${rel} walks the Link keys itself`);
  }
});

test('the graph view never reaches the Interchange context (the context map)', () => {
  const view = sources().find((f) => f.rel === 'src/distribution/graph-view.js');
  assert.deepStrictEqual(view.requires.filter((s) => /interchange\//u.test(s)), []);
});
