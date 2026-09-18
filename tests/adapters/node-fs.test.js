'use strict';
// AGSC-01-15 (discovery order), AGSC-01-16 (caps, archives, path escape) and the
// schema loader that keeps knowledge/ free of the file system.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createFileSystem, readSchemas, safeJoin, FsError } = require('../../src/adapters/node-fs.js');

const ROOT = path.resolve(__dirname, '..', '..');

function sandbox(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-fs-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('readSchemas is the only door the schemas come through', () => {
  const raw = readSchemas(ROOT);
  assert.deepStrictEqual(Object.keys(raw).sort(), ['bundle', 'config', 'item']);
  assert.strictEqual(raw.item.$id, 'https://agenticsystemcore.com/ns/schema/item.schema.json');
  assert.strictEqual(readSchemas().item.$id, raw.item.$id, 'the engine root is the default');
});

test('a path that escapes the root is AGSC-E902 (AGSC-01-16)', () => {
  const port = createFileSystem(ROOT);
  assert.throws(() => port.readFile('../etc/passwd'), (e) => e.code === 'AGSC-E902');
  assert.throws(() => port.readFile('/etc/passwd'), (e) => e.code === 'AGSC-E902');
  assert.throws(() => safeJoin(ROOT, 'C:/x'), FsError);
  assert.strictEqual(port.exists('../nope'), false, 'exists never throws');
});

test('archives are refused and the size cap is enforced (AGSC-E903, AGSC-E904)', () => sandbox((dir) => {
  const port = createFileSystem(dir, { maxBytes: 16 });
  fs.writeFileSync(path.join(dir, 'a.zip'), 'x');
  fs.writeFileSync(path.join(dir, 'big.md'), 'x'.repeat(64));
  fs.writeFileSync(path.join(dir, 'small.md'), 'ok');
  assert.throws(() => port.readFile('a.zip'), (e) => e.code === 'AGSC-E903');
  assert.throws(() => port.readFile('big.md'), (e) => e.code === 'AGSC-E904');
  assert.strictEqual(port.readFile('small.md'), 'ok');
  assert.ok(Buffer.isBuffer(port.readFile('small.md', null)));
}));

test('discovery order is a code-point sort, never the filesystem\'s (AGSC-01-15)', () => sandbox((dir) => {
  const port = createFileSystem(dir);
  port.mkdirp('content/concepts');
  for (const name of ['b.md', 'A.md', 'a.md', '0.md']) port.writeFile(`content/concepts/${name}`, 'x');
  assert.deepStrictEqual(port.readdir('content/concepts'), ['0.md', 'A.md', 'a.md', 'b.md']);
  assert.deepStrictEqual(port.walk('content'),
    ['content/concepts/0.md', 'content/concepts/A.md', 'content/concepts/a.md', 'content/concepts/b.md']);
  assert.deepStrictEqual(port.walk('missing'), []);
}));

test('write, stat, exists and remove', () => sandbox((dir) => {
  const port = createFileSystem(dir);
  port.writeFile('deep/nested/file.md', 'hello');
  assert.strictEqual(port.exists('deep/nested/file.md'), true);
  assert.strictEqual(port.stat('deep/nested/file.md').size, 5);
  assert.strictEqual(port.stat('deep').isDirectory(), true);
  port.remove('deep');
  assert.strictEqual(port.exists('deep'), false);
  assert.strictEqual(port.root, dir);
}));

test('a symlink out of the root is refused too (AGSC-E902)', () => sandbox((dir) => {
  const outside = path.join(dir, 'outside.md');
  fs.writeFileSync(outside, 'secret');
  const inner = path.join(dir, 'bundle');
  fs.mkdirSync(inner);
  fs.symlinkSync(outside, path.join(inner, 'link.md'));
  const port = createFileSystem(inner);
  assert.throws(() => port.readFile('link.md'), (e) => e.code === 'AGSC-E902');
}));

// F27-01: the realpath containment check used to run only in `readFile`, so a planted
// directory symlink let every other method work outside the Bundle root (AGSC-E902,
// AGSC-01-35, AGSC-01-16). It now lives in the shared `abs()` helper.
test('a planted directory symlink cannot escape the root in any method (AGSC-E902, AGSC-01-35)', () => sandbox((dir) => {
  const outside = path.join(dir, 'outside');
  fs.mkdirSync(outside);
  const inner = path.join(dir, 'bundle');
  fs.mkdirSync(path.join(inner, 'sub'), { recursive: true });
  fs.symlinkSync(outside, path.join(inner, 'sub', 'escape'), 'dir');
  const port = createFileSystem(inner);
  const escaped = (e) => e.code === 'AGSC-E902';

  assert.throws(() => port.writeFile('sub/escape/pwned.txt', 'x'), escaped);
  assert.strictEqual(fs.existsSync(path.join(outside, 'pwned.txt')), false, 'nothing was written outside');
  assert.throws(() => port.mkdirp('sub/escape/deeper'), escaped);
  assert.throws(() => port.remove('sub/escape'), escaped);
  assert.throws(() => port.stat('sub/escape'), escaped);
  assert.throws(() => port.readdir('sub/escape'), escaped);
  assert.throws(() => port.walk('sub/escape'), escaped);
  assert.throws(() => port.readFile('sub/escape/any.md'), escaped);
  assert.strictEqual(port.exists('sub/escape'), false, 'exists answers false, never true, for an escape');

  // A file that does not exist yet is judged by its nearest existing ancestor.
  port.writeFile('sub/fresh/new.md', 'ok');
  assert.strictEqual(port.readFile('sub/fresh/new.md'), 'ok');
}));
