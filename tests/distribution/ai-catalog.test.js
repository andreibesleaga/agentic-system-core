'use strict';
// tests/distribution/ai-catalog.test.js — AGSC-06-42: the two opt-in catalogue files.
//
//   * Off by default: no file, no finding.
//   * The `urn:air` host is a fully qualified domain name: an IP literal, a single label and a
//     `.local` name are AGSC-E209, a missing `bundle.id` is AGSC-E202, and no file is written.
//   * Each entry's digest is the SHA-256 of the exact bytes it points at; `ard.json` carries it as
//     `metadata.digest`, `ai-catalog.json` as `digest`; no `representativeQueries`.
//   * fast-check: the files are the same bytes twice and their entries are in identifier order.
//
// Deterministic: no clock, no network, fixed seed.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fc = require('fast-check');

const { catalogueFiles, domainName, AI_CATALOG_PATH, ARD_PATH } = require('../../src/distribution/ai-catalog.js');

const config = (extra = {}) => ({
  bundle: { id: 'example' }, discovery: { ai_catalog: true }, site: { base: 'https://a.example/', title: 'Example Node' }, ...extra,
});
const DOCUMENT = '{"linkset":[{"anchor":"https://a.example/"}]}\n';
const hex = (text) => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;

test('AGSC-06-42: no file unless discovery.ai_catalog is true', () => {
  for (const discovery of [undefined, {}, { ai_catalog: false }, { ai_catalog: 'true' }]) {
    const result = catalogueFiles({ config: config({ discovery }), discoveryBytes: DOCUMENT });
    assert.equal(result.files.size, 0);
    assert.deepEqual(result.findings, []);
  }
});

test('AGSC-06-42: the host must be a fully qualified domain name; bundle.id must be set', () => {
  for (const base of ['http://localhost:8080/', 'https://127.0.0.1/', 'https://[::1]/', 'https://node.local/', 'https://0x7f.1/', 'not a url']) {
    const result = catalogueFiles({ config: config({ site: { base, title: 'T' } }), discoveryBytes: DOCUMENT });
    assert.equal(result.files.size, 0, base);
    assert.deepEqual(result.findings.map((f) => [f.code, f.severity]), [['AGSC-E209', 'error']], base);
  }
  const noId = catalogueFiles({ config: config({ bundle: {} }), discoveryBytes: DOCUMENT });
  assert.deepEqual([noId.files.size, noId.findings.map((f) => f.code)], [0, ['AGSC-E202']]);
  assert.equal(domainName('https://A.Example:8443/x'), 'a.example', 'lower case, no port');
});

test('AGSC-06-42: each digest is the SHA-256 of the bytes served at the entry\'s url, in the form each format names', () => {
  const cardBytes = '{"name":"Example Node"}\n';
  const { files } = catalogueFiles({ cardBytes, config: config(), description: 'A node.', discoveryBytes: DOCUMENT });
  const catalog = JSON.parse(files.get(AI_CATALOG_PATH));
  const ard = JSON.parse(files.get(ARD_PATH));
  assert.deepEqual(catalog.entries.map((e) => e.digest), [hex(cardBytes), hex(DOCUMENT)]);
  assert.deepEqual(ard.entries.map((e) => e.metadata.digest), [hex(cardBytes), hex(DOCUMENT)]);
  assert.equal(catalog.specVersion, '1.0');
  for (const one of [...catalog.entries, ...ard.entries]) assert.equal(one.representativeQueries, undefined);
  const plain = catalogueFiles({ config: config(), discoveryBytes: DOCUMENT }).files;
  assert.equal(JSON.parse(plain.get(ARD_PATH)).entries[0].description, undefined, 'no description member when there is none');
});

test('property: the catalogue files are the same bytes twice and list their entries in identifier order', () => {
  fc.assert(fc.property(fc.string({ maxLength: 40 }), fc.option(fc.string({ maxLength: 40 })), fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/u),
    (document, cardBytes, id) => {
      const input = { cardBytes, config: config({ bundle: { id } }), description: 'd', discoveryBytes: document };
      const first = catalogueFiles(input).files;
      assert.deepEqual([...catalogueFiles(input).files], [...first]);
      for (const route of [ARD_PATH, AI_CATALOG_PATH]) {
        const ids = JSON.parse(first.get(route)).entries.map((e) => e.identifier);
        assert.deepEqual(ids, [...ids].sort());
        assert.equal(ids.length, cardBytes === null ? 1 : 2);
      }
    }), { numRuns: 60, seed: 20261107 });
});
