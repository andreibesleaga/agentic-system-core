// tests/conformance/areas/_shared.js — small shared test scaffolding for the
// area handlers this package (B) owns. Not a vector area itself.
'use strict';

/**
 * memoryPorts(files) -> a minimal FileSystem port over an in-memory
 * {path: contents} map, for area handlers whose vector supplies Bundle
 * content inline (`input.config`, `input.env_file`, …) rather than a real
 * fixture directory (tests/fixtures/minimal/ does not exist yet).
 */
function memoryPorts(files) {
  const store = Object.assign({}, files);
  return {
    exists: (p) => Object.prototype.hasOwnProperty.call(store, p),
    readFile: (p) => store[p],
    writeFile: (p, data) => {
      store[p] = data;
    },
    readdir: () => [],
    stat: () => ({}),
    mkdirp: () => {},
    remove: (p) => {
      delete store[p];
    },
  };
}

function captureStream() {
  const chunks = [];
  return {
    write(s) {
      chunks.push(s);
    },
    text() {
      return chunks.join('');
    },
  };
}

module.exports = { memoryPorts, captureStream };
