'use strict';
// tests/conformance/areas/_listed-names.js — the Bundle a vector lists, on every host.
// Not a vector area itself.
//
// A fixture case writes `input.add_files` onto the host's disk and runs the real `lint`
// over it. A disk that ignores case (macOS APFS and Windows NTFS by default) keeps ONE
// file of two names that differ only in case, so bundle-0014's `content/assets/Photo.txt`
// and `content/assets/photo.txt` would reach `lint` as one name, and the collision that
// AGSC-01-40 (b) reports would depend on the host. The rule is over the names in the
// Bundle (`portable-names.js#checkPaths` is a pure function of that list), so the case
// must give the same result on every host: each name the disk did not keep is added to
// the FileSystem port's listings, and every name of its case group reads the vector's
// text. Where the disk keeps every name (Linux, and every other case), the port is the
// disk port itself.

const nodeFs = require('node:fs');
const path = require('node:path');
const { createFileSystem } = require('../../../src/adapters/node-fs.js');
const { compareCodePoint } = require('../../../src/knowledge/unicode.js');

/** The names of `files` that the folder under `root` does not list exactly as written. */
function droppedNames(root, files) {
  return Object.keys(files).filter((file) => {
    let names;
    try { names = nodeFs.readdirSync(path.join(root, path.posix.dirname(file))); } catch { return true; }
    return !names.includes(path.posix.basename(file));
  });
}

/**
 * The FileSystem port `port` with the `dropped` names of `files` listed and readable.
 *
 * @param {object} port the disk port.
 * @param {Object<string,string>} files the vector's `add_files`.
 * @param {string[]} dropped names the disk did not keep (droppedNames).
 * @returns {object} `port` itself when nothing was dropped.
 */
function listedPort(port, files, dropped) {
  if (dropped.length === 0) return port;
  const folded = new Set(dropped.map((file) => file.toLowerCase()));
  // The dropped names and the names the disk kept in their place: each reads its own text.
  const own = new Map(Object.entries(files).filter(([file]) => folded.has(file.toLowerCase())));
  const merged = (list, added) => [...new Set([...list, ...added])].sort(compareCodePoint);
  return {
    ...port,
    readFile(p, encoding = 'utf8') {
      if (!own.has(p)) return port.readFile(p, encoding);
      return encoding === null ? Buffer.from(own.get(p)) : own.get(p);
    },
    exists: (p) => own.has(p) || port.exists(p),
    readdir: (p) => merged(port.readdir(p),
      dropped.filter((file) => path.posix.dirname(file) === p).map((file) => path.posix.basename(file))),
    walk: (p) => merged(port.walk(p), dropped.filter((file) => file.startsWith(`${p}/`))),
  };
}

/** The port a fixture case runs `lint` with: the disk under `root`, with every name of `files` listed. */
function portOf(root, files) {
  return listedPort(createFileSystem(root), files, droppedNames(root, files));
}

module.exports = { droppedNames, listedPort, portOf };
