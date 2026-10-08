'use strict';
// AGSC-09-14a: `ask` returns the descriptions of the best-matching published items with
// their addresses and calls no model. Its tool description said "Answer a question
// from this memory", which a client reads as a generated answer (verification finding
// G12, 2026-10-02). The manifest is one object on both transports (AGSC-09-16), so the
// stdio server's `tools/list` and every page's WebMCP registration say the same.

const test = require('node:test');
const assert = require('node:assert/strict');

const { manifest } = require('../../src/distribution/mcp-tools.js');
const webmcp = require('../../src/distribution/webmcp.js');

test('G12: the ask tool says it returns item descriptions and calls no model', () => {
  const ask = manifest().tools.find((t) => t.name === 'ask');
  assert.match(ask.description, /descriptions of the best-matching items/u);
  assert.match(ask.description, /no model is called/u);
  assert.doesNotMatch(ask.description, /^Answer a question/u);
  // One manifest, two transports: the page registers the same text.
  assert.ok(webmcp.script().includes(JSON.stringify(ask.description)));
});
