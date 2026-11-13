'use strict';
// application/bundle.js: the Bundle root document and the configuration must agree
// (AGSC-00-17, AGSC-01-04). From 1.1 a difference is reported and nothing else
// changes: no exit code, no emitted byte. Both are warnings, because a 1.0 Bundle
// that carried the difference was valid and a MINOR adds only (AGSC-00-14).

const test = require('node:test');
const assert = require('node:assert');

const { loadBundle } = require('../../src/application/bundle.js');

function root({ specVersion = '1.0.0', base = 'https://a.example/' } = {}) {
  return `---\nspec_version: ${specVersion}\nokf_version: "0.2"\ntitle: T\ndescription: D\nbase: ${base}\n---\n\n# T\n`;
}

function port(config, index) {
  return {
    exists: (p) => p === 'agsc.config.json' || (p === 'content/index.md' && index !== null),
    readdir: () => [],
    readFile: (p) => (p === 'agsc.config.json' ? JSON.stringify(config) : index),
    walk: () => [],
  };
}

const CONFIG = { site: { base: 'https://a.example/' }, spec_version: '1.0.0' };
const byCode = (bundle, code) => bundle.findings.filter((f) => f.code === code);

test('AGSC-00-17: two different spec_version values are one warning AGSC-E506 on the root document', () => {
  const bundle = loadBundle(port(CONFIG, root({ specVersion: '1.0.1' })), {});
  const [hit, ...rest] = byCode(bundle, 'AGSC-E506');
  assert.deepStrictEqual(rest, []);
  assert.deepStrictEqual([hit.file, hit.severity], ['content/index.md', 'warn']);
  assert.match(hit.message, /1\.0\.1.*1\.0\.0.*AGSC-00-17/u);
});

test('AGSC-00-17: equal values, or a value missing on either side, report nothing here', () => {
  assert.deepStrictEqual(byCode(loadBundle(port(CONFIG, root()), {}), 'AGSC-E506'), []);
  assert.deepStrictEqual(byCode(loadBundle(port({ site: CONFIG.site }, root()), {}), 'AGSC-E506'), []);
});

test('AGSC-01-04: a root base that differs from site.base is one warning AGSC-E204 on the root document', () => {
  const bundle = loadBundle(port(CONFIG, root({ base: 'https://other.example/' })), {});
  const [hit, ...rest] = byCode(bundle, 'AGSC-E204');
  assert.deepStrictEqual(rest, []);
  assert.deepStrictEqual([hit.file, hit.severity], ['content/index.md', 'warn']);
  assert.match(hit.message, /https:\/\/other\.example\/.*https:\/\/a\.example\/.*AGSC-01-04/u);
});

test('AGSC-01-04: a trailing slash does not make two bases different, and a missing site.base reports nothing', () => {
  assert.deepStrictEqual(byCode(loadBundle(port(CONFIG, root({ base: 'https://a.example' })), {}), 'AGSC-E204'), []);
  assert.deepStrictEqual(byCode(loadBundle(port({ spec_version: '1.0.0' }, root({ base: 'https://z.example/' })), {}), 'AGSC-E204'), []);
});

test('a Bundle without a root document reports neither', () => {
  const bundle = loadBundle(port(CONFIG, null), {});
  assert.deepStrictEqual(bundle.findings.filter((f) => f.severity === 'warn'), []);
});
