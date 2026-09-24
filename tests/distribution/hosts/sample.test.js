'use strict';
// tests/distribution/hosts/sample.test.js — the hosting-profile samples under
// `examples/hosts/` hold to the same contract as the one-per-kind samples of
// `examples/plugins/` (AGSC-00-24): they register into the deployment-profile registry and no
// other, they require nothing at all (so they can reach neither the network nor the
// disk), and every path they name is relative and outside `content/`.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const plugins = require('../../../src/application/plugins.js');
const pluginLoader = require('../../../src/application/plugin-loader.js');
const { SPEC_VERSION } = require('../../../src/application/cli/main.js');

const DIR = path.resolve(__dirname, '..', '..', '..', 'examples', 'hosts');
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.js')).sort();

test('there is at least one hosting-profile sample, each named after itself', () => {
  assert.ok(files.length >= 1);
  for (const file of files) assert.strictEqual(require(path.join(DIR, file)).name, file.replace(/\.js$/u, ''));
});

test('each sample registers as a deployment profile, and as nothing else', () => {
  for (const file of files) {
    const sample = require(path.join(DIR, file));
    assert.deepStrictEqual(plugins.createRegistry('deployment-profile', { specVersion: SPEC_VERSION }).register(sample).findings, [], file);
    for (const other of plugins.KIND_NAMES.filter((k) => k !== 'deployment-profile')) {
      assert.strictEqual(plugins.createRegistry(other, { specVersion: SPEC_VERSION }).register(sample).registered, false, `${file} as ${other}`);
    }
    assert.match(sample.claim, new RegExp(`^${sample.name} `, 'u'), `${file}: the claim names the profile`);
  }
});

test('each sample requires nothing, over the real module loader', () => {
  for (const file of files) {
    const full = path.join(DIR, file);
    const loaded = new Module(full, null);
    loaded.filename = full;
    const asked = [];
    loaded.require = (id) => { asked.push(id); throw new Error(`refused: ${id}`); };
    loaded._compile(fs.readFileSync(full, 'utf8'), full);
    assert.deepStrictEqual(asked, [], `${file} required ${asked.join(', ')}`);
  }
});

test('each sample answers data whose every path is relative, safe and outside content/', () => {
  const input = { discoveryText: null, files: [], redirects: [{ from: '/a', status: 301, to: '/b' }], sets: [{ headers: [['X', '1']], route: '/*' }] };
  for (const file of files) {
    const answer = require(path.join(DIR, file)).emit(input);
    for (const f of [...(answer.site || []), ...(answer.server || [])]) {
      assert.strictEqual(pluginLoader.unsafePath(f.path), null, `${file}: ${f.path}`);
      assert.ok(!f.path.startsWith('content/'), `${file}: ${f.path}`);
      assert.strictEqual(typeof f.text, 'string');
    }
  }
});
