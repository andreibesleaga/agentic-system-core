'use strict';
// The proof of the TypeScript toolchain (docs/ENGINEERING.md, "TypeScript parts"):
// `src-ts/shared/version-line.ts`, compiled by tools/build-ts to the committed
// `src/shared/version-line.js`, gives the line `agsc --version` prints (AGSC-09-09), in
// both forms. The command line prints its `--version` line through it, so the property
// below holds the two together, and the first test pins the bytes 1.0 printed.
//
// Deterministic: strings in, strings out; the property runs on a fixed seed.

const test = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');

const { versionLine } = require('../../src/shared/version-line.js');
const { main } = require('../../src/application/cli/main.js');

/** What `agsc --version` (with `--json` when asked) writes to stdout for `version`. */
function printed(version, json) {
  let out = '';
  const stdout = { write: (text) => { out += text; return true; } };
  const code = main(json ? ['--version', '--json'] : ['--version'], { stdout, stderr: stdout, version, env: {} });
  assert.equal(code, 0);
  return out;
}

test('AGSC-09-09: the compiled module gives the text line and the JSON line', () => {
  assert.equal(versionLine('1.1.0'), 'agsc 1.1.0\n');
  assert.equal(versionLine('1.1.0', 'text'), 'agsc 1.1.0\n');
  assert.equal(versionLine('1.1.0-rc.1', 'json'), '{"version":"1.1.0-rc.1"}\n');
});

// An empty version is not a case: the command line then reads package.json's own.
test('AGSC-09-09: for any version, the compiled module and the command line print the same line', () => {
  fc.assert(fc.property(fc.string({ minLength: 1 }), fc.boolean(), (version, json) => {
    assert.equal(versionLine(version, json ? 'json' : 'text'), printed(version, json));
  }), { seed: 20260101, numRuns: 200 });
});

test('the compiled module is CommonJS and exports the one function', () => {
  const exported = require('../../src/shared/version-line.js');
  assert.deepEqual(Object.keys(exported), ['versionLine']);
  assert.equal(exported.__esModule, true);
});
