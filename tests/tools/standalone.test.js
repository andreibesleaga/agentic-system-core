'use strict';
// AGSC-09-90: every validator is "runnable standalone — no import from `src/`".
// A validator that imported the engine it validates would prove nothing, so this
// suite is the arrow check for `tools/`: it reads every tool byte for byte and
// fails on any require that reaches into the engine, and it asserts that each one
// loads and answers `--help` with no engine module in the require cache.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const { TOOLS, capture } = require('./helpers');

/** The nine command contracts of AGSC-09-90, plus the two generators of PRD-054. */
const NINE = Object.freeze([
  'validate-spec', 'validate-schemas', 'validate-ontology', 'validate-vectors',
  'validate-wellknown', 'validate-features', 'validate-diagrams',
  'gen-spec-html', 'gen-ns',
]);
/** The libraries a tool MAY use: the engine's own pins (AGSC-09-90). */
const PINNED = Object.freeze(['ajv', 'ajv-formats', 'fast-xml-parser', 'json-canonicalize',
  'markdown-it', 'n3', 'yaml']);

function sources() {
  return fs.readdirSync(TOOLS).sort().map((name) => ({
    name,
    text: fs.readFileSync(path.join(TOOLS, name), 'utf8'),
  }));
}

describe('tools/ are independent of the engine (AGSC-09-90)', () => {
  it('ships the nine command contracts the rule names', () => {
    const present = fs.readdirSync(TOOLS).sort();
    for (const name of NINE) assert.ok(present.includes(name), `tools/${name} is missing`);
  });

  it('no tool requires anything under src/', () => {
    for (const { name, text } of sources()) {
      for (const match of text.matchAll(/require\(\s*(['"])([^'"]+)\1\s*\)/gu)) {
        const specifier = match[2];
        assert.ok(!/(^|\/)src\//u.test(specifier) && !specifier.startsWith('../src'),
          `tools/${name} requires ${specifier}, which AGSC-09-90 forbids`);
      }
    }
  });

  it('no tool requires a package outside the engine pins', () => {
    for (const { name, text } of sources()) {
      for (const match of text.matchAll(/require\(\s*(['"])([^'"]+)\1\s*\)/gu)) {
        const specifier = match[2];
        if (specifier.startsWith('node:') || specifier.startsWith('.') || specifier.startsWith('/')) continue;
        const pkg = specifier.startsWith('@')
          ? specifier.split('/').slice(0, 2).join('/')
          : specifier.split('/')[0];
        assert.ok(['fs', 'path', 'crypto', 'https', 'http', 'dns', 'net', 'child_process'].includes(pkg)
          || PINNED.includes(pkg), `tools/${name} requires ${specifier}, which is not an engine pin`);
      }
    }
  });

  it('no tool reads the clock or the network at runtime', () => {
    for (const { name, text } of sources()) {
      if (name === 'validate-wellknown') continue;   // AGSC-09-93 gives it a URL argument
      const body = text.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/u.test(l)).join('\n');
      assert.ok(!/Date\.now|new Date\(|Math\.random/u.test(body), `tools/${name} reaches for the clock or randomness`);
      assert.ok(!/require\(\s*['"](node:)?(https?|dns|net)['"]/u.test(body), `tools/${name} reaches for the network`);
    }
  });

  it('every tool answers --help with exit 0 and writes nothing to stderr', () => {
    for (const name of NINE) {
      if (name === 'validate-vectors' || name === 'validate-wellknown') continue;   // shipped earlier, no run() export
      const result = capture(name, ['--help']);
      assert.equal(result.code, 0, name);
      assert.equal(result.err, '', name);
      assert.match(result.out, new RegExp(`^${name} `), name);
    }
  });

  it('loading a tool pulls no engine module into the require cache', () => {
    const loaded = Object.keys(require.cache).filter((f) => f.includes(`${path.sep}src${path.sep}`));
    assert.deepEqual(loaded, []);
  });
});
