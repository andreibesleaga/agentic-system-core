'use strict';
// tests/arch/query-engine-pin.test.js — the query engine every node ships under `/query/`
// (AGSC-06-39: "the files of one release of an engine whose licence allows their
// redistribution") is VENDORED in src/distribution/vendor/ and pinned, so what a node
// serves can change only by a deliberate commit:
//
//   * each vendored file has the byte count and SHA-256 that `query-page.js#ENGINE` states,
//     and the folder holds those files and the README only;
//   * the two engine files are byte-identical to the files of the pinned `oxigraph`
//     dependency of the same version, so the browser and the development lane run one
//     release, and a bump of the dependency fails here until the vendored copy moves too;
//   * the licence is the release's own, its two texts are shipped, and `REUSE.toml`
//     annotates the engine's files with it;
//   * the folder's README states the same version and the same hashes.
//
// Deterministic: reads files only.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const { ENGINE, ENGINE_SOURCES } = require('../../src/distribution/query-page.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FOLDER = path.join(ROOT, 'src', 'distribution', 'vendor', ENGINE.folder);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('each vendored file has the byte count and the SHA-256 the engine states, and nothing else is in the folder', () => {
  assert.deepStrictEqual(fs.readdirSync(FOLDER).sort(), [...ENGINE.files.map((f) => f.source), 'README.md'].sort());
  for (const file of ENGINE.files) {
    const bytes = fs.readFileSync(path.join(FOLDER, file.source));
    assert.strictEqual(bytes.length, file.bytes, `${file.source} is ${bytes.length} bytes; the pin says ${file.bytes}`);
    assert.strictEqual(sha256(bytes), file.sha256, `${file.source} no longer hashes to its pin`);
  }
  assert.deepStrictEqual(ENGINE_SOURCES, ENGINE.files.map((f) => `src/distribution/vendor/${ENGINE.folder}/${f.source}`));
});

test('the engine files are those of the pinned dependency, at the same version', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.strictEqual(manifest.dependencies[ENGINE.package], ENGINE.version, 'the vendored release and the pinned dependency differ');
  assert.strictEqual(ENGINE.folder, `${ENGINE.package}-${ENGINE.version}`);
  const installed = path.join(ROOT, 'node_modules', ENGINE.package);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8')).version, ENGINE.version);
  for (const name of [ENGINE.module, 'web_bg.wasm']) {
    assert.ok(fs.readFileSync(path.join(FOLDER, name)).equals(fs.readFileSync(path.join(installed, name))), `${name} differs from node_modules`);
  }
});

test('the licence is the release\'s own: both texts are shipped and REUSE.toml annotates the engine with it', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', ENGINE.package, 'package.json'), 'utf8'));
  assert.strictEqual(manifest.license, ENGINE.licence);
  assert.match(fs.readFileSync(path.join(FOLDER, 'LICENSE-MIT'), 'utf8'), /^Copyright \(c\) 2018 Oxigraph developers\n\nPermission is hereby granted/u);
  assert.match(fs.readFileSync(path.join(FOLDER, 'LICENSE-APACHE'), 'utf8'), /Apache License\s+Version 2\.0, January 2004/u);
  const served = ENGINE.files.map((f) => f.served);
  assert.ok(served.includes('LICENSE-MIT.txt') && served.includes('LICENSE-APACHE.txt') && served.includes('THIRD-PARTY.txt'));
  const toml = fs.readFileSync(path.join(ROOT, 'REUSE.toml'), 'utf8');
  const block = toml.slice(toml.indexOf(`src/distribution/vendor/${ENGINE.folder}/web.js`));
  assert.match(block, new RegExp(`^SPDX-License-Identifier = "${ENGINE.licence}"$`, 'mu'));
  assert.ok(block.indexOf(`src/distribution/vendor/${ENGINE.folder}/web_bg.wasm`) > 0);
});

test('the folder\'s README states the version, the licence and every pin', () => {
  const readme = fs.readFileSync(path.join(FOLDER, 'README.md'), 'utf8');
  assert.ok(readme.includes(`${ENGINE.package}@${ENGINE.version}`));
  assert.ok(readme.includes(`\`${ENGINE.licence}\``));
  for (const file of ENGINE.files) {
    assert.ok(readme.includes(`| \`${file.source}\` | ${file.bytes} | \`${file.sha256}\` |`), `README states another pin for ${file.source}`);
  }
});
