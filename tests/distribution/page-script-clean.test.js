'use strict';
// The scripts the build copies into every node's pages, from 1.1 (AGSC-06-13a to
// AGSC-06-36 are not touched; the bytes that change are named in the change log):
//
//   * their patterns are linear. Each scan that replaced a quadratic regular expression
//     returns what the expression returned (the old expression is the oracle, over a
//     fixed generated set of short texts), and one hostile input of about 1 MiB of the
//     shape that made the old expression read to the end from every start finishes (a
//     quadratic scan needs about a million times more steps and fails by the per-test
//     timeout; no duration is asserted or measured);
//   * their comments carry no review label and no dated note. The text of a function is
//     emitted with its comments, so a note such as "(finding G4)" or "(2026-09-25)" told
//     a reader of the page nothing and made every node's script differ from the next
//     release's for no reason.

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { Linter } = require('eslint');

const { MIB, texts } = require('../_linear-kit');
const pageTools = require('../../src/distribution/page-tools.js');
const webmcp = require('../../src/distribution/webmcp.js');
const composePage = require('../../src/distribution/compose-page.js');
const searchPage = require('../../src/distribution/search-page.js');
const theme = require('../../src/distribution/theme.js');

const OPTIONS = { timeout: 120000 };
const SEEDED = 3000;

// ------------------------------------------------------------------ the comments

/** Every comment of a script, as text. */
function commentsOf(source) {
  const found = [];
  const collect = { create: (context) => ({ Program() { found.push(...context.sourceCode.getAllComments().map((c) => c.value)); } }) };
  const config = [{
    files: ['**/*.js'], languageOptions: { ecmaVersion: 'latest', sourceType: 'script' },
    plugins: { guard: { rules: { collect } } }, rules: { 'guard/collect': 'error' },
  }];
  const messages = new Linter().verify(source, config, { filename: 'page.js' });
  assert.deepEqual(messages.filter((m) => m.fatal), [], 'the script could not be parsed');
  return found;
}

/** A date, a finding label of a review (`finding G4`) or a plan identifier (`DP-3`, `FR-091`). */
const REVIEW_NOTE = /\b\d{4}-\d{2}-\d{2}\b|\bfinding [A-Z]\d+\b|\b(?:DP|FR|OQ|VA\d?|SW|RS|FX)-?\d+\b/u;

test('no emitted page script carries a review label or a dated note in a comment', () => {
  const scripts = {
    'agsc-page-tools.js': pageTools.bundle({ specVersion: '1.1.0' }),
    'webmcp.js': webmcp.script(),
    'agsc-compose.js': composePage.controller(),
    'agsc-search.js': searchPage.script(),
    'theme.js': theme.script(),
  };
  for (const [name, source] of Object.entries(scripts)) {
    for (const comment of commentsOf(source)) {
      assert.doesNotMatch(comment, REVIEW_NOTE, `${name}: ${JSON.stringify(comment.trim().slice(0, 100))}`);
    }
  }
});

// -------------------------------------------------------------------- the patterns

test('a base IRI loses its trailing slashes in linear time (pageBaseIri)', OPTIONS, () => {
  const oracle = (base) => `${String(base === undefined || base === null ? '/' : base).replace(/\/+$/, '')}/`;
  for (const text of texts(5, SEEDED, ['/', '/', 'a', ':', 'b.'])) {
    assert.equal(pageTools.pageBaseIri(text), oracle(text), JSON.stringify(text));
  }
  assert.equal(pageTools.pageBaseIri(undefined), '/');
  assert.equal(pageTools.pageBaseIri(null), '/');
  assert.equal(pageTools.pageBaseIri('https://a.example///'), 'https://a.example/');
  assert.doesNotThrow(() => pageTools.pageBaseIri(`${'/'.repeat(MIB)}x`));
  assert.doesNotThrow(() => pageTools.pageBaseIri(`a${'/'.repeat(MIB)}`));
});

test('the compose page forms the node base without a scan from every slash (baseOf)', OPTIONS, () => {
  const context = vm.createContext({ location: { origin: 'https://o.test' } });
  vm.runInContext(composePage.controller(), context, { filename: 'agsc-compose.js' });
  const baseOf = vm.runInContext('globalThis.AGSC_COMPOSE.baseOf', context);
  const oracle = (anchor) => (anchor === '' ? 'https://o.test/' : `${anchor.replace(/\/+$/, '')}/`);
  for (const text of texts(11, SEEDED, ['/', '/', 'a', ':', 'b.'])) {
    assert.equal(baseOf({ linkset: [{ anchor: text }] }), oracle(text), JSON.stringify(text));
  }
  assert.equal(baseOf(null), 'https://o.test/');
  assert.equal(baseOf({ linkset: [{ anchor: '' }] }), 'https://o.test/');
  assert.doesNotThrow(() => baseOf({ linkset: [{ anchor: `${'/'.repeat(MIB)}x` }] }));
  assert.doesNotThrow(() => baseOf({ linkset: [{ anchor: `a${'/'.repeat(MIB)}` }] }));
});

test('a heading line is read without a scan from every blank (pageHeadingText)', OPTIONS, () => {
  const oracle = (line) => {
    const heading = /^ {0,3}#{1,6}(?: +(.*))?$/.exec(line);
    if (heading === null) return null;
    return String(heading[1] === undefined ? '' : heading[1]).replace(/ +#+ *$/, '').trim();
  };
  const alphabet = ['#', '#', ' ', ' ', 'a', 'b c', '\r', '\u2028', '\t', ' #'];
  for (const text of texts(3, SEEDED * 3, alphabet, 12)) {
    assert.equal(pageTools.pageHeadingText(text), oracle(text), JSON.stringify(text));
  }
  for (const line of ['# Title', '## Title ##', '### Title ###  ', '#', '#######', ' # indented', '    # code',
    '# ###', '#Title', '# a # b #', '#   spaced   ']) {
    assert.equal(pageTools.pageHeadingText(line), oracle(line), JSON.stringify(line));
  }
  for (const input of [`# ${' '.repeat(MIB)}`, `# a${' '.repeat(MIB)}b`, `# ${'# '.repeat(MIB / 2)}x`, `#${' '.repeat(MIB)}`]) {
    assert.doesNotThrow(() => pageTools.pageHeadingText(input));
  }
});

test('the inline link targets of a body are found without a scan from every bracket (pageInlineTargets)', OPTIONS, () => {
  const oracle = (body) => {
    const out = [];
    const lines = String(body).split('\n');
    let fence = '';
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const opened = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (fence !== '') {
        if (opened !== null && opened[1].charAt(0) === fence.charAt(0) && opened[1].length >= fence.length) fence = '';
        continue;
      }
      if (opened !== null) { fence = opened[1]; continue; }
      const stripped = line.replace(/`[^`]*`/g, '');
      const pattern = /!?\[[^\]]*\]\(([^()\s]*)(?:\s+"[^"]*")?\)/g;
      let match = pattern.exec(stripped);
      while (match !== null) {
        if (match[1] !== '') out.push(match[1]);
        match = pattern.exec(stripped);
      }
    }
    return out;
  };
  const alphabet = ['[', '[', ']', ']', '(', ')', ' ', '"', '`', 'a', 'b/c', '!', '\n', '```', '#x', '\t'];
  for (const text of texts(9, SEEDED * 3, alphabet, 18)) {
    assert.deepEqual(pageTools.pageInlineTargets(text), oracle(text), JSON.stringify(text));
  }
  for (const body of ['[a](b)', '![i](x.png "t") and [j](y)', '[[a](b)', '[a]](b)', '[a](b c)', '[a](b "c d")',
    '[a](b "c d" )', '[](x)', '[a]()', '`[a](b)` [c](d)', '[a] (b)', '[a](b)(c)', '[a](\n)']) {
    assert.deepEqual(pageTools.pageInlineTargets(body), oracle(body), JSON.stringify(body));
  }
  for (const input of ['['.repeat(MIB), `${'['.repeat(MIB)}]x`, '[a'.repeat(MIB / 2), `[a${']'.repeat(MIB)}`,
    '[a](b'.repeat(MIB / 5), `[a](b${' '.repeat(MIB)}`, `[a](b ${'"'.repeat(MIB)}`, '`'.repeat(MIB), '[a](b "c'.repeat(MIB / 8)]) {
    assert.doesNotThrow(() => pageTools.pageInlineTargets(input));
  }
});
