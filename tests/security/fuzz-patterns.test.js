'use strict';
// The seeded fuzz lane of the text scanners that replaced regular expressions: the
// control against malicious parser input (a pattern that an author's text can make
// run in quadratic time) that the threat table of docs/PLAN.md names. Deterministic:
// a fixed seed, a fixed number of texts, no clock and no randomness.
//
// For each scanner:
//   1. on many short texts over the alphabet of its pattern, the scanner returns
//      exactly what the regular expression it replaced returned (kept below as the
//      reference);
//   2. on long runs of every piece of that alphabet, and on the whole alphabet
//      repeated, the scanner stays within a constant number of steps per character
//      (tests/_linear-kit.js). These are the inputs that made the old patterns scan
//      from every start position to the end.

const test = require('node:test');
const assert = require('node:assert/strict');
const ledger = require('../../src/governance/ledger.js');
const fix = require('../../src/governance/fix.js');
const pii = require('../../src/governance/pii.js');
const adopt = require('../../src/knowledge/adopt.js');
const mapping = require('../../src/interchange/mapping.js');
const boards = require('../../src/interchange/board-formats.js');
const cleanroomRewrite = require('../../src/interchange/cleanroom-rewrite.js');
const llms = require('../../src/distribution/llms.js');
const { assertLinear, longRuns, texts } = require('../_linear-kit.js');

const SEED = 20261010;
const COUNT = 20000;
const AT = '@';

/** The patterns as they stood, kept as the references the scanners must equal. */
const OLD = {
  bracketed: (value) => {
    const m = /<([^>]+)>/u.exec(value);
    return m === null ? null : m[1];
  },
  fence: /^(?: {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^(?: {0,3})\1[^\n]*(?:\n|$)|$(?![\s\S]))/gmu,
  span: /(`+)(?:[^`]|(?!\1)`)*\1/gu,
  wikilink: /(!?)\[\[([^\]|#]*)(#[^\]|]*)?(\|[^\]]*)?\]\]/gu,
  link: /(!?)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu,
  patternLink: /\[([^\]]*)\]\(\/patterns\/([a-z0-9][a-z0-9-]*)\/\)/gu,
  peerBase: /[^/]+\/[^/]+\/?$/u,
  heading: /^(#{1,6})\s+(.+?)\s*#*\s*$/u,
  trailingFeeds: /\n+$/u,
  trailingBlanks: /[ \t]+$/u,
  lineBreak: /\s*\n\s*/gu,
  oneTrailingFeed: /\n*$/u,
};

/** The code spans as the two patterns found them. */
function oldCodeSpans(text) {
  const out = [];
  for (const m of text.matchAll(OLD.fence)) out.push([m.index, m.index + m[0].length]);
  for (const m of text.matchAll(OLD.span)) {
    if (!out.some(([s, e]) => m.index >= s && m.index < e)) out.push([m.index, m.index + m[0].length]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** The wikilink rewriting as the pattern did it (the same replacement rules). */
function oldRewrite(text, typeOfSlug) {
  const spans = oldCodeSpans(text);
  const left = [];
  let rewritten = 0;
  const body = text.replace(OLD.wikilink, (whole, bang, rawTarget, rawAnchor, rawAlias, index) => {
    if (spans.some(([s, e]) => index >= s && index < e)) return whole;
    const target = rawTarget.trim();
    const anchor = (rawAnchor === undefined ? '' : rawAnchor.slice(1)).trim();
    const alias = (rawAlias === undefined ? '' : rawAlias.slice(1)).trim();
    if (bang === '!') {
      rewritten += 1;
      return /\.(avif|gif|jpeg|jpg|png|svg|webp)$/u.test(target.toLowerCase())
        ? `![${alias === '' ? target : alias}](${target})` : '';
    }
    if (!typeOfSlug.has(target)) { left.push(target); return whole; }
    rewritten += 1;
    return `[${alias === '' ? target : alias}](${fix.relativeTarget(typeOfSlug.get(target), target, anchor)})`;
  });
  return { body, left, rewritten };
}

/** The relative references as the pattern found them. */
function oldReferences(text) {
  const out = [];
  for (const m of text.matchAll(OLD.link)) {
    const target = m[2];
    if (!/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(target) && !target.startsWith('#') && !target.startsWith('//')) {
      out.push({ reference: target, image: m[1] === '!' });
    }
  }
  return out;
}

/** The trailer block as the key-list search parsed it. */
function oldTrailers(message) {
  const lines = String(message).split('\n');
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  let start = lines.length;
  while (start > 0 && lines[start - 1].trim() !== '') start -= 1;
  const block = lines.slice(start);
  const isKey = (l) => /^[A-Za-z0-9][A-Za-z0-9-]*:[ \t]/u.test(l);
  const isContinuation = (l) => /^[ \t]/u.test(l);
  if (block.length === 0 || !block.every((l, i) => (i === 0 ? isKey(l) : isKey(l) || isContinuation(l)))) return {};
  const order = [];
  const values = {};
  for (const line of block) {
    if (isContinuation(line)) {
      values[order[order.length - 1]] += ` ${line.trim()}`;
      continue;
    }
    const key = line.slice(0, line.indexOf(':'));
    const existing = order.find((k) => k.toLowerCase() === key.toLowerCase());
    if (existing !== undefined) {
      order.splice(order.indexOf(existing), 1);
      delete values[existing];
    }
    order.push(key);
    values[key] = line.slice(line.indexOf(':') + 1).trim();
  }
  return Object.fromEntries(order.map((k) => [k, values[k]]));
}

const SLUGS = new Map([['a', 'concept'], ['b', 'procedure'], ['x.png', 'concept']]);

/** Each scanner: its alphabet, the new scan (taking a meter) and the reference. */
const SCANNERS = [
  {
    name: 'the Signed-off-by address',
    alphabet: ['<', '>', 'a', AT, '.', ' ', '\u00e9', '<>', `<ada${AT}b.c>`],
    scan: (text, meter) => ledger.actorOf(text, meter),
    found: (result) => result !== 'human:unknown',
    reference: (text) => {
      const inside = OLD.bracketed(text);
      const email = inside === null ? text.trim() : inside;
      return email.includes(AT) ? adopt.operatorFor({}, email).operator : 'human:unknown';
    },
  },
  {
    name: 'the trailer block',
    alphabet: ['\n', 'Signed-off-by: a', 'signed-off-by: b', 'Key: v', 'KEY: w', ' more', '\t', 'x', ': ', 'A-1: c', '\n\n'],
    scan: (text, meter) => ({ ...ledger.parseTrailers(text, meter) }),
    found: (result) => Object.keys(result).length > 1,
    reference: oldTrailers,
  },
  {
    name: 'the code spans',
    alphabet: ['`', '``', '```', '~~~', '~', 'a', ' ', '   ', '    ', '\n', '\r', '\r\n', '\u2028', '\u2029'],
    scan: (text, meter) => fix.codeSpans(text, meter),
    found: (result) => result.length > 1,
    reference: oldCodeSpans,
  },
  {
    name: 'the wikilinks',
    alphabet: ['[', ']', '[[', ']]', '[[a', '[[c]]', '![[x.png]]', '!', '#', '#h', '|', '|al', 'a', 'b', ' ', '`', '```\n', '\n', 'x.png'],
    scan: (text, meter) => fix.rewriteWikilinks(text, SLUGS, meter),
    found: (result) => result.rewritten > 0 || result.left.length > 0,
    reference: (text) => oldRewrite(text, SLUGS),
  },
  {
    name: 'the trailing line feeds',
    alphabet: ['\n', '\r', '\r\n', 'a', ' ', 'e\u0301'],
    scan: (text, meter) => fix.normaliseText(text, meter),
    found: (result) => result.length > 1 && result.includes('\n\n'),
    reference: (text) => `${text.split('\r\n').join('\n').split('\r').join('\n').normalize('NFC').replace(/\n+$/u, '')}\n`,
  },
  {
    name: 'the relative references',
    alphabet: ['[', ']', '(', ')', '[a](', '](', '![', '!', '"', ' "t")', ' ', '\t', '\u00a0', '\u3000', '\ufeff', 'a', 'b.md', 'p.png', '#', 'h:', '//'],
    scan: (text, meter) => adopt.relativeReferences(text, meter),
    found: (result) => result.length > 0,
    reference: oldReferences,
  },
  {
    name: 'the e-mail addresses',
    alphabet: ['a', '.', '-', AT, 'b', ' ', '+'],
    scan: (text, meter) => pii.emailSpans(text, meter),
    found: (result) => result.length > 0,
    reference: (text) => {
      const pattern = new RegExp(pii.EMAIL.source, 'gu');
      return [...text.matchAll(pattern)].map((m) => ({ at: m.index + m[0].indexOf(AT), end: m.index + m[0].length, start: m.index }));
    },
  },
  {
    name: 'the old site\'s pattern links',
    alphabet: ['[', ']', '(', ')', '/', '](/patterns/', '[a](/patterns/', 'ab', '-', 'a-b/)', '/)', 'A', '\n', '\u{1F600}'],
    scan: (text, meter) => mapping.patternLinks(text, meter),
    found: (result) => result.length > 0,
    reference: (text) => [...text.matchAll(OLD.patternLink)]
      .map((m) => ({ end: m.index + m[0].length, index: m.index, label: m[1], target: m[2] })),
  },
  {
    name: 'the base of a peer board\'s IRI',
    alphabet: ['/', 'a', 'b.json', '//', ':', 'https:', '\ud83d', '\u{1F600}', ' '],
    scan: (text, meter) => boards.peerBase(text, meter),
    found: (result, text) => result !== text,
    reference: (text) => text.replace(OLD.peerBase, ''),
  },
  {
    name: 'the Markdown heading',
    alphabet: ['#', '# ', '##', '#######', ' ', '  ', '\t', '\u00a0', '\u2028', '\n', '\r', 'a', 'b c', '\u{1F600}', '\ud83d'],
    maxLength: 16,
    scan: (text, meter) => boards.markdownHeading(text, meter),
    found: (result) => result !== null,
    reference: (text) => {
      const m = OLD.heading.exec(text);
      return m === null ? null : { marks: m[1], text: m[2] };
    },
  },
  {
    name: 'the trailing line feeds of a board card',
    alphabet: ['\n', '\n\n', 'a', ' ', '\r'],
    scan: (text, meter) => boards.withoutTrailingFeeds(text, meter),
    found: (result, text) => result !== text,
    reference: (text) => text.replace(OLD.trailingFeeds, ''),
  },
  {
    name: 'the blanks a clean-room cut exposes',
    alphabet: ['\t', ' ', '  ', 'a', '\n', '\u00a0'],
    scan: (text, meter) => cleanroomRewrite.withoutTrailingBlanks(text, meter),
    found: (result, text) => result !== text,
    reference: (text) => text.replace(OLD.trailingBlanks, ''),
  },
  {
    name: 'the line breaks of the description in /llms.txt',
    alphabet: ['\n', ' ', '\t', '\r', '\v', '\f', '\u00a0', '\u2028', '\u2029', '\u3000', '\ufeff', 'a', '\u0085'],
    scan: (text, meter) => llms.collapseLineBreaks(text, meter),
    found: (result, text) => result !== text,
    reference: (text) => text.replace(OLD.lineBreak, ' '),
  },
  {
    name: 'the trailing line feeds of a body in /llms-full.txt',
    alphabet: ['\n', '\n\n', 'a', ' ', '\r'],
    scan: (text, meter) => llms.withOneTrailingFeed(text, meter),
    found: (result, text) => result !== `${text}\n`,
    reference: (text) => text.replace(OLD.oneTrailingFeed, '\n'),
  },
];

for (const [n, scanner] of SCANNERS.entries()) {
  test(`${scanner.name}: the scanner finds exactly what the old pattern found`, () => {
    let found = 0;
    for (const text of texts(SEED + n, COUNT, scanner.alphabet, scanner.maxLength)) {
      const expected = scanner.reference(text);
      assert.deepEqual(scanner.scan(text), expected, JSON.stringify(text));
      if (scanner.found(expected, text)) found += 1;
    }
    assert.ok(found > COUNT / 100, `the generated texts exercise what the pattern finds (${found})`);
  });

  test(`${scanner.name}: long runs of the alphabet stay linear`, () => {
    for (const { label, input } of longRuns(scanner.alphabet)) {
      assertLinear(`${scanner.name}, ${label}`, scanner.scan, input);
    }
  });
}
