'use strict';
// tests/arch/explorer-portable.test.js — the explorer of `/clusters/` (AGSC-06-38) is
// shipped to the page as the SOURCE TEXT of its functions (src/distribution/explorer/
// page.js), the way the page tools are (AGSC-07-13, page-tools-portable.test.js). Three
// rules keep that honest, each a fitness function of the architecture:
//
//   1. every name a module lists in `PORTABLE` is a top-level function declaration of that
//      module, and the emitted script carries it;
//   2. no portable function reads a module-scope binding other than another explorer
//      function: in the page such a binding does not exist, and the failure would be a
//      silent `undefined`, not a crash;
//   3. the explorer depends on nothing: its modules require only each other, and the
//      emitter (`page.js`) adds only the relation table and the context reader of
//      `src/knowledge/` — no package, no Node built-in, no other part of the engine.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const page = require('../../src/distribution/explorer/page.js');

const DIR = path.resolve(__dirname, '..', '..', 'src', 'distribution', 'explorer');
const MODULES = fs.readdirSync(DIR).filter((f) => f.endsWith('.js') && f !== 'page.js').sort();
const ALL_PORTABLE = new Set(MODULES.flatMap((f) => require(path.join(DIR, f)).PORTABLE));
const EMITTED = page.script({ relations: page.relationTerms(null) });

/** Every name a file binds at module scope (`const x =`, `const { a, b } =`). */
function moduleScopeNames(text) {
  const names = [];
  for (const line of text.split('\n')) {
    const single = /^(?:const|let|var) ([A-Za-z_$][A-Za-z0-9_$]*)\s*=/u.exec(line);
    if (single !== null) names.push(single[1]);
    const destructured = /^(?:const|let|var) \{([^}]*)\}\s*=/u.exec(line);
    if (destructured !== null) {
      for (const part of destructured[1].split(',')) names.push(part.trim().split(':').pop().trim());
    }
  }
  return names.filter((n) => n !== '');
}

/** The source text of a top-level function declaration, from the file. */
function sourceOf(text, name) {
  const at = text.indexOf(`\nfunction ${name}(`);
  return at < 0 ? null : text.slice(at, text.indexOf('\n}\n', at) + 3);
}

test('the explorer has its modules, and each lists the functions it ships', () => {
  assert.deepStrictEqual(MODULES, ['controller.js', 'graph-data.js', 'layout.js', 'main.js', 'tooltip.js', 'view.js']);
  for (const file of MODULES) {
    const portable = require(path.join(DIR, file)).PORTABLE;
    assert.ok(Array.isArray(portable) && portable.length > 0, `${file} lists no PORTABLE function`);
  }
});

test('every portable name is a top-level function of its module and is in the emitted script', () => {
  for (const file of MODULES) {
    const text = fs.readFileSync(path.join(DIR, file), 'utf8');
    for (const name of require(path.join(DIR, file)).PORTABLE) {
      assert.ok(sourceOf(text, name) !== null, `${file}#${name} is not a top-level function declaration`);
      assert.ok(EMITTED.includes(`function ${name}(`), `${file}#${name} is not in the emitted script`);
    }
  }
});

test('no portable function reads a module-scope binding that the page would not have', () => {
  let checked = 0;
  for (const file of MODULES) {
    const text = fs.readFileSync(path.join(DIR, file), 'utf8');
    const bound = moduleScopeNames(text).filter((n) => !ALL_PORTABLE.has(n));
    for (const name of require(path.join(DIR, file)).PORTABLE) {
      const source = sourceOf(text, name);
      for (const binding of bound) {
        const used = new RegExp(`(?<![A-Za-z0-9_$.'"\`])${binding.replace(/\$/gu, '\\$')}(?![A-Za-z0-9_$])`, 'u');
        const redeclared = new RegExp(`(?:const|let|var)\\s+${binding.replace(/\$/gu, '\\$')}\\b`, 'u');
        assert.ok(!(used.test(source) && !redeclared.test(source)),
          `explorer/${file}#${name} reads the module-scope binding "${binding}", which the page does not have`);
      }
      assert.ok(!source.includes('require('), `explorer/${file}#${name} requires a module; a page cannot`);
      checked += 1;
    }
  }
  assert.ok(checked >= 15, `only ${checked} functions were checked; the scan is broken`);
});

test('the explorer depends on nothing outside itself, and its emitter only on the relation table', () => {
  const requires = (file) => [...fs.readFileSync(path.join(DIR, file), 'utf8').matchAll(/require\('([^']+)'\)/gu)].map((m) => m[1]);
  for (const file of MODULES) {
    for (const target of requires(file)) {
      assert.match(target, /^\.\/[a-z-]+\.js$/u, `explorer/${file} requires ${target}`);
    }
  }
  const outside = requires('page.js').filter((t) => !/^\.\/[a-z-]+\.js$/u.test(t));
  assert.deepStrictEqual(outside.sort(), ['../../knowledge/jsonld.js', '../../knowledge/relations.js']);
});
