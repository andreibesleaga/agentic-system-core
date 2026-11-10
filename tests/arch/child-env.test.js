'use strict';
// A test that starts bin/agsc.js passes no AGSC_ name to it. The command refuses an
// AGSC_ name it does not know (AGSC-01-37), so a lane switch such as AGSC_BROWSER or
// AGSC_AUDIT, copied in by spreading process.env, makes the command exit 2 and the test fail
// in that lane only. A file may spread process.env when it first deletes every AGSC_
// name from it; otherwise it builds the child's environment without them (docs/TESTING.md).
//
// Reads text only; no clock, no network.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const TESTS = path.join(ROOT, 'tests');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory()
    ? walk(path.join(dir, e.name))
    : [path.join(dir, e.name)]));
}

const STARTS_AGSC = /'bin', 'agsc\.js'|bin\/agsc\.js/u;
const SPREAD = /\.\.\.process\.env\b/u;
const DELETES_AGSC = /if \(name\.startsWith\('AGSC_'\)\) delete process\.env\[name\]/u;

test('AGSC-01-37: no test that starts bin/agsc.js hands it an unfiltered process.env', () => {
  const offenders = walk(TESTS)
    .filter((f) => f.endsWith('.js'))
    .filter((f) => {
      const text = fs.readFileSync(f, 'utf8');
      return STARTS_AGSC.test(text) && SPREAD.test(text) && !DELETES_AGSC.test(text);
    })
    .map((f) => path.relative(ROOT, f).split(path.sep).join('/'))
    .sort();
  assert.deepStrictEqual(offenders, []);
});
