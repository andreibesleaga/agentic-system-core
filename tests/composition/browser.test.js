'use strict';
// tests/composition/browser.test.js — AGSC-07-13, proved rather than promised.
//
// The emitted bundle is evaluated in a FRESH `node:vm` context with no `require`,
// no `process`, no `fetch` and no `document`, and its results are compared, byte
// for byte, with this process's. That is the whole content of AGSC-07-13: "Harness
// output computed in a browser MUST be byte-identical to the equivalent CLI
// invocation". The vm context is not a browser, but it is the same thing a browser
// is for this purpose — a host with the language and nothing else.

const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const fc = require('fast-check');

const browser = require('../../src/composition/browser.js');
const { compose } = require('../../src/composition/compose.js');
const harness = require('../../src/composition/harness.js');

const INSTANT = '2026-01-01T00:00:00Z';
const TERMS = 'LicenseRef-AgenticSystemCore-Content-Use-1.0';

const ITEMS = Object.freeze([
  {
    slug: 'a', type: 'concept', kind: 'pattern', title: 'A', description: 'The first concept of the fixture, long enough to be a description.', requires: ['b'], produces: ['p'],
  },
  {
    slug: 'b', type: 'concept', kind: 'pattern', title: 'B', description: 'The second concept, required by the first and consuming its port.', consumes: ['p'], supersedes: ['b-old'],
  },
  { slug: 'b-old', type: 'concept', title: 'B, superseded', description: 'The superseded ancestor of B, hidden by Step 2 of the algebra.' },
  { slug: 'p-run', type: 'procedure', title: 'Run it', description: 'A procedure with a body, so the skill file has prose to fence.', body: '## Steps\n\n1. Run.\n' },
]);

/** A bundle in a context that holds nothing but the language (no require, no fs). */
function loadBundle() {
  const context = vm.createContext(Object.create(null));
  vm.runInContext(browser.bundle({ specVersion: '1.0.0-rc.6' }), context, { filename: 'agsc-core.js' });
  const core = vm.runInContext('globalThis.AGSC_CORE', context);
  assert.ok(core, 'the bundle installed no AGSC_CORE');
  return { context, core };
}

function optionsFor(result, items) {
  return {
    base: 'https://minimal.example/',
    instant: INSTANT,
    items: items || ITEMS,
    licenseProse: TERMS,
    name: 'fixture',
    selectionDigest: createHash('sha256').update(harness.selectionDigestInput(result), 'utf8').digest('hex'),
    specVersion: '1.0.0-rc.6',
  };
}

test('the bundle evaluates in a context with no host at all and exports every name', () => {
  const { core, context } = loadBundle();
  assert.deepStrictEqual(Object.keys(core).sort(), [...browser.exportedNames()].sort());
  // Nothing the page could reach for: the guarantee of AGSC-09-16 ("no tool may
  // require a network call, a key or a server") starts with the bundle itself.
  for (const name of ['require', 'process', 'fetch', 'document', 'XMLHttpRequest', 'crypto']) {
    assert.strictEqual(vm.runInContext(`typeof ${name}`, context), 'undefined', `${name} is reachable`);
  }
});

test('AGSC-07-13: the verdict is byte-identical in both hosts', () => {
  const { core } = loadBundle();
  const selection = ['a', 'b', 'p-run'];
  const here = compose(ITEMS, selection);
  const there = core.compose(structuredClone(ITEMS), selection);
  assert.strictEqual(harness.canonicalJson(core.verdictOf(there)),
    harness.canonicalJson(require('../../src/composition/compose.js').verdictOf(here)));
});

test('AGSC-07-13: all seven Harness files are byte-identical in both hosts', () => {
  const { core } = loadBundle();
  const selection = ['a', 'b', 'p-run'];
  const here = harness.emit(compose(ITEMS, selection), optionsFor(compose(ITEMS, selection)));
  const thereResult = core.compose(structuredClone(ITEMS), selection);
  const there = core.emit(thereResult, {
    ...optionsFor(thereResult),
    items: structuredClone(ITEMS),
  });
  assert.deepStrictEqual([...there.files.keys()], [...here.files.keys()]);
  for (const [path, text] of here.files) {
    assert.strictEqual(there.files.get(path), text, `${path} differs between the two hosts`);
  }
  assert.strictEqual(there.emitted, here.emitted);
});

test('AGSC-07-13: byte-identity holds over generated selections, not just one', () => {
  const { core } = loadBundle();
  const slugs = ITEMS.map((i) => i.slug);
  fc.assert(fc.property(fc.subarray(slugs, { minLength: 1 }), fc.boolean(), (selection, reversed) => {
    const order = reversed ? [...selection].reverse() : selection;
    const mine = compose(ITEMS, order);
    const theirs = core.compose(structuredClone(ITEMS), order);
    const a = harness.emit(mine, optionsFor(mine));
    const b = core.emit(theirs, { ...optionsFor(theirs), items: structuredClone(ITEMS) });
    if (a.files.size !== b.files.size) return false;
    for (const [path, text] of a.files) if (b.files.get(path) !== text) return false;
    return true;
  }), { numRuns: 200, seed: 20260919 });
});

test('the portable canonicaliser behaves identically in the vm', () => {
  const { core } = loadBundle();
  fc.assert(fc.property(fc.object({ maxDepth: 3 }), (value) => {
    let mine;
    try {
      mine = harness.canonicalJson(value);
    } catch {
      return true;
    }
    return core.canonicalJson(structuredClone(value)) === mine;
  }), { numRuns: 200, seed: 20260919 });
});

// ------------------------------------------------------- reading graph.jsonld back

test('itemsFromGraph recovers the authored keys the algebra reads (AGSC-05-16)', () => {
  const graph = {
    '@context': 'https://w3id.org/agentic-system-core/ns/1.0.0-draft.1/context.jsonld',
    '@graph': [
      { '@id': 'https://x.example/', '@type': 'skos:ConceptScheme' },
      {
        '@id': 'https://x.example/concepts/a/',
        '@type': ['asc:Concept', 'skos:Concept'],
        'skos:prefLabel': { '@value': 'A', '@language': 'en' },
        'skos:definition': 'The first one.',
        'dcterms:requires': { '@id': 'https://x.example/concepts/b/' },
        'asc:uses': [{ '@id': 'https://x.example/procedures/p/' }],
        'asc:produces': 'port-one',
      },
      {
        '@id': 'https://x.example/procedures/p/',
        '@type': 'asc:Procedure',
        'skos:prefLabel': 'P',
        'asc:consumes': ['port-one'],
      },
      {
        '@id': 'https://x.example/clusters/c/',
        '@type': 'asc:Cluster',
        'skos:member': [{ '@id': 'https://x.example/concepts/a/' }],
      },
      { '@id': 'https://x.example/concepts/a/#source-1', '@type': 'asc:Source' },
    ],
  };
  const items = browser.itemsFromGraph(graph);
  assert.deepStrictEqual(items.map((i) => i.slug), ['a', 'c', 'p']);
  const a = items.find((i) => i.slug === 'a');
  assert.strictEqual(a.type, 'concept');
  assert.strictEqual(a.title, 'A');
  assert.deepStrictEqual(a.requires, ['b']);
  assert.deepStrictEqual(a.uses, ['p']);
  assert.deepStrictEqual(a.produces, ['port-one']);
  assert.deepStrictEqual(items.find((i) => i.slug === 'c').members, ['a']);
  // Neither the Bundle node nor a Source is an item.
  assert.ok(!items.some((i) => i.slug === '' || i.type === undefined));
});

test('itemsFromGraph is total: a malformed or empty graph yields no item, never a throw', () => {
  for (const graph of [null, undefined, {}, { '@graph': null }, { '@graph': [null, 3, 'x'] },
    { '@graph': [{ '@type': 'asc:Concept' }] }]) {
    assert.deepStrictEqual(browser.itemsFromGraph(graph), []);
  }
});

test('the fourteen Link keys and the six item classes are all mapped', () => {
  assert.strictEqual(Object.keys(browser.graphPredicates()).length, 14);
  assert.deepStrictEqual(Object.values(browser.graphPredicates()).sort(),
    [...harness.linkKeys()].sort());
  assert.deepStrictEqual(Object.values(browser.graphTypes()).sort(),
    ['cluster', 'concept', 'episode', 'gate', 'lesson', 'procedure']);
});

test('slugOfIri survives every shape an IRI can take', () => {
  assert.strictEqual(browser.slugOfIri('https://x.example/concepts/a/'), 'a');
  assert.strictEqual(browser.slugOfIri('https://x.example/concepts/a'), 'a');
  assert.strictEqual(browser.slugOfIri('https://x.example/concepts/a/#chunk-ff'), 'a');
  assert.strictEqual(browser.slugOfIri('https://x.example/concepts/a/?x=1'), 'a');
  assert.strictEqual(browser.slugOfIri(''), '');
  assert.strictEqual(browser.slugOfIri(null), '');
  assert.strictEqual(browser.slugOfIri('///'), '');
});

test('graphValues reads every JSON-LD value shape and invents none', () => {
  const node = {
    a: 'plain', b: ['x', 'y'], c: { '@id': 'i' }, d: { '@value': 7 },
    e: null, f: [null, { '@id': 'j' }], g: [{ nothing: 1 }],
  };
  assert.deepStrictEqual(browser.graphValues(node, 'a'), ['plain']);
  assert.deepStrictEqual(browser.graphValues(node, 'b'), ['x', 'y']);
  assert.deepStrictEqual(browser.graphValues(node, 'c'), ['i']);
  assert.deepStrictEqual(browser.graphValues(node, 'd'), [7]);
  assert.deepStrictEqual(browser.graphValues(node, 'e'), []);
  assert.deepStrictEqual(browser.graphValues(node, 'f'), ['j']);
  assert.deepStrictEqual(browser.graphValues(node, 'g'), []);
  assert.deepStrictEqual(browser.graphValues(node, 'missing'), []);
});

test('the bundle is deterministic and ends in exactly one LF', () => {
  const a = browser.bundle({ specVersion: '1.0.0-rc.6' });
  const b = browser.bundle({ specVersion: '1.0.0-rc.6' });
  assert.strictEqual(a, b);
  assert.ok(a.endsWith('}());\n'));
  assert.ok(!a.includes('\r'));
  assert.notStrictEqual(a, browser.bundle());
  assert.ok(browser.bundle().includes('spec_version: unset'));
});
