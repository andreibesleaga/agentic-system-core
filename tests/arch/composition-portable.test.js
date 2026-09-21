'use strict';
// tests/arch/composition-portable.test.js — the portability contract of AGSC-07-13
// (M8-T20), enforced rather than commented.
//
// `composition/browser.js` emits the SOURCE TEXT of the functions the CLI runs, so
// the browser and the CLI cannot produce different bytes. That only holds while
// every portable function is self-contained: a function closing over a module-scope
// binding would be emitted with a free variable that is `undefined` in the page,
// and the failure would be silent — a Harness with `undefined` in it, not a crash.
//
// This test therefore checks three things a reader cannot check by eye:
//   1. `src/composition/**` requires no host module (the purity test covers the
//      Node builtins; this adds the ones a browser has no answer for).
//   2. every name in a module's `PORTABLE` list is a real function whose source
//      text a page can evaluate.
//   3. the emitted bundle has NO free identifier beyond the language's own
//      globals — computed by evaluating it in a context whose global object traps
//      every unknown read.

const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');

const compose = require('../../src/composition/compose.js');
const harness = require('../../src/composition/harness.js');
const browser = require('../../src/composition/browser.js');

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.resolve(__dirname, '..', '..', 'src', 'composition');

/**
 * Every name a module binds at MODULE SCOPE — a `const`/`let`/`var` declaration or
 * a destructured `require` — which is exactly the set a page has no binding for.
 */
function moduleScopeNames(file) {
  const text = fs.readFileSync(path.join(SRC, file), 'utf8');
  const names = [];
  for (const line of text.split('\n')) {
    // Module scope only: a declaration at column 0.
    const single = /^(?:const|let|var) ([A-Za-z_$][A-Za-z0-9_$]*)\s*=/u.exec(line);
    if (single !== null) names.push(single[1]);
    const destructured = /^(?:const|let|var) \{([^}]*)\}\s*=/u.exec(line);
    if (destructured !== null) {
      for (const part of destructured[1].split(',')) {
        const name = part.trim().split(':').pop().trim();
        if (name !== '') names.push(name);
      }
    }
  }
  return names;
}

test('every portable name is a function whose own source text is emitted', () => {
  for (const [label, module] of [['compose.js', compose], ['harness.js', harness]]) {
    assert.ok(Array.isArray(module.PORTABLE), `${label} declares no PORTABLE list`);
    for (const name of module.PORTABLE) {
      assert.strictEqual(typeof module[name], 'function', `${label}#${name} is not an exported function`);
      const source = String(module[name]);
      assert.ok(source.startsWith(`function ${name}(`) || source.startsWith(`function ${name} (`),
        `${label}#${name} is not a plain function declaration (its source text is "${source.slice(0, 40)}…")`);
      assert.ok(!source.includes('require('), `${label}#${name} requires a module; a page cannot`);
    }
  }
});

test('no portable function closes over a module-scope binding', () => {
  // THE failure mode this file exists for: a portable function that reads a
  // module-scope `const` is emitted with a free variable that is `undefined` in the
  // page — a Harness with `undefined` in it, silently, not a crash.
  for (const [file, module] of [['compose.js', compose], ['harness.js', harness],
    ['browser.js', browser]]) {
    // A module-scope binding is harmless when it is itself one of the names the
    // bundle emits — `harness.js` destructures `compareCodePoint` from
    // `compose.js`, and the bundle carries that function's own declaration.
    const emitted = new Set(browser.exportedNames());
    const bound = moduleScopeNames(file).filter((n) => !emitted.has(n));
    assert.ok(bound.length > 0, `no module-scope binding was found in ${file}; the scan is broken`);
    const portable = module.PORTABLE || module.PAGE_SUPPORT;
    for (const name of portable) {
      const source = String(module[name] || (file === 'browser.js' && browser[name]));
      for (const binding of bound) {
        // A name declared at module scope may appear inside a portable function
        // only if that function DECLARES it again locally.
        const used = new RegExp(`(?<![A-Za-z0-9_$.'"\`])${binding.replace(/\$/gu, '\\$')}(?![A-Za-z0-9_$])`, 'u');
        const redeclared = new RegExp(`(?:const|let|var)\\s+${binding.replace(/\$/gu, '\\$')}\\b`, 'u');
        if (used.test(source) && !redeclared.test(source)) {
          assert.fail(`${file}#${name} reads the module-scope binding "${binding}"; `
            + 'a page has no such binding, so the emitted bundle would carry `undefined` (AGSC-07-13)');
        }
      }
    }
  }
});

test('no portable function reads a MEMBER of a required module (the hole that let one through)', () => {
  // The check above filters a module-scope binding out of `bound` when its own name is
  // one the bundle emits — and `compose` is both the name of a required module in
  // `browser.js` AND one of `compose.PORTABLE`'s function names. So
  // `itemsFromGraph` could read `compose.compareCodePoint(…)` and be emitted into a
  // page that has the function `compose` but no OBJECT `compose`: `itemsFromGraph`
  // threw `compose.compareCodePoint is not a function` on every real page, and no
  // test noticed. A member read on a required module is never portable, whatever the
  // module is called.
  let scanned = 0;
  for (const [file, module] of [['compose.js', compose], ['harness.js', harness],
    ['browser.js', browser]]) {
    const text = fs.readFileSync(path.join(SRC, file), 'utf8');
    // Only a require bound to a plain identifier can be read as an OBJECT; a
    // destructured require binds the functions themselves, which the bundle emits.
    const required = [...text.matchAll(/^const ([A-Za-z_$][A-Za-z0-9_$]*) = require\(/gmu)].map((m) => m[1]);
    scanned += required.length;
    const portable = module.PORTABLE || module.PAGE_SUPPORT;
    for (const name of portable) {
      const source = String(module[name] || browser[name]);
      for (const binding of required) {
        const member = new RegExp(`(?<![A-Za-z0-9_$.])${binding}\\.[A-Za-z_$]`, 'u');
        assert.ok(!member.test(source),
          `${file}#${name} reads a member of the required module "${binding}"; a page holds no such object (AGSC-07-13)`);
      }
    }
  }
  assert.ok(scanned >= 2, `only ${scanned} module-object requires were found; the scan is broken`);
});

test('every page-support function runs in the bundle, over a REAL graph shape', () => {
  // The "evaluates in a context that holds only the language" test below exercises the
  // two algebras; nothing exercised `itemsFromGraph`, which is why the defect above
  // survived. A node spelled the three ways one graph document may spell it.
  const context = vm.createContext({});
  vm.runInContext(browser.bundle(), context, { filename: 'agsc-core.js' });
  const core = vm.runInContext('globalThis.AGSC_CORE', context);
  const graph = {
    '@graph': [
      {
        '@id': 'https://x.example/concepts/a/',
        '@type': 'https://w3id.org/agentic-system-core/ns#Concept',
        prefLabel: { '@value': 'A', '@language': 'en' },
        'https://w3id.org/agentic-system-core/ns#uses': { '@id': 'https://x.example/procedures/p/' },
      },
      { '@id': 'https://x.example/procedures/p/', '@type': 'asc:Procedure', 'skos:prefLabel': 'P' },
    ],
  };
  // `deepStrictEqual` compares prototypes, and the bundle answers with arrays of the
  // vm realm, so the comparison is made on plain values.
  const items = JSON.parse(JSON.stringify(core.itemsFromGraph(graph)));
  assert.deepStrictEqual(items.map((i) => i.slug), ['a', 'p']);
  assert.deepStrictEqual(items[0].uses, ['p']);
  assert.strictEqual(core.localOf('https://w3id.org/agentic-system-core/ns#uses'), 'uses');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(core.nodeValues({ 'a:x': 1, 'b/x': 2 }, 'x'))), [1, 2]);
});

test('the emitted bundle evaluates and answers in a context that holds only the language', () => {
  const context = vm.createContext({});
  vm.runInContext(browser.bundle(), context, { filename: 'agsc-core.js' });
  const core = vm.runInContext('globalThis.AGSC_CORE', context);
  assert.strictEqual(typeof core.compose, 'function');
  // Force every body to execute: the bodies are where a free identifier would show.
  const items = [{ slug: 'x', type: 'concept', title: 'X', description: 'A concept long enough to be a description of itself.', produces: ['p'] },
    { slug: 'y', type: 'procedure', title: 'Y', description: 'A procedure long enough to be a description of itself.', consumes: ['p'], requires: ['x'] }];
  const verdict = core.compose(items, ['y']);
  const out = core.emit(verdict, {
    base: 'https://x.example/', instant: '2026-01-01T00:00:00Z', items,
    licenseProse: 'CC0-1.0', name: 'n', selectionDigest: 'deadbeef', specVersion: '1.0.0-rc.4',
  });
  assert.strictEqual(out.emitted, true);
  for (const [file, text] of out.files) {
    assert.ok(!text.includes('undefined'), `${file} carries the string "undefined"`);
    assert.ok(!text.includes('[object Object]'), `${file} carries "[object Object]"`);
  }
});

test('src/composition requires nothing a browser cannot give it', () => {
  // `node:crypto` IS required by `compose.js` (for `verdictDigest`, which is not
  // portable and not in PORTABLE) — the check is that no PORTABLE function reaches
  // it, which the first test proves, and that no module in the context reaches for
  // a host facility a browser has no equivalent of.
  // eslint-disable-next-line global-require
  const { sources } = require('./_scan.js');
  const FORBIDDEN = ['node:fs', 'fs', 'node:child_process', 'child_process', 'node:os',
    'os', 'node:http', 'http', 'node:https', 'https', 'node:net', 'net', 'node:vm', 'vm'];
  let read = 0;
  for (const file of sources()) {
    if ((file.dir.split('/')[0] || '') !== 'composition') continue;
    read += 1;
    for (const specifier of file.requires) {
      assert.ok(!FORBIDDEN.includes(specifier), `${file.rel} requires ${specifier}`);
    }
  }
  assert.ok(read >= 4, `the sweep read only ${read} files under src/composition/`);
});

test('the two canonicalisers of this system are proven equal, not assumed', () => {
  // A guard on the guard: if the property test that proves
  // `harness.canonicalJson === jcs.canonicalize` is ever deleted, this fails.
  const text = fs.readFileSync(path.resolve(__dirname, '..', 'composition', 'harness.test.js'), 'utf8');
  assert.match(text, /the portable canonicalizer equals the pinned RFC 8785 library/u);
  assert.match(text, /jcs\.canonicalize\(value\)/u);
});
