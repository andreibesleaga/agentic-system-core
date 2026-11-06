'use strict';
// tests/arch/typescript-parts.test.js — the fitness functions of the TypeScript parts
// (docs/ENGINEERING.md §8).
//
//   * New agent-facing protocol modules are TypeScript: a plain JavaScript file in one of
//     the protocol places below fails, unless it is one of the files that were there when
//     this rule began (commit 2327f33) or the compiled twin of a source under src-ts/; and so
//     does a plain JavaScript file anywhere in src/ or bench/ that bears a protocol mark (it
//     requires an official MCP package, or names `jsonrpc`, `registerTool` or
//     `MCP-Protocol-Version`), unless it bore one at 12c243a.
//   * A TypeScript protocol module speaks through the official MCP SDK, never through a
//     JSON-RPC layer of its own: every compiled module of src/ that bears a protocol mark
//     requires one of the official `@modelcontextprotocol/*` packages.
//   * The committed output under src/ is byte for byte what the pinned compiler writes
//     from src-ts/ now (compiled in memory by tools/build-ts), and every compiled file
//     names its source, which exists.
//   * The dependency rule and the linter keep reading src-ts/: `npm run arch` names it, and
//     every source gets typescript-eslint's rules and the size budgets, while the files
//     compiled from it are left to their source.
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

/**
 * What makes a module agent-facing protocol code wherever it sits: it requires the MCP SDK, or
 * it writes a JSON-RPC message, registers a WebMCP tool or reads the MCP revision header.
 */
const PROTOCOL_MARKS = /\bjsonrpc\b|\bregisterTool\b|MCP-Protocol-Version/u;
/** The official MCP TypeScript packages: the 1.x SDK and the v2 packages that replace it. */
const PROTOCOL_PACKAGE = /^@modelcontextprotocol\/(?:sdk|server|core|node|client)(?:\/|$)/u;
/**
 * The plain JavaScript modules outside those places that bore a mark at 12c243a; the list never
 * grows. (`src/distribution/mcp-stdio.js` left it when the server moved to the MCP core.)
 */
const MARKED_AT_START = Object.freeze([
  'bench/parity.js',
  'src/application/plugins.js',
  'src/distribution/page-tools.js',
  'src/distribution/webmcp.js',
]);

const rel = (absolute) => path.relative(ROOT, absolute).split(path.sep).join('/');

/** The packages a module requires, by the specifiers of its `require(...)` calls. */
const requiresOf = (text) => [...text.matchAll(/\brequire\(\s*(['"])([^'"]+)\1\s*\)/gu)].map((m) => m[2]);
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

test('no new module anywhere in src/ or bench/ speaks an agent protocol in plain JavaScript', () => {
  const vendor = /^src\/distribution\/vendor\//u;
  const marked = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'bench'))].map(rel)
    .filter((file) => file.endsWith('.js') && !vendor.test(file))
    .filter((file) => {
      const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
      return PROTOCOL_MARKS.test(text) || requiresOf(text).some((specifier) => PROTOCOL_PACKAGE.test(specifier));
    });
  for (const file of MARKED_AT_START) assert.ok(marked.includes(file), `${file} bears no mark now: take it off the list`);
  for (const file of marked) {
    if (MARKED_AT_START.includes(file) || PLAIN_AT_START.includes(file) || generatedFrom(file) !== null) continue;
    assert.fail(`${file} speaks an agent protocol (the MCP SDK, JSON-RPC, WebMCP registerTool or MCP-Protocol-Version) `
      + 'in plain JavaScript; write it in TypeScript under src-ts/');
  }
});

test('a TypeScript protocol module speaks through the official MCP SDK, not through a JSON-RPC layer of its own', () => {
  const compiled = walk(path.join(ROOT, 'src')).map(rel).filter((file) => file.endsWith('.js') && generatedFrom(file) !== null);
  const protocol = compiled.filter((file) => PROTOCOL_MARKS.test(fs.readFileSync(path.join(ROOT, file), 'utf8')));
  assert.ok(protocol.includes('src/distribution/mcp-core.js'), 'the MCP core is a compiled TypeScript module that bears a protocol mark');
  for (const file of protocol) {
    const official = requiresOf(fs.readFileSync(path.join(ROOT, file), 'utf8')).filter((specifier) => PROTOCOL_PACKAGE.test(specifier));
    assert.ok(official.length > 0, `${file} speaks an agent protocol without the official MCP SDK; build on @modelcontextprotocol/server`);
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

test('the dependency rule and the linter keep reading src-ts/, and leave its compiled files to their source', async () => {
  assert.match(pkg.scripts.arch, /^depcruise [^|]*\ssrc-ts\s/u, 'npm run arch cruises src-ts/');
  const { ESLint } = require('eslint');
  const eslint = new ESLint({ cwd: ROOT });
  const compiled = buildTs.compile(ROOT).files;
  assert.ok(compiled.length >= 1);
  for (const { source, target } of compiled) {
    const config = await eslint.calculateConfigForFile(path.join(ROOT, source));
    const rules = Object.keys(config.rules);
    assert.ok(rules.filter((rule) => rule.startsWith('@typescript-eslint/')).length >= 20, `${source} gets typescript-eslint's rules`);
    for (const budget of ['complexity', 'max-depth', 'max-lines', 'max-lines-per-function', 'max-params']) {
      assert.ok(config.rules[budget] && config.rules[budget][0] !== 0, `${source} has the size budget ${budget}`);
    }
    assert.equal(await eslint.isPathIgnored(path.join(ROOT, target)), true, `${target} is linted at its source`);
  }
});
