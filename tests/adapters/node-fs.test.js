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
  // No two names differ only by case: macOS and Windows file systems fold case, and
  // `Z` before `a` is what a code-point sort gives and a natural sort does not.
  for (const name of ['b.md', 'Z.md', 'a.md', '0.md']) port.writeFile(`content/concepts/${name}`, 'x');
  assert.deepStrictEqual(port.readdir('content/concepts'), ['0.md', 'Z.md', 'a.md', 'b.md']);
  assert.deepStrictEqual(port.walk('content'),
    ['content/concepts/0.md', 'content/concepts/Z.md', 'content/concepts/a.md', 'content/concepts/b.md']);
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

// the realpath containment check used to run only in `readFile`, so a planted
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

// The port remembers the directories it has proved literal so that a build of many
// thousands of files is not a real-path walk per file. The guarantee must not weaken:
// a link planted under a remembered directory is still refused, in every method.
test('a link planted under a directory the port already trusts is still refused (AGSC-E902)', () => sandbox((dir) => {
  const outside = path.join(dir, 'outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'secret.md'), 'secret');
  const inner = path.join(dir, 'bundle');
  fs.mkdirSync(inner);
  const port = createFileSystem(inner);
  const escaped = (e) => e.code === 'AGSC-E902';
  // The port creates and writes into `www/a` itself: both are now trusted.
  port.mkdirp('www/a');
  port.writeFile('www/a/index.html', 'x');
  port.writeFile('www/a/index.html', 'y'); // a second write into a trusted directory
  assert.strictEqual(port.readFile('www/a/index.html'), 'y');
  // Then somebody plants links under the trusted directories.
  fs.symlinkSync(outside, path.join(inner, 'www', 'a', 'escape'), 'dir');
  fs.symlinkSync(path.join(outside, 'secret.md'), path.join(inner, 'www', 'a', 'file.md'));
  fs.symlinkSync(outside, path.join(inner, 'www', 'b'), 'dir');
  assert.throws(() => port.writeFile('www/a/escape/pwned.txt', 'x'), escaped);
  assert.throws(() => port.mkdirp('www/a/escape/deeper'), escaped);
  assert.throws(() => port.writeFile('www/a/file.md', 'x'), escaped);
  assert.throws(() => port.readFile('www/a/file.md'), escaped);
  assert.throws(() => port.writeFile('www/b/pwned.txt', 'x'), escaped);
  assert.throws(() => port.mkdirp('www/b/c'), escaped);
  assert.strictEqual(port.exists('www/b'), false);
  assert.strictEqual(fs.readFileSync(path.join(outside, 'secret.md'), 'utf8'), 'secret', 'nothing was written through the link');
  assert.strictEqual(fs.existsSync(path.join(outside, 'pwned.txt')), false);
  // A link that stays inside the root is allowed, as before, and never trusted as literal.
  fs.mkdirSync(path.join(inner, 'real'));
  fs.symlinkSync(path.join(inner, 'real'), path.join(inner, 'www', 'a', 'inside'), 'dir');
  port.writeFile('www/a/inside/ok.md', 'ok');
  assert.strictEqual(fs.readFileSync(path.join(inner, 'real', 'ok.md'), 'utf8'), 'ok');
  // Removing a trusted directory forgets it: a link planted in its place is refused.
  port.remove('www/a');
  fs.symlinkSync(outside, path.join(inner, 'www', 'a'), 'dir');
  assert.throws(() => port.writeFile('www/a/pwned.txt', 'x'), escaped);
  assert.strictEqual(fs.existsSync(path.join(outside, 'pwned.txt')), false);
}));

test('checkReal, the exported form of the guard, takes the root as a path or as its resolved real path', () => sandbox((dir) => {
  const { checkReal } = require('../../src/adapters/node-fs.js');
  const outside = path.join(dir, 'outside');
  fs.mkdirSync(outside);
  const inner = path.join(dir, 'bundle');
  fs.mkdirSync(inner);
  fs.symlinkSync(outside, path.join(inner, 'escape'), 'dir');
  const inside = path.join(inner, 'new.md');
  assert.strictEqual(checkReal(inner, inside, 'new.md'), inside);
  assert.strictEqual(checkReal({ real: fs.realpathSync(inner) }, inside, 'new.md'), inside);
  assert.throws(() => checkReal(inner, path.join(inner, 'escape', 'x.md'), 'escape/x.md'), (e) => e.code === 'AGSC-E902');
  assert.throws(() => checkReal({ real: fs.realpathSync(inner) }, path.join(inner, 'escape', 'x.md'), 'escape/x.md'), (e) => e.code === 'AGSC-E902');
}));
