'use strict';
// Architecture checks owned: the arrows and invariants of the
// Composition, Boundary and tool-Surface modules. `tests/arch/_scan.js` reads
// source text and never executes a module, so a side effect cannot hide a
// violation.

const test = require('node:test');
const assert = require('node:assert');
const { sources } = require('./_scan.js');

const mine = (prefix) => sources().filter((f) => f.rel.startsWith(prefix));

test('Boundary is an anti-corruption layer: it never requires Distribution', () => {
  // This is why `boundary/visibility.js` computes the AGSC-11-03/11-05 header
  // sets itself instead of calling `distribution/headers.js`; Distribution may
  // call Boundary, never the other way round.
  for (const file of mine('src/boundary/')) {
    for (const specifier of file.requires) {
      assert.ok(!specifier.includes('/distribution/') && !specifier.includes('../distribution'),
        `${file.rel} requires Distribution; Boundary is upstream of it`);
    }
  }
});

test('Composition requires no Surface, no Boundary and no Governance', () => {
  for (const file of mine('src/composition/')) {
    for (const specifier of file.requires) {
      for (const forbidden of ['/distribution/', '/boundary/', '/governance/']) {
        assert.ok(!specifier.includes(forbidden), `${file.rel} requires ${specifier}`);
      }
    }
  }
});

test('no tool function names a foreign protocol version (the anti-corruption rule)', () => {
  // The MCP wire revision, the declared surface revisions and the WebMCP
  // report date live in `boundary/surfaces.js` and nowhere else
  // (AGSC-11-16, AGSC-11-18). A date literal in a tool function would make the
  // core depend on someone else's release calendar.
  const VERSION_LITERAL = /['"]20\d\d-\d\d-\d\d['"]/u;
  for (const file of sources()) {
    if (file.rel === 'src/boundary/surfaces.js') continue;
    const code = file.text.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
    assert.ok(!VERSION_LITERAL.test(code),
      `${file.rel} carries an external version literal; it belongs in boundary/surfaces.js`);
  }
});

/**
 * The tool names as surfaces.js declares them, read from its text (the scan never runs a
 * module), and the patterns that refuse a restatement: any three of them in a row, in their
 * order, quoted. That catches the ten names of 1.1 and the seven of 1.0, whose run
 * `'links', 'propose', 'read'` is three in a row of the ten too.
 */
function toolListPatterns(surfacesText) {
  const literal = /const TOOL_NAMES = Object\.freeze\(\[([^\]]*)\]\)/u.exec(surfacesText);
  const names = literal ? [...literal[1].matchAll(/'([a-z]+)'/gu)].map((m) => m[1]) : [];
  const runs = [];
  for (let i = 0; i + 3 <= names.length; i += 1) {
    runs.push(new RegExp(names.slice(i, i + 3).map((n) => `['"]${n}['"]`).join(',\\s*'), 'u'));
  }
  return { names, runs };
}

test('the ten tool names are declared once, in Boundary, and reused', () => {
  const surfacesFile = sources().find((f) => f.rel === 'src/boundary/surfaces.js');
  const { names, runs } = toolListPatterns(surfacesFile.text);
  assert.strictEqual(names.length, 10, 'TOOL_NAMES holds the ten tools of AGSC-09-13');
  const restates = (text) => runs.some((re) => re.test(text));
  // The check refuses both lists it exists for, and a single name is no restatement.
  assert.ok(restates("['ask', 'brief', 'check', 'compose']"), 'the 1.1 list is not refused');
  assert.ok(restates("['ask', 'compose', 'links', 'propose', 'read']"), 'the 1.0 list is not refused');
  assert.ok(!restates("name === 'ask'"));
  for (const file of sources()) {
    if (file.rel === 'src/boundary/surfaces.js') continue;
    assert.ok(!restates(file.text), `${file.rel} restates the tool list; require TOOL_NAMES instead`);
  }
});

test('the Surface modules reach the network through nothing at all', () => {
  const NETWORK = ['http', 'node:http', 'https', 'node:https', 'net', 'node:net', 'dgram', 'node:dgram'];
  for (const file of mine('src/distribution/mcp')) {
    for (const specifier of file.requires) {
      assert.ok(!NETWORK.includes(specifier), `${file.rel} requires ${specifier}`);
    }
  }
  for (const file of mine('src/distribution/webmcp')) {
    assert.deepStrictEqual(file.requires.filter((r) => NETWORK.includes(r)), []);
  }
});

test('Boundary classifies addresses with the platform, never by hand', () => {
  // AGSC-11-08: classification gives every textual form of one address the same
  // result, which a parser of addresses gives and a match on the literal's text does not.
  const federation = sources().find((f) => f.rel === 'src/boundary/federation.js');
  assert.ok(federation.requires.includes('node:net'), 'federation.js must use node:net.BlockList');
  assert.match(federation.text, /new net\.BlockList\(\)/u);
  assert.ok(!/\.split\('\.'\)\.map\(Number\)/u.test(federation.text), 'an address literal is being parsed by hand');
});
