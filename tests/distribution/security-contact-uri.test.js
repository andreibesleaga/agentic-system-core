'use strict';
// AGSC-06-36: `/.well-known/security.txt` MUST be a conforming RFC 9116 file. RFC 9116
// section 2.5.3: the `Contact:` value "MUST follow the URI syntax described in
// Section 3 of [RFC3986]. This means that "mailto" and "tel" URI schemes must be used
// when specifying email addresses and telephone numbers", and "If this field indicates
// a web URI, then it MUST begin with "https://"". A bare address was accepted and
// published unchanged (verification finding G25, 2026-10-02); it is now AGSC-E204,
// like the other malformed values of the rule, and the route is not emitted.
//
// Pure: the writer function with a fixed build instant.

const test = require('node:test');
const assert = require('node:assert/strict');

const site = require('../../src/distribution/site.js');

const BASE = 'https://example.org/';
const INSTANT = '2026-01-01T00:00:00Z';
const at = (local, domain) => [local, domain].join('@');
/** A telephone-shaped string, kept in parts so that no file holds one. */
const phone = (sep) => ['+1', '201', '555', '0123'].join(sep);

function write(contact) {
  return site.securityTxt(BASE, INSTANT, { authored: `Contact: ${contact}\n`, publishing: true });
}

test('G25: a Contact that is not a URI is AGSC-E204 and nothing is emitted', () => {
  for (const contact of [at('security', 'example.org'), phone(' '), 'example.org/security', 'http://example.org/security', 'see the website']) {
    const r = write(contact);
    assert.equal(r.text, null, contact);
    const codes = r.findings.filter((f) => f.severity === 'error').map((f) => f.code);
    assert.deepEqual(codes, ['AGSC-E204'], contact);
    assert.equal(r.findings[0].line, 1, contact);
  }
});

test('G25: the RFC 9116 forms are published as before', () => {
  for (const contact of [`mailto:${at('security', 'example.org')}`, `tel:${phone('-')}`, 'https://example.org/security-contact.html']) {
    const r = write(contact);
    assert.deepEqual(r.findings, [], contact);
    assert.ok(r.text.startsWith(`Contact: ${contact}\n`), contact);
  }
});
