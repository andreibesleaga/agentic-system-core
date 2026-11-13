'use strict';
// tests/knowledge/license-url.test.js — AGSC-06-44: the licence URL of a node, in the rule's
// order: `bundle.license_url`; else, under the Content Use Terms (or no prose licence) and with
// `/legal/` emitted, the absolute URL of `/legal/`; else none. Pure; no I/O.

const test = require('node:test');
const assert = require('node:assert/strict');

const { licenseUrl, TERMS } = require('../../src/knowledge/chunks.js');

const site = { base: 'https://a.example' };

test('AGSC-06-44: the configured versioned URL comes first, whatever else is set', () => {
  const url = 'https://creativecommons.org/licenses/by/4.0/';
  assert.equal(licenseUrl({ bundle: { license_prose: 'CC0-1.0', license_url: url }, site }, { legal: true }), url);
  assert.equal(licenseUrl({ bundle: { license_url: url }, site }), url);
});

test('AGSC-06-44: /legal/ only under the Content Use Terms and only when the build emits it', () => {
  assert.equal(licenseUrl({ bundle: {}, site }, { legal: true }), 'https://a.example/legal/');
  assert.equal(licenseUrl({ bundle: { license_prose: TERMS }, site: { base: 'https://a.example///' } }, { legal: true }), 'https://a.example/legal/');
  assert.equal(licenseUrl({ bundle: {}, site }, { legal: false }), null);
  assert.equal(licenseUrl({ bundle: { license_prose: 'CC-BY-4.0' }, site }, { legal: true }), null, 'another prose licence: no URL is invented');
  assert.equal(licenseUrl(undefined), null);
});
