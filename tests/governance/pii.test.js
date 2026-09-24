'use strict';
// AGSC-08-16 (`no-pii`).
// Every address below is in a reserved example domain (RFC 2606).

const test = require('node:test');
const assert = require('node:assert');
const pii = require('../../src/governance/pii.js');

const codes = (findings) => findings.map((f) => f.code);

test('an e-mail address in prose is AGSC-E404', () => {
  assert.deepStrictEqual(codes(pii.check({ text: 'write to someone@example.org for access' })),
    ['AGSC-E404']);
});

test('a telephone number in prose is AGSC-E404', () => {
  for (const text of ['call +40 21 123 4567', 'call (555) 123-4567', 'call 555-123-4567',
    'see tel:+15551234567']) {
    assert.deepStrictEqual(codes(pii.check({ text })), ['AGSC-E404'], text);
  }
});

test('a bare run of digits is not a telephone number', () => {
  for (const text of ['version 1.0.0-rc.4', 'the cap is 1048576 bytes', 'ISBN 9780000000000',
    'port 8080', 'SOURCE_DATE_EPOCH=1767225600']) {
    assert.deepStrictEqual(pii.check({ text }), [], text);
  }
});

test('an empty or absent text is silent', () => {
  assert.deepStrictEqual(pii.check({ text: '' }), []);
  assert.deepStrictEqual(pii.check(), []);
});

test('AGSC-08-16 exempts prov and sources[] structurally, not by heuristics', () => {
  assert.deepStrictEqual([...pii.EXEMPT_KEYS].sort(), ['prov', 'sources']);
});

test('the finding names the file, the slug and where it was found', () => {
  const [f] = pii.check({
    text: 'a@example.org', file: 'content/concepts/a.md', slug: 'a', where: 'the body',
  });
  assert.strictEqual(f.file, 'content/concepts/a.md');
  assert.strictEqual(f.slug, 'a');
  assert.strictEqual(f.severity, 'error');
  assert.match(f.message, /in the body/u);
});
