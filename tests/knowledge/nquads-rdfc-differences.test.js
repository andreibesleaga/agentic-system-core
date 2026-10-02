'use strict';
// AGSC-04-16 (amended 2026-10-02 for 1.0.0): `graph.nq` is this specification's own
// canonical form, not RDFC-1.0's. For a blank-node-free dataset the two hold the same
// quads and differ in exactly four ways of writing a term: (a) the explicit
// `^^xsd:string` of a plain literal (AGSC-05-31), (b) lowercase hex in `\u` escapes,
// (c) `\u0008`/`\u000c` for backspace and form feed, (d) U+007F written as itself
// (AGSC-05-32). This test runs a real RDFC-1.0 implementation (`rdf-canonize`, the one
// `jsonld` depends on) over the engine's own output and checks that claim both ways:
// the two outputs differ, and they become equal after exactly those four rewrites.
//
// Deterministic: no clock, no network, no file.

const test = require('node:test');
const assert = require('node:assert/strict');
const canonize = require('rdf-canonize');

const nq = require('../../src/knowledge/nquads.js');

const XSD_STRING_SUFFIX = '^^<http://www.w3.org/2001/XMLSchema#string>';

/** One engine-form quad with a plain literal, written by the engine's own escaper. */
function engineLine(value) {
  return `<https://example.org/a/> <http://purl.org/dc/terms/title> "${nq.escapeLiteral(value)}"${XSD_STRING_SUFFIX} <https://example.org/> .\n`;
}

/** The four rewrites AGSC-04-16 names, from this specification's form to RDFC-1.0's. */
function toRdfc(text) {
  return text
    .split(XSD_STRING_SUFFIX).join('')                                   // (a)
    .replace(/\\u0008/gu, '\\b').replace(/\\u000c/gu, '\\f')             // (c)
    .replace(/\\u([0-9a-f]{4})/gu, (_, hex) => `\\u${hex.toUpperCase()}`) // (b)
    .replace(/\u007f/gu, '\\u007F');                                     // (d)
}

async function rdfc(text) {
  const dataset = canonize.NQuads.parse(text);
  return canonize.canonize(dataset, { algorithm: 'RDFC-1.0', format: 'application/n-quads' });
}

test('AGSC-04-16: a plain literal alone already makes graph.nq differ from RDFC-1.0 output', async () => {
  const ours = engineLine('A plain title');
  const theirs = await rdfc(ours);
  assert.notEqual(ours, theirs);
  assert.equal(toRdfc(ours), theirs);
});

test('AGSC-04-16: backspace, form feed, another control character and DEL differ exactly as the rule says', async () => {
  const ours = engineLine('a\u0008b\u000cc\u001bd\u007fe');
  assert.match(ours, /\\u0008/u);
  assert.match(ours, /\\u000c/u);
  assert.match(ours, /\\u001b/u);
  assert.ok(ours.includes('\u007f'), 'DEL is written as itself');
  const theirs = await rdfc(ours);
  assert.equal(toRdfc(ours), theirs);
});

test('AGSC-04-16: the same quads — parsing either form gives one dataset', async () => {
  const ours = engineLine('x\u0008y');
  const theirs = await rdfc(ours);
  assert.equal(await rdfc(theirs), theirs);
  assert.equal(await rdfc(toRdfc(ours)), theirs);
});
