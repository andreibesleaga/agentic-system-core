'use strict';
// AGSC-01-40 (b) on a case-insensitive file system. The rule is over the names of the
// Bundle, and `portable-names.js#checkPaths` is a pure function of that list; but a case
// such as bundle-0014 is laid out on the host's disk before `lint` runs, and a disk that
// ignores case (macOS APFS and Windows NTFS by default) keeps ONE file of
// `content/assets/Photo.txt` and `content/assets/photo.txt`. The runner therefore reads the
// names the vector lists, whatever the disk kept. These tests lay out what such a disk
// leaves (the first name, holding the last text) on any host, so Linux runs them too.

const test = require('node:test');
const assert = require('node:assert/strict');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { main } = require('../../src/application/cli/main.js');
const { createFileSystem } = require('../../src/adapters/node-fs.js');
const { captureStream } = require('./areas/_shared.js');
const listed = require('./areas/_listed-names.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FILES = { 'content/assets/Photo.txt': 'a\n', 'content/assets/photo.txt': 'b\n' };

/** The minimal fixture with what a case-insensitive disk keeps of FILES: one file, the first name, the last text. */
function caseInsensitiveLayout() {
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'agsc-listed-names-'));
  nodeFs.cpSync(path.join(ROOT, 'tests', 'fixtures', 'minimal'), root, { recursive: true });
  nodeFs.mkdirSync(path.join(root, 'content', 'assets'), { recursive: true });
  nodeFs.writeFileSync(path.join(root, 'content', 'assets', 'Photo.txt'), 'b\n');
  return root;
}

function lint(root, fs) {
  const stdout = captureStream();
  const exit = main(['lint', '--json', '--quiet'], {
    env: { SOURCE_DATE_EPOCH: '1767225600' }, ports: { fs }, root, specVersion: '1.1.0',
    stderr: captureStream(), stdout, version: '1.1.0',
  });
  const findings = (JSON.parse(stdout.text() || '{}').findings || []).map((f) => `${f.code}:${f.severity}:${f.file}`);
  return { exit, findings };
}

test('AGSC-01-40 (b): the names the vector lists reach lint although the disk kept one of the two', () => {
  const root = caseInsensitiveLayout();
  try {
    assert.deepEqual(listed.droppedNames(root, FILES), ['content/assets/photo.txt']);
    // The defect: the disk alone shows one name, so the collision is not seen.
    assert.deepEqual(lint(root, createFileSystem(root)), { exit: 0, findings: [] });
    // The vector's own list: bundle-0014's expected finding, on every host.
    assert.deepEqual(lint(root, listed.portOf(root, FILES)),
      { exit: 0, findings: ['AGSC-E423:warn:content/assets/photo.txt'] });
  } finally { nodeFs.rmSync(root, { force: true, recursive: true }); }
});

test('the listed port reads each listed name with the vector text and lists it in code-point order', () => {
  const root = caseInsensitiveLayout();
  try {
    const fs = listed.portOf(root, FILES);
    assert.equal(fs.readFile('content/assets/Photo.txt'), 'a\n');
    assert.equal(fs.readFile('content/assets/photo.txt'), 'b\n');
    assert.deepEqual(fs.readFile('content/assets/photo.txt', null), Buffer.from('b\n'));
    assert.equal(fs.exists('content/assets/photo.txt'), true);
    assert.deepEqual(fs.readdir('content/assets'), ['Photo.txt', 'photo.txt']);
    assert.deepEqual(fs.walk('content/assets'), ['content/assets/Photo.txt', 'content/assets/photo.txt']);
  } finally { nodeFs.rmSync(root, { force: true, recursive: true }); }
});

test('where the disk keeps every name, the port is the disk port itself', () => {
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'agsc-listed-names-'));
  try {
    nodeFs.mkdirSync(path.join(root, 'content', 'assets'), { recursive: true });
    nodeFs.writeFileSync(path.join(root, 'content', 'assets', 'one.txt'), 'a\n');
    const files = { 'content/assets/one.txt': 'a\n' };
    assert.deepEqual(listed.droppedNames(root, files), []);
    const disk = createFileSystem(root);
    assert.equal(listed.listedPort(disk, files, []), disk);
  } finally { nodeFs.rmSync(root, { force: true, recursive: true }); }
});
