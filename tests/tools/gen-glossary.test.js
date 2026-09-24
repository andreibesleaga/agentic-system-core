'use strict';
// tests/tools/gen-glossary.test.js — docs/GLOSSARY.md is generated, and the suite
// fails when the committed copy is not what the sources generate.
//
// Deterministic: reads the repository and temporary copies; no clock, no network.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const { REPO, capture, tmpdir, tool } = require('./helpers');

const glossary = tool('gen-glossary');

describe('tools/gen-glossary', () => {
  it('the committed glossary is exactly what the sources generate (--check)', () => {
    const r = capture('gen-glossary', ['--check']);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /^docs\/GLOSSARY\.md: current \(\d+ vocabulary terms, 14 link keys\)\n$/u);
  });

  it('--help prints the usage and writes nothing; an unknown argument is usage, exit 2', () => {
    const help = capture('gen-glossary', ['--help']);
    assert.equal(help.code, 0);
    assert.match(help.out, /^gen-glossary \[--check\] \[--help\]/u);
    assert.equal(capture('gen-glossary', ['--json']).code, 2);
  });

  it('a stale copy fails --check, a write makes it current, and a missing source is exit 1', () => {
    const dir = tmpdir();
    for (const rel of ['spec/00-overview.md', 'spec/03-links.md', 'spec/11-boundary.md', 'ontology/agsc.ttl']) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.copyFileSync(path.join(REPO, rel), path.join(dir, rel));
    }
    fs.mkdirSync(path.join(dir, 'docs'));
    fs.writeFileSync(path.join(dir, 'docs', 'GLOSSARY.md'), '# edited by hand\n');
    const quiet = { err: () => {}, out: () => {} };
    assert.equal(glossary.run(['--check'], { ...quiet, root: dir }), 1);
    assert.equal(glossary.run([], { ...quiet, root: dir }), 0);
    assert.equal(glossary.run(['--check'], { ...quiet, root: dir }), 0);
    fs.rmSync(path.join(dir, 'ontology'), { recursive: true });
    assert.equal(glossary.run(['--check'], { ...quiet, root: dir }), 1);
  });

  it('trace brackets are removed and Markdown links are kept', () => {
    assert.equal(glossary.stripTrace('A term. [PRD-005]'), 'A term.');
    assert.equal(glossary.stripTrace('A term [design] here'), 'A term here');
    assert.equal(glossary.stripTrace('see [RFC 9264, AGSC-06-07]'), 'see');
    assert.equal(glossary.stripTrace('a [link](https://example.org) stays'), 'a [link](https://example.org) stays');
    // Nothing the generator emits carries a trace bracket.
    const text = fs.readFileSync(path.join(REPO, 'docs', 'GLOSSARY.md'), 'utf8');
    assert.ok(!/\[(?:design|PRD-\d+)\]/u.test(text));
  });
});
