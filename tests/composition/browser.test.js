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
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fc = require('fast-check');

const browser = require('../../src/composition/browser.js');
const { compose } = require('../../src/composition/compose.js');
const harness = require('../../src/composition/harness.js');
const brief = require('../../src/composition/brief.js');
const blueprint = require('../../src/composition/blueprint.js');
const { loadBundle } = require('../../src/application/bundle.js');
const { flatten } = require('../../src/application/cli/verbs/compose.js');
const { main } = require('../../src/application/cli/main.js');
const { createFileSystem } = require('../../src/adapters/node-fs.js');
const { captureStream } = require('../conformance/areas/_shared.js');

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
function loadCore(options = {}) {
  const context = vm.createContext(Object.create(null));
  vm.runInContext(browser.bundle({ specVersion: '1.0.0', ...options }), context, { filename: 'agsc-core.js' });
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
    specVersion: '1.0.0',
  };
}

test('the bundle evaluates in a context with no host at all and exports every name', () => {
  const { core, context } = loadCore();
  assert.deepStrictEqual(Object.keys(core).sort(), [...browser.exportedNames()].sort());
  // Nothing the page could reach for: the guarantee of AGSC-09-16 ("no tool may
  // require a network call, a key or a server") starts with the bundle itself.
  for (const name of ['require', 'process', 'fetch', 'document', 'XMLHttpRequest', 'crypto']) {
    assert.strictEqual(vm.runInContext(`typeof ${name}`, context), 'undefined', `${name} is reachable`);
  }
});

test('AGSC-07-13: the verdict is byte-identical in both hosts', () => {
  const { core } = loadCore();
  const selection = ['a', 'b', 'p-run'];
  const here = compose(ITEMS, selection);
  const there = core.compose(structuredClone(ITEMS), selection);
  assert.strictEqual(harness.canonicalJson(core.verdictOf(there)),
    harness.canonicalJson(require('../../src/composition/compose.js').verdictOf(here)));
});

test('AGSC-07-13: all seven Harness files are byte-identical in both hosts', () => {
  const { core } = loadCore();
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
  const { core } = loadCore();
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

test('AGSC-07-25, AGSC-07-13: the brief the command line writes is the brief the page computes, byte for byte', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-brief-hosts-'));
  test.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  fs.cpSync(path.resolve(__dirname, '..', 'fixtures', 'minimal'), dir, { recursive: true });
  const exit = main(['compose', 'supervisor', 'handoff', '--brief', '--quiet'], {
    env: { SOURCE_DATE_EPOCH: '1767225600' }, ports: { fs: createFileSystem(dir) }, root: dir,
    specVersion: '1.0.0', stderr: captureStream(), stdout: captureStream(), version: '1.0.0',
  });
  assert.strictEqual(exit, 0);
  const companion = fs.readdirSync(path.join(dir, 'dist', 'harness')).find((name) => name.endsWith('.companion'));
  const items = flatten(loadBundle({ fs: createFileSystem(dir) }, {}).items);
  const { core } = loadCore({ brief: true });
  const result = core.compose(structuredClone(items), ['supervisor', 'handoff']);
  const there = core.briefFiles(result, {
    ...optionsFor(result, structuredClone(items)), base: 'https://minimal.example/', bundleVersion: undefined,
    instant: INSTANT, licenseProse: TERMS,
  });
  assert.deepStrictEqual(Array.from(there, ([name]) => name), ['BRIEF.md', 'brief.json', 'brief.mmd', 'context.md']);
  for (const [name, text] of there) {
    assert.strictEqual(text, fs.readFileSync(path.join(dir, 'dist', 'harness', companion, name), 'utf8'), `${name} differs between the two hosts`);
  }
});

test('AGSC-07-29, AGSC-07-13: the blueprint the command line writes is the blueprint the page computes, byte for byte', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-blueprint-hosts-'));
  test.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  fs.cpSync(path.resolve(__dirname, '..', 'fixtures', 'minimal'), dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'content', 'concepts', 'team.md'), ['---', 'type: concept', 'kind: architecture',
    'title: The team', 'description: A saved architecture of the two patterns of the minimal fixture.',
    'clusters:', '  - agent-patterns', 'decided-by:', '  - handoff', 'prov:', '  origin: human', '  operator: human:andreibesleaga',
    '---', '', '# The team', '', '```yaml agsc-selection', '- supervisor', '- handoff', '```', ''].join('\n'));
  const exit = main(['compose', '--from', 'team', '--brief', '--quiet'], {
    env: { SOURCE_DATE_EPOCH: '1767225600' }, ports: { fs: createFileSystem(dir) }, root: dir,
    specVersion: '1.0.0', stderr: captureStream(), stdout: captureStream(), version: '1.0.0',
  });
  assert.strictEqual(exit, 0);
  const companion = fs.readdirSync(path.join(dir, 'dist', 'harness')).find((name) => name.endsWith('.companion'));
  const items = flatten(loadBundle({ fs: createFileSystem(dir) }, {}).items);
  const { core } = loadCore({ brief: true });
  const result = core.compose(structuredClone(items), ['supervisor', 'handoff']);
  const there = core.blueprintFiles(result, {
    ...optionsFor(result, structuredClone(items)), architecture: 'team', bundleVersion: undefined, licenseProse: TERMS,
  });
  assert.strictEqual(there.length, 4, 'the four files of a blueprint with no decision cited by a member');
  for (const [name, text] of there) {
    assert.strictEqual(text, fs.readFileSync(path.join(dir, 'dist', 'harness', companion, name), 'utf8'), `${name} differs between the two hosts`);
  }
});

test('AGSC-07-13: the brief is byte-identical in both hosts over generated selections', () => {
  const { core } = loadCore({ brief: true });
  const slugs = ITEMS.map((i) => i.slug);
  fc.assert(fc.property(fc.subarray(slugs, { minLength: 1 }), fc.boolean(), (selection, reversed) => {
    const order = reversed ? [...selection].reverse() : selection;
    const mine = compose(ITEMS, order);
    const theirs = core.compose(structuredClone(ITEMS), order);
    const a = brief.briefFiles(mine, optionsFor(mine));
    const b = core.briefFiles(theirs, { ...optionsFor(theirs), items: structuredClone(ITEMS) });
    return JSON.stringify(a) === JSON.stringify(b);
  }), { numRuns: 100, seed: 20261105 });
});

test('the bundle carries the brief only when asked, which the published /compose/ script does', () => {
  const plain = browser.bundle({ specVersion: '1.0.0' });
  assert.ok(!plain.includes('function briefFiles('), 'the default bundle carries the brief');
  assert.ok(browser.bundle({ brief: true, specVersion: '1.0.0' }).includes('function briefFiles('));
  assert.ok(!plain.includes('function blueprintFiles('), 'the default bundle carries the blueprint');
  assert.deepStrictEqual(browser.exportedNames({ brief: true }).filter((n) => !browser.exportedNames().includes(n)),
    [...brief.PORTABLE, ...blueprint.PORTABLE]);
  const { core } = loadCore({ brief: true });
  assert.deepStrictEqual(Object.keys(core).sort(), [...browser.exportedNames({ brief: true })].sort());
});

test('the portable canonicaliser behaves identically in the vm', () => {
  const { core } = loadCore();
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
  const a = browser.bundle({ specVersion: '1.0.0' });
  const b = browser.bundle({ specVersion: '1.0.0' });
  assert.strictEqual(a, b);
  assert.ok(a.endsWith('}());\n'));
  assert.ok(!a.includes('\r'));
  assert.notStrictEqual(a, browser.bundle());
  assert.ok(browser.bundle().includes('spec_version: unset'));
});
