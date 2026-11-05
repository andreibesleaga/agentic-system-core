'use strict';
// tests/arch/typescript-parts.test.js — the fitness functions of the TypeScript parts
// (docs/ENGINEERING.md §8).
//
//   * New agent-facing protocol modules are TypeScript: a plain JavaScript file in one of
//     the protocol places below fails, unless it is one of the files that were there when
//     this rule began (commit 2327f33) or the compiled twin of a source under src-ts/.
//   * The committed output under src/ is byte for byte what the pinned compiler writes
//     from src-ts/ now (compiled in memory by tools/build-ts), and every compiled file
//     names its source, which exists.
//   * The compiler options stay strict, and TypeScript is needed by no install and no run:
//     the compiler and the type packages are development dependencies, the type package of
//     Node is the major line of the Node floor, and no shipped module requires them.
//
// Deterministic: reads the tree and compiles in memory; no clock, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT, sources, walk } = require('./_scan.js');

const buildTs = require('../../tools/build-ts');

/** The places of the agent-facing protocol modules, as root-relative patterns. */
const PROTOCOL_PLACES = Object.freeze([
  /^src\/distribution\/mcp-[^/]*\.js$/u,
  /^src\/distribution\/a2a[^/]*\.js$/u,
  /^src\/application\/hosting-http[^/]*\.js$/u,
  /^bench\/runners\/.+$/u,
]);
/** The plain JavaScript protocol modules that were there at 2327f33; the list never grows. */
const PLAIN_AT_START = Object.freeze([
  'src/distribution/mcp-resources.js',
  'src/distribution/mcp-stdio.js',
  'src/distribution/mcp-tools.js',
]);

const rel = (absolute) => path.relative(ROOT, absolute).split(path.sep).join('/');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

/** The source a compiled file names in its header, or null for a hand-written file. */
function generatedFrom(file) {
  const first = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n', 1)[0];
  const m = buildTs.HEADER_LINE.exec(`${first}\n`);
  return m ? m[1] : null;
}

test('no new agent-facing protocol module is plain JavaScript', () => {
  const files = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'bench'))].map(rel)
    .filter((file) => PROTOCOL_PLACES.some((place) => place.test(file)));
  for (const file of PLAIN_AT_START) assert.ok(files.includes(file), `${file} is gone: take it off the list`);
  for (const file of files) {
    if (PLAIN_AT_START.includes(file)) continue;
    const source = generatedFrom(file);
    assert.ok(source !== null && fs.existsSync(path.join(ROOT, source)),
      `${file} is a new agent-facing protocol module in plain JavaScript; write it in TypeScript under src-ts/`);
  }
});

test('the committed output of src-ts/ is what tsc writes now, and every compiled file names a source that exists', () => {
  const compiled = buildTs.compile(ROOT);
  assert.deepEqual(compiled.errors, []);
  assert.ok(compiled.files.length >= 1, 'the toolchain proof src-ts/shared/version-line.ts is compiled');
  for (const { target, text } of compiled.files) {
    assert.equal(fs.readFileSync(path.join(ROOT, target), 'utf8'), text, `${target} is stale: run npm run build:ts`);
  }
  const targets = compiled.files.map((f) => f.target);
  for (const file of sources().map((s) => s.rel)) {
    const source = generatedFrom(file);
    if (source !== null) assert.ok(targets.includes(file), `${file} names ${source}, which is not compiled`);
  }
});

test('the compiler options stay strict and CommonJS, without maps or declarations, and a bare tsc writes nothing', () => {
  const { options, fileNames } = buildTs.readConfig(ROOT);
  for (const flag of ['strict', 'noUncheckedIndexedAccess', 'exactOptionalPropertyTypes', 'noImplicitOverride', 'isolatedModules', 'noEmit']) {
    assert.equal(options[flag], true, `${flag} is on`);
  }
  for (const flag of ['sourceMap', 'declaration', 'declarationMap', 'checkJs']) assert.equal(options[flag], false, `${flag} is off`);
  const ts = require('typescript');
  assert.equal(options.module, ts.ModuleKind.Node20, 'module node20: a .ts file of this package compiles to CommonJS');
  assert.equal(options.target, ts.ScriptTarget.ES2024, 'target ES2024, which Node 22.13 runs');
  assert.equal(pkg.type, undefined, 'no "type" field: the package is CommonJS');
  assert.ok(fileNames.every((file) => rel(file).startsWith('src-ts/')), 'the sources are src-ts/ only');
  for (const { source, target } of buildTs.compile(ROOT).files) {
    assert.equal(target, `src/${source.slice('src-ts/'.length, -'.ts'.length)}.js`, 'src-ts/<path>.ts compiles to src/<path>.js');
  }
});

test('TypeScript is needed by no install and no run', () => {
  for (const name of ['typescript', '@types/node', 'typescript-eslint']) {
    assert.ok(pkg.devDependencies[name], `${name} is a development dependency`);
    assert.equal(pkg.dependencies[name], undefined, `${name} is not a run-time dependency`);
  }
  const floorMajor = /^>=(\d+)\./u.exec(pkg.engines.node)[1];
  assert.equal(pkg.devDependencies['@types/node'].split('.')[0], floorMajor, 'the Node types follow the Node floor');
  for (const file of sources()) {
    for (const specifier of file.requires) {
      assert.ok(!/^(typescript|@types\/|typescript-eslint)/u.test(specifier), `${file.rel} requires ${specifier}`);
    }
  }
  assert.equal(pkg.scripts['build:ts'], 'node tools/build-ts');
  assert.equal(pkg.scripts['check:ts'], 'node tools/build-ts --check');
  assert.equal(pkg.scripts.typecheck, 'tsc --noEmit');
  assert.equal(pkg.scripts.prepack, 'npm run check:ts && npm run typecheck');
  assert.ok(!pkg.files.includes('src-ts/'), 'the package ships the compiled files, not the sources');
});
