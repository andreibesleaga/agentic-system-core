'use strict';
// The one library table, src/README.md section 4, follows package.json; src/REFERENCE.md links to it.
//
// Each table whose header names a `Library` and a `Version` column is read row by row. The
// packages of a row are the backticked names in its Library cell that package.json pins (a
// subpath such as `ajv/dist/2020`, or a package named "with" another, is not one); the Version
// cell holds one version for each of them, in the same order. A row that names no pinned
// package, or whose versions do not match the pins, fails here, so a dependency bump that
// leaves a table behind is caught by the suite and not by an audit.
//
// Deterministic: reads three files of the repository; no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./_scan.js');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const PINS = Object.freeze({ ...pkg.dependencies, ...pkg.devDependencies });

const cells = (line) => line.trim().replace(/^\||\|$/gu, '').split('|').map((c) => c.trim());

/** The rows of every Library/Version table of `rel`, as `{ line, library, version }`. */
function libraryRows(rel) {
  const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
  const rows = [];
  let columns = null;
  for (const [i, line] of lines.entries()) {
    if (!line.startsWith('|')) {
      columns = null;
      continue;
    }
    const row = cells(line);
    if (columns === null) {
      const library = row.indexOf('Library');
      const version = row.indexOf('Version');
      columns = library >= 0 && version >= 0 ? { library, version } : false;
    } else if (columns && !/^-+$/u.test(row[0])) {
      rows.push({ line: `${rel}:${i + 1}`, library: row[columns.library], version: row[columns.version] });
    }
  }
  return rows;
}

test('src/REFERENCE.md carries no library table of its own: it links to the one in src/README.md', () => {
  assert.deepEqual(libraryRows('src/REFERENCE.md'), []);
});

for (const rel of ['src/README.md']) {
  test(`${rel}: each library row's Version cell is the version package.json pins`, () => {
    const rows = libraryRows(rel);
    assert.ok(rows.length > 0, `${rel} has no library table`);
    for (const row of rows) {
      const names = [...row.library.replace(/\(with [^)]*\)/gu, '').matchAll(/`([^`]+)`/gu)]
        .map((m) => m[1]).filter((name) => Object.hasOwn(PINS, name));
      assert.ok(names.length > 0, `${row.line} names no package of package.json`);
      const versions = row.version.match(/\d+\.\d+\.\d+/gu) || [];
      assert.deepEqual(versions, names.map((name) => PINS[name]), `${row.line}: ${names.join(', ')}`);
    }
  });
}
