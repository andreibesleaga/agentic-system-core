'use strict';
// The patterns of the repository tools that read the repository's own files, made
// linear (audit finding VA2-10, VA2R1-N2). Two checks per pattern:
//
//   * Equivalence: the new scanner returns exactly what the old pattern returned, over
//     a fixed set of short texts from the fixed-seed generator of `_linear-kit.js`. The
//     old pattern is kept here, as the oracle.
//   * Hostile input: one input of about 1 MiB of the shape that made the old pattern
//     start a scan at every position and read to the end (a quadratic pattern needs
//     about a million times more steps and does not finish; the per-test timeout then
//     fails the test). No duration is asserted or measured.

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { MIB, texts } = require('../_linear-kit');
const { tool } = require('./helpers');

const OPTIONS = { timeout: 120000 };
const SEEDED = 3000;

/** Every text of the set through `scan` and `oracle`; the answers must be equal. */
function assertSame(name, alphabet, scan, oracle, seed = 7) {
  for (const text of texts(seed, SEEDED, alphabet)) {
    assert.deepEqual(scan(text), oracle(text), `${name}: ${JSON.stringify(text)}`);
  }
}

/** The new scanner on one hostile input; the answer is the oracle's, computed on a short cut. */
function assertHostile(scan, input) {
  assert.doesNotThrow(() => scan(input));
}

test('the version in spec/00 is found without a scan from every digit (release, validate-features)', OPTIONS, () => {
  const oracle = (text) => (text.match(/\d+\.\d+\.\d+(?:-[a-z]+\.\d+)?/u) || ['unknown'])[0];
  for (const name of ['release', 'validate-features']) {
    const { versionIn } = tool(name);
    assertSame(name, ['1', '2', '.', '-', 'a', 'rc', ' ', 'x'], versionIn, oracle);
    assertHostile(versionIn, '1'.repeat(MIB));
    assertHostile(versionIn, '1.'.repeat(MIB / 2));
    assert.equal(versionIn('spec 1.1.0-rc.2 here'), '1.1.0-rc.2');
    assert.equal(versionIn('nothing'), 'unknown');
  }
});

test('"As P<n>" lines of a feature file are found without reading across blank lines', OPTIONS, () => {
  const { personasDeclared } = tool('validate-features');
  const oracle = (raw) => [...raw.matchAll(/^\s*As (P\d{1,2})\b/gmu)].map((m) => m[1]);
  assertSame('personas', ['As P1', 'As P12', ' ', '\n', '\t', 'x', 'As'], personasDeclared, oracle);
  assertHostile(personasDeclared, '\n'.repeat(MIB));
  assertHostile(personasDeclared, ' '.repeat(MIB));
  assert.deepEqual(personasDeclared('  As P3 a\n\n\n As P4\n'), ['P3', 'P4']);
});

test('a trace bracket and its italic notes are stripped from a rule line in linear time', OPTIONS, () => {
  const oracleStrip = (line) => {
    const stripped = line.replace(/(\s*\*\([^()]*(?:\([^()]*\)[^()]*)*\)\*)+\s*$/u, '');
    const match = /\[([^[\]]+)\]\s*$/u.exec(stripped);
    return match ? match[1] : null;
  };
  for (const name of ['validate-spec', 'requirements-matrix']) {
    const { traceBracket } = tool(name);
    assertSame(name, ['*(', ')*', '(', ')', ' ', 'a', '[PRD-1]', '[', ']', '*'], traceBracket, oracleStrip);
    assertHostile(traceBracket, ' '.repeat(MIB));
    assertHostile(traceBracket, ' *(a) '.repeat(MIB / 6));
    assertHostile(traceBracket, '[ '.repeat(MIB / 2));
  }
});

test('the glossary drops a trace bracket and a trailing bracket in linear time', OPTIONS, () => {
  const { dropTrailingBracket, stripTrace } = tool('gen-glossary');
  const oracleTrailing = (text) => text.replace(/\s*\[[^\]]*\]\s*$/, '');
  assertSame('trailing bracket', ['[', ']', ' ', 'a', '\n', ']('], dropTrailingBracket, oracleTrailing);
  const oracleTrace = (text) => String(text)
    .replace(/\s*\[(?:design|(?:[A-Z][A-Za-z]*-)+\d[\w.-]*|RFC \d+[^\]]*)(?:,\s*[^\]]+)*\](?!\()/gu, '')
    .replace(/\s+$/u, '');
  assertSame('trace', ['[design', '[PRD-005', ',', ' ', 'a', ']', '](', 'x', '[RFC 9110'], stripTrace, oracleTrace, 11);
  assertHostile(dropTrailingBracket, '['.repeat(MIB));
  assertHostile(dropTrailingBracket, ' '.repeat(MIB));
  assertHostile(stripTrace, ' '.repeat(MIB));
  assertHostile(stripTrace, `[design${',a'.repeat(MIB / 2)}`);
  assertHostile(stripTrace, '[design, '.repeat(MIB / 9));
});

test('a code fence line is read in linear time', OPTIONS, () => {
  const { fenceLine, fencedBlocks } = tool('validate-diagrams');
  const oracle = (line) => {
    const m = /^\s*(```|~~~)\s*([A-Za-z0-9_-]*)\s*$/u.exec(line);
    return m ? [m[1], m[2]] : null;
  };
  assertSame('fence', ['```', '~~~', ' ', '\t', 'mermaid', 'x', '-', '!'], (line) => {
    const m = fenceLine(line);
    return m && [m.fence, m.info];
  }, (line) => oracle(line), 5);
  assert.deepEqual(fencedBlocks('```mermaid\nx\n```\n').blocks.map((b) => [b.fence, b.info]), [['```', 'mermaid']]);
  assertHostile(fenceLine, `\`\`\`${' '.repeat(MIB)}!`);
  assertHostile(fenceLine, `${' '.repeat(MIB)}!`);
});

test('raw HTML in a specification file is found without reading across blank lines', OPTIONS, () => {
  const { hasRawHtml, plainText } = tool('gen-spec-html');
  const oracle = (text) => /^\s*<[a-zA-Z!/]/mu.test(text);
  assertSame('raw html', ['<a', '<!', '</', '<', '\n', '\r', ' ', 'x', '\u2028'], hasRawHtml, oracle);
  assertHostile(hasRawHtml, `${'\n'.repeat(MIB)}x`);
  assertHostile(hasRawHtml, `${' '.repeat(MIB)}x`);
  const oracleText = (s) => s.replace(/<[^>]*>/gu, ' ');
  assert.equal(plainText('<p>a <b>b</b></p>'), oracleText('<p>a <b>b</b></p>').replace(/\s+/gu, ' ').trim());
  assertHostile(plainText, '<'.repeat(MIB));
  assertHostile(plainText, '<a '.repeat(MIB / 3));
});

test('an e-mail address is found in linear time, for the lengths addresses can have', OPTIONS, () => {
  const { LINE_PATTERNS } = tool('public-hygiene');
  const [, , email] = LINE_PATTERNS.find(([check]) => check === 'email');
  const find = (text) => [...text.matchAll(email)].map((m) => m[0]);
  assert.deepEqual(find('write to ada@example.org, or b.c+d@sub.example.com now'),
    ['ada@example.org', 'b.c+d@sub.example.com']);
  assert.deepEqual(find(`${'a'.repeat(64)}@example.org`), [`${'a'.repeat(64)}@example.org`]);
  assertHostile(find, 'a'.repeat(MIB));
  assertHostile(find, `${'a'.repeat(MIB)}@`);
  assertHostile(find, 'a@'.repeat(MIB / 2));
  assertHostile(find, `x@${'a-'.repeat(MIB / 2)}`);
});

test('the link of an llms.txt line is found in linear time', OPTIONS, () => {
  const { llmsLink } = tool('bench');
  const oracle = (line) => {
    const m = /\[([^\]]+)\]\(([^)]+)\)(.*)$/u.exec(line);
    return m ? [m[1], m[2], m[3]] : null;
  };
  assertSame('llms link', ['[', ']', '(', ')', 'a', ' ', 'b'], (l) => llmsLink(l), oracle, 13);
  assertHostile(llmsLink, '['.repeat(MIB));
  assertHostile(llmsLink, '[a]('.repeat(MIB / 4));
  assertHostile(llmsLink, '[a] ('.repeat(MIB / 5));
});
