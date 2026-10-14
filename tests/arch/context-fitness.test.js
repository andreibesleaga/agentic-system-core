'use strict';
// Seven architectural rules the documents state for the bounded contexts and that no
// test enforced. A probe
// module in `src/knowledge/` that broke any of them passed every other architecture
// test, the dependency checker and the linter, because those read `require('…')` with
// single quotes and five fixed texts only.
//
//   1  no dynamic loading: `import()`, `createRequire`, `module.require`, a `require`
//      whose argument is not a literal;
//   2  no global network name: `fetch`, `WebSocket`, `XMLHttpRequest`, `EventSource`
//      (an INJECTED function that happens to be called `fetch`, as in
//      `boundary/federation.js`, is a local binding and is allowed);
//   3  no randomness through the allowed `node:crypto`: `randomUUID`, `randomBytes`,
//      `randomInt`, `getRandomValues`;
//   4  no locale (`src/README.md`, "no locale"): `localeCompare`, `toLocale…`, `Intl`;
//   5  no clock by another spelling: the `Date` global in any form (`Date()`,
//      `Date.parse`, `Date.UTC`), `hrtime`;
//   6  no timers: `setTimeout`, `setInterval`, `setImmediate`;
//   7  no computed reach into the process or the global object: `globalThis`, `global`.
//
// The check parses each module with the pinned linter (a devDependency), so it is
// scope-aware: a name in a string or in a template — the page scripts that
// `distribution/` EMITS for the browser are templates — is not code of the context,
// and a local binding is not a global. It reads the files; it never runs a module.

const test = require('node:test');
const assert = require('node:assert');
const { Linter } = require('eslint');
const { sources } = require('./_scan.js');

/** The bounded contexts (docs/ARCHITECTURE-DDD.md §2); `application/` and `adapters/` are the hosts. */
const CONTEXTS = ['knowledge', 'governance', 'composition', 'boundary', 'interchange', 'distribution', 'shared'];

const RULES = {
  'no-restricted-globals': ['error',
    // 2 network
    'fetch', 'WebSocket', 'XMLHttpRequest', 'EventSource',
    // 4 locale
    'Intl',
    // 5 clock
    'Date',
    // 6 timers
    'setTimeout', 'setInterval', 'setImmediate',
    // 7 the global object
    'globalThis', 'global'],
  'no-restricted-properties': ['error',
    // 3 randomness
    { property: 'randomUUID' }, { property: 'randomBytes' }, { property: 'randomInt' }, { property: 'getRandomValues' },
    // 4 locale
    { property: 'localeCompare' }, { property: 'toLocaleString' }, { property: 'toLocaleDateString' },
    { property: 'toLocaleTimeString' }, { property: 'toLocaleLowerCase' }, { property: 'toLocaleUpperCase' },
    // 5 clock
    { property: 'hrtime' }],
  'no-restricted-syntax': ['error',
    // 1 dynamic loading
    { message: 'dynamic import', selector: 'ImportExpression' },
    { message: 'createRequire', selector: 'Identifier[name="createRequire"]' },
    { message: 'module.require', selector: 'MemberExpression[object.name="module"][property.name="require"]' },
    { message: 'a require of a computed name', selector: 'CallExpression[callee.name="require"][arguments.0.type!="Literal"]' }],
};

// `noInlineConfig`: an `eslint-disable` comment in a module cannot switch these off.
const CONFIG = [{
  languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs' },
  linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'off' },
  rules: RULES,
}];

/** Every finding of the seven rules in one module's text. */
function violations(text, filename) {
  // A parse failure is reported too; the notices about inline comments are not.
  return new Linter({ configType: 'flat' }).verify(text, CONFIG, { filename })
    .filter((m) => m.fatal === true || Object.prototype.hasOwnProperty.call(RULES, m.ruleId))
    .map((m) => `${filename}:${m.line} ${m.message}`);
}

test('no bounded context loads, fetches, randomises, localises, reads a clock, sets a timer or reaches the global object', () => {
  const found = [];
  let files = 0;
  for (const file of sources()) {
    if (!CONTEXTS.includes(file.dir.split('/')[0])) continue;
    files += 1;
    found.push(...violations(file.text, file.rel));
  }
  assert.ok(files > 80, `only ${files} context modules were read`);
  assert.deepStrictEqual(found, []);
});

test('the check is not vacuous — each of the seven is caught in a probe module', () => {
  const probes = [
    ['1 dynamic import', 'module.exports = () => import("node:fs");'],
    ['1 createRequire', 'const { createRequire } = require("node:module"); module.exports = createRequire;'],
    ['1 module.require', 'module.exports = module.require("node:fs");'],
    ['1 computed require', 'const name = "node:fs"; module.exports = require(name);'],
    ['1 template require', 'module.exports = require(`node:${"fs"}`);'],
    ['2 fetch', 'module.exports = () => fetch("https://example.org/");'],
    ['2 WebSocket', 'module.exports = () => new WebSocket("wss://example.org/");'],
    ['3 randomUUID', 'const crypto = require("node:crypto"); module.exports = () => crypto.randomUUID();'],
    ['3 randomBytes', 'const { randomBytes } = require("node:crypto"); module.exports = () => randomBytes(4);'],
    ['4 localeCompare', 'module.exports = (a, b) => a.localeCompare(b);'],
    ['4 Intl', 'module.exports = new Intl.Collator("en");'],
    ['5 Date()', 'module.exports = () => Date();'],
    ['5 Date.parse', 'module.exports = () => Date.parse("2026-01-01");'],
    ['6 setTimeout', 'module.exports = (f) => setTimeout(f, 1);'],
    ['6 setImmediate', 'module.exports = (f) => setImmediate(f);'],
    ['7 globalThis[…]', 'module.exports = globalThis["pro" + "cess"];'],
    ['7 global[…]', 'module.exports = global["pro" + "cess"];'],
  ];
  for (const [label, text] of probes) {
    assert.ok(violations(text, 'src/knowledge/zz-probe.js').length > 0, `${label} was not caught`);
  }
  // What is allowed: an injected function named like a global, and the names in text.
  const allowed = [
    'module.exports = (options) => { const fetch = options.fetch; return fetch("k"); };',
    'module.exports = "fetch(route); setTimeout(run, 120); globalThis.AGSC_TOOLS";',
    'module.exports = () => `var t = setTimeout(function () {}, 1); fetch("/x");`;',
    '// Date.now() and localeCompare are named in a comment only\nmodule.exports = 1;',
    'const crypto = require("node:crypto"); module.exports = (t) => crypto.createHash("sha256").update(t).digest("hex");',
  ];
  for (const text of allowed) {
    assert.deepStrictEqual(violations(text, 'src/knowledge/zz-probe.js'), [], text);
  }
});
