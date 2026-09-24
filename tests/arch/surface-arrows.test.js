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

test('the seven tool names are declared once, in Boundary, and reused', () => {
  const surfacesFile = sources().find((f) => f.rel === 'src/boundary/surfaces.js');
  assert.match(surfacesFile.text, /const TOOL_NAMES = Object\.freeze\(\[/u);
  for (const file of sources()) {
    if (file.rel === 'src/boundary/surfaces.js') continue;
    assert.ok(!/'ask',\s*'compose',\s*'links'/u.test(file.text),
      `${file.rel} restates the tool list; require TOOL_NAMES instead`);
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
  // AGSC-11-08: "an implementation MUST NOT hand-parse address literals".
  const federation = sources().find((f) => f.rel === 'src/boundary/federation.js');
  assert.ok(federation.requires.includes('node:net'), 'federation.js must use node:net.BlockList');
  assert.match(federation.text, /new net\.BlockList\(\)/u);
  assert.ok(!/\.split\('\.'\)\.map\(Number\)/u.test(federation.text), 'an address literal is being parsed by hand');
});
