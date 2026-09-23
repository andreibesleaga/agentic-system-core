'use strict';
// tools/gen-spec-html — AGSC-09-90, PRD-054 ("spec/ → /specs/ pages"). The pages are
// deterministic (AGSC-04-01), carry an anchor on every rule id, and --check is the
// gate that keeps a published tree honest.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const { REPO, capture, envelope, specRoot, tmpdir, tool, writeTree } = require('./helpers');

const { page, render, sectionOf } = tool('gen-spec-html');

describe('gen-spec-html — usage and the envelope', () => {
  it('--help exits 0; an unknown flag, a second argument and bare --out/--check exit 2', () => {
    assert.equal(capture('gen-spec-html', ['--help']).code, 0);
    assert.equal(capture('gen-spec-html', ['--nope']).code, 2);
    assert.equal(capture('gen-spec-html', [specRoot(), specRoot()]).code, 2);
    assert.equal(capture('gen-spec-html', ['--out']).code, 2);
    assert.equal(capture('gen-spec-html', ['--check']).code, 2);
  });

  it('a root with no spec/ FAILS with AGSC-E901, and an empty spec/ too', () => {
    // CHANGED at rc.6 (FIX29-S4): AGSC-09-90 now says a validator MUST FAIL "with
    // `AGSC-E901`" over an absent input, and AGSC-09-08 reserves exit 2 for a usage
    // error. An absent input is exit 1, the envelope and the code.
    assert.deepEqual(envelope('gen-spec-html', [tmpdir()]).json.findings.map((f) => f.code),
      ['AGSC-E901']);
    assert.equal(capture('gen-spec-html', [tmpdir()]).code, 1);
    const empty = writeTree(tmpdir(), { 'spec/README.md': 'not a section\n' });
    const result = capture('gen-spec-html', [empty]);
    assert.equal(result.code, 1);
    assert.match(result.err, /no spec\/<nn>-<name>\.md files/u);
    assert.match(result.out, /0 input file\(s\) read/u);
  });

  it('the envelope has the AGSC-09-11 shape', () => {
    const { code, json } = envelope('gen-spec-html', [specRoot()]);
    assert.equal(code, 0);
    assert.equal(json.verb, 'gen-spec-html');
    assert.equal(json.spec_version, '1.0.0-rc.5');
    assert.deepEqual(json.findings, []);
  });

  it('--quiet says nothing; the human output carries a summary line', () => {
    assert.equal(capture('gen-spec-html', ['--quiet', specRoot()]).out, '');
    assert.match(capture('gen-spec-html', [specRoot()]).out,
      /^gen-spec-html: 3 input file\(s\) read, 3 sections, 4 pages, 3 rule anchors, 0 error, 0 warn\n$/u);
  });
});

describe('gen-spec-html — the pages', () => {
  it('one directory per section plus an index, written twice identically', () => {
    const root = specRoot();
    const first = path.join(tmpdir(), 'a');
    const second = path.join(tmpdir(), 'b');
    capture('gen-spec-html', ['--quiet', '--out', first, root]);
    capture('gen-spec-html', ['--quiet', '--out', second, root]);
    assert.deepEqual(fs.readdirSync(first).sort(), ['bundle', 'conformance', 'index.html', 'overview']);
    for (const name of ['index.html', 'bundle/index.html']) {
      assert.equal(fs.readFileSync(path.join(first, name), 'utf8'),
        fs.readFileSync(path.join(second, name), 'utf8'), name);
    }
  });

  it('every rule id becomes an anchor that links to itself', () => {
    const root = specRoot();
    const out = path.join(tmpdir(), 'specs');
    capture('gen-spec-html', ['--quiet', '--out', out, root]);
    const html = fs.readFileSync(path.join(out, 'bundle', 'index.html'), 'utf8');
    assert.match(html, /<strong id="AGSC-01-01"><a href="#AGSC-01-01">AGSC-01-01<\/a><\/strong>/u);
    assert.match(html, /<meta name="agsc-spec-version" content="1\.0\.0-rc\.5">/u);
    assert.match(html, /<title>Bundle<\/title>/u);
  });

  it('the index names every section in order', () => {
    const out = path.join(tmpdir(), 'specs');
    capture('gen-spec-html', ['--quiet', '--out', out, specRoot()]);
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.match(html, /<li><a href="\/specs\/overview\/">00 — overview<\/a><\/li>/u);
    assert.match(html, /<li><a href="\/specs\/conformance\/">09 — conformance<\/a><\/li>/u);
  });

  it('raw HTML in a spec file is AGSC-E109', () => {
    const root = specRoot({ 'spec/02-item.md': '# Item\n\n<div>markup</div>\n\n- **AGSC-02-01** One. [PRD-002]\n' });
    const { code, json } = envelope('gen-spec-html', [root]);
    assert.equal(code, 1);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E109' && /raw HTML/u.test(f.message)));
  });

  it('a rule id repeated on one page is AGSC-E201, and the anchor is left alone', () => {
    const root = specRoot({ 'spec/02-item.md': '# Item\n\n- **AGSC-02-01** One. [PRD-002]\n\nSee **AGSC-02-01** again.\n' });
    const { code, json } = envelope('gen-spec-html', [root]);
    assert.equal(code, 1);
    assert.ok(json.findings.some((f) => /appears twice on this page/u.test(f.message)));
  });

  it('a section file with no heading falls back to its slug', () => {
    const root = specRoot({ 'spec/02-item.md': '- **AGSC-02-01** One. [PRD-002]\n' });
    const out = path.join(tmpdir(), 'specs');
    capture('gen-spec-html', ['--quiet', '--out', out, root]);
    assert.match(fs.readFileSync(path.join(out, 'item', 'index.html'), 'utf8'), /<title>item<\/title>/u);
  });
});

describe('gen-spec-html — --check', () => {
  it('a tree this tool wrote passes', () => {
    const root = specRoot();
    const out = path.join(tmpdir(), 'specs');
    capture('gen-spec-html', ['--quiet', '--out', out, root]);
    const { code, json } = envelope('gen-spec-html', ['--check', out, root]);
    assert.equal(code, 0);
    assert.deepEqual(json.findings, []);
  });

  it('a missing page is AGSC-E901 and a changed page is AGSC-E602', () => {
    const root = specRoot();
    const out = path.join(tmpdir(), 'specs');
    capture('gen-spec-html', ['--quiet', '--out', out, root]);
    fs.rmSync(path.join(out, 'overview', 'index.html'));
    fs.writeFileSync(path.join(out, 'index.html'), '<!DOCTYPE html>\n');
    const { code, json } = envelope('gen-spec-html', ['--check', out, root]);
    assert.equal(code, 1);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E901' && f.file === 'specs/overview/index.html'));
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E602' && f.file === 'specs/index.html'));
  });

  it('the human output is one line per finding', () => {
    const root = specRoot();
    const result = capture('gen-spec-html', ['--check', path.join(tmpdir(), 'absent'), root]);
    assert.equal(result.code, 1);
    assert.match(result.err, /^error: specs\/bundle\/index\.html:1:1 AGSC-E901 /mu);
  });
});

describe('gen-spec-html — the helpers it exports', () => {
  it('sectionOf splits <nn>-<name>.md and refuses anything else', () => {
    assert.deepEqual(sectionOf('09-conformance.md'), { number: '09', slug: 'conformance' });
    assert.equal(sectionOf('README.md'), null);
  });

  it('page escapes its title and ends with exactly one LF', () => {
    const html = page('A & B', '1.0.0-rc.5', '<p>x</p>', '<ul></ul>');
    assert.match(html, /<title>A &amp; B<\/title>/u);
    assert.ok(html.endsWith('</html>\n'));
  });

  it('render returns one file per section plus the index', () => {
    const rendered = render(REPO, new Map([['00-overview.md', '# O\n\n- **AGSC-00-01** One. [PRD-002]\n']]));
    assert.deepEqual([...rendered.files.keys()].sort(), ['index.html', 'overview/index.html']);
    assert.equal(rendered.rules, 1);
  });
});

describe('gen-spec-html — the real distribution', () => {
  it('renders the twelve shipped sections with an anchor on every rule', () => {
    const result = capture('gen-spec-html', [REPO]);
    assert.equal(result.code, 0);
    assert.equal(result.err, '');
    // DERIVED, not pinned (2026-09-22): the number of rules is the counter's to
    // state, and a literal here is a second copy of it that rots on the next rule.
    // The invariant is that this generator renders an anchor for EVERY rule
    // `tools/count-artifacts` finds — one rule, one anchor, none lost.
    const rules = JSON.parse(capture('count-artifacts', ['--json', REPO]).out).counts.rules;
    assert.ok(rules > 300, 'the counter read nothing');
    assert.match(result.out, new RegExp(`^gen-spec-html: 12 input file\\(s\\) read, 12 sections,`
      + ` 13 pages, ${rules} rule anchors, 0 error, 0 warn\\n$`, 'u'), result.out);
  });
});
