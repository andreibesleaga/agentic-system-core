'use strict';
// tests/arch/page-tools-portable.test.js — the AGSC-07-13 portability contract,
// applied to the SEVEN PAGE TOOLS of AGSC-09-16.
//
// `distribution/page-tools.js` emits the SOURCE TEXT of the functions Node runs, the
// way `composition/browser.js` does for the algebra, so there is ONE implementation
// of the tools and the two hosts cannot drift. That holds only while every portable
// function is self-contained: a function closing over a module-scope binding would be
// emitted with a free variable that is `undefined` in the page, and the failure would
// be silent — a wrong answer, not a crash.

const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const pageTools = require('../../src/distribution/page-tools.js');

const FILE = path.resolve(__dirname, '..', '..', 'src', 'distribution', 'page-tools.js');

/** Every name the module binds at MODULE SCOPE — the set a page has no binding for. */
function moduleScopeNames() {
  const text = fs.readFileSync(FILE, 'utf8');
  const names = [];
  for (const line of text.split('\n')) {
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

test('every portable page-tool name is a function whose own source text is emitted', () => {
  assert.ok(Array.isArray(pageTools.PORTABLE) && pageTools.PORTABLE.length > 0);
  const emitted = pageTools.bundle({ bundleId: 'x' });
  for (const name of pageTools.PORTABLE) {
    const source = String(pageTools[name] === undefined ? '' : pageTools[name]);
    // Not every portable function is exported from the module (only the ones a Node
    // caller needs are), so the check is made against the EMITTED text, which is the
    // artefact the page runs.
    assert.ok(emitted.includes(`function ${name}(`),
      `${name} is named in PORTABLE but its declaration is not in the emitted script`);
    if (source !== '') {
      assert.ok(!source.includes('require('), `${name} requires a module; a page cannot`);
    }
  }
});

test('no portable page-tool function closes over a module-scope binding', () => {
  const emittedNames = new Set(pageTools.PORTABLE);
  const bound = moduleScopeNames().filter((n) => !emittedNames.has(n));
  assert.ok(bound.length > 0, 'no module-scope binding was found; the scan is broken');
  const text = fs.readFileSync(FILE, 'utf8');
  for (const name of pageTools.PORTABLE) {
    const at = text.indexOf(`\nfunction ${name}(`);
    assert.notStrictEqual(at, -1, `${name} is not a top-level function declaration`);
    const source = text.slice(at, text.indexOf('\n}\n', at) + 3);
    for (const binding of bound) {
      const used = new RegExp(`(?<![A-Za-z0-9_$.'"\`])${binding.replace(/\$/gu, '\\$')}(?![A-Za-z0-9_$])`, 'u');
      const redeclared = new RegExp(`(?:const|let|var)\\s+${binding.replace(/\$/gu, '\\$')}\\b`, 'u');
      if (used.test(source) && !redeclared.test(source)) {
        assert.fail(`page-tools.js#${name} reads the module-scope binding "${binding}"; `
          + 'a page has no such binding, so the emitted script would carry `undefined` (AGSC-07-13)');
      }
    }
  }
});

test('the emitted script evaluates in a context that holds only the language', () => {
  // A free identifier the page has no binding for would throw here, which is exactly
  // what a silent `undefined` in a tool answer would otherwise become.
  const context = vm.createContext({ TextEncoder });
  vm.runInContext(pageTools.bundle({ bundleId: 'x', specVersion: '1.0.0-rc.5' }), context,
    { filename: 'agsc-page-tools.js' });
  const api = vm.runInContext('globalThis.AGSC_PAGE_TOOLS', context);
  assert.strictEqual(typeof api.pageToolset, 'function');
  assert.strictEqual(api.BUNDLE_ID, 'x');
  // With no `document` the bootstrap stands down and installs nothing at all.
  assert.strictEqual(vm.runInContext('typeof globalThis.AGSC_TOOLS', context), 'undefined');
  assert.strictEqual(api.ready, null);
});

test('the emitted script reaches no third-party origin and evaluates no text', () => {
  const emitted = pageTools.bundle({ bundleId: 'x' });
  // AGSC-06-05: no third-party origin, no cookie, no storage, no beacon.
  for (const forbidden of ['localStorage', 'sessionStorage', 'document.cookie', 'indexedDB',
    'sendBeacon', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts']) {
    assert.ok(!emitted.includes(forbidden), `the page-tool script uses ${forbidden}`);
  }
  // AGSC-06-17: `script-src 'self'` with no `unsafe-eval`.
  for (const forbidden of ['eval(', 'new Function', 'setTimeout("', 'innerHTML']) {
    assert.ok(!emitted.includes(forbidden), `the page-tool script uses ${forbidden}`);
  }
  // Every address it names is site-absolute; nothing has a scheme or an authority.
  // A route literal is `/` followed by a name; `'//'` in the guard that rejects a
  // protocol-relative body reference is not a route and is excluded by that shape.
  const targets = [...emitted.matchAll(/'(\/[a-z][^']*)'/gu)].map((m) => m[1]);
  assert.ok(targets.includes('/search.json'), 'the script reads no published index');
  for (const target of targets) {
    assert.ok(target.startsWith('/') && !target.startsWith('//'), `${target} is not same-origin`);
  }
  // An absolute origin is a scheme, `//` and a HOST; the only `https://` in the
  // script is inside the AGSC-05-04b message, whose bytes the local server's message
  // fixes ("use the https:// IRI").
  assert.ok(!/https?:\/\/[A-Za-z0-9]/u.test(emitted), 'the page-tool script names an absolute origin');
});
