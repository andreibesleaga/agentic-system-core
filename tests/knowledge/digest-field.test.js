'use strict';
// The RFC 9530 digest value `sha-256=:<base64>:` (AGSC-06-08, AGSC-06-29, AGSC-06-44,
// AGSC-09-17): one Structured Fields Dictionary member whose value is a Byte Sequence
// (RFC 9651), written by the `structured-headers` library and never by hand, over a
// SHA-256 computed by node:crypto. The oracle is the plain base64 of the same hash; the
// round trip is the library's own parser.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fc = require('fast-check');
const { parseDictionary } = require('structured-headers');

const { sha256Field } = require('../../src/knowledge/digest-field.js');

/** The value as the rule words it, from Node alone: the oracle. */
const oracle = (bytes) => `sha-256=:${crypto.createHash('sha256').update(bytes).digest('base64')}:`;

test('the empty byte string has the SHA-256 every reader knows', () => {
  assert.equal(sha256Field(''), 'sha-256=:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=:');
});

test('a string is hashed as its UTF-8 bytes, a Buffer as its bytes', () => {
  assert.equal(sha256Field('é\n'), oracle(Buffer.from('é\n', 'utf8')));
  assert.equal(sha256Field(Buffer.from([0, 255, 10])), oracle(Buffer.from([0, 255, 10])));
});

test('property: the field equals the oracle and parses back to the same 32 bytes', () => {
  fc.assert(fc.property(fc.uint8Array({ maxLength: 512 }), (raw) => {
    const bytes = Buffer.from(raw);
    const field = sha256Field(bytes);
    assert.equal(field, oracle(bytes));
    const parsed = parseDictionary(field).get('sha-256');
    assert.ok(Buffer.from(parsed[0]).equals(crypto.createHash('sha256').update(bytes).digest()));
  }), { numRuns: 200, seed: 20260918 });
});

test('the pinned Structured Fields library reaches no clock, no network, no environment and no other module', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'node_modules', 'structured-headers', 'cjs', 'index.cjs'), 'utf8');
  for (const forbidden of ['Date.now', 'Math.random', 'fetch(', 'process.env', 'require(']) {
    assert.ok(!source.includes(forbidden), `the library reaches ${forbidden}`);
  }
  // Its one `new Date` turns a parsed RFC 9651 Date item into a value; it reads no clock.
  assert.equal(source.split('new Date(').length - 1, 1);
  assert.ok(source.includes('new Date(parseInt(inputNumber, 10) * sign * 1e3)'));
});
