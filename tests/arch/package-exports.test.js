'use strict';
// I-087 (FR-226): the `exports` map of package.json.
//
// Without a map every file of the tarball is an import path, including `src/` internals.
// The map names what a consumer may import: the entry, the `agsc` launcher the alias
// package requires, the manifest, and the data files the specification calls normative
// (schemas, ontology, specification text, vectors). Anything else is not importable
// (`ERR_PACKAGE_PATH_NOT_EXPORTED`). The command-line `bin` entries are not imports
// and are unaffected.
//
// Deterministic: reads package.json and resolves paths through the real Node resolver.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const alias = fs.readFileSync(path.join(ROOT, 'packages', 'agsc-cli', 'bin', 'agsc.js'), 'utf8');

test('the exports map names the entry, the launcher the alias requires and the manifest', () => {
  assert.ok(manifest.exports, 'package.json has no exports map');
  assert.strictEqual(manifest.exports['.'], `./${manifest.main}`);
  assert.strictEqual(manifest.exports['./package.json'], './package.json');
  const required = /require\('agentic-system-core\/([^']+)'\)/u.exec(alias);
  assert.ok(required, 'the alias requires a subpath of the engine');
  assert.strictEqual(manifest.exports[`./${required[1]}`], `./${required[1]}`,
    `the alias requires agentic-system-core/${required[1]}, so the map must export it`);
});

test('every exported path exists in the tree and is shipped', () => {
  const files = manifest.files || [];
  const ships = (entry) => files.some((f) => f === entry || entry.startsWith(f));
  for (const [name, target] of Object.entries(manifest.exports)) {
    assert.strictEqual(typeof target, 'string', `${name}: one target per subpath`);
    assert.ok(target.startsWith('./'), `${name}: ${target} is not package-relative`);
    const base = target.replace(/\*.*$/u, '');
    assert.ok(fs.existsSync(path.join(ROOT, base)), `${name}: ${base} is missing`);
    assert.ok(ships(base.slice(2)) || base === './package.json', `${name}: ${base} is not in files[]`);
  }
});

test('the internals are not importable: src/ is in no export', () => {
  for (const [name, target] of Object.entries(manifest.exports)) {
    assert.ok(!/^\.\/src(?:\/|$)/u.test(target), `${name} exports ${target}`);
    assert.ok(!/^\.\/(?:tools|bench|tests\/(?!vectors))/u.test(target), `${name} exports ${target}`);
  }
});

test('the main entry still resolves by the package name through the map', () => {
  const resolved = require.resolve(ROOT);
  assert.strictEqual(resolved, path.join(ROOT, manifest.main));
});
