'use strict';
// tests/arch/query-portable.test.js — the `/query/` page (AGSC-06-39) ships its script and
// its worker as the SOURCE TEXT of its functions (src/distribution/query-page.js), the way
// the explorer of `/clusters/` and the page tools do. Four rules keep that honest, each a
// fitness function of the architecture:
//
//   1. every name a module of `src/distribution/query/` lists in `PORTABLE` is a top-level
//      function declaration of that module;
//   2. no portable function reads a module-scope binding: in the page or the worker such a
//      binding does not exist, and the failure would be a silent `undefined`;
//   3. each emitted script carries every portable function its functions call, the page
//      script the explorer's layout, scene and element writer among them (one layout
//      engine, not two), and the page script runs in a context with no document without a
//      fault;
//   4. the page's modules depend on nothing outside themselves but the explorer's portable
//      modules; the emitter adds only the relation table, the graph writer's prefixes and
//      item IRIs, the context reader, the page shell and the build-time reader of the node's
//      examples and vocabulary (`query-examples.js`, never shipped as source text).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const queryPage = require('../../src/distribution/query-page.js');

const SRC = path.resolve(__dirname, '..', '..', 'src', 'distribution');
const DIR = path.join(SRC, 'query');
const MODULES = fs.readdirSync(DIR).filter((f) => f.endsWith('.js')).sort();
const EXPLORER = ['layout.js', 'view.js', 'controller.js', 'graph-data.js', 'tooltip.js', 'main.js'].map((f) => path.join(SRC, 'explorer', f));
const ALL = [...MODULES.map((f) => path.join(DIR, f)), ...EXPLORER];
const PORTABLE = new Set(ALL.flatMap((file) => require(file).PORTABLE));

/** Every name a file binds at module scope (`const x =`, `const { a, b } =`). */
function moduleScopeNames(text) {
  const names = [];
  for (const line of text.split('\n')) {
    const single = /^(?:const|let|var) ([A-Za-z_$][A-Za-z0-9_$]*)\s*=/u.exec(line);
    if (single !== null) names.push(single[1]);
    const destructured = /^(?:const|let|var) \{([^}]*)\}\s*=/u.exec(line);
    if (destructured !== null) for (const part of destructured[1].split(',')) names.push(part.trim().split(':').pop().trim());
  }
  return names.filter((n) => n !== '');
}

/** The source text of a top-level function declaration, from the file. */
function sourceOf(text, name) {
  const at = text.indexOf(`\nfunction ${name}(`);
  return at < 0 ? null : text.slice(at, text.indexOf('\n}\n', at) + 3);
}

/** The portable functions a script defines and the portable names its text calls. */
function defined(script) {
  return new Set([...script.matchAll(/^function ([A-Za-z0-9_$]+)\(/gmu)].map((m) => m[1]));
}

test('the page has its modules, and each lists the functions it ships as top-level declarations', () => {
  assert.deepStrictEqual(MODULES, ['engine.js', 'main.js', 'tokens.js', 'view.js']);
  for (const file of MODULES) {
    const text = fs.readFileSync(path.join(DIR, file), 'utf8');
    const portable = require(path.join(DIR, file)).PORTABLE;
    assert.ok(Array.isArray(portable) && portable.length > 0, `${file} lists no PORTABLE function`);
    for (const name of portable) assert.ok(sourceOf(text, name) !== null, `${file}#${name} is not a top-level function declaration`);
  }
});

test('no portable function reads a module-scope binding that the page or the worker would not have', () => {
  let checked = 0;
  for (const file of MODULES) {
    const text = fs.readFileSync(path.join(DIR, file), 'utf8');
    const bound = moduleScopeNames(text).filter((n) => !PORTABLE.has(n));
    for (const name of require(path.join(DIR, file)).PORTABLE) {
      const source = sourceOf(text, name);
      for (const binding of bound) {
        const used = new RegExp(`(?<![A-Za-z0-9_$.'"\`])${binding.replace(/\$/gu, '\\$')}(?![A-Za-z0-9_$])`, 'u');
        assert.ok(!used.test(source), `query/${file}#${name} reads the module-scope binding "${binding}"`);
      }
      assert.ok(!source.includes('require('), `query/${file}#${name} requires a module; a page cannot`);
      checked += 1;
    }
  }
  assert.ok(checked >= 12, `only ${checked} functions were checked; the scan is broken`);
});

test('each emitted script carries every portable function its functions call', () => {
  for (const script of [queryPage.script({ specVersion: '1.1.0' }), queryPage.workerScript({ specVersion: '1.1.0' })]) {
    const have = defined(script);
    for (const name of PORTABLE) {
      if (have.has(name)) continue;
      assert.doesNotMatch(script, new RegExp(`(?<![A-Za-z0-9_$.'"])${name}\\(`, 'u'), `the script calls ${name} but does not carry it`);
    }
  }
  const page = defined(queryPage.script({}));
  for (const name of ['explorerLayout', 'explorerScene', 'explorerBuild', 'queryMain', 'queryTable', 'queryHighlight']) assert.ok(page.has(name), name);
  const worker = defined(queryPage.workerScript({}));
  assert.deepStrictEqual([...worker].sort(), ['queryAnswer', 'queryCheck', 'queryGraphStore', 'queryRefusal', 'queryTokens', 'queryWorkerMain']);
});

test('the page script runs where there is no document, and defines nothing global but its own start', () => {
  const sandbox = { globalThis: null };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(queryPage.script({ specVersion: '1.1.0' }), sandbox);
  assert.deepStrictEqual(Object.keys(sandbox), ['globalThis']);
});

test('the page depends on nothing outside itself but the explorer\'s portable modules', () => {
  const requires = (file) => [...fs.readFileSync(file, 'utf8').matchAll(/require\('([^']+)'\)/gu)].map((m) => m[1]);
  for (const file of MODULES) {
    for (const target of requires(path.join(DIR, file))) {
      assert.match(target, /^\.\/[a-z-]+\.js$|^\.\.\/explorer\/(?:layout|view)\.js$/u, `query/${file} requires ${target}`);
    }
  }
  const outside = requires(path.join(SRC, 'query-page.js')).filter((t) => !/^\.\/(?:query|explorer)\/[a-z-]+\.js$/u.test(t));
  assert.deepStrictEqual(outside.sort(), ['../knowledge/nquads.js', '../knowledge/relations.js', './html.js', './query-examples.js']);
});
