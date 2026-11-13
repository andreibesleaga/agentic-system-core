'use strict';
// tests/tools/build-ts.test.js — tools/build-ts compiles the TypeScript parts under
// src-ts/ to CommonJS under src/, each file with the header that names its source and
// the compiler, and `--check` fails when a committed file is not what the compiler
// writes now (docs/ENGINEERING.md, "TypeScript parts").
//
// Deterministic: compiles the repository and small scratch trees in memory; no clock,
// no network. A scratch tree reaches the pinned compiler's type packages through a
// directory junction to the repository's node_modules, removed with the tree.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const ts = require('typescript');

const { REPO, capture, tmpdir, tool, writeTree } = require('./helpers');

const buildTs = tool('build-ts');
const HEADER = `// generated from src-ts/shared/one.ts by tsc ${ts.version}; do not edit\n`;
const quiet = { err: () => {}, out: () => {} };

/** A scratch root with the repository's tsconfig.json and the given files. */
function scratch(files) {
  const dir = tmpdir();
  fs.copyFileSync(path.join(REPO, 'tsconfig.json'), path.join(dir, 'tsconfig.json'));
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(dir, 'node_modules'), 'junction');
  return writeTree(dir, files);
}

/** Run the tool on `root`, keeping both streams. */
function runOn(root, argv) {
  let out = '';
  let err = '';
  const code = buildTs.run(argv, { root, err: (s) => { err += s; }, out: (s) => { out += s; } });
  return { code, err, out };
}

const ONE = 'export function one(): number {\n  return 1;\n}\n';

describe('tools/build-ts', () => {
  it('the committed output of src-ts/ is what the compiler writes (--check)', () => {
    const r = capture('build-ts', ['--check']);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /^src-ts\/: current \(\d+ modules?, tsc \d+\.\d+\.\d+\)\n$/u);
  });

  it('--help prints the usage; an unknown argument is usage, exit 2', () => {
    const help = capture('build-ts', ['--help']);
    assert.equal(help.code, 0);
    assert.match(help.out, /^build-ts \[--check\] \[--help\]/u);
    assert.equal(capture('build-ts', ['--json']).code, 2);
  });

  it('writes CommonJS under src/ with the header, and --check then passes', () => {
    const root = scratch({ 'src-ts/shared/one.ts': ONE });
    assert.equal(runOn(root, ['--check']).code, 1, 'a module never compiled is stale');
    const write = runOn(root, []);
    assert.equal(write.code, 0, write.err);
    assert.equal(write.out, 'src/shared/one.js: written\nsrc-ts/: 1 module compiled\n');
    const text = fs.readFileSync(path.join(root, 'src', 'shared', 'one.js'), 'utf8');
    assert.ok(text.startsWith(`${HEADER}"use strict";\n`), text);
    assert.match(text, /exports\.one = one;/u);
    assert.equal(runOn(root, ['--check']).code, 0);
    assert.equal(runOn(root, []).out, 'src-ts/: 1 module compiled\n', 'an unchanged file is not written again');
  });

  it('--check names a compiled file edited by hand, and writes nothing', () => {
    const root = scratch({ 'src-ts/shared/one.ts': ONE });
    runOn(root, []);
    const target = path.join(root, 'src', 'shared', 'one.js');
    fs.writeFileSync(target, `${fs.readFileSync(target, 'utf8')}// edited\n`);
    const r = runOn(root, ['--check']);
    assert.equal(r.code, 1);
    assert.match(r.err, /src\/shared\/one\.js is not what tsc writes from src-ts\/shared\/one\.ts; run npm run build:ts/u);
    assert.match(fs.readFileSync(target, 'utf8'), /\/\/ edited\n$/u);
  });

  it('a source imports a JavaScript module of src/ by the path that holds from both trees, typed from its JSDoc', () => {
    const js = "'use strict';\n/** @param {string} a @returns {string} */\nfunction twice(a) { return a + a; }\nmodule.exports = { twice };\n";
    const root = scratch({
      'src/shared/twice.js': js,
      'src-ts/distribution/two.ts': "import { twice } from '../../src/shared/twice.js';\nexport const two: string = twice('2');\n",
    });
    const write = runOn(root, []);
    assert.equal(write.code, 0, write.err);
    assert.equal(fs.readFileSync(path.join(root, 'src', 'shared', 'twice.js'), 'utf8'), js, 'the JavaScript module is never emitted');
    assert.equal(require(path.join(root, 'src', 'distribution', 'two.js')).two, '22');
    const wrong = scratch({
      'src/shared/twice.js': js,
      'src-ts/distribution/two.ts': "import { twice } from '../../src/shared/twice.js';\nexport const two: number = twice('2');\n",
    });
    assert.match(runOn(wrong, []).err, /src-ts\/distribution\/two\.ts:2:14 TS2322 /u, 'the JSDoc type is checked');
  });

  it('a type error is refused with its position, and nothing is written', () => {
    const root = scratch({ 'src-ts/shared/one.ts': 'export const one: number = "one";\n' });
    const r = runOn(root, []);
    assert.equal(r.code, 1);
    assert.match(r.err, /src-ts\/shared\/one\.ts:1:14 TS2322 /u);
    assert.ok(!fs.existsSync(path.join(root, 'src', 'shared', 'one.js')));
  });

  it('the strict options hold: an index read may be undefined', () => {
    const root = scratch({ 'src-ts/shared/one.ts': 'export function first(list: number[]): number {\n  return list[0];\n}\n' });
    const r = runOn(root, ['--check']);
    assert.equal(r.code, 1);
    assert.match(r.err, /TS2322 /u, 'noUncheckedIndexedAccess is on');
  });

  it('refuses to overwrite a hand-written module of src/, and names a compiled file whose source is gone', () => {
    const handWritten = scratch({ 'src-ts/shared/one.ts': ONE, 'src/shared/one.js': "'use strict';\n" });
    const r = runOn(handWritten, []);
    assert.equal(r.code, 1);
    assert.match(r.err, /src\/shared\/one\.js was not generated by tsc; give the TypeScript module another name/u);
    assert.equal(fs.readFileSync(path.join(handWritten, 'src', 'shared', 'one.js'), 'utf8'), "'use strict';\n");

    const orphan = scratch({ 'src-ts/shared/one.ts': ONE, 'src/shared/gone.js': HEADER.replace('one.ts', 'gone.ts') });
    assert.equal(runOn(orphan, []).code, 1);
    const check = runOn(orphan, ['--check']);
    assert.equal(check.code, 1);
    assert.match(check.err, /src\/shared\/gone\.js was generated from src-ts\/shared\/gone\.ts, which is gone; delete it/u);
  });

  it('a benchmark runner under src-ts/bench/ compiles to bench/runners/, and a runner whose source is gone is named', () => {
    const root = scratch({ 'src-ts/bench/one.ts': ONE });
    const write = runOn(root, []);
    assert.equal(write.code, 0, write.err);
    assert.equal(write.out, 'bench/runners/one.js: written\nsrc-ts/: 1 module compiled\n');
    const text = fs.readFileSync(path.join(root, 'bench', 'runners', 'one.js'), 'utf8');
    assert.ok(text.startsWith(`${HEADER.replace('shared', 'bench')}"use strict";\n`), text);
    assert.ok(!fs.existsSync(path.join(root, 'src', 'bench')), 'nothing is written under src/bench/');
    assert.equal(runOn(root, ['--check']).code, 0);

    const orphan = scratch({ 'src-ts/bench/one.ts': ONE, 'bench/runners/gone.js': HEADER.replace('shared/one.ts', 'bench/gone.ts') });
    const check = runOn(orphan, ['--check']);
    assert.equal(check.code, 1);
    assert.match(check.err, /bench\/runners\/gone\.js was generated from src-ts\/bench\/gone\.ts, which is gone; delete it/u);
  });

  it('a missing tsconfig.json is exit 1', () => {
    const dir = tmpdir();
    assert.equal(buildTs.run(['--check'], { ...quiet, root: dir }), 1);
  });
});
