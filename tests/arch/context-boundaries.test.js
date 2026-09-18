'use strict';
// The DDD context map, enforced. `src/` IS the map, so the arrows are checkable:
// a require that points the wrong way is a design defect, not a style question.
//
//   shared       -> nothing                          (SHARED KERNEL: the two orderings)
//   knowledge    -> knowledge, shared (plus the pinned libraries)
//   governance   -> knowledge, ports, shared
//   composition  -> knowledge, ports, shared
//   boundary     -> knowledge, ports, shared         (anti-corruption layer)
//   distribution -> knowledge, governance, composition, boundary, ports, shared
//   application  -> everything, adapters included    (the only layer that wires)
//   ports        -> nothing
//   adapters     -> ports, shared                    (NEVER a bounded context)
//
// Plus: no module requires `adapters/` except `application/`, no adapter requires a
// bounded context (F27-13), and the require graph has no cycle.

const test = require('node:test');
const assert = require('node:assert');
const { sources, contextOf } = require('./_scan.js');

const CONTEXTS = Object.freeze(['knowledge', 'governance', 'composition', 'boundary',
  'distribution', 'interchange']);

const ALLOWED = Object.freeze({
  shared: [],
  knowledge: ['knowledge', 'shared'],
  governance: ['knowledge', 'governance', 'ports', 'shared'],
  composition: ['knowledge', 'composition', 'ports', 'shared'],
  boundary: ['knowledge', 'boundary', 'ports', 'shared'],
  distribution: ['knowledge', 'governance', 'composition', 'boundary', 'distribution', 'ports', 'shared'],
  interchange: ['knowledge', 'governance', 'interchange', 'ports', 'shared'],
  application: ['knowledge', 'governance', 'composition', 'boundary', 'distribution',
    'interchange', 'application', 'ports', 'adapters', 'shared'],
  ports: [],
  // F27-13: an adapter is not a context and may not borrow from one. What it shares
  // with the Knowledge context — the AGSC-04-12 ordering — lives in the shared kernel.
  adapters: ['ports', 'adapters', 'shared'],
});

test('every require respects the context map', () => {
  for (const file of sources()) {
    const from = file.dir.split('/')[0] || '';
    const allowed = ALLOWED[from];
    if (!allowed) continue; // a directory the map does not yet name
    for (const specifier of file.requires) {
      const to = contextOf(file, specifier);
      if (to === null || to === '') continue; // a package or a file directly under src/
      assert.ok(allowed.includes(to),
        `${file.rel} (${from}) requires ${specifier} (${to}); ${from} may require only [${allowed.join(', ')}]`);
    }
  }
});

// F27-13: the edge `adapters -> knowledge` existed and the table above let it
// through. This states the rule on its own so it cannot be widened by accident.
test('no adapter requires a bounded context', () => {
  for (const file of sources()) {
    if ((file.dir.split('/')[0] || '') !== 'adapters') continue;
    for (const specifier of file.requires) {
      const to = contextOf(file, specifier);
      assert.ok(!CONTEXTS.includes(to),
        `${file.rel} requires ${specifier} (${to}); an adapter may use ports and the shared kernel only`);
    }
  }
});

test('the shared kernel depends on nothing inside src/', () => {
  for (const file of sources()) {
    if ((file.dir.split('/')[0] || '') !== 'shared') continue;
    for (const specifier of file.requires) {
      assert.strictEqual(contextOf(file, specifier), null,
        `${file.rel} requires ${specifier}; the shared kernel depends on nothing`);
    }
  }
});

test('only the application layer requires an adapter', () => {
  for (const file of sources()) {
    const from = file.dir.split('/')[0] || '';
    if (from === 'application' || from === 'adapters') continue;
    for (const specifier of file.requires) {
      assert.notStrictEqual(contextOf(file, specifier), 'adapters',
        `${file.rel} requires an adapter; only application/ and bin/ may wire one`);
    }
  }
});

test('the require graph has no cycle', () => {
  const path = require('node:path');
  const files = sources();
  const byPath = new Map(files.map((f) => [f.absolute, f]));
  const resolve = (file, specifier) => {
    if (!specifier.startsWith('.')) return null;
    const target = path.resolve(path.dirname(file.absolute), specifier);
    return byPath.has(target) ? target : null;
  };
  const colour = new Map();
  const stack = [];
  const visit = (key) => {
    if (colour.get(key) === 'done') return;
    assert.ok(colour.get(key) !== 'open',
      `import cycle: ${[...stack, key].map((k) => path.basename(k)).join(' -> ')}`);
    colour.set(key, 'open');
    stack.push(key);
    for (const specifier of byPath.get(key).requires) {
      const target = resolve(byPath.get(key), specifier);
      if (target) visit(target);
    }
    stack.pop();
    colour.set(key, 'done');
  };
  for (const file of files) visit(file.absolute);
});
